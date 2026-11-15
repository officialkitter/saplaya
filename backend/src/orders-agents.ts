import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import nodemailer from 'nodemailer';

const router = Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Initialize email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
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
  confirmation: z.boolean().refine(v => v === true),
});

const NotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.string(),
  subject: z.string(),
  body: z.string(),
  data: z.record(z.any()).optional(),
});

// ========== Middleware ==========

async function authenticateUser(req: Request, res: Response, next: Function) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = user;
  next();
}

// ========== Agent Endpoints ==========

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

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
  }
});

// Update agent profile
router.put('/agents/:agentId', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { fullName, phone, bankAccount } = req.body;

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
      .from('agents')
      .update({
        full_name: fullName,
        phone,
        bank_account: bankAccount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agentId)
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
  }
});

// List available orders to claim
router.get('/orders/available', authenticateUser, async (req: Request, res: Response) => {
  try {
    // Get orders that haven't been claimed yet
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          product_id,
          qty,
          unit_price
        ),
        supplier_orders (
          id,
          supplier_id,
          status
        )
      `)
      .not('order_claims', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
  }
});

// Claim an order as agent
router.post('/orders/claim', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { orderId, agentId } = ClaimOrderSchema.parse(req.body);

    // Verify agent ownership
    const { data: agent } = await supabase
      .from('agents')
      .select('user_id')
      .eq('id', agentId)
      .single();

    if (!agent || agent.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Call RPC function to claim order
    const { data, error } = await supabase.rpc('claim_order', {
      p_order_id: orderId,
      p_agent_id: agentId,
    });

    if (error) throw error;

    // Send notification email
    await sendOrderClaimedEmail(orderId, agentId);

    res.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
  }
});

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
      .select(`
        *,
        order_claim_id,
        order_claims (
          order_id,
          claimed_at,
          completed_at
        )
      `)
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Calculate totals
    const totals = {
      pending: 0,
      approved: 0,
      paid: 0,
      cancelled: 0,
    };

    data?.forEach((commission: any) => {
      totals[commission.status as keyof typeof totals] += commission.amount;
    });

    res.json({ commissions: data, totals });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
  }
});

// ========== Order For Others Endpoint ==========

// Place order for another customer
router.post('/orders/for-other', authenticateUser, async (req: Request, res: Response) => {
  try {
    const {
      customerId,
      recipientName,
      recipientPhone,
      recipientEmail,
      items,
      mode,
      deliveryLat,
      deliveryLng,
      specialInstructions,
    } = OrderForOtherSchema.parse(req.body);

    // Calculate total and distance
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('*')
      .in('id', items.map(i => i.productId));

    if (prodError) throw prodError;

    let subtotal = 0;
    items.forEach(item => {
      const product = products?.find(p => p.id === item.productId);
      if (product) {
        const price = mode === 'wholesale' ? product.wholesale_price : product.retail_price;
        subtotal += Math.round(price * item.qty);
      }
    });

    // Create order
    const { data: orderData, error: orderError } = await supabase.rpc('place_order', {
      p_customer: customerId,
      p_mode: mode,
      p_items: JSON.stringify(items),
      p_fee: 0, // Will be calculated by delivery service
      p_distance: null,
      p_lat: deliveryLat,
      p_lng: deliveryLng,
    });

    if (orderError) throw orderError;

    // Update with order-for-other fields
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        ordered_by: req.user?.id,
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
        recipient_email: recipientEmail,
        special_instructions: specialInstructions,
      })
      .eq('id', orderData)
      .select();

    if (updateError) throw updateError;

    // Send notification to recipient
    if (recipientEmail) {
      await sendOrderPlacedEmail(
        updatedOrder[0],
        recipientEmail,
        `${req.user?.email || 'Someone'} ordered for you`
      );
    }

    res.status(201).json(updatedOrder[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
  }
});

// ========== Data Deletion Endpoints ==========

// Delete farm (admin only)
router.post('/admin/farms/delete', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { farmId, confirmCode } = DeleteFarmSchema.parse(req.body);

    // Verify admin
    const { data: farm } = await supabase
      .from('suppliers')
      .select('admin_user_id')
      .eq('id', farmId)
      .single();

    if (!farm || farm.admin_user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Verify confirmation code (should be hashed and stored separately in production)
    if (confirmCode !== process.env.FARM_DELETE_CODE) {
      return res.status(400).json({ error: 'Invalid confirmation code' });
    }

    // Delete farm cascade
    const { data, error } = await supabase.rpc('delete_farm_cascade', {
      p_farm_id: farmId,
    });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
  }
});

// Wipe user data (admin only)
router.post('/admin/users/wipe', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { userId, reason, confirmation } = WipeUserDataSchema.parse(req.body);

    // Verify admin
    const { data: { user: currentUser } } = await supabase.auth.admin.getUserById(req.user?.id || '');

    const userRole = (currentUser as any)?.user_metadata?.role;
    if (userRole !== 'platform_admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Wipe user data
    const { data, error } = await supabase.rpc('wipe_user_data', {
      p_user_id: userId,
      p_reason: reason,
    });

    if (error) throw error;

    // Send notification to user
    await sendDataWipeEmail(userId);

    res.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
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
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
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
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
  }
});

// Queue notification
router.post('/notifications/queue', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { userId, type, subject, body, data } = NotificationSchema.parse(req.body);

    // Verify ownership or admin
    if (userId !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert([{ user_id: userId, type, subject, body, data }])
      .select();

    if (error) throw error;

    // Asynchronously send email and push
    queueNotificationSending(notification[0]);

    res.status(201).json(notification[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
  }
});

// ========== Helper Functions ==========

async function sendOrderClaimedEmail(orderId: string, agentId: string) {
  try {
    const { data: agent } = await supabase
      .from('agents')
      .select('email, full_name')
      .eq('id', agentId)
      .single();

    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (!agent || !order) return;

    await emailTransporter.sendMail({
      to: agent.email,
      subject: `Order Claimed - Commission Opportunity`,
      html: `
        <h2>Order Claimed Successfully</h2>
        <p>Hi ${agent.full_name},</p>
        <p>You have successfully claimed order #${orderId.substring(0, 8)}.</p>
        <p><strong>Subtotal:</strong> TZS ${order.subtotal}</p>
        <p>Your commission will be calculated when the order is completed.</p>
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

async function sendDataWipeEmail(userId: string) {
  try {
    const { data: user } = await supabase.auth.admin.getUserById(userId);
    if (!user) return;

    await emailTransporter.sendMail({
      to: user.email || '',
      subject: 'Your Data Has Been Removed',
      html: `
        <h2>Data Removal Confirmation</h2>
        <p>Your account and associated data have been permanently removed from our system.</p>
        <p>If you didn't request this, please contact support immediately.</p>
      `,
    });
  } catch (error) {
    console.error('Failed to send data wipe email:', error);
  }
}

async function queueNotificationSending(notification: any) {
  // This would be sent to a background job queue in production
  // For now, attempt to send immediately
  try {
    if (notification.type === 'order_placed') {
      // Send to email
      const { data: user } = await supabase.auth.admin.getUserById(notification.user_id);
      if (user?.email) {
        await emailTransporter.sendMail({
          to: user.email,
          subject: notification.subject,
          html: notification.body,
        });

        // Mark as sent
        await supabase
          .from('notifications')
          .update({ email_sent: true, email_sent_at: new Date().toISOString() })
          .eq('id', notification.id);
      }
    }
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

export default router;
