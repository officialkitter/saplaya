import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import WebSocket from 'ws';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  getTransactionStatus,
  isPaymentCompleted,
  isPaymentFailed,
  registerIpn,
  submitOrder,
} from './pesapal.js';

const {
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  PORT = '3000',
  STORE_LAT = '-6.1630', // Dodoma pickup hub
  STORE_LNG = '35.7516',
  PUBLIC_API_URL,
  PAYMENT_APP_CALLBACK_URL = 'saplaya://payment-callback',
  WEB_ORIGIN = '*', // e.g. https://admin.saplaya.com
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY');
}

// Secret-key client: bypasses RLS. NEVER ship this key inside the mobile app.
type RealtimeTransport = NonNullable<
  NonNullable<SupabaseClientOptions<'public'>['realtime']>['transport']
>;
// ws is runtime-compatible; its Node event types differ from Supabase's browser-shaped interface.
const realtimeTransport = WebSocket as unknown as RealtimeTransport;
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
  realtime: { transport: realtimeTransport },
});

const app = express();
app.use(cors({ origin: WEB_ORIGIN === '*' ? true : WEB_ORIGIN.split(',') }));
app.use(express.json());

// ======================================================================
// Roles and permissions (the web admin panel mirrors this table)
// ======================================================================
type Role = 'platform_owner' | 'platform_manager' | 'supplier_owner' | 'supplier_staff' | 'driver';
type Perm =
  | 'dashboard.view' | 'orders.view' | 'orders.update_status'
  | 'products.view' | 'products.edit' | 'stock.adjust' | 'inventory.view'
  | 'catalog.manage'
  | 'suppliers.view_all' | 'suppliers.manage'
  | 'team.view' | 'team.manage' | 'settings.manage';

const ALL: Perm[] = [
  'dashboard.view', 'orders.view', 'orders.update_status', 'products.view', 'products.edit',
  'stock.adjust', 'inventory.view', 'catalog.manage', 'suppliers.view_all', 'suppliers.manage',
  'team.view', 'team.manage', 'settings.manage',
];

const PERMISSIONS: Record<Role, Perm[]> = {
  // The platform owner controls shared catalog prices, not farm-specific products or stock.
  platform_owner: ALL.filter((p) => p !== 'products.edit' && p !== 'stock.adjust'),
  platform_manager: [
    'dashboard.view', 'orders.view', 'orders.update_status', 'products.view',
    'inventory.view', 'suppliers.view_all', 'suppliers.manage', 'team.view',
  ],
  supplier_owner: [
    'dashboard.view', 'orders.view', 'orders.update_status', 'products.view', 'products.edit',
    'stock.adjust', 'inventory.view', 'team.view', 'team.manage',
  ],
  supplier_staff: [
    'dashboard.view', 'orders.view', 'orders.update_status', 'products.view',
    'stock.adjust', 'inventory.view',
  ],
  driver: ['orders.view', 'orders.update_status'],
};

// A driver may only move an order along the road; they cannot pack or cancel.
const DRIVER_STATUSES = ['en_route', 'delivered'];
// Roles a farm owner may hand out. Platform roles can never be created by a farm.
const FARM_ASSIGNABLE: Role[] = ['supplier_staff'];

type Member = {
  id: string; user_id: string; supplier_id: string | null;
  full_name: string; email: string; role: Role; status: string;
};
type AuthedRequest = Request & {
  userId?: string;
  isAnonymous?: boolean;
  authProvider?: 'supabase' | 'firebase';
  member?: Member;
};

const isPlatform = (m: Member) => m.role === 'platform_owner' || m.role === 'platform_manager' || m.role === 'driver';

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'saplaya-v1';
const FIREBASE_APP_NAME = 'saplaya-backend';

function getFirebaseAdminAuth() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('Firebase server credentials are not configured.');
  }

  const parsedServiceAccount = z.object({
    project_id: z.string().min(1),
    client_email: z.string().email(),
    private_key: z.string().min(1),
  }).safeParse(JSON.parse(serviceAccountJson));
  if (!parsedServiceAccount.success || parsedServiceAccount.data.project_id !== FIREBASE_PROJECT_ID) {
    throw new Error('Firebase server credentials do not match the configured project.');
  }

  const existingApp = getApps().find((app) => app.name === FIREBASE_APP_NAME);
  if (existingApp) return getAuth(existingApp);

  const app = initializeApp({
    credential: cert({
      projectId: parsedServiceAccount.data.project_id,
      clientEmail: parsedServiceAccount.data.client_email,
      privateKey: parsedServiceAccount.data.private_key.replace(/\\n/g, '\n'),
    }),
    projectId: FIREBASE_PROJECT_ID,
  }, FIREBASE_APP_NAME);
  return getAuth(app);
}

