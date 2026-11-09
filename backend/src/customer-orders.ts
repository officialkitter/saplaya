import type { SupabaseClient } from '@supabase/supabase-js';

export async function customerOrders(db: SupabaseClient, customerId: string) {
  if (!customerId) throw new Error('A verified customer identity is required.');
  return db.from('orders')
    .select('id, mode, status, subtotal, delivery_fee, created_at, delivery_window, payment_method, order_items(qty, unit_price, products(name, unit, image_url))')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(50);
}
