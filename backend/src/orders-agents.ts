import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { authenticateUser, handleZodError, errorHandler } from './middleware.js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SECRET_KEY || ''
);

// Initialize email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASSWORD || '',
  },
});

// ========== Validation Schemas ==========

const ClaimOrderSchema = z.object({
  orderId: z.string().uuid(),
  agentId: z.string().uuid(),
});

const OrderForOtherSchema = z.object({
  customerId: z.string().uuid(),
  recipientName: z.string().min(2),
  recipientPhone: z.string().optional(),
  recipientEmail: z.string().email().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    qty: z.number().positive(),
  })),
  mode: z.enum(['retail', 'wholesale']),
  deliveryLat: z.number().optional(),
  deliveryLng: z.number().optional(),
  specialInstructions: z.string().optional(),
});

const DeleteFarmSchema = z.object({
  farmId: z.string().uuid(),
  confirmCode: z.string(),
});

const WipeUserDataSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().min(10),
  confirmation: z.boolean().refine(v => v === true, {
    message: 'Confirmation must be true',
  }),
});

const NotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.string(),
  subject: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.any()).optional(),
});

const UpdateAgentProfileSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  bankAccount: z.string().optional(),
  profileImage: z.string().optional(),
  bio: z.string().optional(),
});

// ========== Agent Profile Endpoints ==========

