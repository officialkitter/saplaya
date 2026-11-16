import { getAuth, getIdToken, onAuthStateChanged, signInWithPhoneNumber, signOut, type User } from '@react-native-firebase/auth';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { API_URL, ensureSession, supabase } from './supabase';
import type { CustomerIdentity } from './customer-auth.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Set the public Supabase URL and publishable key before using Firebase customer auth.');
}

export const firebaseAuth = getAuth();

const firebaseSupabase = createClient(supabaseUrl, supabasePublishableKey, {
  accessToken: async () => {
    const user = firebaseAuth.currentUser;
    return user ? getIdToken(user) : null;
  },
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

let pendingConfirmation: Awaited<ReturnType<typeof signInWithPhoneNumber>> | null = null;
let pendingPhone: string | null = null;
let pendingFullName: string | undefined;
let mappedUid: string | null = null;
let mappedCustomerId: string | null = null;

function identityFor(user: User): CustomerIdentity {
  return {
    id: user.uid,
    email: user.email ?? null,
    phone: user.phoneNumber ?? null,
    is_anonymous: false,
  };
}

export function getCurrentPhoneIdentity(): CustomerIdentity | null {
  const user = firebaseAuth.currentUser;
  return user ? identityFor(user) : null;
}

export function subscribePhoneAuth(listener: (user: CustomerIdentity | null) => void): () => void {
  return onAuthStateChanged(firebaseAuth, (user) => listener(user ? identityFor(user) : null));
}

export async function sendPhoneOtp(phone: string, fullName?: string): Promise<void> {
  pendingConfirmation = await signInWithPhoneNumber(firebaseAuth, phone);
  pendingPhone = phone;
  pendingFullName = fullName?.trim() || undefined;
}

async function bootstrapCustomerIdentity(user: User): Promise<string> {
  if (mappedUid === user.uid && mappedCustomerId) return mappedCustomerId;

  const token = await getIdToken(user);
  const response = await fetch(`${API_URL}/auth/firebase/bootstrap`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json() as {
    customer_id?: string;
    requires_token_refresh?: boolean;
    error?: string;
  };
  if (!response.ok || !result.customer_id) {
    throw new Error(result.error ?? 'Could not initialize the Firebase customer account.');
  }
  if (result.requires_token_refresh) await getIdToken(user, true);

  mappedUid = user.uid;
  mappedCustomerId = result.customer_id;
  return result.customer_id;
}

export async function verifyPhoneOtp(phone: string, code: string): Promise<CustomerIdentity> {
  if (!pendingConfirmation || pendingPhone !== phone) {
    throw new Error('Request a new SMS verification code before continuing.');
  }
  await pendingConfirmation.confirm(code);
  pendingConfirmation = null;
  pendingPhone = null;

  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Firebase did not return a signed-in user after verifying the code.');
  const customerId = await bootstrapCustomerIdentity(user);
  if (pendingFullName) {
    const { error } = await firebaseSupabase.from('customer_profiles').upsert({
      customer_id: customerId,
      full_name: pendingFullName,
      phone: user.phoneNumber ?? phone,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error('Account created, but could not save the profile name. Please try again.');
  }
  pendingFullName = undefined;
  return identityFor(user);
}

export async function getCustomerDataContext(): Promise<{
  client: SupabaseClient;
  userId: string;
}> {
  const firebaseUser = firebaseAuth.currentUser;
  if (firebaseUser) {
    return { client: firebaseSupabase, userId: await bootstrapCustomerIdentity(firebaseUser) };
  }
  const session = await ensureSession();
  return { client: supabase, userId: session.user.id };
}

export async function getCustomerApiToken(): Promise<string> {
  const firebaseUser = firebaseAuth.currentUser;
  if (firebaseUser) {
    await bootstrapCustomerIdentity(firebaseUser);
    return getIdToken(firebaseUser);
  }
  const session = await ensureSession();
  return session.access_token;
}

export async function signOutPhoneAuth(): Promise<void> {
  mappedUid = null;
  mappedCustomerId = null;
  pendingConfirmation = null;
  pendingPhone = null;
  pendingFullName = undefined;
  if (firebaseAuth.currentUser) await signOut(firebaseAuth);
}
