import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { City, Country, State } from 'country-state-city';
import WebSocket from 'ws';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { deriveOrderMode, haversineKm, selectStorefrontProducts, type OrderMode } from './storefront.js';
import {
  calculateWeeklyCommission,
  supplierMatchesScopes,
  weekBoundsUtc,
  type CommissionTier,
  type OperationScope,
} from './management.js';
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
  PUBLIC_API_URL,
  PAYMENT_APP_CALLBACK_URL = 'saplaya://payment-callback',
  WEB_CHECKOUT_CALLBACK_URL,
  GOOGLE_MAPS_API_KEY,
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

app.get('/locations/countries', (_req, res) => {
  return res.json(Country.getAllCountries()
    .map((country) => ({ code: country.isoCode, name: country.name }))
    .sort((left, right) => left.name.localeCompare(right.name)));
});

app.get('/locations/countries/:countryCode/regions', (req, res) => {
  const countryCode = z.string().regex(/^[A-Z]{2}$/).safeParse(req.params.countryCode.toUpperCase());
  if (!countryCode.success) return res.status(400).json({ error: 'Invalid country code.' });
  return res.json(State.getStatesOfCountry(countryCode.data)
    .map((region) => ({ code: region.isoCode, name: region.name }))
    .sort((left, right) => left.name.localeCompare(right.name)));
});

app.get('/locations/countries/:countryCode/regions/:regionCode/districts', (req, res) => {
  const countryCode = z.string().regex(/^[A-Z]{2}$/).safeParse(req.params.countryCode.toUpperCase());
  const regionCode = z.string().trim().min(1).max(100).safeParse(req.params.regionCode);
  if (!countryCode.success || !regionCode.success) return res.status(400).json({ error: 'Invalid country or region code.' });
  return res.json(City.getCitiesOfState(countryCode.data, regionCode.data)
    .map((district) => ({ code: district.name, name: district.name }))
    .sort((left, right) => left.name.localeCompare(right.name)));
});

// ======================================================================
// Roles and permissions (the web admin panel mirrors this table)
// ======================================================================
type Role = string;
type Perm =
  | 'dashboard.view' | 'orders.view' | 'orders.update_status'
  | 'products.view' | 'products.edit' | 'stock.adjust' | 'inventory.view'
  | 'catalog.manage'
  | 'suppliers.view_all' | 'suppliers.manage'
  | 'team.view' | 'team.manage' | 'settings.manage'
  | 'finance.view' | 'marketing.view' | 'stores.view' | 'system.view' | 'team.roles.manage'
  | 'management.view' | 'management.manage';

const ALL: Perm[] = [
  'dashboard.view', 'orders.view', 'orders.update_status', 'products.view', 'products.edit',
  'stock.adjust', 'inventory.view', 'catalog.manage', 'suppliers.view_all', 'suppliers.manage',
  'team.view', 'team.manage', 'settings.manage', 'finance.view', 'marketing.view',
  'stores.view', 'system.view', 'team.roles.manage', 'management.view', 'management.manage',
];

// A driver may only move an order along the road; they cannot pack or cancel.
const DRIVER_STATUSES = ['en_route', 'delivered'];

type Member = {
  id: string; user_id: string; supplier_id: string | null;
  full_name: string; email: string; role: Role; status: string;
  role_label: string; department_id: string; department: string; department_theme: string;
  role_scope: 'platform' | 'farm'; permissions: Perm[];
  phone: string | null; age: number | null; job_title: string | null; bio: string | null;
  avatar_url: string | null; operation_scope_mode: 'global' | 'restricted';
  operation_scopes: OperationScope[];
};
type AuthedRequest = Request & {
  userId?: string;
  isAnonymous?: boolean;
  authProvider?: 'supabase' | 'firebase';
  member?: Member;
};

const isPlatform = (m: Member) => m.supplier_id === null;
const isPlatformAdministrator = (m: Member) =>
  isPlatform(m) && ['platform_owner', 'administrator', 'platform_admin'].includes(m.role);
const canViewTierPricing = (m: Member) =>
  m.role === 'platform_owner'
  || (m.role_scope === 'platform' && ['administrator', 'platform_admin'].includes(m.role))
  || (m.role === 'supplier_owner' && m.role_scope === 'farm');

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

