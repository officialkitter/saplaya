import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { customerOrders } from '../src/customer-orders.js';

test('order history is scoped to the verified customer, including a guest identity', async () => {
  const rows = [
    { id: 'guest-order', customer_id: 'guest' },
    { id: 'other-order', customer_id: 'other' },
  ];
  let customerId = '';
  const query = {
    select() { return query; },
    eq(field: string, value: string) { assert.equal(field, 'customer_id'); customerId = value; return query; },
    order(field: string, options: { ascending: boolean }) { assert.equal(field, 'created_at'); assert.equal(options.ascending, false); return query; },
    async limit(limit: number) { assert.equal(limit, 50); return { data: rows.filter((row) => row.customer_id === customerId), error: null }; },
  };
  const db = { from(table: string) { assert.equal(table, 'orders'); return query; } } as unknown as SupabaseClient;
  assert.deepEqual((await customerOrders(db, 'guest')).data, [rows[0]]);
  assert.deepEqual((await customerOrders(db, 'other')).data, [rows[1]]);
  await assert.rejects(customerOrders(db, ''), /verified customer identity/);
});
