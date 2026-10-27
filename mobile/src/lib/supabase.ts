import './crypto-polyfill';
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { authStorage } from './auth-storage';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

if (!url || !publishableKey || !API_URL) {
  throw new Error(
    'Set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and EXPO_PUBLIC_API_URL.',
  );
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const supabaseOAuth = createClient(url, publishableKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Keep guest checkout frictionless; guest sessions can later be upgraded to accounts.
export async function ensureSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session;
  const res = await supabase.auth.signInAnonymously();
  if (res.error) throw res.error;
  if (!res.data.session) throw new Error('Could not create an account session.');
  return res.data.session;
}