function getFirebaseAdminMessaging() {
  getFirebaseAdminAuth();
  const adminApp = getApps().find((app) => app.name === FIREBASE_APP_NAME);
  if (!adminApp) throw new Error('Firebase server application was not initialized.');
  return getMessaging(adminApp);
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
      const { data, error: memberError } = await db
        .from('team_members')
        .select('id, user_id, supplier_id, full_name, email, role, status')
        .eq('user_id', req.userId!)
        .maybeSingle();
      if (memberError) {
        console.error('Could not load team account:', memberError.message);
        return res.status(503).json({ error: 'Could not load your team access.' });
      }
      if (!data) return res.status(403).json({ error: 'No active team account' });
      const { data: role, error: roleError } = await db.from('team_roles')
        .select('role_key, name, department_id, scope, permissions')
        .eq('role_key', data.role)
        .maybeSingle();
      if (roleError || !role) {
        console.error('Could not load team role configuration:', roleError?.message ?? 'Assigned role was not found.');
        return res.status(503).json({ error: 'Could not load your role permissions.' });
      }
      const { data: department, error: departmentError } = await db.from('team_departments')
        .select('name, theme_color')
        .eq('id', role.department_id)
        .maybeSingle();
      if (departmentError || !department) {
        console.error('Could not load team department configuration:', departmentError?.message ?? 'Assigned department was not found.');
        return res.status(503).json({ error: 'Could not load your department.' });
      }
      const { data: profile, error: profileError } = await db.from('team_member_profiles')
        .select('phone, age, job_title, bio, avatar_url, operation_scope_mode')
        .eq('team_member_id', data.id)
        .maybeSingle();
      const { data: operationScopes, error: scopesError } = await db.from('team_member_operation_scopes')
        .select('country_code, country_name, region_code, region_name, district_code, district_name')
        .eq('team_member_id', data.id);
      if (profileError || scopesError) {
        console.error('Could not load team member profile and operation scopes:', profileError?.message ?? scopesError?.message);
        return res.status(503).json({ error: 'Could not load your team profile and operation access.' });
      }
      let m: Member = {
        ...data,
        role: role.role_key,
        role_label: role.name,
        department_id: role.department_id,
        department: department.name,
        department_theme: department.theme_color,
        role_scope: role.scope,
        permissions: role.permissions.filter((permission: string): permission is Perm => ALL.includes(permission as Perm)),
        phone: profile?.phone ?? null,
        age: profile?.age ?? null,
        job_title: profile?.job_title ?? null,
        bio: profile?.bio ?? null,
        avatar_url: profile?.avatar_url ?? null,
        operation_scope_mode: profile?.operation_scope_mode === 'restricted' ? 'restricted' : 'global',
        operation_scopes: operationScopes ?? [],
      };
      if (!m || m.status === 'suspended') return res.status(403).json({ error: 'No active team account' });
      if (m.status === 'invited') {
        const { data: activated, error: activateError } = await db.from('team_members')
          .update({ status: 'active' })
          .eq('id', m.id)
          .eq('user_id', req.userId!)
          .eq('status', 'invited')
          .select('id')
          .maybeSingle();
        if (activateError || !activated) {
          return res.status(403).json({ error: 'Could not activate this team invitation.' });
        }
        m = { ...m, status: 'active' };
      }
      if (perm && !m.permissions.includes(perm)) {
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

async function scopedSupplierIds(member: Member): Promise<string[] | null> {
  if (member.supplier_id) return [member.supplier_id];
  if (member.operation_scope_mode !== 'restricted') return null;
  if (!member.operation_scopes.length) return [];

  const countryCodes = [...new Set(member.operation_scopes.map((scope) => scope.country_code))];
  const { data, error } = await db.from('suppliers')
    .select('id, country_code, region_code, district_code')
    .in('country_code', countryCodes);
  if (error) {
    console.error('Could not resolve farm locations for operation scope:', error.message);
    throw new Error('Could not load your assigned operation areas.');
  }
  return (data ?? [])
    .filter((supplier) => supplierMatchesScopes(supplier, member.operation_scopes))
    .map((supplier) => supplier.id);
}

async function memberCanAccessSupplier(member: Member, supplierId: string): Promise<boolean> {
  const allowed = await scopedSupplierIds(member);
  return allowed === null || allowed.includes(supplierId);
}

function relationRecord(value: unknown): Record<string, unknown> | null {
  const relation = Array.isArray(value) ? value[0] : value;
  return typeof relation === 'object' && relation !== null
    ? relation as Record<string, unknown>
    : null;
}

function operationScopesOverlap(left: OperationScope, right: OperationScope): boolean {
  return left.country_code === right.country_code
    && left.region_code === right.region_code
    && (left.district_code === null || right.district_code === null || left.district_code === right.district_code);
}

function memberCanAccessLocation(
  member: Member,
  location: OperationScope,
): boolean {
  return member.operation_scope_mode !== 'restricted'
    || member.operation_scopes.some((scope) => (
      scope.country_code === location.country_code
      && scope.region_code === location.region_code
      && (scope.district_code === null || scope.district_code === location.district_code)
    ));
}


// ---------- Delivery tiers (single source of truth; the app mirrors this) ----------
function deliveryFor(km: number, settings: {
  free_radius_km: number; mid_radius_km: number; mid_fee: number; far_fee: number;
}) {
  if (km <= Number(settings.free_radius_km)) return 0;
  if (km <= Number(settings.mid_radius_km)) return Number(settings.mid_fee);
  return Number(settings.far_fee);
}

const DELIVERY_ETAS = [
  { value: '12h', title: 'Within 12 hours' },
  { value: '24h', title: 'Within 24 hours' },
  { value: '48h', title: 'Within 48 hours' },
  { value: '72h', title: 'Within 72 hours' },
  { value: '7d', title: 'Within 7 days' },
  { value: '10d', title: 'Within 10 days' },
  { value: '14d', title: 'Within 14 days' },
] as const;
const DELIVERY_WINDOWS = [
  { value: 'morning', title: 'Morning delivery window', fee: 0 },
  { value: 'evening', title: 'Evening delivery window', fee: 0 },
] as const;
const DELIVERY_WINDOW_VALUES = ['morning', 'evening', ...DELIVERY_ETAS.map((option) => option.value)] as const;

function isDailyDeliveryMode(mode: OrderMode) {
  return mode === 'retail' || mode === 'wholesale';
}

function validDeliveryWindow(mode: OrderMode, window: string) {
  return isDailyDeliveryMode(mode)
    ? window === 'morning' || window === 'evening'
    : DELIVERY_ETAS.some((option) => option.value === window);
}

function deliverySpeedFeeFor(mode: OrderMode, window: string, fees: unknown): number | null {
  if (!validDeliveryWindow(mode, window)) return null;
  if (isDailyDeliveryMode(mode)) return 0;
  if (typeof fees !== 'object' || fees === null || Array.isArray(fees)) return null;
  const fee = (fees as Record<string, unknown>)[window];
  return typeof fee === 'number' && Number.isSafeInteger(fee) && fee >= 0 ? fee : null;
}

function matchesOrderMode(
  mode: OrderMode,
  items: { qty: number }[],
  products: { wholesale_min_qty: number }[],
) {
  const preferredMode = mode === 'wholesale' ? 'wholesale' : 'retail';
  return deriveOrderMode(items.map((item, index) => ({
    qty: item.qty,
    product: { wholesale_min_qty: Number(products[index].wholesale_min_qty) },
  })), preferredMode) === mode;
}

function priceForQuantity(product: {
  retail_price: number; wholesale_price: number; wholesale_min_qty: number;
  bulk_price: number | null; mega_bulk_price: number | null;
}, qty: number, mode: OrderMode): number | null {
  const wholesaleMinimum = Math.max(1, Number(product.wholesale_min_qty));
  if (qty >= wholesaleMinimum * 100) {
    return typeof product.mega_bulk_price === 'number' && Number.isFinite(product.mega_bulk_price)
      ? Number(product.mega_bulk_price)
      : null;
  }
  if (qty >= wholesaleMinimum * 10) {
    return typeof product.bulk_price === 'number' && Number.isFinite(product.bulk_price)
      ? Number(product.bulk_price)
      : null;
  }
  if (mode === 'wholesale' || qty >= wholesaleMinimum) return Number(product.wholesale_price);
  return Number(product.retail_price);
}

function distanceToSupplier(product: { suppliers?: unknown }, latitude: number, longitude: number): number | null {
  const relation = product.suppliers;
  const supplier = Array.isArray(relation) ? relation[0] : relation;
  if (typeof supplier !== 'object' || supplier === null) return null;
  const location = supplier as Record<string, unknown>;
  if (
    typeof location.latitude !== 'number' || !Number.isFinite(location.latitude)
    || typeof location.longitude !== 'number' || !Number.isFinite(location.longitude)
    || location.status !== 'active'
  ) return null;
  return haversineKm(location.latitude, location.longitude, latitude, longitude);
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

app.post('/location/reverse-geocode', async (req, res) => {
  if (!GOOGLE_MAPS_API_KEY) {
    return res.status(503).json({ error: 'Location-name service is not configured.' });
  }
  const coordinates = z.object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  }).safeParse(req.body);
  if (!coordinates.success) {
    return res.status(400).json({ error: 'Provide valid latitude and longitude coordinates.' });
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${coordinates.data.lat},${coordinates.data.lng}`);
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
    url.searchParams.set('language', 'en');
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      console.error('Google Maps reverse-geocoding request failed with HTTP status.', response.status);
      return res.status(503).json({ error: 'Location name is temporarily unavailable.' });
    }

    const payload: unknown = await response.json();
    const result = z.object({
      status: z.string(),
      results: z.array(z.object({
        address_components: z.array(z.object({
          long_name: z.string(),
          short_name: z.string(),
          types: z.array(z.string()),
        })),
      })),
    }).safeParse(payload);
    if (!result.success) {
      console.error('Google Maps returned an invalid reverse-geocoding response.');
      return res.status(503).json({ error: 'Location name is temporarily unavailable.' });
    }
    if (result.data.status === 'ZERO_RESULTS') {
      return res.status(404).json({ error: 'No named location was found for these coordinates.' });
    }
    if (result.data.status !== 'OK' || !result.data.results[0]) {
      console.error('Google Maps reverse-geocoding service returned status.', result.data.status);
      return res.status(503).json({ error: 'Location name is temporarily unavailable.' });
    }

    const components = result.data.results[0].address_components;
    const component = (type: string) => components.find((item) => item.types.includes(type));
    const neighborhood = component('neighborhood') ?? component('sublocality_level_1');
    const townOrCity = component('locality') ?? component('postal_town');
    const administrativeArea = component('administrative_area_level_2')
      ?? component('administrative_area_level_1');
    const country = component('country');
    const placeName = [...new Set([
      neighborhood?.long_name,
      townOrCity?.long_name ?? administrativeArea?.long_name,
      country?.long_name,
    ].filter((part): part is string => Boolean(part)))].join(', ');
    if (!placeName) {
      return res.status(404).json({ error: 'No named location was found for these coordinates.' });
    }

    res.set('Cache-Control', 'private, no-store');
    return res.json({
      place_name: placeName,
      country_name: country?.long_name ?? null,
      country_code: country?.short_name ?? null,
    });
  } catch (error) {
    console.error('Google Maps reverse-geocoding request failed.', error instanceof Error ? error.name : 'Unknown error');
    return res.status(503).json({ error: 'Location name is temporarily unavailable.' });
  }
});

app.get('/products', async (req, res) => {
  const requestedPage = Number(req.query.page ?? 0);
  const requestedSize = Number(req.query.size ?? 20);
  const page = Number.isFinite(requestedPage) ? Math.max(0, Math.floor(requestedPage)) : 0;
  const size = Number.isFinite(requestedSize) ? Math.min(40, Math.max(1, Math.floor(requestedSize))) : 20;
  const hasLatitude = req.query.lat !== undefined;
  const hasLongitude = req.query.lng !== undefined;
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);
  if (hasLatitude !== hasLongitude || (hasLatitude && (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ))) {
    return res.status(400).json({ error: 'Provide a valid latitude and longitude pair.' });
  }
  const hasCustomerLocation = hasLatitude && hasLongitude;
  const queryBatchSize = 500;
  const products: Array<Record<string, unknown> & {
    id: string; name: string; stock: number; supplier_id: string; catalog_product_id: string | null;
  }> = [];

  for (let offset = 0; ; offset += queryBatchSize) {
    const { data, error } = await db
      .from('products')
      .select('*')
      .eq('active', true)
      .gt('stock', 0)
      .order('name')
      .order('stock', { ascending: false })
      .order('id')
      .range(offset, offset + queryBatchSize - 1);
    if (error) return res.status(500).json({ error: error.message });
    products.push(...(data ?? []));
    if ((data?.length ?? 0) < queryBatchSize) break;
  }

  const supplierIds = [...new Set(products.map((product) => product.supplier_id))];
  const catalogIds = [...new Set(products.map((product) => product.catalog_product_id).filter((id): id is string => !!id))];
  const [{ data: suppliers, error: supplierError }, { data: catalog, error: catalogError }] = await Promise.all([
    supplierIds.length
      ? db.from('suppliers').select('id, latitude, longitude, status').in('id', supplierIds)
      : Promise.resolve({ data: [], error: null }),
    catalogIds.length
      ? db.from('catalog_products').select('id, price_approved').in('id', catalogIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (supplierError || catalogError) {
    console.error('Could not load supplier locations for the storefront:', supplierError?.message ?? catalogError?.message);
    return res.status(500).json({ error: 'Could not load available products.' });
  }
  const approvedCatalogIds = new Set((catalog ?? []).filter((item) => item.price_approved).map((item) => item.id));
  const selectedProducts = selectStorefrontProducts(
    products, suppliers ?? [], approvedCatalogIds,
    hasCustomerLocation ? { lat: latitude, lng: longitude } : null,
  );
  const items = selectedProducts.slice(page * size, (page + 1) * size).map(({ product, distance }) => ({
    id: product.id,
    name: product.name,
    category: product.category ?? '',
    unit: product.unit,
    retail_price: product.retail_price,
    wholesale_price: product.wholesale_price,
    wholesale_min_qty: product.wholesale_min_qty,
    bulk_price: product.bulk_price ?? null,
    mega_bulk_price: product.mega_bulk_price ?? null,
    stock: product.stock,
    image_url: product.image_url,
    harvested_at: product.harvested_at,
    farm_distance_km: distance === null ? null : Number(distance.toFixed(2)),
  }));
  res.json({ items, hasMore: selectedProducts.length > (page + 1) * size });
});

app.get('/promos', async (_req, res) => {
  const { data, error } = await db.from('promos').select('*').eq('active', true).order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

let exchangeRateCache: {
  rates: Record<string, number>;
  updatedAt: string;
  expiresAt: number;
} | null = null;

app.get('/exchange-rates', async (_req, res) => {
  if (exchangeRateCache && exchangeRateCache.expiresAt > Date.now()) {
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json({ base: 'TZS', rates: exchangeRateCache.rates, updated_at: exchangeRateCache.updatedAt });
  }

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/TZS', {
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(`Exchange-rate service returned ${response.status}.`);
    const payload: unknown = await response.json();
    if (
      typeof payload !== 'object'
      || payload === null
      || !('result' in payload) || payload.result !== 'success'
      || !('rates' in payload) || typeof payload.rates !== 'object' || payload.rates === null
      || !('time_last_update_utc' in payload) || typeof payload.time_last_update_utc !== 'string'
    ) {
      throw new Error('Exchange-rate service returned an invalid response.');
    }
    const rates = Object.fromEntries(
      Object.entries(payload.rates).filter((entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0,
      ),
    );
    if (rates.TZS !== 1 || typeof rates.USD !== 'number') {
      throw new Error('Exchange-rate response is missing required currencies.');
    }
    exchangeRateCache = {
      rates,
      updatedAt: payload.time_last_update_utc,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json({ base: 'TZS', rates, updated_at: exchangeRateCache.updatedAt });
  } catch (error) {
    console.error('Could not load display exchange rates:', error);
    return res.status(503).json({ error: 'Display exchange rates are temporarily unavailable.' });
  }
});

app.get('/delivery-options', async (_req, res) => {
  const { data, error } = await db
    .from('platform_settings')
    .select('delivery_option_fees')
    .eq('id', 'primary')
    .maybeSingle();
  if (error || !data) {
    console.error('Could not load delivery timeframe settings:', error?.message ?? 'Settings are not initialized.');
    return res.status(503).json({ error: 'Delivery options are not configured.' });
  }
  const fees = data.delivery_option_fees;
  const options = DELIVERY_ETAS.flatMap((option) => {
    if (typeof fees !== 'object' || fees === null || Array.isArray(fees)) return [];
    const fee = (fees as Record<string, unknown>)[option.value];
    return typeof fee === 'number' && Number.isSafeInteger(fee) && fee >= 0
      ? [{ ...option, fee }]
      : [];
  });
  return res.json([...DELIVERY_WINDOWS, ...options]);
});

app.get('/admin/pricing-policy', requirePerm('products.view'), async (_req: AuthedRequest, res) => {
  const { data, error } = await db.from('platform_settings')
    .select('tier_price_percentages')
    .eq('id', 'primary')
    .maybeSingle();
  if (error || !data) {
    console.error('Could not load product tier pricing policy:', error?.message ?? 'Settings are not initialized.');
    return res.status(503).json({ error: 'Product pricing rules are not configured.' });
  }
  return res.json(data.tier_price_percentages);
});

app.get('/checkout/options', async (_req, res) => {
  let onlinePayment = false;
  if (WEB_CHECKOUT_CALLBACK_URL && isPesapalConfigured()) {
    const { data, error } = await db.from('payment_provider_config')
      .select('ipn_id')
      .eq('provider', 'pesapal')
      .maybeSingle();
    if (error) {
      console.error('Could not check web payment readiness:', error.message);
      return res.status(503).json({ error: 'Could not load checkout payment options.' });
    }
    onlinePayment = Boolean(data?.ipn_id);
  }
  return res.json({ cash_on_delivery: true, online_payment: onlinePayment });
});

const checkoutFields = z.object({
  client_platform: z.enum(['mobile', 'web']).default('mobile'),
  mode: z.enum(['retail', 'wholesale', 'bulk', 'mega_bulk']),
  delivery_window: z.enum(DELIVERY_WINDOW_VALUES),
  delivery_fee_accepted: z.boolean().default(false),
  quoted_delivery_fee: z.number().int().nonnegative(),
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
  payment_phone: z.string().trim().min(5).max(32).optional(),
});

const refineDeliveryWindow = (value: { mode: OrderMode; delivery_window: string }, ctx: z.RefinementCtx) => {
  if (!validDeliveryWindow(value.mode, value.delivery_window)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['delivery_window'],
      message: isDailyDeliveryMode(value.mode)
        ? 'Retail and wholesale orders use a morning or evening delivery window.'
        : 'Bulk orders require a configured delivery timeframe.',
    });
  }
};

const checkoutSchema = checkoutFields.superRefine(refineDeliveryWindow);

const checkoutQuoteSchema = z.object({
  mode: z.enum(['retail', 'wholesale', 'bulk', 'mega_bulk']),
  delivery_window: z.enum(DELIVERY_WINDOW_VALUES),
  items: checkoutFields.shape.items,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
}).superRefine(refineDeliveryWindow);

function normalizedProductName(name: string) {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

app.post('/checkout/quote', requireUser, async (req, res) => {
  const parsed = checkoutQuoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { mode, delivery_window: deliveryWindow, items, lat, lng } = parsed.data;
  const { data: requestedProducts, error: requestedError } = await db
    .from('products')
    .select('id, name, catalog_product_id, wholesale_min_qty')
    .in('id', items.map((item) => item.product_id));
  if (requestedError) {
    console.error('Could not load products for checkout quote:', requestedError.message);
    return res.status(500).json({ error: 'Could not prepare your delivery quote.' });
  }
  if (!requestedProducts || requestedProducts.length !== items.length) {
    return res.status(409).json({ error: 'One or more basket items are no longer available.' });
  }

  const names = [...new Set(requestedProducts.map((product) => product.name))];
  const catalogIds = [...new Set(requestedProducts.map((product) => product.catalog_product_id).filter((id): id is string => !!id))];
  const candidateQueries = await Promise.all([
    db.from('products')
      .select('id, name, catalog_product_id, stock, active, retail_price, wholesale_price, wholesale_min_qty, bulk_price, mega_bulk_price, suppliers!inner(latitude, longitude, status)')
      .eq('active', true)
      .gt('stock', 0)
      .in('name', names),
    catalogIds.length
      ? db.from('products')
          .select('id, name, catalog_product_id, stock, active, retail_price, wholesale_price, wholesale_min_qty, bulk_price, mega_bulk_price, suppliers!inner(latitude, longitude, status)')
          .eq('active', true)
          .gt('stock', 0)
          .in('catalog_product_id', catalogIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const candidateError = candidateQueries.find((result) => result.error)?.error;
  if (candidateError) {
    console.error('Could not load farm stock for checkout quote:', candidateError.message);
    return res.status(500).json({ error: 'Could not prepare your delivery quote.' });
  }
  const candidates = new Map<string, NonNullable<(typeof candidateQueries)[number]['data']>[number]>();
  for (const result of candidateQueries) {
    for (const candidate of result.data ?? []) candidates.set(candidate.id, candidate);
  }

  let subtotal = 0;
  let distance = 0;
  const quotedItems: {
    requested_product_id: string;
    product_id: string;
    qty: number;
    unit_price: number;
    distance_km: number;
  }[] = [];
  const selectedProductsForMode: { wholesale_min_qty: number }[] = [];

  for (const item of items) {
    const requested = requestedProducts.find((product) => product.id === item.product_id)!;
    const matchingCandidates = [...candidates.values()].filter((candidate) =>
      candidate.id === requested.id
      || (requested.catalog_product_id !== null && candidate.catalog_product_id === requested.catalog_product_id)
      || normalizedProductName(candidate.name) === normalizedProductName(requested.name),
    );
    const stockedCandidates = matchingCandidates.filter((candidate) =>
      Number(candidate.stock) >= item.qty
      && (mode !== 'wholesale' || item.qty >= Number(candidate.wholesale_min_qty)),
    );
    if (!stockedCandidates.length) {
      return res.status(409).json({
        error: mode === 'wholesale'
          ? `No farm has enough stock at the wholesale minimum for ${requested.name}. Reduce the quantity or remove it from your basket.`
          : `No farm currently has enough stock for ${requested.name}. Reduce the quantity or remove it from your basket.`,
      });
    }

    const locatedCandidates = stockedCandidates.flatMap((candidate) => {
      const candidateDistance = distanceToSupplier(candidate, lat, lng);
      return candidateDistance === null ? [] : [{ product: candidate, distance: candidateDistance }];
    });
    if (!locatedCandidates.length) {
      return res.status(409).json({ error: `Farm delivery coordinates are not available for ${requested.name}. Please choose another item or try again later.` });
    }

    locatedCandidates.sort((a, b) => a.distance - b.distance || Number(b.product.stock) - Number(a.product.stock));
    const selected = locatedCandidates[0];
    selectedProductsForMode.push({ wholesale_min_qty: Number(selected.product.wholesale_min_qty) });
    const unitPrice = priceForQuantity(selected.product, item.qty, mode);
    if (unitPrice === null) {
      return res.status(409).json({ error: `A bulk price is not configured for ${requested.name}. Reduce the quantity or contact Saplaya.` });
    }
    quotedItems.push({
      requested_product_id: item.product_id,
      product_id: selected.product.id,
      qty: item.qty,
      unit_price: unitPrice,
      distance_km: Number(selected.distance.toFixed(2)),
    });
    subtotal += Math.round(unitPrice * item.qty);
    distance = Math.max(distance, selected.distance);
  }
  if (!matchesOrderMode(mode, items, selectedProductsForMode)) {
    return res.status(409).json({ error: 'Order mode changed with your basket quantities. Refresh your basket and try again.' });
  }

  const { data: settings, error: settingsError } = await db
    .from('platform_settings')
    .select('free_radius_km, mid_radius_km, mid_fee, far_fee, delivery_option_fees')
    .eq('id', 'primary')
    .maybeSingle();
  if (settingsError || !settings) {
    console.error('Could not load delivery pricing for checkout quote:', settingsError?.message ?? 'Settings are not initialized.');
    return res.status(503).json({ error: 'Checkout pricing is not configured.' });
  }
  const speedFee = deliverySpeedFeeFor(mode, deliveryWindow, settings.delivery_option_fees);
  if (speedFee === null) {
    return res.status(409).json({ error: 'The selected delivery timeframe is not currently available.' });
  }

  const distanceFee = deliveryFor(distance, settings);
  return res.json({
    items: quotedItems,
    subtotal,
    distance_km: Number(distance.toFixed(2)),
    distance_fee: distanceFee,
    speed_fee: speedFee,
    delivery_fee: distanceFee + speedFee,
    amount: subtotal + distanceFee + speedFee,
  });
});

const applicationSchema = z.object({
  farmName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(32),
  location: z.string().trim().min(2).max(240),
  country_code: z.string().regex(/^[A-Z]{2}$/),
  country_name: z.string().trim().min(2).max(100),
  region_code: z.string().trim().min(1).max(100),
  region_name: z.string().trim().min(1).max(100),
  district_code: z.string().trim().min(1).max(100).nullable().default(null),
  district_name: z.string().trim().min(1).max(100).nullable().default(null),
  products: z.string().trim().min(2).max(1000),
}).refine((value) => (value.district_code === null) === (value.district_name === null), {
  message: 'Provide both district code and name, or leave both empty.',
});

function paymentCallbackUrl(transactionRef: string, orderTrackingId: string) {
  const callback = new URL(PAYMENT_APP_CALLBACK_URL);
  callback.searchParams.set('tx_ref', transactionRef);
  callback.searchParams.set('order_tracking_id', orderTrackingId);
  return callback.toString();
}

function webPaymentCallbackUrl(transactionRef: string, orderTrackingId: string) {
  if (!WEB_CHECKOUT_CALLBACK_URL) {
    throw new Error('Web checkout callback URL is not configured.');
  }
  const callback = new URL(WEB_CHECKOUT_CALLBACK_URL);
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
  if (parsed.data.client_platform === 'web' && !WEB_CHECKOUT_CALLBACK_URL) {
    return res.status(503).json({ error: 'Web payment return URL is not configured on the server.' });
  }
  const {
    client_platform: clientPlatform, mode, items, lat, lng, customer, delivery_window: deliveryWindow,
    delivery_fee_accepted: deliveryFeeAccepted, quoted_delivery_fee: quotedDeliveryFee,
  } = parsed.data;
  const phone = normalizedTanzanianPhone(parsed.data.payment_phone ?? customer.phone);
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
    .select('id, name, stock, active, retail_price, wholesale_price, wholesale_min_qty, bulk_price, mega_bulk_price, suppliers!inner(latitude, longitude, status)')
    .in('id', items.map((item) => item.product_id));
  if (productError) return res.status(500).json({ error: 'Could not validate the basket.' });
  if (!products || products.length !== items.length) {
    return res.status(400).json({ error: 'One or more items are no longer available.' });
  }
  if (!matchesOrderMode(mode, items, items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.product_id);
    return { wholesale_min_qty: Number(product?.wholesale_min_qty ?? 0) };
  }))) {
    return res.status(409).json({ error: 'Order mode changed with your basket quantities. Refresh your basket and try again.' });
  }

  let subtotal = 0;
  let distance = 0;
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
    const price = priceForQuantity(product, item.qty, mode);
    if (price === null) {
      return res.status(409).json({ error: `A bulk price is not configured for ${product.name}.` });
    }
    const supplierDistance = distanceToSupplier(product, lat, lng);
    if (supplierDistance === null) {
      return res.status(409).json({ error: `Accurate delivery coordinates are not available for ${product.name}.` });
    }
    distance = Math.max(distance, supplierDistance);
    pricedItems.push({ product_id: item.product_id, qty: item.qty, unit_price: price });
    subtotal += Math.round(price * item.qty);
  }

  const { data: deliverySettings, error: settingsError } = await db
    .from('platform_settings')
    .select('free_radius_km, mid_radius_km, mid_fee, far_fee, delivery_option_fees')
    .eq('id', 'primary')
    .maybeSingle();
  if (settingsError || !deliverySettings) {
    console.error('Could not load delivery pricing settings:', settingsError?.message ?? 'Settings are not initialized.');
    return res.status(503).json({ error: 'Checkout pricing is not configured.' });
  }
  const configuredSpeedFee = deliverySpeedFeeFor(mode, deliveryWindow, deliverySettings.delivery_option_fees);
  if (configuredSpeedFee === null) {
    return res.status(409).json({ error: 'The selected delivery timeframe is not currently available.' });
  }
  const fee = deliveryFor(distance, deliverySettings) + configuredSpeedFee;
  if (fee !== quotedDeliveryFee) {
    return res.status(409).json({ error: 'The delivery charge changed. Review the refreshed quote before continuing.' });
  }
  if (fee > 0 && !deliveryFeeAccepted) {
    return res.status(409).json({ error: 'Accept the quoted delivery charge before continuing.' });
  }
  const amount = subtotal + fee;
  const transactionRef = `saplaya-${randomUUID()}`;
  const { error: paymentError } = await db.from('checkout_payments').insert({
    transaction_ref: transactionRef,
    customer_id: req.userId,
    mode,
    items: pricedItems,
    delivery_fee: fee,
    delivery_speed_fee: configuredSpeedFee,
    distance_km: Number(distance.toFixed(2)),
    dest_lat: lat,
    dest_lng: lng,
    customer_email: customer.email,
    customer_name: customer.name,
    customer_phone: customer.phone,
    delivery_window: deliveryWindow,
    client_platform: clientPlatform,
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

const cashCheckoutSchema = checkoutFields.extend({
  request_key: z.string().min(16).max(120),
}).superRefine(refineDeliveryWindow);

app.post('/orders/cash', requireUser, async (req: AuthedRequest, res) => {
  const parsed = cashCheckoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const {
    mode, items, lat, lng, customer, delivery_window: deliveryWindow,
    delivery_fee_accepted: deliveryFeeAccepted, quoted_delivery_fee: quotedDeliveryFee, request_key: requestKey,
  } = parsed.data;

  const { data: products, error: productError } = await db
    .from('products')
    .select('id, name, stock, active, retail_price, wholesale_price, wholesale_min_qty, bulk_price, mega_bulk_price, suppliers!inner(latitude, longitude, status)')
    .in('id', items.map((item) => item.product_id));
  if (productError) {
    console.error('Could not validate cash-on-delivery basket:', productError.message);
    return res.status(500).json({ error: 'Could not validate the basket.' });
  }
  if (!products || products.length !== items.length) {
    return res.status(400).json({ error: 'One or more items are no longer available.' });
  }
  if (!matchesOrderMode(mode, items, items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.product_id);
    return { wholesale_min_qty: Number(product?.wholesale_min_qty ?? 0) };
  }))) {
    return res.status(409).json({ error: 'Order mode changed with your basket quantities. Refresh your basket and try again.' });
  }

  let subtotal = 0;
  let distance = 0;
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
    const price = priceForQuantity(product, item.qty, mode);
    if (price === null) {
      return res.status(409).json({ error: `A bulk price is not configured for ${product.name}.` });
    }
    const supplierDistance = distanceToSupplier(product, lat, lng);
    if (supplierDistance === null) {
      return res.status(409).json({ error: `Accurate delivery coordinates are not available for ${product.name}.` });
    }
    distance = Math.max(distance, supplierDistance);
    pricedItems.push({ product_id: item.product_id, qty: item.qty, unit_price: price });
    subtotal += Math.round(price * item.qty);
  }

  const { data: deliverySettings, error: settingsError } = await db
    .from('platform_settings')
    .select('free_radius_km, mid_radius_km, mid_fee, far_fee, delivery_option_fees')
    .eq('id', 'primary')
    .maybeSingle();
  if (settingsError || !deliverySettings) {
    console.error('Could not load cash checkout delivery settings:', settingsError?.message ?? 'Settings are not initialized.');
    return res.status(503).json({ error: 'Checkout pricing is not configured.' });
  }
  const configuredSpeedFee = deliverySpeedFeeFor(mode, deliveryWindow, deliverySettings.delivery_option_fees);
  if (configuredSpeedFee === null) {
    return res.status(409).json({ error: 'The selected delivery timeframe is not currently available.' });
  }

  const fee = deliveryFor(distance, deliverySettings) + configuredSpeedFee;
  if (fee !== quotedDeliveryFee) {
    return res.status(409).json({ error: 'The delivery charge changed. Review the refreshed quote before placing your order.' });
  }
  if (fee > 0 && !deliveryFeeAccepted) {
    return res.status(409).json({ error: 'Accept the quoted delivery charge before placing your order.' });
  }
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

const savedPaymentMethodSchema = z.object({
  label: z.string().trim().min(1).max(40),
  phone: z.string().trim().min(5).max(32),
});

app.get('/payment-methods', requireUser, async (req: AuthedRequest, res) => {
  if (req.isAnonymous) return res.status(403).json({ error: 'Sign in to save payment methods.' });
  const { data, error } = await db.from('customer_payment_methods')
    .select('id, label, phone_e164, is_default, created_at')
    .eq('customer_id', req.userId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Could not load customer payment methods:', error.message);
    return res.status(500).json({ error: 'Could not load saved payment methods.' });
  }
  return res.json(data);
});

app.post('/payment-methods', requireUser, async (req: AuthedRequest, res) => {
  if (req.isAnonymous) return res.status(403).json({ error: 'Sign in to save payment methods.' });
  const parsed = savedPaymentMethodSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const phone = normalizedTanzanianPhone(parsed.data.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid Tanzanian mobile number.' });
  const { data, error } = await db.rpc('save_customer_payment_method', {
    p_customer: req.userId,
    p_label: parsed.data.label,
    p_phone_e164: phone,
  });
  if (error || !data) {
    console.error('Could not save a customer payment method:', error?.message ?? 'No method was returned.');
    return res.status(500).json({ error: 'Could not save this mobile money number.' });
  }
  return res.status(201).json(data);
});

app.delete('/payment-methods/:id', requireUser, async (req: AuthedRequest, res) => {
  if (req.isAnonymous) return res.status(403).json({ error: 'Sign in to manage payment methods.' });
  const methodId = z.string().uuid().safeParse(req.params.id);
  if (!methodId.success) return res.status(400).json({ error: 'Invalid payment method.' });
  const { data, error } = await db.rpc('delete_customer_payment_method', {
    p_customer: req.userId,
    p_method_id: methodId.data,
  });
  if (error) {
    console.error('Could not remove a customer payment method:', error.message);
    return res.status(500).json({ error: 'Could not remove this payment method.' });
  }
  if (!data) return res.status(404).json({ error: 'Payment method not found.' });
  return res.status(204).send();
});

const pushTokenSchema = z.object({
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(['android', 'ios']),
});

app.post('/devices/push-token', requireUser, async (req: AuthedRequest, res) => {
  if (req.isAnonymous) return res.status(403).json({ error: 'Sign in to enable notifications.' });
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { error } = await db.from('customer_push_tokens').upsert({
    customer_id: req.userId,
    token: parsed.data.token,
    platform: parsed.data.platform,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'token' });
  if (error) {
    console.error('Could not save customer notification token:', error.message);
    return res.status(500).json({ error: 'Could not enable notifications.' });
  }
  return res.json({ registered: true });
});

async function notifyCustomerOrderStatus(orderId: string, status: string) {
  const { data: order, error: orderError } = await db.from('orders')
    .select('customer_id')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw new Error(`Could not look up order notification recipient: ${orderError.message}`);
  if (!order) return;

  const { data: registrations, error: tokenError } = await db.from('customer_push_tokens')
    .select('id, token')
    .eq('customer_id', order.customer_id);
  if (tokenError) throw new Error(`Could not load customer notification tokens: ${tokenError.message}`);
  if (!registrations?.length) return;

  const statusLabels: Record<string, string> = {
    pending: 'Order received',
    packing: 'Your order is being prepared',
    en_route: 'Your order is on the way',
    delivered: 'Your order has been delivered',
    cancelled: 'Your order was cancelled',
  };
  const messaging = getFirebaseAdminMessaging();
  const result = await messaging.sendEachForMulticast({
    tokens: registrations.map((registration) => registration.token),
    notification: {
      title: 'Saplaya order update',
      body: statusLabels[status] ?? 'Your order status has changed',
    },
    data: { order_id: orderId, status },
  });
  const invalidTokenIds = registrations
    .filter((_, index) => {
      const response = result.responses[index];
      return !response.success && (
        response.error?.code === 'messaging/registration-token-not-registered'
        || response.error?.code === 'messaging/invalid-registration-token'
      );
    })
    .map((registration) => registration.id);
  if (invalidTokenIds.length) {
    const { error: cleanupError } = await db.from('customer_push_tokens').delete().in('id', invalidTokenIds);
    if (cleanupError) console.error('Could not remove expired customer notification tokens:', cleanupError.message);
  }
  if (result.failureCount > invalidTokenIds.length) {
    console.error('Some customer order notifications could not be delivered.');
  }
}

app.get('/payments/callback', async (req, res) => {
  const transactionRef = String(req.query.OrderMerchantReference ?? req.query.tx_ref ?? '');
  const orderTrackingId = String(req.query.OrderTrackingId ?? req.query.order_tracking_id ?? '');
  if (!/^saplaya-[0-9a-f-]{36}$/i.test(transactionRef) || !orderTrackingId) {
    return res.redirect(302, paymentCallbackUrl('', ''));
  }
  const { data: payment, error } = await db.from('checkout_payments')
    .select('client_platform')
    .eq('transaction_ref', transactionRef)
    .eq('gateway_transaction_id', orderTrackingId)
    .maybeSingle();
  if (error) {
    console.error('Could not resolve payment callback destination:', error.message);
    return res.status(503).send('Payment return is temporarily unavailable. Contact support with your payment reference.');
  }
  if (payment?.client_platform === 'web') {
    if (!WEB_CHECKOUT_CALLBACK_URL) {
      return res.status(503).send('Web payment return URL is not configured. Contact support with your payment reference.');
    }
    return res.redirect(302, webPaymentCallbackUrl(transactionRef, orderTrackingId));
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
    region: parsed.data.region_name,
    country_code: parsed.data.country_code,
    country_name: parsed.data.country_name,
    region_code: parsed.data.region_code,
    region_name: parsed.data.region_name,
    district_code: parsed.data.district_code,
    district_name: parsed.data.district_name,
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
  country_code: z.string().regex(/^[A-Z]{2}$/),
  country_name: z.string().trim().min(2).max(100),
  region_code: z.string().trim().min(1).max(100),
  region_name: z.string().trim().min(1).max(100),
  district_code: z.string().trim().min(1).max(100).nullable().default(null),
  district_name: z.string().trim().min(1).max(100).nullable().default(null),
  location: z.string().trim().min(2).max(240),
  produce: z.string().min(2).max(300),
  farm_size: z.string().min(2).max(60),
}).refine((value) => (value.district_code === null) === (value.district_name === null), {
  message: 'Provide both district code and name, or leave both empty.',
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
    location: parsed.data.location,
    region: parsed.data.region_name,
    country_code: parsed.data.country_code,
    country_name: parsed.data.country_name,
    region_code: parsed.data.region_code,
    region_name: parsed.data.region_name,
    district_code: parsed.data.district_code,
    district_name: parsed.data.district_name,
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
  res.json({
    ...m,
    avatar_path: m.avatar_url,
    avatar_url: m.avatar_url
      ? db.storage.from('team-avatars').getPublicUrl(m.avatar_url).data.publicUrl
      : null,
  });
});

app.patch('/admin/me', requirePerm(), async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ full_name: z.string().trim().min(2).max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  const { data, error } = await db
    .from('team_members')
    .update({ full_name: parsed.data.full_name })
    .eq('id', m.id)
    .eq('user_id', req.userId!)
    .select('id, user_id, supplier_id, full_name, email, role, status')
    .maybeSingle();
  if (error) {
    console.error('Could not update the signed-in team member profile:', error.message);
    return res.status(500).json({ error: 'Could not save your profile.' });
  }
  if (!data) return res.status(404).json({ error: 'Your team profile could not be found.' });
  req.member = { ...m, full_name: data.full_name };
  return res.json(req.member);
});

app.get('/admin/dashboard-analytics', requirePerm('dashboard.view'), async (req: AuthedRequest, res: Response) => {
  const m = req.member!;
  const now = new Date();
  const to = req.query.to ? new Date(String(req.query.to)) : now;
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 30 * 86_400_000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
    return res.status(400).json({ error: 'Choose a valid analytics date range.' });
  }
  if (to.getTime() - from.getTime() > 366 * 86_400_000) {
    return res.status(400).json({ error: 'Analytics date ranges cannot exceed one year.' });
  }

  let allowedSupplierIds: string[] | null;
  try {
    allowedSupplierIds = await scopedSupplierIds(m);
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  const { data: analytics, error } = allowedSupplierIds === null
    ? await db.rpc('admin_dashboard_analytics', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_supplier_id: null,
    })
    : await db.rpc('admin_dashboard_analytics_scoped', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_supplier_ids: allowedSupplierIds,
    });
  if (error || !analytics) {
    console.error('Could not load aggregated dashboard analytics:', error?.message ?? 'Analytics result was empty.');
    return res.status(500).json({ error: 'Could not load dashboard analytics.' });
  }

  const permissions = new Set(m.permissions);
  const result: Record<string, unknown> = {
    range: { from: from.toISOString(), to: to.toISOString() },
    operations: permissions.has('dashboard.view') ? analytics.summary : undefined,
    finance: permissions.has('finance.view') ? {
      summary: analytics.summary,
      payments: analytics.payments,
      daily: analytics.daily,
      reporting_note: 'Delivered order value is an operational estimate, not a payment settlement or accounting ledger.',
    } : undefined,
    marketing: permissions.has('marketing.view') ? {
      summary: analytics.summary,
      top_products: analytics.top_products,
      categories: analytics.categories,
      modes: analytics.modes,
      daily: analytics.daily,
      reporting_note: 'Campaign attribution and advertising spend are not collected by the current platform.',
    } : undefined,
    stores: permissions.has('stores.view') ? {
      summary: analytics.summary,
      farms: analytics.farms,
    } : undefined,
  };

  if (permissions.has('system.view')) {
    if (allowedSupplierIds !== null) {
      if (allowedSupplierIds.length === 0) {
        result.system = { farms: 0, products: 0, open_applications: 0 };
        return res.json(result);
      }
      const [{ count: farmCount, error: farmError }, { count: productCount, error: productError }, { data: applications, error: applicationError }] = await Promise.all([
        db.from('suppliers').select('id', { count: 'exact', head: true }).eq('status', 'active').in('id', allowedSupplierIds),
        db.from('products').select('id', { count: 'exact', head: true }).in('supplier_id', allowedSupplierIds),
        db.from('supplier_applications').select('country_code, region_code, district_code').in('status', ['new', 'pending', 'reviewing']),
      ]);
      if (farmError || productError || applicationError) {
        console.error('Could not load scoped system dashboard metrics:', farmError?.message ?? productError?.message ?? applicationError?.message);
        return res.status(500).json({ error: 'Could not load scoped system dashboard metrics.' });
      }
      result.system = {
        farms: farmCount ?? 0,
        products: productCount ?? 0,
        open_applications: (applications ?? []).filter((application) => (
          typeof application.country_code === 'string'
          && typeof application.region_code === 'string'
          && memberCanAccessLocation(m, {
            country_code: application.country_code,
            region_code: application.region_code,
            district_code: application.district_code ?? null,
          })
        )).length,
      };
      return res.json(result);
    }
    const counts = await Promise.all([
      db.from('suppliers').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      db.from('products').select('id', { count: 'exact', head: true }),
      db.from('team_members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      db.from('supplier_applications').select('id', { count: 'exact', head: true }).in('status', ['new', 'pending', 'reviewing']),
      db.from('catalog_products').select('id', { count: 'exact', head: true }).eq('price_approved', false),
      db.from('team_departments').select('id', { count: 'exact', head: true }),
      db.from('team_roles').select('role_key', { count: 'exact', head: true }),
    ]);
    const failedCount = counts.find((count) => count.error);
    if (failedCount?.error) {
      console.error('Could not load system dashboard metrics:', failedCount.error.message);
      return res.status(500).json({ error: 'Could not load system dashboard metrics.' });
    }
    result.system = {
      farms: counts[0].count ?? 0,
      products: counts[1].count ?? 0,
      team_members: counts[2].count ?? 0,
      open_applications: counts[3].count ?? 0,
      pending_catalog_products: counts[4].count ?? 0,
      departments: counts[5].count ?? 0,
      roles: counts[6].count ?? 0,
    };
  }

  return res.json(result);
});

// ======================================================================
// Admin: orders. Platform roles see all farms; farm roles only their own.
// ======================================================================
app.get('/admin/orders', requirePerm('orders.view'), async (req: AuthedRequest, res: Response) => {
  const m = req.member!;
  let allowedSupplierIds: string[] | null;
  try {
    allowedSupplierIds = await scopedSupplierIds(m);
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  if (allowedSupplierIds?.length === 0) return res.json([]);
  let q = db
    .from('supplier_orders')
    .select('id, order_id, supplier_id, status, updated_at, orders!supplier_orders_order_id_fkey(id, mode, created_at, delivery_fee, dest_lat, dest_lng, customer_id, delivery_window, payment_method, contact_name, contact_phone), order_items!order_items_supplier_order_id_fkey(product_id, qty, unit_price, products(name, unit)), supplier_order_assignments(team_member_id, team_members!supplier_order_assignments_team_member_id_fkey(full_name))')
    .order('updated_at', { ascending: false })
    .limit(300);
  if (allowedSupplierIds) q = q.in('supplier_id', allowedSupplierIds);
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
    const assignment = relationRecord(row.supplier_order_assignments);
    const assignee = relationRecord(assignment?.team_members);
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
      assignee_id: typeof assignment?.team_member_id === 'string' ? assignment.team_member_id : null,
      assignee_name: typeof assignee?.full_name === 'string' ? assignee.full_name : null,
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
  let allowedSupplierIds: string[] | null;
  try {
    allowedSupplierIds = await scopedSupplierIds(m);
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  if (allowedSupplierIds?.length === 0) return res.status(404).json({ error: 'Not found' });
  if (m.role === 'driver' && !DRIVER_STATUSES.includes(parsed.data.status)) {
    return res.status(403).json({ error: 'Drivers can only mark orders On the way or Delivered' });
  }
  let currentQuery = db.from('supplier_orders').select('status').eq('id', req.params.id);
  if (allowedSupplierIds) currentQuery = currentQuery.in('supplier_id', allowedSupplierIds);
  const { data: current, error: currentError } = await currentQuery.maybeSingle();
  if (currentError) return res.status(500).json({ error: currentError.message });
  if (!current) return res.status(404).json({ error: 'Not found' });

  let q = db
    .from('supplier_orders')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString(), status_updated_by: m.id })
    .eq('id', req.params.id);
  if (allowedSupplierIds) q = q.in('supplier_id', allowedSupplierIds);
  const { data, error } = await q.select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  if (current.status !== data.status) {
    void notifyCustomerOrderStatus(data.order_id, data.status).catch((notificationError: unknown) => {
      console.error('Could not send customer order status notification:', notificationError);
    });
  }
  res.json(data);
});

// ======================================================================
// Admin: products, inventory
// ======================================================================
app.get('/admin/products', requirePerm('products.view'), async (req: AuthedRequest, res: Response) => {
  const m = req.member!;
  let allowedSupplierIds: string[] | null;
  try {
    allowedSupplierIds = await scopedSupplierIds(m);
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  if (allowedSupplierIds?.length === 0) return res.json([]);
  let q = db.from('products').select('*').order('name');
  if (allowedSupplierIds) q = q.in('supplier_id', allowedSupplierIds);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  const catalogIds = [...new Set((data ?? [])
    .map((product) => product.catalog_product_id)
    .filter((id): id is string => typeof id === 'string'))];
  const catalogs = catalogIds.length
    ? await db.from('catalog_products').select('id, price_approved').in('id', catalogIds)
    : { data: [], error: null };
  if (catalogs.error) {
    console.error('Could not load catalog approval status for product listings:', catalogs.error.message);
    return res.status(500).json({ error: 'Could not load product approval status.' });
  }
  const approvals = new Map((catalogs.data ?? []).map((catalog) => [catalog.id, catalog.price_approved]));
  res.json((data ?? []).map((product) => {
    const { bulk_price, mega_bulk_price, ...safeProduct } = product;
    return {
      ...safeProduct,
      ...(canViewTierPricing(m) ? { bulk_price, mega_bulk_price } : {}),
      approval_status: !product.catalog_product_id
        ? 'unlinked'
        : approvals.get(product.catalog_product_id) ? 'approved' : 'pending',
    };
  }));
});

const productSchema = z.object({
  name: z.string().min(2), category: z.string().optional(), unit: z.string().default('kg'),
  retail_price: z.number().int().min(2), wholesale_price: z.number().int().positive(),
  wholesale_min_qty: z.number().int().positive().default(10), stock: z.number().min(0).default(0),
  low_stock_at: z.number().min(0).default(10),
  image_url: z.string().url().nullable().optional(), active: z.boolean().default(true),
});
const productCreateSchema = productSchema.extend({ supplier_id: z.string().uuid().optional() });

app.post('/admin/products', requirePerm('products.edit'), async (req: AuthedRequest, res: Response) => {
  const parsed = productCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  const supplierId = m.supplier_id ?? parsed.data.supplier_id;
  if (!supplierId) return res.status(400).json({ error: 'Choose a farm for this product.' });
  if (m.supplier_id && supplierId !== m.supplier_id) {
    return res.status(403).json({ error: 'You can only add products to your own farm.' });
  }
  try {
    if (!await memberCanAccessSupplier(m, supplierId)) return res.status(404).json({ error: 'Farm not found.' });
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  const { data, error } = await db.rpc('create_product_with_stock', {
    p_supplier_id: supplierId,
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
  if (error?.code === '23505') {
    return res.status(409).json({ error: 'A listing with this product name already exists at your farm. Update that listing or choose it from the approved catalog.' });
  }
  if (error) {
    console.error('Could not create farm product:', error.message);
    return res.status(500).json({ error: 'Could not create this product.' });
  }
  res.status(201).json(data);
});

app.patch('/admin/products/:id', requirePerm('products.edit'), async (req: AuthedRequest, res: Response) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  const { data: current, error: currentError } = await db.from('products')
    .select('supplier_id')
    .eq('id', req.params.id)
    .maybeSingle();
  if (currentError) return res.status(500).json({ error: 'Could not load this product.' });
  if (!current || (m.supplier_id && current.supplier_id !== m.supplier_id)) return res.status(404).json({ error: 'Product not found.' });
  try {
    if (!await memberCanAccessSupplier(m, current.supplier_id)) return res.status(404).json({ error: 'Product not found.' });
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  const { stock: _ignored, ...safe } = parsed.data; // stock only changes via /admin/restock so every change is logged
  const { data, error } = await db.from('products').update(safe).eq('id', req.params.id).eq('supplier_id', current.supplier_id).select().maybeSingle();
  if (error?.code === '23505') {
    return res.status(409).json({ error: 'A listing with this product name already exists at your farm. Update that listing or choose it from the approved catalog.' });
  }
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

app.post('/admin/products/:id/merge', requirePerm('suppliers.manage'), async (req: AuthedRequest, res: Response) => {
  if (!isPlatformAdministrator(req.member!)) return res.status(403).json({ error: 'Only platform owners and administrators can merge products.' });
  const sourceId = z.string().uuid().safeParse(req.params.id);
  const target = z.object({ target_product_id: z.string().uuid() }).safeParse(req.body);
  if (!sourceId.success || !target.success) {
    return res.status(400).json({ error: target.success ? 'Invalid source product ID.' : target.error.flatten() });
  }
  const { data, error } = await db.rpc('merge_farm_products', {
    p_source_product_id: sourceId.data,
    p_target_product_id: target.data.target_product_id,
  });
  if (error) {
    console.error('Could not merge farm product records:', error.message);
    return res.status(409).json({ error: error.message });
  }
  return res.json(data);
});

app.delete('/admin/products/:id', requirePerm('suppliers.manage'), async (req: AuthedRequest, res: Response) => {
  if (!isPlatformAdministrator(req.member!)) return res.status(403).json({ error: 'Only platform owners and administrators can remove products.' });
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid product ID.' });
  const { data, error } = await db.rpc('archive_farm_product', { p_product_id: id.data });
  if (error) {
    console.error('Could not remove farm product:', error.message);
    return res.status(409).json({ error: error.message });
  }
  return res.json(data);
});

app.get('/admin/stockable-catalog', requirePerm('products.view'), async (req: AuthedRequest, res: Response) => {
  const m = req.member!;
  let supplierId = m.supplier_id;
  if (!supplierId) {
    if (m.supplier_id) return res.status(403).json({ error: 'Choose a farm for shared-catalog stock.' });
    const parsedSupplierId = z.string().uuid().safeParse(req.query.supplier_id);
    if (!parsedSupplierId.success) return res.status(400).json({ error: 'Choose a farm first.' });
    supplierId = parsedSupplierId.data;
  }
  try {
    if (!await memberCanAccessSupplier(m, supplierId)) return res.status(404).json({ error: 'Farm not found.' });
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }

  const [{ data: items, error: catalogError }, { data: listings, error: listingsError }] = await Promise.all([
    db.from('catalog_products')
      .select('id, name, category, unit, retail_price, wholesale_price, wholesale_min_qty, image_url, price_approved')
      .eq('price_approved', true).order('category').order('name'),
    db.from('products')
      .select('id, catalog_product_id, name, stock, active')
      .eq('supplier_id', supplierId)
      .order('name'),
  ]);
  if (catalogError || listingsError) {
    console.error('Could not load shared catalog stocking data:', catalogError?.message ?? listingsError?.message);
    return res.status(500).json({ error: 'Could not load shared products for this farm.' });
  }
  return res.json({ items, listings });
});

const stockCatalogSchema = z.object({
  supplier_id: z.string().uuid().optional(),
  qty: z.number().positive().max(10000).default(10),
});

app.post('/admin/catalog/:id/stock', requirePerm('stock.adjust'), async (req: AuthedRequest, res: Response) => {
  const catalogProductId = z.string().uuid().safeParse(req.params.id);
  const parsed = stockCatalogSchema.safeParse(req.body);
  if (!catalogProductId.success || !parsed.success) {
    return res.status(400).json({ error: parsed.success ? 'Invalid shared product ID.' : parsed.error.flatten() });
  }
  const m = req.member!;
  let supplierId = m.supplier_id;
  if (!supplierId) {
    if (m.supplier_id || !parsed.data.supplier_id) {
      return res.status(400).json({ error: 'Choose a farm for this shared product.' });
    }
    supplierId = parsed.data.supplier_id;
  } else if (parsed.data.supplier_id && parsed.data.supplier_id !== supplierId) {
    return res.status(403).json({ error: 'You can only add stock to your own farm.' });
  }
  try {
    if (!await memberCanAccessSupplier(m, supplierId)) return res.status(404).json({ error: 'Farm not found.' });
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }

  const { data, error } = await db.rpc('stock_catalog_product_for_farm', {
    p_catalog_product_id: catalogProductId.data,
    p_supplier_id: supplierId,
    p_qty: parsed.data.qty,
  });
  if (error) {
    console.error('Could not stock a shared catalog product:', error.message);
    const status = error.message.includes('not found') ? 404
      : error.message.includes('not been approved') || error.message.includes('active farm') ? 409
        : 500;
    return res.status(status).json({
      error: status === 409
        ? error.message
        : status === 404 ? 'This shared product could not be found.' : 'Could not add stock to this farm.',
    });
  }
  return res.json(data);
});

app.post('/admin/catalog/:id/publish', requirePerm('stock.adjust'), async (req: AuthedRequest, res: Response) => {
  const catalogProductId = z.string().uuid().safeParse(req.params.id);
  const parsed = z.object({ supplier_id: z.string().uuid().optional() }).safeParse(req.body);
  if (!catalogProductId.success || !parsed.success) {
    return res.status(400).json({ error: parsed.success ? 'Invalid shared product ID.' : parsed.error.flatten() });
  }
  const m = req.member!;
  let supplierId = m.supplier_id;
  if (!supplierId) {
    if (m.supplier_id || !parsed.data.supplier_id) {
      return res.status(400).json({ error: 'Choose a farm for this shared product.' });
    }
    supplierId = parsed.data.supplier_id;
  } else if (parsed.data.supplier_id && parsed.data.supplier_id !== supplierId) {
    return res.status(403).json({ error: 'You can only publish products for your own farm.' });
  }
  try {
    if (!await memberCanAccessSupplier(m, supplierId)) return res.status(404).json({ error: 'Farm not found.' });
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }

  const { data, error } = await db.rpc('publish_catalog_product_for_farm', {
    p_catalog_product_id: catalogProductId.data,
    p_supplier_id: supplierId,
  });
  if (error) {
    console.error('Could not make a shared product available:', error.message);
    const status = error.message.includes('not found') ? 404 : error.message.includes('not been approved') ? 409 : 500;
    return res.status(status).json({
      error: status === 409
        ? error.message
        : status === 404 ? 'This shared product is not ready to be shown.' : 'Could not make this product available.',
    });
  }
  return res.json(data);
});

app.get('/admin/catalog', requirePerm('catalog.manage'), async (req: AuthedRequest, res: Response) => {
  let allowedSupplierIds: string[] | null;
  try {
    allowedSupplierIds = await scopedSupplierIds(req.member!);
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  const proposalQuery = allowedSupplierIds?.length === 0
    ? Promise.resolve({ data: [], error: null })
    : (() => {
      let query = db.from('catalog_price_proposals')
        .select('id, catalog_product_id, supplier_id, product_id, retail_price, wholesale_price, status, created_at')
        .eq('status', 'pending')
        .order('created_at');
      if (allowedSupplierIds) query = query.in('supplier_id', allowedSupplierIds);
      return query;
    })();
  const [{ data: items, error: catalogError }, { data: proposals, error: proposalError }] = await Promise.all([
    db.from('catalog_products').select('*').order('category').order('name'),
    proposalQuery,
  ]);
  if (catalogError || proposalError) {
    console.error('Could not load the central product catalog:', catalogError?.message ?? proposalError?.message);
    return res.status(500).json({ error: 'Could not load the product catalog.' });
  }
  const safeItems = (items ?? []).map((item) => {
    const { bulk_price, mega_bulk_price, ...safeItem } = item;
    return {
      ...safeItem,
      ...(canViewTierPricing(req.member!) ? { bulk_price, mega_bulk_price } : {}),
    };
  });
  return res.json({ items: safeItems, proposals });
});

const catalogCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  unit: z.string().trim().min(1).max(24),
  retail_price: z.number().int().min(2),
  wholesale_price: z.number().int().positive(),
  wholesale_min_qty: z.number().int().positive(),
  bulk_price: z.number().int().positive().nullable().default(null),
  mega_bulk_price: z.number().int().positive().nullable().default(null),
  image_url: z.string().url().nullable(),
  price_approved: z.boolean().default(false),
}).refine((value) => value.wholesale_price < value.retail_price, {
  message: 'Wholesale price must be lower than retail price.',
  path: ['wholesale_price'],
}).refine((value) => (
  (value.bulk_price === null || value.bulk_price <= value.wholesale_price)
  && (value.mega_bulk_price === null || (value.bulk_price !== null && value.mega_bulk_price <= value.bulk_price))
), {
  message: 'Set a bulk price no higher than wholesale, and a mega-bulk price no higher than bulk.',
  path: ['bulk_price'],
});

app.post('/admin/catalog', requirePerm('catalog.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = catalogCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!canViewTierPricing(req.member!) && (parsed.data.bulk_price !== null || parsed.data.mega_bulk_price !== null)) {
    return res.status(403).json({ error: 'Only farm owners and platform administrators can set confidential volume prices.' });
  }
  const { data, error } = await db.from('catalog_products').insert(parsed.data).select('*').single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'A catalog product with this name already exists.' });
    console.error('Could not add a shared catalog product:', error.message);
    return res.status(500).json({ error: 'Could not add this catalog product.' });
  }
  const { bulk_price, mega_bulk_price, ...safeData } = data;
  return res.status(201).json({
    ...safeData,
    ...(canViewTierPricing(req.member!) ? { bulk_price, mega_bulk_price } : {}),
  });
});

const catalogUpdateSchema = z.object({
  category: z.string().trim().min(2).max(80),
  unit: z.string().trim().min(1).max(24),
  retail_price: z.number().int().min(2),
  wholesale_price: z.number().int().positive(),
  wholesale_min_qty: z.number().int().positive(),
  bulk_price: z.number().int().positive().nullable(),
  mega_bulk_price: z.number().int().positive().nullable(),
  image_url: z.string().url().nullable(),
  price_approved: z.boolean(),
}).refine((value) => value.wholesale_price < value.retail_price, {
  message: 'Wholesale price must be lower than retail price.',
  path: ['wholesale_price'],
}).refine((value) => (
  (value.bulk_price === null || value.bulk_price <= value.wholesale_price)
  && (value.mega_bulk_price === null || (value.bulk_price !== null && value.mega_bulk_price <= value.bulk_price))
), {
  message: 'Set a bulk price no higher than wholesale, and a mega-bulk price no higher than bulk.',
  path: ['bulk_price'],
});

app.patch('/admin/catalog/:id', requirePerm('catalog.manage'), async (req: AuthedRequest, res: Response) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = catalogUpdateSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    return res.status(400).json({ error: parsed.success ? 'Invalid catalog product ID.' : parsed.error.flatten() });
  }
  const { bulk_price: _bulkPrice, mega_bulk_price: _megaBulkPrice, ...publicUpdates } = parsed.data;
  const { data, error } = await db.from('catalog_products')
    .update(canViewTierPricing(req.member!) ? parsed.data : publicUpdates)
    .eq('id', id.data)
    .select()
    .maybeSingle();
  if (error) {
    console.error('Could not update central catalog pricing:', error.message);
    return res.status(500).json({ error: 'Could not update this catalog product.' });
  }
  if (!data) return res.status(404).json({ error: 'Catalog product not found.' });
  const { bulk_price, mega_bulk_price, ...safeData } = data;
  return res.json({
    ...safeData,
    ...(canViewTierPricing(req.member!) ? { bulk_price, mega_bulk_price } : {}),
  });
});

app.post('/admin/catalog-proposals/:id/review', requirePerm('catalog.manage'), async (req: AuthedRequest, res: Response) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = z.object({ approve: z.boolean() }).safeParse(req.body);
  if (!id.success || !parsed.success) {
    return res.status(400).json({ error: parsed.success ? 'Invalid price proposal ID.' : parsed.error.flatten() });
  }
  const { data: proposal, error: proposalError } = await db.from('catalog_price_proposals')
    .select('supplier_id')
    .eq('id', id.data)
    .maybeSingle();
  if (proposalError) return res.status(500).json({ error: 'Could not load this price proposal.' });
  if (!proposal) return res.status(404).json({ error: 'Price proposal not found.' });
  try {
    if (!await memberCanAccessSupplier(req.member!, proposal.supplier_id)) return res.status(404).json({ error: 'Price proposal not found.' });
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
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
  let allowedSupplierIds: string[] | null;
  try {
    allowedSupplierIds = await scopedSupplierIds(m);
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  if (allowedSupplierIds?.length === 0) return res.json([]);
  let q = db
    .from('inventory_movements')
    .select('id, supplier_id, kind, qty_change, stock_after, created_at, order_id, products(name, unit)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (allowedSupplierIds) q = q.in('supplier_id', allowedSupplierIds);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const restockSchema = z.object({ product_id: z.string().uuid(), qty: z.number().positive() });

app.post('/admin/restock', requirePerm('stock.adjust'), async (req: AuthedRequest, res: Response) => {
  const parsed = restockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  let supplierId = m.supplier_id;
  if (!supplierId) {
    if (m.supplier_id) return res.status(403).json({ error: 'Choose a farm product to add stock.' });
    const { data: product, error: productError } = await db.from('products')
      .select('supplier_id')
      .eq('id', parsed.data.product_id)
      .maybeSingle();
    if (productError) {
      console.error('Could not find the farm for this product restock:', productError.message);
      return res.status(500).json({ error: 'Could not load this product.' });
    }
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    supplierId = product.supplier_id;
    if (!supplierId) return res.status(404).json({ error: 'Product not found.' });
    try {
      if (!await memberCanAccessSupplier(m, supplierId)) return res.status(404).json({ error: 'Product not found.' });
    } catch (scopeError) {
      return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
    }
  }
  const { data: stockAfter, error } = await db.rpc('restock_product', {
    p_product_id: parsed.data.product_id,
    p_qty: parsed.data.qty,
    p_supplier_id: supplierId,
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
app.get('/admin/suppliers', requirePerm('suppliers.view_all'), async (req: AuthedRequest, res: Response) => {
  let allowedSupplierIds: string[] | null;
  try {
    allowedSupplierIds = await scopedSupplierIds(req.member!);
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  if (allowedSupplierIds?.length === 0) return res.json([]);
  let query = db.from('suppliers').select('*').order('name');
  if (allowedSupplierIds) query = query.in('id', allowedSupplierIds);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/admin/suppliers/:id/merge', requirePerm('suppliers.manage'), async (req: AuthedRequest, res: Response) => {
  if (!isPlatformAdministrator(req.member!)) return res.status(403).json({ error: 'Only platform owners and administrators can merge farms.' });
  const sourceId = z.string().uuid().safeParse(req.params.id);
  const target = z.object({ target_supplier_id: z.string().uuid() }).safeParse(req.body);
  if (!sourceId.success || !target.success) {
    return res.status(400).json({ error: target.success ? 'Invalid source farm ID.' : target.error.flatten() });
  }
  try {
    if (!await memberCanAccessSupplier(req.member!, sourceId.data)
      || !await memberCanAccessSupplier(req.member!, target.data.target_supplier_id)) {
      return res.status(404).json({ error: 'Farm not found.' });
    }
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  const { data, error } = await db.rpc('merge_farm_records', {
    p_source_supplier_id: sourceId.data,
    p_target_supplier_id: target.data.target_supplier_id,
  });
  if (error) {
    console.error('Could not merge farm records:', error.message);
    return res.status(409).json({ error: error.message });
  }
  return res.json(data);
});

app.delete('/admin/suppliers/:id', requirePerm('suppliers.manage'), async (req: AuthedRequest, res: Response) => {
  if (!isPlatformAdministrator(req.member!)) return res.status(403).json({ error: 'Only platform owners and administrators can remove farms.' });
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid farm ID.' });
  try {
    if (!await memberCanAccessSupplier(req.member!, id.data)) return res.status(404).json({ error: 'Farm not found.' });
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  const { data, error } = await db.rpc('archive_farm_record', { p_supplier_id: id.data });
  if (error) {
    console.error('Could not remove farm record:', error.message);
    return res.status(409).json({ error: error.message });
  }
  return res.json(data);
});

app.patch('/admin/suppliers/:id', requirePerm('suppliers.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    status: z.enum(['pending', 'active', 'suspended']).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    country_code: z.string().regex(/^[A-Z]{2}$/).optional(),
    country_name: z.string().trim().min(2).max(100).optional(),
    region_code: z.string().trim().min(1).max(100).optional(),
    region_name: z.string().trim().min(1).max(100).optional(),
    district_code: z.string().trim().min(1).max(100).nullable().optional(),
    district_name: z.string().trim().min(1).max(100).nullable().optional(),
  }).refine((value) => (
    (value.latitude === undefined) === (value.longitude === undefined)
    && (value.country_code === undefined) === (value.country_name === undefined)
    && (value.region_code === undefined) === (value.region_name === undefined)
    && (value.district_code === undefined) === (value.district_name === undefined)
    && (value.district_code === undefined || (value.district_code === null) === (value.district_name === null))
    && Object.values(value).some((entry) => entry !== undefined)
  ), {
    message: 'Provide matching country, region and district details, both coordinates, or a farm status.',
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const member = req.member!;
  try {
    if (!await memberCanAccessSupplier(member, req.params.id)) return res.status(404).json({ error: 'Farm not found.' });
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  const { data: current, error: currentError } = await db.from('suppliers')
    .select('country_code, region_code, district_code')
    .eq('id', req.params.id)
    .maybeSingle();
  if (currentError) return res.status(500).json({ error: 'Could not load this farm.' });
  if (!current) return res.status(404).json({ error: 'Farm not found.' });
  const updatedLocation = {
    country_code: parsed.data.country_code ?? current.country_code,
    region_code: parsed.data.region_code ?? current.region_code,
    district_code: parsed.data.district_code === undefined ? current.district_code : parsed.data.district_code,
  };
  if (updatedLocation.country_code && updatedLocation.region_code
    && !memberCanAccessLocation(member, updatedLocation as OperationScope)) {
    return res.status(403).json({ error: 'You cannot move a farm outside your operation areas.' });
  }
  const updateData = {
    ...parsed.data,
    ...(parsed.data.region_name ? { region: parsed.data.region_name } : {}),
  };
  const { data, error } = await db.from('suppliers').update(updateData).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const supplierSchema = z.object({
  name: z.string().min(2).max(120),
  country_code: z.string().regex(/^[A-Z]{2}$/),
  country_name: z.string().trim().min(2).max(100),
  region_code: z.string().trim().min(1).max(100),
  region_name: z.string().trim().min(1).max(100),
  district_code: z.string().trim().min(1).max(100).nullable().default(null),
  district_name: z.string().trim().min(1).max(100).nullable().default(null),
  contact_name: z.string().min(2).max(120),
  contact_email: z.string().email(),
  contact_phone: z.string().min(5).max(40),
}).refine((value) => (value.district_code === null) === (value.district_name === null), {
  message: 'Provide both district code and name, or leave both empty.',
});

app.post('/admin/suppliers', requirePerm('suppliers.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!memberCanAccessLocation(req.member!, parsed.data)) {
    return res.status(403).json({ error: 'You cannot add a farm outside your operation areas.' });
  }
  const { data: supplier, error: supplierError } = await db.from('suppliers').insert({
    name: parsed.data.name,
    region: parsed.data.region_name,
    country_code: parsed.data.country_code,
    country_name: parsed.data.country_name,
    region_code: parsed.data.region_code,
    region_name: parsed.data.region_name,
    district_code: parsed.data.district_code,
    district_name: parsed.data.district_name,
    contact_name: parsed.data.contact_name,
    contact_email: parsed.data.contact_email,
    contact_phone: parsed.data.contact_phone,
    status: 'active',
  }).select('id').single();
  if (supplierError?.code === '23505') {
    return res.status(409).json({ error: 'A farm with this name and region already exists.' });
  }
  if (supplierError) {
    console.error('Could not create farm:', supplierError.message);
    return res.status(500).json({ error: 'Could not create the farm.' });
  }

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

app.get('/admin/applications', requirePerm('suppliers.manage'), async (req: AuthedRequest, res: Response) => {
  const member = req.member!;
  let allowedSupplierIds: string[] | null;
  try {
    allowedSupplierIds = await scopedSupplierIds(member);
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  const { data, error } = await db.from('supplier_applications').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  if (allowedSupplierIds === null) return res.json(data);
  return res.json((data ?? []).filter((application) => (
    typeof application.country_code === 'string'
    && typeof application.region_code === 'string'
    && memberCanAccessLocation(member, {
      country_code: application.country_code,
      region_code: application.region_code,
      district_code: application.district_code ?? null,
    })
  )));
});

app.delete('/admin/applications/:id', requirePerm('settings.manage'), async (req: AuthedRequest, res: Response) => {
  const member = req.member!;
  if (member.supplier_id || !member.permissions.includes('suppliers.manage')) {
    return res.status(403).json({ error: 'Only platform administrators with farm management access can delete declined applications.' });
  }
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid application ID.' });
  const { data: application, error: loadError } = await db.from('supplier_applications')
    .select('id, country_code, region_code, district_code')
    .eq('id', id.data)
    .in('status', ['declined', 'rejected'])
    .maybeSingle();
  if (loadError) {
    console.error('Could not load declined application:', loadError.message);
    return res.status(500).json({ error: 'Could not load this declined application.' });
  }
  if (!application) return res.status(404).json({ error: 'Declined application not found.' });
  const hasStructuredLocation = typeof application.country_code === 'string'
    && typeof application.region_code === 'string';
  if (member.operation_scope_mode === 'restricted'
    && (!hasStructuredLocation || !memberCanAccessLocation(member, {
      country_code: application.country_code,
      region_code: application.region_code,
      district_code: application.district_code ?? null,
    }))) {
    return res.status(404).json({ error: 'Declined application not found.' });
  }
  const { data, error } = await db.from('supplier_applications')
    .delete()
    .eq('id', id.data)
    .in('status', ['declined', 'rejected'])
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('Could not delete declined application:', error.message);
    return res.status(500).json({ error: 'Could not delete this declined application.' });
  }
  if (!data) return res.status(404).json({ error: 'Declined application not found.' });
  return res.json({ ok: true });
});

// Approve = create the farm + invite its owner by email. Reject = just close it.
app.post('/admin/applications/:id/:decision', requirePerm('suppliers.manage'), async (req: AuthedRequest, res: Response) => {
  const decision = req.params.decision;
  if (decision !== 'approve' && decision !== 'reject') return res.status(400).json({ error: 'Use approve or reject' });
  const { data: a } = await db.from('supplier_applications').select('*').eq('id', req.params.id).maybeSingle();
  if (!a || !['pending', 'reviewing', 'new'].includes(a.status)) {
    return res.status(404).json({ error: 'Application not found or already handled' });
  }
  const hasStructuredLocation = typeof a.country_code === 'string'
    && typeof a.region_code === 'string';
  if ((!hasStructuredLocation && req.member!.operation_scope_mode === 'restricted')
    || (hasStructuredLocation && !memberCanAccessLocation(req.member!, {
      country_code: a.country_code,
      region_code: a.region_code,
      district_code: a.district_code ?? null,
    }))) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  if (decision === 'reject') {
    const { error } = await db.from('supplier_applications').update({ status: 'declined' }).eq('id', a.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  const { data: s, error: se } = await db.from('suppliers').insert({
    name: a.farm_name, status: 'active', region: a.region ?? a.location,
    country_code: a.country_code,
    country_name: a.country_name,
    region_code: a.region_code,
    region_name: a.region_name,
    district_code: a.district_code,
    district_name: a.district_name,
    contact_name: a.contact_name, contact_email: a.email, contact_phone: a.phone,
  }).select().single();
  if (se?.code === '23505') {
    return res.status(409).json({ error: 'A farm with this name and region already exists. Review the existing farm instead.' });
  }
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
  let visibleMembers = data ?? [];
  let visibleProfiles: { team_member_id: string; phone: string | null; age: number | null; job_title: string | null; bio: string | null; avatar_url: string | null; operation_scope_mode: string }[] = [];
  let visibleScopes: { team_member_id: string; country_code: string; country_name: string; region_code: string; region_name: string; district_code: string | null; district_name: string | null }[] = [];
  if (!m.supplier_id && m.operation_scope_mode === 'restricted') {
    let allowedSupplierIds: string[];
    try {
      allowedSupplierIds = await scopedSupplierIds(m) ?? [];
    } catch (scopeError) {
      return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
    }
    const [{ data: profiles, error: profileError }, { data: scopes, error: scopesError }] = await Promise.all([
      db.from('team_member_profiles').select('team_member_id, phone, age, job_title, bio, avatar_url, operation_scope_mode'),
      db.from('team_member_operation_scopes').select('team_member_id, country_code, country_name, region_code, region_name, district_code, district_name'),
    ]);
    if (profileError || scopesError) {
      console.error('Could not load scoped team profiles:', profileError?.message ?? scopesError?.message);
      return res.status(500).json({ error: 'Could not load team details for your operation areas.' });
    }
    visibleProfiles = profiles ?? [];
    visibleScopes = scopes ?? [];
    const profileById = new Map(visibleProfiles.map((profile) => [profile.team_member_id, profile]));
    const scopesById = new Map<string, OperationScope[]>();
    for (const scope of visibleScopes) {
      const entries = scopesById.get(scope.team_member_id) ?? [];
      entries.push(scope);
      scopesById.set(scope.team_member_id, entries);
    }
    visibleMembers = visibleMembers.filter((teamMember) => {
      if (teamMember.id === m.id) return true;
      if (teamMember.supplier_id) return allowedSupplierIds.includes(teamMember.supplier_id);
      const profile = profileById.get(teamMember.id);
      if (profile?.operation_scope_mode !== 'restricted') return false;
      return (scopesById.get(teamMember.id) ?? []).some((candidate) =>
        m.operation_scopes.some((scope) => operationScopesOverlap(scope, candidate)));
    });
  }
  const roleKeys = [...new Set(visibleMembers.map((member) => member.role))];
  const { data: roleRows, error: roleError } = await db.from('team_roles')
    .select('role_key, name, department_id, scope, permissions')
    .in('role_key', roleKeys);
  if (roleError) {
    console.error('Could not load roles for the team directory:', roleError.message);
    return res.status(500).json({ error: 'Could not load team role details.' });
  }
  const departmentIds = [...new Set((roleRows ?? []).map((role) => role.department_id))];
  const { data: departmentRows, error: departmentError } = departmentIds.length
    ? await db.from('team_departments').select('id, name, theme_color').in('id', departmentIds)
    : { data: [], error: null };
  if (departmentError) {
    console.error('Could not load departments for the team directory:', departmentError.message);
    return res.status(500).json({ error: 'Could not load team department details.' });
  }
  const roleByKey = new Map((roleRows ?? []).map((role) => [role.role_key, role]));
  const departmentById = new Map((departmentRows ?? []).map((department) => [department.id, department]));
  const profilesByMemberId = new Map(visibleProfiles.map((profile) => [profile.team_member_id, profile]));
  res.json(visibleMembers.map((member) => {
    const role = roleByKey.get(member.role);
    const department = role ? departmentById.get(role.department_id) : null;
    const profile = profilesByMemberId.get(member.id);
    return {
      ...member,
      role_label: role?.name ?? member.role,
      role_scope: role?.scope ?? (member.supplier_id ? 'farm' : 'platform'),
      permissions: role?.permissions ?? [],
      department_id: role?.department_id ?? '',
      department: department?.name ?? 'Unassigned',
      department_theme: department?.theme_color ?? '#6B7A6C',
      phone: profile?.phone ?? null,
      age: profile?.age ?? null,
      job_title: profile?.job_title ?? null,
      bio: profile?.bio ?? null,
      avatar_url: profile?.avatar_url
        ? db.storage.from('team-avatars').getPublicUrl(profile.avatar_url).data.publicUrl
        : null,
      operation_scope_mode: profile?.operation_scope_mode ?? 'global',
      operation_scopes: visibleScopes.filter((scope) => scope.team_member_id === member.id),
    };
  }));
});

app.get('/admin/role-config', requirePerm('team.view'), async (req: AuthedRequest, res: Response) => {
  const m = req.member!;
  const [{ data: departments, error: departmentError }, { data: roles, error: roleError }] = await Promise.all([
    db.from('team_departments').select('id, name, description, theme_color').order('name'),
    db.from('team_roles').select('role_key, name, department_id, scope, permissions, is_builtin').order('name'),
  ]);
  if (departmentError || roleError) {
    console.error('Could not load department and role configuration:', departmentError?.message ?? roleError?.message);
    return res.status(500).json({ error: 'Could not load departments and roles.' });
  }
  const assignable = (roles ?? []).filter((role) =>
    (!m.supplier_id || role.scope === 'farm')
    && role.permissions.every((permission: string) => m.permissions.includes(permission as Perm)),
  );
  return res.json({
    departments: departments ?? [],
    roles: assignable,
    can_manage_roles: !m.supplier_id && m.permissions.includes('team.roles.manage'),
  });
});

const departmentSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(''),
  theme_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#2E7D32'),
});

app.post('/admin/departments', requirePerm('team.roles.manage'), async (req: AuthedRequest, res: Response) => {
  if (req.member!.supplier_id) {
    return res.status(403).json({ error: 'Only platform team members can create departments.' });
  }
  const parsed = departmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await db.from('team_departments').insert(parsed.data)
    .select('id, name, description, theme_color').single();
  if (error?.code === '23505') return res.status(409).json({ error: 'A department with this ID already exists.' });
  if (error) {
    console.error('Could not create department:', error.message);
    return res.status(500).json({ error: 'Could not create this department.' });
  }
  return res.status(201).json(data);
});

const roleSchema = z.object({
  role_key: z.string().regex(/^[a-z][a-z0-9_-]{1,59}$/),
  name: z.string().trim().min(2).max(80),
  department_id: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
  scope: z.enum(['platform', 'farm']),
  permissions: z.array(z.string().refine((permission): permission is Perm => ALL.includes(permission as Perm))).max(ALL.length),
}).refine((role) => (
  !role.permissions.some((permission) => ['finance.view', 'marketing.view', 'stores.view', 'system.view'].includes(permission))
  || role.permissions.includes('dashboard.view')
), {
  message: 'Department dashboard access also requires the home dashboard permission.',
  path: ['permissions'],
});

app.post('/admin/roles', requirePerm('team.roles.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  if (m.supplier_id) {
    return res.status(403).json({ error: 'Only platform team members can create roles.' });
  }
  if (!parsed.data.permissions.every((permission) => m.permissions.includes(permission))) {
    return res.status(403).json({ error: 'A new role cannot grant permissions you do not have.' });
  }
  const { data, error } = await db.from('team_roles').insert({
    ...parsed.data,
    permissions: [...new Set(parsed.data.permissions)],
    is_builtin: false,
  }).select('role_key, name, department_id, scope, permissions, is_builtin').single();
  if (error?.code === '23505') return res.status(409).json({ error: 'A role with this ID already exists.' });
  if (error?.code === '23503') return res.status(400).json({ error: 'Choose an existing department.' });
  if (error) {
    console.error('Could not create team role:', error.message);
    return res.status(500).json({ error: 'Could not create this role.' });
  }
  return res.status(201).json(data);
});

const inviteSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  role: z.string().regex(/^[a-z][a-z0-9_-]{1,59}$/),
  supplier_id: z.string().uuid().optional(),
});

app.post('/admin/team', requirePerm('team.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  const { data: role, error: roleError } = await db.from('team_roles')
    .select('role_key, scope, permissions')
    .eq('role_key', parsed.data.role)
    .maybeSingle();
  if (roleError) return res.status(500).json({ error: 'Could not validate this team role.' });
  if (!role) return res.status(400).json({ error: 'Choose an available role.' });
  if (!role.permissions.every((permission: string) => m.permissions.includes(permission as Perm))) {
    return res.status(403).json({ error: 'You cannot assign a role with permissions you do not have.' });
  }

  let supplier_id: string | null = null;
  if (role.scope === 'farm') {
    supplier_id = m.supplier_id ?? parsed.data.supplier_id ?? null;
    if (!supplier_id) return res.status(400).json({ error: 'Choose which farm this person belongs to.' });
    if (m.supplier_id && supplier_id !== m.supplier_id) {
      return res.status(403).json({ error: 'You can only invite staff to your own farm.' });
    }
  } else if (m.supplier_id) {
    return res.status(403).json({ error: 'Farm administrators can only invite farm-scoped roles.' });
  }

  const invited = await db.auth.admin.inviteUserByEmail(parsed.data.email);
  if (invited.error) return res.status(500).json({ error: invited.error.message });
  const { data, error } = await db.from('team_members').insert({
    user_id: invited.data.user.id, supplier_id,
    full_name: parsed.data.full_name, email: parsed.data.email, role: role.role_key, status: 'invited',
  }).select().single();
  if (error) {
    console.error('Could not save invited team member:', error.message);
    const { error: cleanupError } = await db.auth.admin.deleteUser(invited.data.user.id);
    if (cleanupError) {
      console.error('Could not remove orphaned auth invite:', cleanupError.message);
    }
    return res.status(500).json({ error: 'Could not save the team invitation.' });
  }
  if (role.scope === 'platform' && m.operation_scope_mode === 'restricted') {
    const { error: scopeError } = await db.rpc('save_team_member_management_profile', {
      p_team_member_id: data.id,
      p_profile: { operation_scope_mode: 'restricted' },
      p_scopes: m.operation_scopes.map((scope) => ({
        country_code: scope.country_code,
        country_name: scope.country_name ?? scope.country_code,
        region_code: scope.region_code,
        region_name: scope.region_name ?? scope.region_code,
        district_code: scope.district_code,
        district_name: scope.district_name ?? scope.district_code,
      })),
    });
    if (scopeError) {
      console.error('Could not apply the inviter’s operation scopes to a new team member:', scopeError.message);
      const { error: memberCleanupError } = await db.from('team_members').delete().eq('id', data.id);
      if (memberCleanupError) console.error('Could not remove team member after scope assignment failed:', memberCleanupError.message);
      const { error: authCleanupError } = await db.auth.admin.deleteUser(invited.data.user.id);
      if (authCleanupError) console.error('Could not remove auth invite after scope assignment failed:', authCleanupError.message);
      return res.status(500).json({ error: 'Could not save the team invitation with its operation-area restrictions.' });
    }
  }
  res.status(201).json(data);
});

app.patch('/admin/team/:id', requirePerm('team.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ status: z.enum(['active', 'suspended']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = req.member!;
  if (req.params.id === m.id) return res.status(400).json({ error: 'You cannot change your own access' });
  let targetQuery = db.from('team_members')
    .select('id, supplier_id, role')
    .eq('id', req.params.id);
  if (m.supplier_id) targetQuery = targetQuery.eq('supplier_id', m.supplier_id);
  const { data: target, error: targetError } = await targetQuery.maybeSingle();
  if (targetError) {
    console.error('Could not load team member for access update:', targetError.message);
    return res.status(500).json({ error: 'Could not load this team member.' });
  }
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (!m.supplier_id && m.operation_scope_mode === 'restricted') {
    if (target.supplier_id) {
      try {
        if (!await memberCanAccessSupplier(m, target.supplier_id)) return res.status(404).json({ error: 'Not found' });
      } catch (scopeError) {
        return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
      }
    } else {
      const [{ data: targetProfile, error: targetProfileError }, { data: targetScopes, error: targetScopesError }] = await Promise.all([
        db.from('team_member_profiles').select('operation_scope_mode').eq('team_member_id', target.id).maybeSingle(),
        db.from('team_member_operation_scopes').select('country_code, region_code, district_code').eq('team_member_id', target.id),
      ]);
      if (targetProfileError || targetScopesError) {
        console.error('Could not validate team member operation areas:', targetProfileError?.message ?? targetScopesError?.message);
        return res.status(500).json({ error: 'Could not validate this team member’s operation areas.' });
      }
      if (targetProfile?.operation_scope_mode !== 'restricted'
        || !targetScopes?.some((scope) => m.operation_scopes.some((actorScope) => operationScopesOverlap(actorScope, scope)))) {
        return res.status(404).json({ error: 'Not found' });
      }
    }
  }
  const { data: targetRole, error: targetRoleError } = await db.from('team_roles')
    .select('scope, permissions')
    .eq('role_key', target.role)
    .maybeSingle();
  if (targetRoleError) {
    console.error('Could not load role for team member access update:', targetRoleError.message);
    return res.status(500).json({ error: 'Could not validate this team member role.' });
  }
  if (!targetRole) return res.status(409).json({ error: 'This team member has an invalid role configuration.' });
  if (m.supplier_id && targetRole.scope !== 'farm') {
    return res.status(403).json({ error: 'Farm administrators can only manage farm team members.' });
  }
  if (!targetRole.permissions.every((permission: string) => m.permissions.includes(permission as Perm))) {
    return res.status(403).json({ error: 'You cannot change a team member with permissions you do not have.' });
  }
  let q = db.from('team_members').update({ status: parsed.data.status }).eq('id', req.params.id);
  if (m.supplier_id) q = q.eq('supplier_id', m.supplier_id);
  const { data, error } = await q.select().maybeSingle();
  if (error) {
    console.error('Could not update team member access:', error.message);
    return res.status(500).json({ error: 'Could not update team member access.' });
  }
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

app.get('/admin/management/commission-policy', requirePerm('management.view'), async (_req: AuthedRequest, res: Response) => {
  const [{ data: policy, error: policyError }, { data: tiers, error: tiersError }] = await Promise.all([
    db.from('team_commission_settings').select('margin_pool_pct, incentive_budget_pct, bonus_rate_pct, period').eq('id', 'primary').maybeSingle(),
    db.from('team_commission_tiers').select('id, target_sales_tzs, commission_rate_pct').order('target_sales_tzs'),
  ]);
  if (policyError || tiersError || !policy) {
    console.error('Could not load weekly commission policy:', policyError?.message ?? tiersError?.message ?? 'Policy is not initialized.');
    return res.status(503).json({ error: 'Could not load the commission policy.' });
  }
  return res.json({ ...policy, tiers: tiers ?? [] });
});

app.put('/admin/management/commission-policy', requirePerm('management.manage'), async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    margin_pool_pct: z.number().min(0).max(100),
    incentive_budget_pct: z.number().min(0).max(1),
    bonus_rate_pct: z.number().min(0).max(1),
    tiers: z.array(z.object({
      target_sales_tzs: z.number().int().positive(),
      commission_rate_pct: z.number().min(0.2).max(0.5),
    })).max(30),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const tiers = [...parsed.data.tiers].sort((a, b) => a.target_sales_tzs - b.target_sales_tzs);
  if (new Set(tiers.map((tier) => tier.target_sales_tzs)).size !== tiers.length) {
    return res.status(400).json({ error: 'Each weekly sales target must be unique.' });
  }
  if (tiers.some((tier, index) => index > 0 && tier.commission_rate_pct < tiers[index - 1].commission_rate_pct)) {
    return res.status(400).json({ error: 'Higher sales targets cannot have a lower commission rate.' });
  }
  if (parsed.data.bonus_rate_pct > parsed.data.incentive_budget_pct
    || (tiers.at(-1)?.commission_rate_pct ?? 0) + parsed.data.bonus_rate_pct > parsed.data.incentive_budget_pct) {
    return res.status(400).json({ error: 'The highest commission tier plus bonus must fit within the incentive budget.' });
  }
  const { error } = await db.rpc('save_team_commission_policy', {
    p_margin_pool_pct: parsed.data.margin_pool_pct,
    p_incentive_budget_pct: parsed.data.incentive_budget_pct,
    p_bonus_rate_pct: parsed.data.bonus_rate_pct,
    p_tiers: tiers,
  });
  if (error) {
    console.error('Could not save weekly commission policy:', error.message);
    return res.status(400).json({ error: 'Could not save this commission policy. Check that the tiers fit within the incentive budget.' });
  }
  return res.json({ ok: true });
});

app.get('/admin/management/commission-summary', requirePerm('management.view'), async (req: AuthedRequest, res: Response) => {
  const member = req.member!;
  const { start, end } = weekBoundsUtc(new Date());
  const canManage = member.permissions.includes('management.manage');
  let allowedSupplierIds: string[] | null;
  try {
    allowedSupplierIds = await scopedSupplierIds(member);
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  const [{ data: sales, error: salesError }, { data: policy, error: policyError }, { data: tiers, error: tiersError }] = await Promise.all([
    allowedSupplierIds?.length === 0
      ? Promise.resolve({ data: [], error: null })
      : db.rpc('get_weekly_team_commission_sales', {
        p_from: start.toISOString(),
        p_to: end.toISOString(),
        p_team_member_id: canManage ? null : member.id,
        p_supplier_ids: allowedSupplierIds,
      }),
    db.from('team_commission_settings').select('margin_pool_pct, incentive_budget_pct, bonus_rate_pct').eq('id', 'primary').maybeSingle(),
    db.from('team_commission_tiers').select('target_sales_tzs, commission_rate_pct').order('target_sales_tzs'),
  ]);
  if (salesError || policyError || tiersError || !policy) {
    console.error('Could not calculate weekly commissions:', salesError?.message ?? policyError?.message ?? tiersError?.message ?? 'Policy is not initialized.');
    return res.status(503).json({ error: 'Could not calculate commission details.' });
  }
  const commissionTiers: CommissionTier[] = (tiers ?? []).map((tier) => ({
    target_sales_tzs: Number(tier.target_sales_tzs),
    commission_rate_pct: Number(tier.commission_rate_pct),
  }));
  type WeeklySalesRow = {
    team_member_id: string;
    full_name: string;
    email: string;
    sales_value_tzs: number;
    delivered_supplier_orders: number;
  };
  const salesRows = (sales ?? []) as WeeklySalesRow[];
  const rows = canManage
    ? salesRows
    : salesRows.filter((entry) => entry.team_member_id === member.id);
  return res.json({
    period: { start: start.toISOString(), end: end.toISOString() },
    tiers: commissionTiers,
    members: rows.map((entry) => ({
      team_member_id: entry.team_member_id,
      full_name: entry.full_name,
      email: entry.email,
      delivered_supplier_orders: Number(entry.delivered_supplier_orders),
      ...calculateWeeklyCommission(Number(entry.sales_value_tzs), {
        margin_pool_pct: Number(policy.margin_pool_pct),
        incentive_budget_pct: Number(policy.incentive_budget_pct),
        bonus_rate_pct: Number(policy.bonus_rate_pct),
      }, commissionTiers),
    })),
  });
});

app.get('/admin/management/assignable-orders', requirePerm('management.manage'), async (req: AuthedRequest, res: Response) => {
  let allowedSupplierIds: string[] | null;
  try {
    allowedSupplierIds = await scopedSupplierIds(req.member!);
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  if (allowedSupplierIds?.length === 0) return res.json([]);
  let query = db.from('supplier_orders')
    .select('id, order_id, supplier_id, status, updated_at, suppliers(name, country_name, region_name, district_name), supplier_order_assignments(team_member_id, team_members!supplier_order_assignments_team_member_id_fkey(full_name))')
    .in('status', ['pending', 'packing', 'en_route', 'delivered'])
    .order('updated_at', { ascending: false })
    .limit(300);
  if (allowedSupplierIds) query = query.in('supplier_id', allowedSupplierIds);
  const { data, error } = await query;
  if (error) {
    console.error('Could not load orders for sales assignment:', error.message);
    return res.status(500).json({ error: 'Could not load assignable orders.' });
  }
  return res.json((data ?? []).map((order) => {
    const supplier = relationRecord(order.suppliers);
    const assignment = relationRecord(order.supplier_order_assignments);
    const assignee = relationRecord(assignment?.team_members);
    return {
      id: order.id,
      code: order.order_id.slice(0, 8).toUpperCase(),
      supplier_id: order.supplier_id,
      supplier_name: typeof supplier?.name === 'string' ? supplier.name : 'Farm',
      country_code: typeof supplier?.country_code === 'string' ? supplier.country_code : '',
      country_name: typeof supplier?.country_name === 'string' ? supplier.country_name : '',
      region_code: typeof supplier?.region_code === 'string' ? supplier.region_code : '',
      region_name: typeof supplier?.region_name === 'string' ? supplier.region_name : '',
      district_code: typeof supplier?.district_code === 'string' ? supplier.district_code : '',
      district_name: typeof supplier?.district_name === 'string' ? supplier.district_name : '',
      status: order.status,
      updated_at: order.updated_at,
      team_member_id: typeof assignment?.team_member_id === 'string' ? assignment.team_member_id : null,
      team_member_name: typeof assignee?.full_name === 'string' ? assignee.full_name : null,
    };
  }));
});

app.get('/admin/management/members', requirePerm('management.manage'), async (req: AuthedRequest, res: Response) => {
  const [{ data: members, error: memberError }, { data: roles, error: roleError }, { data: profiles, error: profileError }, { data: scopes, error: scopeError }] = await Promise.all([
    db.from('team_members').select('id, supplier_id, full_name, email, role, status').is('supplier_id', null).order('full_name'),
    db.from('team_roles').select('role_key, name, scope, permissions'),
    db.from('team_member_profiles').select('team_member_id, phone, age, job_title, bio, avatar_url, operation_scope_mode'),
    db.from('team_member_operation_scopes').select('id, team_member_id, country_code, country_name, region_code, region_name, district_code, district_name'),
  ]);
  if (memberError || roleError || profileError || scopeError) {
    console.error('Could not load management team profiles:', memberError?.message ?? roleError?.message ?? profileError?.message ?? scopeError?.message);
    return res.status(503).json({ error: 'Could not load team management details.' });
  }
  const roleByKey = new Map((roles ?? []).map((role) => [role.role_key, role]));
  const profileById = new Map((profiles ?? []).map((profile) => [profile.team_member_id, profile]));
  const member = req.member!;
  const restrictedActor = !isPlatformAdministrator(member);
  return res.json((members ?? []).flatMap((teamMember) => {
    const role = roleByKey.get(teamMember.role);
    if (!role?.permissions.includes('management.view')) return [];
    const profile = profileById.get(teamMember.id);
    const memberScopes = (scopes ?? []).filter((scope) => scope.team_member_id === teamMember.id);
    if (restrictedActor && (
      profile?.operation_scope_mode !== 'restricted'
      || !memberScopes.some((candidate) => member.operation_scopes.some((scope) => operationScopesOverlap(scope, candidate)))
    )) return [];
    return [{
      ...teamMember,
      role_label: role.name,
      role_scope: role.scope,
      phone: profile?.phone ?? null,
      age: profile?.age ?? null,
      job_title: profile?.job_title ?? null,
      bio: profile?.bio ?? null,
      avatar_url: profile?.avatar_url
        ? db.storage.from('team-avatars').getPublicUrl(profile.avatar_url).data.publicUrl
        : null,
      operation_scope_mode: profile?.operation_scope_mode ?? 'global',
      operation_scopes: memberScopes,
    }];
  }));
});

const operationScopeSchema = z.object({
  country_code: z.string().regex(/^[A-Z]{2}$/),
  country_name: z.string().trim().min(2).max(100),
  region_code: z.string().trim().min(1).max(100),
  region_name: z.string().trim().min(1).max(100),
  district_code: z.string().trim().min(1).max(100).nullable(),
  district_name: z.string().trim().min(1).max(100).nullable(),
}).refine((scope) => (scope.district_code === null) === (scope.district_name === null), {
  message: 'Provide both district code and name, or leave both empty.',
});

app.put('/admin/management/members/:id', requirePerm('management.manage'), async (req: AuthedRequest, res: Response) => {
  const memberId = z.string().uuid().safeParse(req.params.id);
  const parsed = z.object({
    phone: z.string().trim().max(40).nullable(),
    age: z.number().int().min(16).max(120).nullable(),
    job_title: z.string().trim().max(100).nullable(),
    bio: z.string().trim().max(1000).nullable(),
    operation_scope_mode: z.enum(['global', 'restricted']),
    operation_scopes: z.array(operationScopeSchema).max(100),
  }).safeParse(req.body);
  if (!memberId.success || !parsed.success) {
    return res.status(400).json({ error: parsed.success ? 'Invalid team member ID.' : parsed.error.flatten() });
  }
  const actor = req.member!;
  if (memberId.data === actor.id) return res.status(400).json({ error: 'Use My account to update your own personal details.' });
  const { data: target, error: targetError } = await db.from('team_members')
    .select('id, role, supplier_id')
    .eq('id', memberId.data)
    .maybeSingle();
  if (targetError || !target) {
    if (targetError) console.error('Could not load target team member:', targetError.message);
    return res.status(targetError ? 500 : 404).json({ error: 'Could not load this team member.' });
  }
  if (['platform_owner', 'administrator', 'platform_admin'].includes(target.role)) {
    return res.status(403).json({ error: 'Owner accounts cannot be changed through employee management.' });
  }
  if (target.supplier_id) return res.status(400).json({ error: 'Farm team profiles are managed by the farm team.' });
  if (!isPlatformAdministrator(actor)) {
    const [{ data: targetProfile, error: targetProfileError }, { data: targetScopes, error: targetScopesError }] = await Promise.all([
      db.from('team_member_profiles').select('operation_scope_mode').eq('team_member_id', memberId.data).maybeSingle(),
      db.from('team_member_operation_scopes').select('country_code, region_code, district_code').eq('team_member_id', memberId.data),
    ]);
    if (targetProfileError || targetScopesError) {
      console.error('Could not validate target operation scopes:', targetProfileError?.message ?? targetScopesError?.message);
      return res.status(500).json({ error: 'Could not validate this team member’s operation areas.' });
    }
    if (targetProfile?.operation_scope_mode !== 'restricted'
      || !targetScopes?.some((scope) => actor.operation_scopes.some((actorScope) => operationScopesOverlap(actorScope, scope)))) {
      return res.status(403).json({ error: 'You cannot manage an employee outside your operation areas.' });
    }
  }
  if (parsed.data.operation_scope_mode === 'restricted' && parsed.data.operation_scopes.length === 0) {
    return res.status(400).json({ error: 'Choose at least one operation area for a restricted account.' });
  }
  if (parsed.data.operation_scope_mode === 'global' && parsed.data.operation_scopes.length > 0) {
    return res.status(400).json({ error: 'Remove individual operation areas before granting global access.' });
  }
  if (!isPlatformAdministrator(actor)) {
    if (parsed.data.operation_scope_mode === 'global') {
      return res.status(403).json({ error: 'Only platform administrators can grant global operation access.' });
    }
    if (!parsed.data.operation_scopes.every((candidate) => actor.operation_scopes.some((scope) => operationScopesOverlap(scope, candidate)))) {
      return res.status(403).json({ error: 'You cannot grant access beyond your own operation areas.' });
    }
  }
  const { error } = await db.rpc('save_team_member_management_profile', {
    p_team_member_id: memberId.data,
    p_profile: {
      phone: parsed.data.phone,
      age: parsed.data.age,
      job_title: parsed.data.job_title,
      bio: parsed.data.bio,
      operation_scope_mode: parsed.data.operation_scope_mode,
    },
    p_scopes: parsed.data.operation_scopes,
  });
  if (error) {
    console.error('Could not save team management profile:', error.message);
    return res.status(400).json({ error: 'Could not save this team profile and its operation areas.' });
  }
  return res.json({ ok: true });
});

app.post('/admin/management/my-avatar-upload', requirePerm(), async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const extension = parsed.data.content_type === 'image/jpeg' ? 'jpg' : parsed.data.content_type.slice('image/'.length);
  const path = `${req.member!.id}/${randomUUID()}.${extension}`;
  const { data, error } = await db.storage.from('team-avatars').createSignedUploadUrl(path, { upsert: false });
  if (error) {
    console.error('Could not create team avatar upload URL:', error.message);
    return res.status(503).json({ error: 'Could not prepare your profile photo upload.' });
  }
  return res.json({ path: data.path, token: data.token, public_url: db.storage.from('team-avatars').getPublicUrl(data.path).data.publicUrl });
});

app.patch('/admin/management/my-profile', requirePerm(), async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    phone: z.string().trim().max(40).nullable(),
    age: z.number().int().min(16).max(120).nullable(),
    job_title: z.string().trim().max(100).nullable(),
    bio: z.string().trim().max(1000).nullable(),
    avatar_url: z.string().max(200).nullable(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const member = req.member!;
  if (parsed.data.avatar_url && !parsed.data.avatar_url.startsWith(`${member.id}/`)) {
    return res.status(400).json({ error: 'The profile photo must be uploaded to your own account.' });
  }
  const { error } = await db.from('team_member_profiles').upsert({
    team_member_id: member.id,
    phone: parsed.data.phone,
    age: parsed.data.age,
    job_title: parsed.data.job_title,
    bio: parsed.data.bio,
    avatar_url: parsed.data.avatar_url,
    operation_scope_mode: member.operation_scope_mode,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('Could not update the signed-in team member profile:', error.message);
    return res.status(500).json({ error: 'Could not save your profile.' });
  }
  return res.json({
    ...member,
    ...parsed.data,
    avatar_path: parsed.data.avatar_url,
    avatar_url: parsed.data.avatar_url
      ? db.storage.from('team-avatars').getPublicUrl(parsed.data.avatar_url).data.publicUrl
      : null,
  });
});

app.get('/admin/management/my-activity', requirePerm(), async (req: AuthedRequest, res: Response) => {
  const member = req.member!;
  const { start, end } = weekBoundsUtc(new Date());
  const { data: assignments, error: assignmentError } = await db.from('supplier_order_assignments')
    .select('supplier_order_id')
    .eq('team_member_id', member.id)
    .limit(2000);
  if (assignmentError) {
    console.error('Could not load employee order assignments:', assignmentError.message);
    return res.status(503).json({ error: 'Could not load your weekly activities.' });
  }
  const orderIds = (assignments ?? []).map((assignment) => assignment.supplier_order_id);
  const [ordersResult, updatesResult] = await Promise.all([
    orderIds.length
      ? db.from('supplier_orders').select('id, status')
        .in('id', orderIds).gte('updated_at', start.toISOString()).lt('updated_at', end.toISOString())
      : Promise.resolve({ data: [], error: null }),
    db.from('supplier_orders').select('id', { count: 'exact', head: true })
      .eq('status_updated_by', member.id)
      .gte('updated_at', start.toISOString())
      .lt('updated_at', end.toISOString()),
  ]);
  if (ordersResult.error || updatesResult.error) {
    console.error('Could not calculate employee weekly activities:', ordersResult.error?.message ?? updatesResult.error?.message);
    return res.status(503).json({ error: 'Could not load your weekly activities.' });
  }
  const statuses = (ordersResult.data ?? []).reduce<Record<string, number>>((summary, order) => {
    summary[order.status] = (summary[order.status] ?? 0) + 1;
    return summary;
  }, {});
  return res.json({
    period: { start: start.toISOString(), end: end.toISOString() },
    assigned_orders: (ordersResult.data ?? []).length,
    delivered_orders: statuses.delivered ?? 0,
    active_orders: (statuses.pending ?? 0) + (statuses.packing ?? 0) + (statuses.en_route ?? 0),
    status_updates: updatesResult.count ?? 0,
    statuses,
  });
});

app.post('/admin/management/supplier-orders/:id/assign', requirePerm('management.manage'), async (req: AuthedRequest, res: Response) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = z.object({ team_member_id: z.string().uuid().nullable() }).safeParse(req.body);
  if (!id.success || !parsed.success) {
    return res.status(400).json({ error: parsed.success ? 'Invalid supplier order ID.' : parsed.error.flatten() });
  }
  const member = req.member!;
  const { data: supplierOrder, error: orderError } = await db.from('supplier_orders')
    .select('id, supplier_id')
    .eq('id', id.data)
    .maybeSingle();
  if (orderError || !supplierOrder) {
    if (orderError) console.error('Could not load supplier order for commission assignment:', orderError.message);
    return res.status(orderError ? 500 : 404).json({ error: 'Order not found.' });
  }
  try {
    if (!await memberCanAccessSupplier(member, supplierOrder.supplier_id)) return res.status(404).json({ error: 'Order not found.' });
  } catch (scopeError) {
    return res.status(503).json({ error: scopeError instanceof Error ? scopeError.message : 'Could not load your assigned operation areas.' });
  }
  if (parsed.data.team_member_id === null) {
    const { error } = await db.from('supplier_order_assignments').delete().eq('supplier_order_id', id.data);
    if (error) {
      console.error('Could not clear supplier order assignment:', error.message);
      return res.status(500).json({ error: 'Could not clear the order assignment.' });
    }
    return res.json({ ok: true, team_member_id: null });
  }
  const { data, error } = await db.from('supplier_order_assignments').upsert({
    supplier_order_id: id.data,
    team_member_id: parsed.data.team_member_id,
    assigned_by: member.id,
    assigned_at: new Date().toISOString(),
  }).select('supplier_order_id, team_member_id, assigned_at').single();
  if (error) {
    console.error('Could not assign supplier order:', error.message);
    return res.status(400).json({ error: 'Could not assign this order. Check that the employee is active and authorized for this area.' });
  }
  return res.json(data);
});

const settingsSchema = z.object({
  hub_name: z.string().min(2).max(120),
  free_radius_km: z.number().min(0).max(100),
  mid_radius_km: z.number().positive().max(200),
  mid_fee: z.number().int().nonnegative(),
  far_fee: z.number().int().nonnegative(),
  commission_pct: z.number().min(0).max(40),
  wholesale_min_default: z.number().int().positive(),
  tier_price_percentages: z.object({
    wholesale: z.number().finite().min(1).max(99),
    bulk: z.number().finite().min(1).max(99),
    mega_bulk: z.number().finite().min(1).max(99),
  }).refine((value) => value.wholesale > value.bulk && value.bulk > value.mega_bulk, {
    message: 'Tier percentages must descend from wholesale to bulk to mega-bulk.',
  }),
  delivery_option_fees: z.object({
    '12h': z.number().int().nonnegative().nullable(),
    '24h': z.number().int().nonnegative().nullable(),
    '48h': z.number().int().nonnegative().nullable(),
    '72h': z.number().int().nonnegative().nullable(),
    '7d': z.number().int().nonnegative().nullable(),
    '10d': z.number().int().nonnegative().nullable(),
    '14d': z.number().int().nonnegative().nullable(),
  }),
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
    tier_price_percentages: parsed.data.tier_price_percentages,
    delivery_option_fees: parsed.data.delivery_option_fees,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select().single();
  if (error) return res.status(500).json({ error: 'Could not save platform settings.' });
  return res.json(data);
});

app.listen(Number(PORT), () => console.log(`Saplaya API on :${PORT}`));