function isFirebaseTokenForProject(token: string): boolean {
  const payload = token.split('.')[1];
  if (!payload) return false;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof claims !== 'object' || claims === null) return false;
    const tokenClaims = claims as Record<string, unknown>;
    return tokenClaims.aud === FIREBASE_PROJECT_ID
      && tokenClaims.iss === `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
      && typeof tokenClaims.sub === 'string';
  } catch {
    return false;
  }
}

async function findFirebaseIdentity(
  firebaseUser: DecodedIdToken,
): Promise<{ authUserId: string }> {
  const { data: linkedIdentity, error: linkedError } = await db
    .from('firebase_auth_identities')
    .select('auth_user_id')
    .eq('firebase_uid', firebaseUser.uid)
    .maybeSingle();
  if (linkedError) throw new Error('Could not look up the Firebase identity mapping.');
  if (linkedIdentity) return { authUserId: linkedIdentity.auth_user_id };

  const verifiedPhone = typeof firebaseUser.phone_number === 'string' ? firebaseUser.phone_number : null;
  const verifiedEmail = firebaseUser.email_verified && typeof firebaseUser.email === 'string'
    ? firebaseUser.email.trim().toLowerCase()
    : null;
  if (!verifiedPhone && !verifiedEmail) {
    throw new Error('Verify a phone number or email address before linking this Firebase account.');
  }

  const candidates = new Map<string, { auth_user_id: string }>();
  if (verifiedPhone) {
    const { data, error } = await db.from('firebase_auth_identities')
      .select('auth_user_id')
      .eq('phone_e164', verifiedPhone)
      .is('firebase_uid', null)
      .limit(2);
    if (error) throw new Error('Could not match the verified Firebase phone number.');
    for (const identity of data ?? []) candidates.set(identity.auth_user_id, identity);
  }
  if (verifiedEmail) {
    const { data, error } = await db.from('firebase_auth_identities')
      .select('auth_user_id')
      .eq('email', verifiedEmail)
      .is('firebase_uid', null)
      .limit(2);
    if (error) throw new Error('Could not match the verified Firebase email address.');
    for (const identity of data ?? []) candidates.set(identity.auth_user_id, identity);
  }
  if (candidates.size > 1) {
    throw new Error('The verified Firebase phone and email belong to different existing accounts. Contact support to link them safely.');
  }

  let authUserId = [...candidates.keys()][0];
  if (!authUserId) {
    const { data, error } = await db.auth.admin.createUser({
      ...(verifiedPhone ? { phone: verifiedPhone, phone_confirm: true } : {}),
      ...(verifiedEmail ? { email: verifiedEmail, email_confirm: true } : {}),
      user_metadata: {
        ...(typeof firebaseUser.name === 'string' ? { full_name: firebaseUser.name } : {}),
        auth_provider: 'firebase',
      },
    });
    if (error || !data.user) {
      throw new Error('Could not create the Supabase customer identity. If this email or phone already has an account, sign in to that account first.');
    }
    authUserId = data.user.id;

    const { error: insertError } = await db.from('firebase_auth_identities').insert({
      firebase_uid: firebaseUser.uid,
      auth_user_id: authUserId,
      phone_e164: verifiedPhone,
      email: verifiedEmail,
    });
    if (insertError) {
      const { data: racedIdentity } = await db.from('firebase_auth_identities')
        .select('auth_user_id')
        .eq('firebase_uid', firebaseUser.uid)
        .maybeSingle();
      if (racedIdentity) return { authUserId: racedIdentity.auth_user_id };

      console.error('Could not persist a new Firebase identity mapping.', insertError.message);
      const { error: cleanupError } = await db.auth.admin.deleteUser(authUserId);
      if (cleanupError) {
        console.error('Could not remove an unlinked Supabase Auth user.', cleanupError.message);
      }
      throw new Error('Could not finish setting up this customer account. Please retry.');
    }
    return { authUserId };
  }

  const { data: updatedIdentity, error: updateError } = await db
    .from('firebase_auth_identities')
    .update({ firebase_uid: firebaseUser.uid })
    .eq('auth_user_id', authUserId)
    .is('firebase_uid', null)
    .select('auth_user_id')
    .maybeSingle();
  if (updateError) throw new Error('Could not link the verified Firebase identity.');
  if (updatedIdentity) return { authUserId: updatedIdentity.auth_user_id };

  const { data: racedIdentity, error: raceError } = await db
    .from('firebase_auth_identities')
    .select('auth_user_id')
    .eq('firebase_uid', firebaseUser.uid)
    .maybeSingle();
  if (raceError || !racedIdentity || racedIdentity.auth_user_id !== authUserId) {
    throw new Error('This Firebase account could not be linked safely. Please retry or contact support.');
  }
  return { authUserId };
}

async function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const { data, error } = await db.auth.getUser(token);
  if (!error && data.user) {
    req.userId = data.user.id;
    req.isAnonymous = data.user.is_anonymous === true;
    req.authProvider = 'supabase';
    return next();
  }

  if (!isFirebaseTokenForProject(token)) return res.status(401).json({ error: 'Invalid token' });
  let firebaseAuth;
  try {
    firebaseAuth = getFirebaseAdminAuth();
  } catch (firebaseError) {
    console.error('Firebase authentication configuration is unavailable.', firebaseError instanceof Error ? firebaseError.message : 'Unknown error');
    return res.status(503).json({ error: 'Firebase authentication is not available. Check the server configuration.' });
  }
  let firebaseUser: DecodedIdToken;
  try {
    firebaseUser = await firebaseAuth.verifyIdToken(token, true);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired Firebase token.' });
  }
  if (firebaseUser.role !== 'authenticated') {
    return res.status(401).json({ error: 'Refresh the Firebase ID token after completing account setup.' });
  }

  const { data: identity, error: identityError } = await db
    .from('firebase_auth_identities')
    .select('auth_user_id')
    .eq('firebase_uid', firebaseUser.uid)
    .maybeSingle();
  if (identityError) {
    console.error('Firebase identity mapping lookup failed.', identityError.message);
    return res.status(503).json({ error: 'Could not load the customer identity mapping.' });
  }
  if (!identity) return res.status(401).json({ error: 'Complete Firebase account setup before continuing.' });

  req.userId = identity.auth_user_id;
  req.isAnonymous = false;
  req.authProvider = 'firebase';
  next();
}

/** Loads the signed-in person's team record and checks they hold the permission. */
function requirePerm(perm?: Perm) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    await requireUser(req, res, async () => {
      if (req.authProvider !== 'supabase') {
        return res.status(403).json({ error: 'Web team accounts must sign in with Supabase Auth.' });
      }
      const { data } = await db
        .from('team_members')
        .select('id, user_id, supplier_id, full_name, email, role, status')
        .eq('user_id', req.userId!)
        .maybeSingle();
      let m = data as Member | null;
      if (!m || m.status === 'suspended') return res.status(403).json({ error: 'No active team account' });
      if (m.status === 'invited') {
        const { data: activated, error: activateError } = await db.from('team_members')
          .update({ status: 'active' })
          .eq('id', m.id)
          .eq('user_id', req.userId!)
          .eq('status', 'invited')
          .select('id, user_id, supplier_id, full_name, email, role, status')
          .maybeSingle();
        if (activateError || !activated) {
          return res.status(403).json({ error: 'Could not activate this team invitation.' });
        }
        m = activated as Member;
      }
      if (perm && !PERMISSIONS[m.role].includes(perm)) {
        return res.status(403).json({ error: 'Your role is not allowed to do this' });
      }
      if (m.supplier_id) {
        const { data: s } = await db.from('suppliers').select('status').eq('id', m.supplier_id).maybeSingle();
        if (s?.status !== 'active') return res.status(403).json({ error: 'This farm account is not active' });
      }
      req.member = m;
      next();
    });
  };
}


// ---------- Delivery tiers (single source of truth; the app mirrors this) ----------
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function deliveryFor(km: number, settings: {
  free_radius_km: number; mid_radius_km: number; mid_fee: number; far_fee: number;
}) {
  if (km <= Number(settings.free_radius_km)) return 0;
  if (km <= Number(settings.mid_radius_km)) return Number(settings.mid_fee);
  return Number(settings.far_fee);
}

// ---------- Customer routes (suppliers are never exposed) ----------
app.post('/auth/firebase/bootstrap', async (req, res) => {
  const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Missing Firebase ID token.' });
  if (!isFirebaseTokenForProject(token)) return res.status(401).json({ error: 'Invalid Firebase ID token.' });

  let firebaseAuth;
  try {
    firebaseAuth = getFirebaseAdminAuth();
  } catch (bootstrapError) {
    console.error('Firebase authentication configuration is unavailable.', bootstrapError instanceof Error ? bootstrapError.message : 'Unknown error');
    return res.status(503).json({ error: 'Firebase authentication is not available. Check the server configuration.' });
  }
  let firebaseUser: DecodedIdToken;
  try {
    firebaseUser = await firebaseAuth.verifyIdToken(token, true);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired Firebase token.' });
  }

  try {
    const identity = await findFirebaseIdentity(firebaseUser);
    const firebaseRecord = await firebaseAuth.getUser(firebaseUser.uid);
    const claims = firebaseRecord.customClaims ?? {};
    const requiresTokenRefresh = claims.role !== 'authenticated';
    if (requiresTokenRefresh) {
      await firebaseAuth.setCustomUserClaims(firebaseUser.uid, {
        ...claims,
        role: 'authenticated',
      });
    }
    return res.json({
      customer_id: identity.authUserId,
      requires_token_refresh: requiresTokenRefresh,
    });
  } catch (bootstrapError) {
    const message = bootstrapError instanceof Error ? bootstrapError.message : 'Could not configure the Firebase account.';
    console.error('Firebase account bootstrap failed.', message);
    const status = message.includes('different existing accounts') || message.includes('already has an account') ? 409 : 503;
    return res.status(status).json({ error: message });
  }
});

app.get('/health', async (_req, res) => {
  const { error } = await db.from('storefront_products').select('id').limit(0);
  if (error) {
    console.error('Health check failed: Supabase storefront query is unavailable.', error);
    return res.status(503).json({ ok: false, service: 'saplaya-api', database: 'unavailable' });
  }
  res.json({ ok: true, service: 'saplaya-api', database: 'connected' });
});

app.get('/products', async (req, res) => {
  const page = Math.max(0, Number(req.query.page ?? 0));
  const size = Math.min(40, Number(req.query.size ?? 20));
  const { data, error } = await db
    .from('storefront_products')
    .select('*')
    .order('name')
    .range(page * size, page * size + size - 1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data, hasMore: (data?.length ?? 0) === size });
});

app.get('/promos', async (_req, res) => {
  const { data, error } = await db.from('promos').select('*').eq('active', true).order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const checkoutSchema = z.object({
  mode: z.enum(['retail', 'wholesale']),
  delivery_window: z.enum(['morning', 'afternoon']).default('morning'),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    qty: z.number().positive().max(10000),
  })).min(1).max(100).superRefine((items, ctx) => {
    const ids = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (ids.has(item.product_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'product_id'],
          message: 'Each product can only appear once.',
        });
      }
      ids.add(item.product_id);
    }
  }),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(5).max(32),
  }),
});

const applicationSchema = z.object({
  farmName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(32),
  location: z.string().trim().min(2).max(240),
  products: z.string().trim().min(2).max(1000),
});

function paymentCallbackUrl(transactionRef: string, orderTrackingId: string) {
  const callback = new URL(PAYMENT_APP_CALLBACK_URL);
  callback.searchParams.set('tx_ref', transactionRef);
  callback.searchParams.set('order_tracking_id', orderTrackingId);
  return callback.toString();
}

function isPesapalConfigured() {
  return Boolean(
    (process.env.PESAPAL_CONSUMER_KEY || process.env.PESAPAL_CUSTOMER_KEY)
    && (process.env.PESAPAL_CONSUMER_SECRET || process.env.PESAPAL_CUSTOMER_SECRET)
    && PUBLIC_API_URL,
  );
}

function normalizedTanzanianPhone(phone: string): string | null {
  const compact = phone.replace(/[\s()-]/g, '');
  if (!/^(?:\+?255|0)?[1-9]\d{8}$/.test(compact)) return null;
  if (compact.startsWith('+255')) return compact;
  if (compact.startsWith('255')) return `+${compact}`;
  if (compact.startsWith('0')) return `+255${compact.slice(1)}`;
  return `+255${compact}`;
}

app.get('/orders', requireUser, async (req: AuthedRequest, res) => {
  if (req.isAnonymous) return res.status(403).json({ error: 'Sign in to view past orders.' });
  const { data, error } = await db
    .from('orders')
    .select('id, mode, status, subtotal, delivery_fee, created_at, delivery_window, payment_method, order_items(qty, unit_price, products(name, unit, image_url))')
    .eq('customer_id', req.userId!)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: 'Could not load order history.' });
  res.json(data);
});

app.post('/payments/initialize', requireUser, async (req: AuthedRequest, res) => {
  if (!isPesapalConfigured()) {
    return res.status(503).json({ error: 'Pesapal checkout is not configured on the server.' });
  }

  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { mode, items, lat, lng, customer, delivery_window: deliveryWindow } = parsed.data;
  const phone = normalizedTanzanianPhone(customer.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid Tanzanian mobile number.' });

  const { data: providerConfig, error: configError } = await db
    .from('payment_provider_config')
    .select('ipn_id')
    .eq('provider', 'pesapal')
    .maybeSingle();
  if (configError) {
    console.error('Could not load Pesapal configuration:', configError.message);
    return res.status(500).json({ error: 'Could not prepare payment checkout.' });
  }
  if (!providerConfig?.ipn_id) {
    return res.status(503).json({ error: 'Pesapal notifications have not been configured.' });
  }

  const { data: products, error: productError } = await db
    .from('products')
    .select('id, name, stock, active, retail_price, wholesale_price, wholesale_min_qty')
    .in('id', items.map((item) => item.product_id));
  if (productError) return res.status(500).json({ error: 'Could not validate the basket.' });
  if (!products || products.length !== items.length) {
    return res.status(400).json({ error: 'One or more items are no longer available.' });
  }

  let subtotal = 0;
  const pricedItems: { product_id: string; qty: number; unit_price: number }[] = [];
  for (const item of items) {
    const product = products.find((candidate) => candidate.id === item.product_id);
    if (!product || !product.active) {
      return res.status(400).json({ error: 'One or more items are no longer available.' });
    }
    if (Number(product.stock) < item.qty) {
      return res.status(400).json({ error: `${product.name} no longer has enough stock.` });
    }
    if (mode === 'wholesale' && item.qty < Number(product.wholesale_min_qty)) {
      return res.status(400).json({ error: `Wholesale minimum for ${product.name} is ${product.wholesale_min_qty}.` });
    }
    const price = Math.round(Number(mode === 'wholesale' ? product.wholesale_price : product.retail_price));
    pricedItems.push({ product_id: item.product_id, qty: item.qty, unit_price: price });
    subtotal += Math.round(price * item.qty);
  }

  const { data: deliverySettings, error: settingsError } = await db
    .from('platform_settings')
    .select('free_radius_km, mid_radius_km, mid_fee, far_fee')
    .eq('id', 'primary')
    .maybeSingle();
  if (settingsError || !deliverySettings) {
    console.error('Could not load delivery pricing settings:', settingsError?.message ?? 'Settings are not initialized.');
    return res.status(503).json({ error: 'Checkout pricing is not configured.' });
  }
  const distance = haversineKm(Number(STORE_LAT), Number(STORE_LNG), lat, lng);
  const fee = deliveryFor(distance, deliverySettings);
  const amount = subtotal + fee;
  const transactionRef = `saplaya-${randomUUID()}`;
  const { error: paymentError } = await db.from('checkout_payments').insert({
    transaction_ref: transactionRef,
    customer_id: req.userId,
    mode,
    items: pricedItems,
    delivery_fee: fee,
    distance_km: Number(distance.toFixed(2)),
    dest_lat: lat,
    dest_lng: lng,
    customer_email: customer.email,
    customer_name: customer.name,
    customer_phone: customer.phone,
    delivery_window: deliveryWindow,
    amount,
    currency: 'TZS',
  });
  if (paymentError) {
    console.error('Could not create checkout payment record:', paymentError.message);
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }

  let orderTrackingId: string | undefined;
  try {
    const order = await submitOrder({
      reference: transactionRef,
      amount,
      callbackUrl: `${PUBLIC_API_URL!.replace(/\/+$/, '')}/payments/callback`,
      ipnId: providerConfig.ipn_id,
      email: customer.email,
      phone,
      name: customer.name,
    });
    orderTrackingId = order.order_tracking_id;
    if (order.merchant_reference !== transactionRef) {
      throw new Error('Pesapal returned a merchant reference that does not match this checkout.');
    }
    const { data: savedPayment, error: trackingError } = await db
      .from('checkout_payments')
      .update({ gateway_transaction_id: orderTrackingId })
      .eq('transaction_ref', transactionRef)
      .eq('status', 'pending')
      .select('transaction_ref')
      .maybeSingle();
    if (trackingError || !savedPayment) {
      console.error('Pesapal order was created but its tracking ID could not be saved:', {
        transactionRef,
        orderTrackingId,
        error: trackingError?.message ?? 'Checkout record was not updated.',
      });
      return res.status(503).json({
        error: 'Payment was created but could not be synchronized. Please contact support before retrying.',
        tx_ref: transactionRef,
      });
    }
    return res.status(201).json({
      payment_url: order.redirect_url,
      tx_ref: transactionRef,
      order_tracking_id: orderTrackingId,
      amount,
      currency: 'TZS',
      delivery_fee: fee,
      distance_km: Number(distance.toFixed(2)),
      subtotal,
      items: pricedItems,
    });
  } catch (error) {
    if (!orderTrackingId) {
      const { error: updateError } = await db
        .from('checkout_payments')
        .update({ status: 'failed' })
        .eq('transaction_ref', transactionRef)
        .eq('status', 'pending');
      if (updateError) console.error('Could not mark failed Pesapal initialization:', updateError.message);
    }
    console.error('Pesapal payment initialization failed:', error);
    return res.status(502).json({ error: 'Could not open secure payment checkout. Please try again.' });
  }
});

const cashCheckoutSchema = checkoutSchema.extend({
  request_key: z.string().min(16).max(120),
});

app.post('/orders/cash', requireUser, async (req: AuthedRequest, res) => {
  const parsed = cashCheckoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { mode, items, lat, lng, customer, delivery_window: deliveryWindow, request_key: requestKey } = parsed.data;

  const { data: products, error: productError } = await db
    .from('products')
    .select('id, name, stock, active, retail_price, wholesale_price, wholesale_min_qty')
    .in('id', items.map((item) => item.product_id));
  if (productError) {
    console.error('Could not validate cash-on-delivery basket:', productError.message);
    return res.status(500).json({ error: 'Could not validate the basket.' });
  }
  if (!products || products.length !== items.length) {
    return res.status(400).json({ error: 'One or more items are no longer available.' });
  }

  let subtotal = 0;
  const pricedItems: { product_id: string; qty: number; unit_price: number }[] = [];
  for (const item of items) {
    const product = products.find((candidate) => candidate.id === item.product_id);
    if (!product || !product.active) {
      return res.status(400).json({ error: 'One or more items are no longer available.' });
    }
    if (Number(product.stock) < item.qty) {
      return res.status(400).json({ error: `${product.name} no longer has enough stock.` });
    }
    if (mode === 'wholesale' && item.qty < Number(product.wholesale_min_qty)) {
      return res.status(400).json({ error: `Wholesale minimum for ${product.name} is ${product.wholesale_min_qty}.` });
    }
    const price = Math.round(Number(mode === 'wholesale' ? product.wholesale_price : product.retail_price));
    pricedItems.push({ product_id: item.product_id, qty: item.qty, unit_price: price });
    subtotal += Math.round(price * item.qty);
  }

  const { data: deliverySettings, error: settingsError } = await db
    .from('platform_settings')
    .select('free_radius_km, mid_radius_km, mid_fee, far_fee')
    .eq('id', 'primary')
    .maybeSingle();
  if (settingsError || !deliverySettings) {
    console.error('Could not load cash checkout delivery settings:', settingsError?.message ?? 'Settings are not initialized.');
    return res.status(503).json({ error: 'Checkout pricing is not configured.' });
  }

  const distance = haversineKm(Number(STORE_LAT), Number(STORE_LNG), lat, lng);
  const fee = deliveryFor(distance, deliverySettings);
  const { data: orderId, error: orderError } = await db.rpc('place_cash_on_delivery_order', {
    p_customer: req.userId,
    p_request_key: requestKey,
    p_mode: mode,
    p_items: pricedItems,
    p_fee: fee,
    p_distance: Number(distance.toFixed(2)),
    p_lat: lat,
    p_lng: lng,
    p_delivery_window: deliveryWindow,
    p_customer_name: customer.name,
    p_customer_email: customer.email,
    p_customer_phone: customer.phone,
  });
  if (orderError || !orderId) {
    console.error('Could not place cash-on-delivery order:', orderError?.message ?? 'Order ID was not returned.');
    const message = orderError?.message ?? '';
    if (message.includes('Checkout request key was reused')) {
      return res.status(409).json({ error: 'Your basket changed while the order was being placed. Review it and try again.' });
    }
    if (/not enough stock|no longer available|price .* changed|wholesale minimum/i.test(message)) {
      return res.status(409).json({ error: message });
    }
    return res.status(500).json({ error: 'Could not place your order. Please try again.' });
  }

  const [{ data: savedOrder, error: savedOrderError }, { data: savedItems, error: savedItemsError }] = await Promise.all([
    db.from('orders')
      .select('id, subtotal, delivery_fee, delivery_window, created_at')
      .eq('id', orderId)
      .eq('customer_id', req.userId)
      .single(),
    db.from('order_items')
      .select('product_id, qty, unit_price')
      .eq('order_id', orderId),
  ]);
  if (savedOrderError || savedItemsError || !savedOrder) {
    console.error('Cash-on-delivery order exists but could not be reloaded:', {
      orderId,
      error: savedOrderError?.message ?? savedItemsError?.message ?? 'Order was not returned.',
    });
    return res.status(503).json({ error: 'Your order was created but could not be displayed. Check your order tracking before retrying.' });
  }

  return res.status(201).json({
    order_id: orderId,
    subtotal: Number(savedOrder.subtotal),
    delivery_fee: Number(savedOrder.delivery_fee),
    amount: Number(savedOrder.subtotal) + Number(savedOrder.delivery_fee),
    delivery_window: savedOrder.delivery_window,
    created_at: savedOrder.created_at,
    items: (savedItems ?? []).map((item) => ({
      product_id: item.product_id,
      qty: Number(item.qty),
      unit_price: Number(item.unit_price),
    })),
  });
});

app.get('/payments/callback', (req, res) => {
  const transactionRef = String(req.query.OrderMerchantReference ?? req.query.tx_ref ?? '');
  const orderTrackingId = String(req.query.OrderTrackingId ?? req.query.order_tracking_id ?? '');
  if (!/^saplaya-[0-9a-f-]{36}$/i.test(transactionRef) || !orderTrackingId) {
    return res.redirect(302, paymentCallbackUrl('', ''));
  }
  return res.redirect(302, paymentCallbackUrl(transactionRef, orderTrackingId));
});

const confirmPaymentSchema = z.object({
  tx_ref: z.string().regex(/^saplaya-[0-9a-f-]{36}$/i),
  order_tracking_id: z.string().min(1).max(200),
});

app.post('/payments/confirm', requireUser, async (req: AuthedRequest, res) => {
  if (!isPesapalConfigured()) {
    return res.status(503).json({ error: 'Pesapal checkout is not configured on the server.' });
  }
  const parsed = confirmPaymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { tx_ref: transactionRef, order_tracking_id: orderTrackingId } = parsed.data;
  const { data: payment, error: paymentError } = await db
    .from('checkout_payments')
    .select('amount, currency, status, order_id, gateway_transaction_id')
    .eq('transaction_ref', transactionRef)
    .eq('customer_id', req.userId!)
    .maybeSingle();
  if (paymentError) return res.status(500).json({ error: 'Could not verify this checkout.' });
  if (!payment) return res.status(404).json({ error: 'Payment reference was not found for this account.' });
  if (payment.gateway_transaction_id !== orderTrackingId) {
    return res.status(400).json({ error: 'Payment tracking details do not match this checkout.' });
  }
  if (payment.status === 'paid' && payment.order_id) {
    return res.json({ order_id: payment.order_id });
  }

  try {
    const verified = await getTransactionStatus(orderTrackingId);
    if (
      (verified.order_tracking_id && verified.order_tracking_id !== orderTrackingId)
      || (verified.merchant_reference && verified.merchant_reference !== transactionRef)
    ) {
      return res.status(400).json({ error: 'Pesapal returned transaction details that do not match this checkout.' });
    }
    if (!isPaymentCompleted(verified)) {
      if (isPaymentFailed(verified)) {
        const { error: updateError } = await db
          .from('checkout_payments')
          .update({ status: 'failed' })
          .eq('transaction_ref', transactionRef)
          .eq('status', 'pending');
        if (updateError) {
          console.error('Could not mark failed Pesapal checkout:', updateError.message);
          return res.status(500).json({ error: 'Could not update payment status.' });
        }
        return res.status(402).json({ error: 'Pesapal confirmed that this payment was not completed.' });
      }
      return res.status(202).json({ status: 'pending', message: 'Payment has not been confirmed yet.' });
    }
    if (Math.round(Number(verified.amount)) !== Number(payment.amount) || verified.currency !== payment.currency) {
      console.error('Pesapal completed payment does not match the expected amount or currency:', transactionRef);
      return res.status(409).json({ error: 'Payment details do not match this checkout. Please contact support.' });
    }

    const { data: orderId, error } = await db.rpc('complete_pesapal_payment', {
      p_transaction_ref: transactionRef,
      p_order_tracking_id: orderTrackingId,
    });
    if (error) {
      console.error('Verified payment could not be converted to an order:', error.message);
      return res.status(409).json({ error: 'Payment was received, but the order could not be completed. Please contact support with your payment reference.' });
    }
    return res.json({ order_id: orderId });
  } catch (error) {
    console.error('Pesapal transaction verification failed:', error);
    return res.status(502).json({ error: 'Could not verify the payment right now. Please try again.' });
  }
});

app.post('/admin/payments/pesapal/register-ipn', requirePerm('settings.manage'), async (_req, res) => {
  if (!isPesapalConfigured()) {
    return res.status(503).json({ error: 'Pesapal credentials and PUBLIC_API_URL must be configured.' });
  }
  const { data: existing, error: lookupError } = await db
    .from('payment_provider_config')
    .select('ipn_id')
    .eq('provider', 'pesapal')
    .maybeSingle();
  if (lookupError) {
    console.error('Could not load Pesapal IPN configuration:', lookupError.message);
    return res.status(500).json({ error: 'Could not check existing Pesapal notification configuration.' });
  }
  if (existing?.ipn_id) return res.json({ ipn_id: existing.ipn_id, already_registered: true });

  try {
    const ipnId = await registerIpn(`${PUBLIC_API_URL!.replace(/\/+$/, '')}/api/v1/payments/pesapal-ipn`);
    const { error: saveError } = await db.from('payment_provider_config').upsert({
      provider: 'pesapal',
      ipn_id: ipnId,
      updated_at: new Date().toISOString(),
    });
    if (saveError) {
      console.error('Pesapal IPN was registered but could not be saved:', { ipnId, error: saveError.message });
      return res.status(500).json({ error: 'IPN was registered but could not be saved. Contact support before registering again.' });
    }
    console.info('Pesapal IPN registered:', ipnId);
    return res.status(201).json({ ipn_id: ipnId, already_registered: false });
  } catch (error) {
    console.error('Pesapal IPN registration failed:', error);
    return res.status(502).json({ error: 'Could not register the Pesapal notification URL.' });
  }
});

app.get('/api/v1/payments/pesapal-ipn', async (req, res) => {
  const orderTrackingId = String(req.query.OrderTrackingId ?? req.query.orderTrackingId ?? '');
  const merchantReference = String(req.query.OrderMerchantReference ?? req.query.merchant_reference ?? '');
  if (!orderTrackingId) return res.status(400).json({ error: 'Missing Pesapal order tracking ID.' });

  const { data: payment, error: lookupError } = await db
    .from('checkout_payments')
    .select('transaction_ref, gateway_transaction_id')
    .eq('gateway_transaction_id', orderTrackingId)
    .maybeSingle();
  if (lookupError) {
    console.error('Could not find checkout for Pesapal IPN:', lookupError.message);
    return res.status(503).json({ error: 'Could not process payment notification.' });
  }
  if (!payment) {
    console.warn('Acknowledging Pesapal IPN for an unknown tracking ID:', orderTrackingId);
    return res.status(200).json({ status: 'acknowledged' });
  }
  if (merchantReference && merchantReference !== payment.transaction_ref) {
    console.error('Pesapal IPN merchant reference did not match its tracking ID:', orderTrackingId);
    return res.status(200).json({ status: 'acknowledged', processed: false });
  }

  try {
    const verified = await getTransactionStatus(orderTrackingId);
    if (
      (verified.order_tracking_id && verified.order_tracking_id !== orderTrackingId)
      || (verified.merchant_reference && verified.merchant_reference !== payment.transaction_ref)
    ) {
      console.error('Pesapal status query returned a mismatched transaction:', orderTrackingId);
      return res.status(200).json({ status: 'acknowledged', processed: false });
    }
    if (!isPaymentCompleted(verified)) {
      if (isPaymentFailed(verified)) {
        const { error: updateError } = await db
          .from('checkout_payments')
          .update({ status: 'failed' })
          .eq('transaction_ref', payment.transaction_ref)
          .eq('status', 'pending');
        if (updateError) {
          console.error('Could not mark failed Pesapal payment from IPN:', updateError.message);
          return res.status(503).json({ error: 'Could not update failed payment notification.' });
        }
        return res.status(200).json({ status: 'acknowledged', processed: true });
      }
      return res.status(200).json({ status: 'acknowledged', processed: false });
    }

    const { data: paymentDetails, error: paymentDetailsError } = await db
      .from('checkout_payments')
      .select('amount, currency')
      .eq('transaction_ref', payment.transaction_ref)
      .maybeSingle();
    if (paymentDetailsError || !paymentDetails) {
      console.error('Could not load payment details for Pesapal IPN:', paymentDetailsError?.message);
      return res.status(503).json({ error: 'Could not verify the notified payment.' });
    }
    if (
      Math.round(Number(verified.amount)) !== Number(paymentDetails.amount)
      || verified.currency !== paymentDetails.currency
    ) {
      console.error('Pesapal notified payment amount or currency did not match:', payment.transaction_ref);
      return res.status(200).json({ status: 'acknowledged', processed: false });
    }

    const { error: fulfillmentError } = await db.rpc('complete_pesapal_payment', {
      p_transaction_ref: payment.transaction_ref,
      p_order_tracking_id: orderTrackingId,
    });
    if (fulfillmentError) {
      console.error('Verified Pesapal IPN could not fulfill its order:', fulfillmentError.message);
      return res.status(503).json({ error: 'Could not fulfill verified payment notification.' });
    }
    return res.status(200).json({ status: 'acknowledged', processed: true });
  } catch (error) {
    console.error('Pesapal IPN status verification failed:', error);
    return res.status(503).json({ error: 'Could not verify payment notification; retry later.' });
  }
});

app.post('/supplier-applications', requireUser, async (req: AuthedRequest, res) => {
  const parsed = applicationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await db.from('supplier_applications').insert({
    customer_id: req.userId,
    farm_name: parsed.data.farmName,
    contact_name: parsed.data.contactName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    location: parsed.data.location,
    products: parsed.data.products,
  }).select('id, status, created_at').single();
  if (error) {
    console.error('Could not save supplier application:', error.message);
    return res.status(500).json({ error: 'Could not submit your application. Please try again.' });
  }
  return res.status(201).json(data);
});


// ======================================================================
// Public: "Become a supplier" form on the landing page
// ======================================================================
const applySchema = z.object({
  farm_name: z.string().min(2).max(120),
  contact_name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(5).max(40),
  region: z.string().min(2).max(80),
  produce: z.string().min(2).max(300),
  farm_size: z.string().min(2).max(60),
});

app.post('/apply', async (req: Request, res: Response) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await db.from('supplier_applications').insert({
    customer_id: null,
    farm_name: parsed.data.farm_name,
    contact_name: parsed.data.contact_name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    location: parsed.data.region,
    region: parsed.data.region,
    farm_size: parsed.data.farm_size,
    products: parsed.data.produce,
  }).select('id').single();
  if (error) {
    console.error('Could not save public supplier application:', error.message);
    return res.status(500).json({ error: 'Could not submit your application. Please try again.' });
  }
  return res.status(201).json({ ok: true, id: data.id });
});

// ======================================================================
// Admin: who am I
// ======================================================================
app.get('/admin/me', requirePerm(), (req: AuthedRequest, res: Response) => {
  const m = req.member!;
  res.json({ ...m, permissions: PERMISSIONS[m.role] });
});

// ======================================================================
// Admin: orders. Platform roles see all farms; farm roles only their own.
// ======================================================================
app.get('/admin/orders', requirePerm('orders.view'), async (req: AuthedRequest, res: Response) => {
  const m = req.member!;
  let q = db
    .from('supplier_orders')
    .select('id, order_id, supplier_id, status, updated_at, orders!supplier_orders_order_id_fkey(id, mode, created_at, delivery_fee, dest_lat, dest_lng, customer_id, delivery_window, payment_method, contact_name, contact_phone), order_items!order_items_supplier_order_id_fkey(product_id, qty, unit_price, products(name, unit))')
    .order('updated_at', { ascending: false })
    .limit(300);
  if (m.supplier_id) q = q.eq('supplier_id', m.supplier_id);
  if (m.role === 'driver') q = q.in('status', ['packing', 'en_route', 'delivered']);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  const customerIds = [...new Set((data ?? [])
    .flatMap((row) => Array.isArray(row.orders) ? row.orders : row.orders ? [row.orders] : [])
    .map((order) => order.customer_id)
    .filter(Boolean))];
  const orderIds = [...new Set((data ?? []).map((row) => row.order_id).filter(Boolean))];
  const mayViewCustomerContact = !m.supplier_id;
  const [{ data: customers, error: customerError }, { data: paymentContacts, error: paymentContactError }] = mayViewCustomerContact
    ? await Promise.all([
      customerIds.length
        ? db.from('customer_profiles').select('customer_id, full_name, phone').in('customer_id', customerIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? db.from('checkout_payments').select('order_id, customer_name, customer_phone').in('order_id', orderIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (customerError || paymentContactError) {
    console.error('Could not load admin order customer details:', customerError?.message ?? paymentContactError?.message);
    return res.status(500).json({ error: 'Could not load orders.' });
  }
  const customerById = new Map((customers ?? []).map((customer) => [customer.customer_id, customer]));
  const paymentContactByOrderId = new Map((paymentContacts ?? []).map((payment) => [payment.order_id, payment]));
  res.json((data ?? []).map((row) => {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    const customer = order ? customerById.get(order.customer_id) : undefined;
    const paymentContact = paymentContactByOrderId.get(row.order_id);
    const fullName = order?.contact_name || paymentContact?.customer_name || customer?.full_name || 'Customer';
    const customerName = m.supplier_id ? fullName.split(/\s+/)[0] : fullName;
    const area = order?.dest_lat != null && order?.dest_lng != null
      ? `${Number(order.dest_lat).toFixed(4)}, ${Number(order.dest_lng).toFixed(4)}`
      : 'Delivery location';
    return {
      id: row.id,
      order_id: row.order_id,
      supplier_id: row.supplier_id,
      status: row.status,
      updated_at: row.updated_at,
      code: row.order_id.slice(0, 8).toUpperCase(),
      order,
      customer_name: customerName,
      customer_phone: mayViewCustomerContact ? order?.contact_phone || paymentContact?.customer_phone || customer?.phone || '' : '',
      area,
      items: (row.order_items ?? []).map((item) => ({
        product_id: item.product_id,
        qty: item.qty,
        unit_price: item.unit_price,
        product: item.products,
      })),
    };
  }));
});

const statusSchema = z.object({ status: z.enum(['pending', 'packing', 'en_route', 'delivered', 'cancelled']) });

// Updating supplier_orders fires the DB trigger -> orders.status -> Supabase Realtime
// -> the customer's tracking screen glows in the new colour.
app.patch('/admin/supplier-orders/:id/status', requirePerm('orders.update_status'), async (req: AuthedRequest, res: Response) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  if (m.role === 'driver' && !DRIVER_STATUSES.includes(parsed.data.status)) {
    return res.status(403).json({ error: 'Drivers can only mark orders On the way or Delivered' });
  }
  let q = db
    .from('supplier_orders')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id);
  if (m.supplier_id) q = q.eq('supplier_id', m.supplier_id); // farm roles: own rows only
  const { data, error } = await q.select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// ======================================================================
// Admin: products, inventory
// ======================================================================
app.get('/admin/products', requirePerm('products.view'), async (req: AuthedRequest, res: Response) => {
  const m = req.member!;
  let q = db.from('products').select('*').order('name');
  if (m.supplier_id) q = q.eq('supplier_id', m.supplier_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const productSchema = z.object({
  name: z.string().min(2), category: z.string().optional(), unit: z.string().default('kg'),
  retail_price: z.number().int().positive(), wholesale_price: z.number().int().positive(),
  wholesale_min_qty: z.number().int().positive().default(10), stock: z.number().min(0).default(0),
  low_stock_at: z.number().min(0).default(10),
  image_url: z.string().url().nullable().optional(), active: z.boolean().default(true),
});

app.post('/admin/products', requirePerm('products.edit'), async (req: AuthedRequest, res: Response) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  if (!m.supplier_id) return res.status(400).json({ error: 'Products belong to a farm. Sign in as a farm owner.' });
  const { data, error } = await db.rpc('create_product_with_stock', {
    p_supplier_id: m.supplier_id,
    p_name: parsed.data.name,
    p_category: parsed.data.category ?? null,
    p_unit: parsed.data.unit,
    p_retail_price: parsed.data.retail_price,
    p_wholesale_price: parsed.data.wholesale_price,
    p_wholesale_min_qty: parsed.data.wholesale_min_qty,
    p_stock: parsed.data.stock,
    p_low_stock_at: parsed.data.low_stock_at,
    p_image_url: parsed.data.image_url ?? null,
    p_active: parsed.data.active,
  });
  if (error) return res.status(500).json({ error: 'Could not create this product.' });
  res.status(201).json(data);
});

app.patch('/admin/products/:id', requirePerm('products.edit'), async (req: AuthedRequest, res: Response) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  if (!m.supplier_id) return res.status(400).json({ error: 'Sign in as a farm owner to edit products.' });
  const { stock: _ignored, ...safe } = parsed.data; // stock only changes via /admin/restock so every change is logged
  const { data, error } = await db.from('products').update(safe).eq('id', req.params.id).eq('supplier_id', m.supplier_id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

app.get('/admin/catalog', requirePerm('catalog.manage'), async (_req: AuthedRequest, res: Response) => {
  const [{ data: items, error: catalogError }, { data: proposals, error: proposalError }] = await Promise.all([
    db.from('catalog_products').select('*').order('category').order('name'),
    db.from('catalog_price_proposals').select('id, catalog_product_id, supplier_id, product_id, retail_price, wholesale_price, status, created_at').eq('status', 'pending').order('created_at'),
  ]);
  if (catalogError || proposalError) {
    console.error('Could not load the central product catalog:', catalogError?.message ?? proposalError?.message);
    return res.status(500).json({ error: 'Could not load the product catalog.' });
  }
  return res.json({ items, proposals });
});

const catalogUpdateSchema = z.object({
  category: z.string().trim().min(2).max(80),
  unit: z.string().trim().min(1).max(24),
  retail_price: z.number().int().positive(),
  wholesale_price: z.number().int().positive(),
  wholesale_min_qty: z.number().int().positive(),
  image_url: z.string().url().nullable(),
  price_approved: z.boolean(),
}).refine((value) => value.wholesale_price < value.retail_price, {
  message: 'Wholesale price must be lower than retail price.',
  path: ['wholesale_price'],
});

app.patch('/admin/catalog/:id', requirePerm('catalog.manage'), async (req: AuthedRequest, res: Response) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = catalogUpdateSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    return res.status(400).json({ error: parsed.success ? 'Invalid catalog product ID.' : parsed.error.flatten() });
  }
  const { data, error } = await db.rpc('admin_update_catalog_product', {
    p_id: id.data,
    p_category: parsed.data.category,
    p_unit: parsed.data.unit,
    p_retail_price: parsed.data.retail_price,
    p_wholesale_price: parsed.data.wholesale_price,
    p_wholesale_min_qty: parsed.data.wholesale_min_qty,
    p_image_url: parsed.data.image_url,
    p_price_approved: parsed.data.price_approved,
  });
  if (error || !data) {
    console.error('Could not update central catalog pricing:', error?.message ?? 'Catalog product not found.');
    return res.status(error?.message.includes('not found') ? 404 : 400).json({ error: 'Could not update this catalog product.' });
  }
  return res.json(data);
});

app.post('/admin/catalog-proposals/:id/review', requirePerm('catalog.manage'), async (req: AuthedRequest, res: Response) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = z.object({ approve: z.boolean() }).safeParse(req.body);
  if (!id.success || !parsed.success) {
    return res.status(400).json({ error: parsed.success ? 'Invalid price proposal ID.' : parsed.error.flatten() });
  }
  const { data, error } = await db.rpc('review_catalog_price_proposal', {
    p_proposal_id: id.data,
    p_approve: parsed.data.approve,
  });
  if (error || !data) {
    console.error('Could not review catalog price proposal:', error?.message ?? 'Proposal was not found.');
    return res.status(error?.message.includes('not found') ? 404 : 409).json({ error: 'Could not review this price proposal.' });
  }
  return res.json({ catalog_product_id: data, status: parsed.data.approve ? 'approved' : 'rejected' });
});

app.get('/admin/inventory-movements', requirePerm('inventory.view'), async (req: AuthedRequest, res: Response) => {
  const m = req.member!;
  let q = db
    .from('inventory_movements')
    .select('id, supplier_id, kind, qty_change, stock_after, created_at, order_id, products(name, unit)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (m.supplier_id) q = q.eq('supplier_id', m.supplier_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const restockSchema = z.object({ product_id: z.string().uuid(), qty: z.number().positive() });

app.post('/admin/restock', requirePerm('stock.adjust'), async (req: AuthedRequest, res: Response) => {
  const parsed = restockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  if (!m.supplier_id) return res.status(400).json({ error: 'Stock belongs to a farm.' });
  const { data: stockAfter, error } = await db.rpc('restock_product', {
    p_product_id: parsed.data.product_id,
    p_qty: parsed.data.qty,
    p_supplier_id: m.supplier_id,
  });
  if (error) {
    console.error('Could not restock product:', error.message);
    return res.status(error.message.includes('not found') ? 404 : 500).json({ error: 'Could not update product stock.' });
  }
  return res.json({ stock: stockAfter });
});

// ======================================================================
// Admin: suppliers and applications (platform roles only)
// ======================================================================
app.get('/admin/suppliers', requirePerm('suppliers.view_all'), async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await db.from('suppliers').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.patch('/admin/suppliers/:id', requirePerm('suppliers.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ status: z.enum(['pending', 'active', 'suspended']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await db.from('suppliers').update({ status: parsed.data.status }).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const supplierSchema = z.object({
  name: z.string().min(2).max(120),
  region: z.string().min(2).max(80),
  contact_name: z.string().min(2).max(120),
  contact_email: z.string().email(),
  contact_phone: z.string().min(5).max(40),
});

app.post('/admin/suppliers', requirePerm('suppliers.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data: supplier, error: supplierError } = await db.from('suppliers').insert({
    name: parsed.data.name,
    region: parsed.data.region,
    contact_name: parsed.data.contact_name,
    contact_email: parsed.data.contact_email,
    contact_phone: parsed.data.contact_phone,
    status: 'active',
  }).select('id').single();
  if (supplierError) return res.status(500).json({ error: 'Could not create the farm.' });

  const invited = await db.auth.admin.inviteUserByEmail(parsed.data.contact_email);
  if (invited.error || !invited.data.user) {
    await db.from('suppliers').delete().eq('id', supplier.id);
    return res.status(502).json({ error: invited.error?.message ?? 'Could not invite the farm owner.' });
  }
  const { data: member, error: memberError } = await db.from('team_members').insert({
    user_id: invited.data.user.id,
    supplier_id: supplier.id,
    full_name: parsed.data.contact_name,
    email: parsed.data.contact_email,
    role: 'supplier_owner',
    status: 'invited',
  }).select().single();
  if (memberError) {
    await db.auth.admin.deleteUser(invited.data.user.id);
    await db.from('suppliers').delete().eq('id', supplier.id);
    return res.status(500).json({ error: 'The farm owner invitation could not be saved.' });
  }
  return res.status(201).json({ supplier_id: supplier.id, team_member: member });
});

app.get('/admin/applications', requirePerm('suppliers.manage'), async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await db.from('supplier_applications').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Approve = create the farm + invite its owner by email. Reject = just close it.
app.post('/admin/applications/:id/:decision', requirePerm('suppliers.manage'), async (req: AuthedRequest, res: Response) => {
  const decision = req.params.decision;
  if (decision !== 'approve' && decision !== 'reject') return res.status(400).json({ error: 'Use approve or reject' });
  const { data: a } = await db.from('supplier_applications').select('*').eq('id', req.params.id).maybeSingle();
  if (!a || !['pending', 'reviewing', 'new'].includes(a.status)) {
    return res.status(404).json({ error: 'Application not found or already handled' });
  }

  if (decision === 'reject') {
    const { error } = await db.from('supplier_applications').update({ status: 'declined' }).eq('id', a.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  const { data: s, error: se } = await db.from('suppliers').insert({
    name: a.farm_name, status: 'active', region: a.region ?? a.location,
    contact_name: a.contact_name, contact_email: a.email, contact_phone: a.phone,
  }).select().single();
  if (se) return res.status(500).json({ error: se.message });

  const invited = await db.auth.admin.inviteUserByEmail(a.email);
  if (invited.error) return res.status(500).json({ error: invited.error.message });
  await db.from('team_members').insert({
    user_id: invited.data.user.id, supplier_id: s.id, full_name: a.contact_name,
    email: a.email, role: 'supplier_owner', status: 'active',
  });
  await db.from('supplier_applications').update({ status: 'approved' }).eq('id', a.id);
  res.json({ ok: true, supplier_id: s.id });
});

// ======================================================================
// Admin: team and roles
// ======================================================================
app.get('/admin/team', requirePerm('team.view'), async (req: AuthedRequest, res: Response) => {
  const m = req.member!;
  let q = db.from('team_members').select('id, supplier_id, full_name, email, role, status').order('full_name');
  if (m.supplier_id) q = q.eq('supplier_id', m.supplier_id); // a farm only sees its own people
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const inviteSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['platform_manager', 'supplier_owner', 'supplier_staff', 'driver']),
  supplier_id: z.string().uuid().optional(),
});

app.post('/admin/team', requirePerm('team.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  let { role, supplier_id } = parsed.data;

  if (m.supplier_id) {
    // Farm owners can only add packers to their own farm.
    if (!FARM_ASSIGNABLE.includes(role)) return res.status(403).json({ error: 'A farm owner can only add farm staff' });
    supplier_id = m.supplier_id;
  } else if (role === 'supplier_owner' || role === 'supplier_staff') {
    if (!supplier_id) return res.status(400).json({ error: 'Choose which farm this person belongs to' });
  } else {
    supplier_id = undefined;
  }

  const invited = await db.auth.admin.inviteUserByEmail(parsed.data.email);
  if (invited.error) return res.status(500).json({ error: invited.error.message });
  const { data, error } = await db.from('team_members').insert({
    user_id: invited.data.user.id, supplier_id: supplier_id ?? null,
    full_name: parsed.data.full_name, email: parsed.data.email, role, status: 'invited',
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/admin/team/:id', requirePerm('team.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ status: z.enum(['active', 'suspended']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  if (req.params.id === m.id) return res.status(400).json({ error: 'You cannot change your own access' });
  let q = db.from('team_members').update({ status: parsed.data.status }).eq('id', req.params.id);
  if (m.supplier_id) q = q.eq('supplier_id', m.supplier_id).eq('role', 'supplier_staff');
  const { data, error } = await q.select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

const settingsSchema = z.object({
  hub_name: z.string().min(2).max(120),
  free_radius_km: z.number().min(0).max(100),
  mid_radius_km: z.number().positive().max(200),
  mid_fee: z.number().int().nonnegative(),
  far_fee: z.number().int().nonnegative(),
  commission_pct: z.number().min(0).max(40),
  wholesale_min_default: z.number().int().positive(),
}).refine((settings) => settings.mid_radius_km > settings.free_radius_km, {
  message: 'The standard delivery distance must exceed the free distance.',
  path: ['mid_radius_km'],
}).refine((settings) => settings.far_fee >= settings.mid_fee, {
  message: 'Far delivery cannot cost less than standard delivery.',
  path: ['far_fee'],
});

app.get('/admin/settings', requirePerm('settings.manage'), async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await db.from('platform_settings').select('*').eq('id', 'primary').maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not load platform settings.' });
  if (!data) return res.status(503).json({ error: 'Platform settings have not been initialized.' });
  return res.json(data);
});

app.put('/admin/settings', requirePerm('settings.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await db.from('platform_settings').upsert({
    id: 'primary',
    hub_name: parsed.data.hub_name,
    free_radius_km: parsed.data.free_radius_km,
    mid_radius_km: parsed.data.mid_radius_km,
    mid_fee: parsed.data.mid_fee,
    far_fee: parsed.data.far_fee,
    commission_pct: parsed.data.commission_pct,
    wholesale_min_default: parsed.data.wholesale_min_default,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select().single();
  if (error) return res.status(500).json({ error: 'Could not save platform settings.' });
  return res.json(data);
});

app.listen(Number(PORT), () => console.log(`Saplaya API on :${PORT}`));