// Get agent profile
router.get('/agents/:agentId', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Agent not found' });

    res.json(data);
  } catch (error) {
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// Update agent profile
router.put('/agents/:agentId', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const validatedData = UpdateAgentProfileSchema.parse(req.body);

    // Verify ownership
    const { data: agent } = await supabase
      .from('agents')
      .select('user_id')
      .eq('id', agentId)
      .single();

    if (!agent || agent.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden - You can only update your own profile' });
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (validatedData.fullName) updatePayload.full_name = validatedData.fullName;
    if (validatedData.phone) updatePayload.phone = validatedData.phone;
    if (validatedData.bankAccount) updatePayload.bank_account = validatedData.bankAccount;
    if (validatedData.profileImage) updatePayload.profile_image = validatedData.profileImage;
    if (validatedData.bio) updatePayload.bio = validatedData.bio;

    const { data, error } = await supabase
      .from('agents')
      .update(updatePayload)
      .eq('id', agentId)
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(handleZodError(error));
    }
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// Get agent statistics
router.get('/agents/:agentId/stats', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    // Verify ownership
    const { data: agent } = await supabase
      .from('agents')
      .select('user_id')
      .eq('id', agentId)
      .single();

    if (!agent || agent.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data: orders, error: ordersError } = await supabase
      .from('order_claims')
      .select('id, status, created_at, completed_at')
      .eq('agent_id', agentId);

    if (ordersError) throw ordersError;

    const stats = {
      totalOrdersClaimed: orders?.length || 0,
      completedOrders: orders?.filter(o => o.status === 'completed').length || 0,
      activeOrders: orders?.filter(o => o.status === 'active').length || 0,
      cancelledOrders: orders?.filter(o => o.status === 'cancelled').length || 0,
      avgCompletionTime: calculateAvgCompletionTime(orders || []),
    };

    res.json(stats);
  } catch (error) {
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// ========== Order Claiming (Uber-like) ==========

// List available orders for agents to claim
router.get('/orders/available', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, radius = 5 } = req.query;

    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          product_id,
          qty,
          unit_price
        )
      `)
      .is('agent_id', null)
      .eq('status', 'pending');

    if (latitude && longitude) {
      // Simple distance filtering (would use PostGIS in production)
      const { data, error } = await query;
      if (error) throw error;

      const filtered = (data || []).filter(order => {
        const distance = haversineDistance(
          parseFloat(latitude as string),
          parseFloat(longitude as string),
          order.delivery_lat,
          order.delivery_lng
        );
        return distance <= (radius as number);
      });

      return res.json(filtered.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// Claim an order as agent
router.post('/orders/claim', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { orderId, agentId } = ClaimOrderSchema.parse(req.body);

    // Verify agent ownership
    const { data: agent } = await supabase
      .from('agents')
      .select('user_id, full_name, phone')
      .eq('id', agentId)
      .single();

    if (!agent || agent.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden - This is not your agent profile' });
    }

    // Get order details
    const { data: order } = await supabase
      .from('orders')
      .select('*, customer_id')
      .eq('id', orderId)
      .single();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.agent_id) {
      return res.status(400).json({ error: 'Order already claimed by another agent' });
    }

    // Update order with agent
    const { data: updatedOrder, error } = await supabase
      .from('orders')
      .update({
        agent_id: agentId,
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select();

    if (error) throw error;

    // Create order claim record
    await supabase
      .from('order_claims')
      .insert({
        order_id: orderId,
        agent_id: agentId,
        claimed_at: new Date().toISOString(),
      });

    // Send notifications
    await sendOrderClaimedEmail(orderId, agent);
    await notifyCustomer(order.customer_id, `Agent ${agent.full_name} has claimed your order`);

    res.json(updatedOrder[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(handleZodError(error));
    }
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// Mark order as picked up
router.patch('/orders/:orderId/pickup', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    // Verify agent ownership
    const { data: order } = await supabase
      .from('orders')
      .select('agent_id, customer_id')
      .eq('id', orderId)
      .single();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { data: agent } = await supabase
      .from('agents')
      .select('user_id')
      .eq('id', order.agent_id)
      .single();

    if (!agent || agent.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden - You are not the assigned agent' });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'picked_up',
        picked_up_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select();

    if (error) throw error;

    await notifyCustomer(order.customer_id, 'Your order has been picked up and is on the way!');

    res.json(data[0]);
  } catch (error) {
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// Mark order as delivered
router.patch('/orders/:orderId/delivered', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { proofImage } = req.body;

    const { data: order } = await supabase
      .from('orders')
      .select('agent_id, customer_id, subtotal')
      .eq('id', orderId)
      .single();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { data: agent } = await supabase
      .from('agents')
      .select('user_id')
      .eq('id', order.agent_id)
      .single();

    if (!agent || agent.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden - You are not the assigned agent' });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        proof_image: proofImage,
      })
      .eq('id', orderId)
      .select();

    if (error) throw error;

    // Calculate and record commission
    const commission = Math.round(order.subtotal * 0.1); // 10% commission
    await supabase
      .from('commissions')
      .insert({
        agent_id: order.agent_id,
        order_id: orderId,
        amount: commission,
        status: 'pending',
      });

    await notifyCustomer(order.customer_id, 'Your order has been delivered!');

    res.json(data[0]);
  } catch (error) {
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// ========== Order For Others (Customer Places Order for Another Person) ==========

// Place order for another person (like Uber Eats - one person orders for someone else)
router.post('/orders/for-other', authenticateUser, async (req: Request, res: Response) => {
  try {
    const validatedData = OrderForOtherSchema.parse(req.body);

    // Get products to calculate total
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('id, retail_price, wholesale_price')
      .in('id', validatedData.items.map(i => i.productId));

    if (prodError) throw prodError;

    let subtotal = 0;
    validatedData.items.forEach(item => {
      const product = products?.find(p => p.id === item.productId);
      if (product) {
        const price = validatedData.mode === 'wholesale' ? product.wholesale_price : product.retail_price;
        subtotal += Math.round(price * item.qty);
      }
    });

    // Create order
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_id: validatedData.customerId,
        ordered_by: req.user?.id,
        recipient_name: validatedData.recipientName,
        recipient_phone: validatedData.recipientPhone,
        recipient_email: validatedData.recipientEmail,
        special_instructions: validatedData.specialInstructions,
        mode: validatedData.mode,
        delivery_lat: validatedData.deliveryLat,
        delivery_lng: validatedData.deliveryLng,
        subtotal,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Insert order items
    const orderItems = validatedData.items.map(item => ({
      order_id: orderData.id,
      product_id: item.productId,
      qty: item.qty,
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // Send notification to recipient
    if (validatedData.recipientEmail) {
      await sendOrderPlacedEmail(
        orderData,
        validatedData.recipientEmail,
        `${req.user?.email || 'Someone'} ordered for you`
      );
    }

    res.status(201).json(orderData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(handleZodError(error));
    }
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// ========== Commission Endpoints ==========

// Get agent commissions
router.get('/agents/:agentId/commissions', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    // Verify ownership
    const { data: agent } = await supabase
      .from('agents')
      .select('user_id')
      .eq('id', agentId)
      .single();

    if (!agent || agent.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data, error } = await supabase
      .from('commissions')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const totals = {
      pending: 0,
      approved: 0,
      paid: 0,
      cancelled: 0,
    };

    (data || []).forEach((commission: any) => {
      totals[commission.status as keyof typeof totals] += commission.amount;
    });

    res.json({ commissions: data, totals });
  } catch (error) {
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// Withdraw commission
router.post('/agents/:agentId/withdraw', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { amount } = req.body;

    const { data: agent } = await supabase
      .from('agents')
      .select('user_id, bank_account')
      .eq('id', agentId)
      .single();

    if (!agent || agent.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!agent.bank_account) {
      return res.status(400).json({ error: 'Please add bank account details first' });
    }

    // Create withdrawal request
    const { data, error } = await supabase
      .from('withdrawals')
      .insert({
        agent_id: agentId,
        amount,
        status: 'pending',
        requested_at: new Date().toISOString(),
      })
      .select();

    if (error) throw error;

    res.status(201).json(data[0]);
  } catch (error) {
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// ========== Notifications Endpoints ==========

// Get user notifications
router.get('/notifications', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user?.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// Mark notification as read
router.patch('/notifications/:notificationId/read', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;

    const { data, error } = await supabase
      .from('notifications')
      .update({
        read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', notificationId)
      .eq('user_id', req.user?.id)
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (error) {
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// ========== Data Deletion Endpoints ==========

// Delete farm (admin only)
router.post('/admin/farms/delete', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { farmId, confirmCode } = DeleteFarmSchema.parse(req.body);

    const { data: farm } = await supabase
      .from('suppliers')
      .select('admin_user_id')
      .eq('id', farmId)
      .single();

    if (!farm || farm.admin_user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (confirmCode !== process.env.FARM_DELETE_CODE) {
      return res.status(400).json({ error: 'Invalid confirmation code' });
    }

    const { data, error } = await supabase.rpc('delete_farm_cascade', {
      p_farm_id: farmId,
    });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(handleZodError(error));
    }
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// Wipe user data (admin only)
router.post('/admin/users/wipe', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { userId, reason, confirmation } = WipeUserDataSchema.parse(req.body);

    const { data: { user: currentUser } } = await supabase.auth.admin.getUserById(req.user?.id || '');

    const userRole = (currentUser as any)?.user_metadata?.role;
    if (userRole !== 'platform_admin') {
      return res.status(403).json({ error: 'Forbidden - Admin only' });
    }

    const { data, error } = await supabase.rpc('wipe_user_data', {
      p_user_id: userId,
      p_reason: reason,
    });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(handleZodError(error));
    }
    const { status, body } = errorHandler(error);
    res.status(status).json(body);
  }
});

// ========== Helper Functions ==========

async function sendOrderClaimedEmail(orderId: string, agent: any) {
  try {
    await emailTransporter.sendMail({
      to: agent.user_id,
      subject: `Order Claimed - New Delivery Opportunity`,
      html: `
        <h2>Order Claimed Successfully</h2>
        <p>Hi ${agent.full_name},</p>
        <p>You have successfully claimed order #${orderId.substring(0, 8)}.</p>
        <p>Start navigating to the pickup location and mark it as picked up once you arrive.</p>
      `,
    });
  } catch (error) {
    console.error('Failed to send order claimed email:', error);
  }
}

async function sendOrderPlacedEmail(order: any, email: string, subject: string) {
  try {
    await emailTransporter.sendMail({
      to: email,
      subject: `Order Placed: ${subject}`,
      html: `
        <h2>Order Placed Successfully</h2>
        <p>Order ID: #${order.id.substring(0, 8)}</p>
        <p><strong>Subtotal:</strong> TZS ${order.subtotal}</p>
        <p><strong>Status:</strong> ${order.status}</p>
        <p>We'll notify you when your order is on the way!</p>
      `,
    });
  } catch (error) {
    console.error('Failed to send order placed email:', error);
  }
}

async function notifyCustomer(customerId: string, message: string) {
  try {
    const { data: customer } = await supabase
      .from('customers')
      .select('user_id')
      .eq('id', customerId)
      .single();

    if (!customer) return;

    await supabase
      .from('notifications')
      .insert({
        user_id: customer.user_id,
        type: 'order_update',
        subject: 'Order Update',
        body: message,
        read: false,
      });
  } catch (error) {
    console.error('Failed to notify customer:', error);
  }
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateAvgCompletionTime(orders: any[]): number {
  const completed = orders.filter(o => o.completed_at && o.created_at);
  if (completed.length === 0) return 0;

  const times = completed.map(o => {
    const created = new Date(o.created_at).getTime();
    const done = new Date(o.completed_at).getTime();
    return (done - created) / (1000 * 60);
  });

  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}

export default router;
