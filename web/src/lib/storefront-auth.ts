import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let customerClient: ReturnType<typeof createClient> | undefined;

function getCustomerClient() {
  if (!supabaseUrl || !publishableKey) {
    throw new Error('Configure the public Supabase URL and publishable key for guest checkout.');
  }
  customerClient ??= createClient(supabaseUrl, publishableKey, {
    auth: {
      storageKey: 'saplaya-storefront-customer',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return customerClient;
}

export async function getStorefrontCustomerToken() {
  const client = getCustomerClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session.access_token;
  const result = await client.auth.signInAnonymously();
  if (result.error) throw new Error(`Guest checkout could not start: ${result.error.message}`);
  if (!result.data.session) throw new Error('Guest checkout could not create a customer session.');
  return result.data.session.access_token;
}

export async function storefrontRequest<T>(path: string, input?: unknown): Promise<T> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (!apiUrl) throw new Error('The storefront API is not configured.');
  const token = await getStorefrontCustomerToken();
  const response = await fetch(`${apiUrl}${path}`, {
    method: input === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(input === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    cache: 'no-store',
  });
  const result = await response.json() as T | { error?: string };
  if (!response.ok) {
    throw new Error(
      typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
        ? result.error
        : 'The storefront request could not be completed.',
    );
  }
  return result as T;
}
