import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationUrl = new URL('../../supabase/migrations/20261116100000_multicurrency_checkout_recipient.sql', import.meta.url);

test('checkout migration snapshots converted charges and transactional recipient details', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /payment_amount numeric\(18, 6\)/);
  assert.match(migration, /exchange_rate numeric\(30, 15\)/);
  assert.match(migration, /before insert on public\.checkout_payments/);
  assert.match(migration, /new\.currency is distinct from 'TZS'/);
  assert.match(migration, /new\.payment_amount := new\.amount/);
  assert.match(migration, /new\.exchange_rate := 1/);
  assert.doesNotMatch(migration, /drop function if exists public\.place_cash_on_delivery_order/i);
  assert.match(migration, /null::text, null::text, null::text/);
  assert.match(migration, /recipient_name text/);
  assert.match(migration, /recipient_phone text/);
  assert.match(migration, /delivery_address text/);
  assert.match(migration, /'recipient_name', p_recipient_name/);
  assert.match(migration, /'recipient_phone', p_recipient_phone/);
  assert.match(migration, /'delivery_address', p_delivery_address/);
  assert.match(migration, /recipient_name = p_recipient_name/);
  assert.match(migration, /delivery_address = p_delivery_address/);
  assert.match(migration, /recipient_name = v_payment\.recipient_name/);
  assert.match(migration, /delivery_address = v_payment\.delivery_address/);
  assert.match(migration, /v_order_subtotal \+ v_payment\.delivery_fee <> v_payment\.amount/);
});
