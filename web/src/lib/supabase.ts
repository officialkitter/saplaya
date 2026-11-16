import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { safeHttpErrorMessage, UserFacingError } from './user-facing-error';
import { RequestTimeoutError, withAbortTimeout, withTimeout } from './timeout';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const storageKey = process.env.NEXT_PUBLIC_SUPABASE_AUTH_STORAGE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }
  client ??= createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      ...(storageKey ? { storageKey } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export async function fetchAdmin<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data, error } = await withTimeout(getSupabase().auth.getSession());
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in to your Saplaya admin account to continue.');
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) throw new Error('Configure NEXT_PUBLIC_API_URL to connect the live admin API.');

  try {
    return await withAbortTimeout(async (signal) => {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
        ...init,
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        cache: 'no-store',
      });
      const result = await response.json() as T | { error?: string };
      if (!response.ok) throw new UserFacingError(safeHttpErrorMessage(response.status));
      return result as T;
    }, init.signal);
  } catch (error) {
    if (error instanceof RequestTimeoutError) {
      throw new UserFacingError('The request timed out. Check the latest result before trying again.');
    }
    throw error;
  }
}
