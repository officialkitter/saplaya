-- Run as postgres after 20261116100000_multicurrency_checkout_recipient.sql.
-- All fixtures, orders, stock changes, and payment records are rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, extensions;

do $test$
declare
  v_customer uuid := gen_random_uuid();
  v_supplier uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_request text := 'checkout-test-' || gen_random_uuid();
  v_legacy_request text := 'checkout-test-' || gen_random_uuid();
  v_payment text := 'checkout-test-' || gen_random_uuid();
  v_tracking text := 'checkout-test-' || gen_random_uuid();
  v_fee integer;
  v_items jsonb;
  v_order uuid;
  v_legacy_order uuid;
  v_paid_order uuid;
  v_rejected boolean;
begin
  select case when 0 <= free_radius_km then 0
    when 0 <= mid_radius_km then mid_fee else far_fee end
    into strict v_fee from public.platform_settings where id = 'primary';
  insert into auth.users (id) values (v_customer);
  insert into public.suppliers (id, name, status)
    values (v_supplier, 'Checkout test ' || v_supplier, 'active');
  insert into public.catalog_products (
    id, name, category, retail_price, wholesale_price, wholesale_min_qty, price_approved
  ) values (v_product, 'Checkout test ' || v_product, 'Produce', 10000, 7000, 10, true);
  insert into public.products (
    id, supplier_id, catalog_product_id, name, retail_price, wholesale_price, wholesale_min_qty, stock, active
  ) values (v_product, v_supplier, v_product, 'Checkout test ' || v_product, 10000, 7000, 10, 20, true);
  v_items := jsonb_build_array(jsonb_build_object(
    'product_id', v_product, 'qty', 1, 'unit_price', 10000
  ));

  v_order := public.place_cash_on_delivery_order(
    v_customer, v_request, 'retail', v_items, v_fee, 0, 45.4236, -75.7009,
    'morning', 'Checkout buyer', 'checkout@example.invalid', '+12025550123',
    'Checkout recipient', '+12025550124', 'Confirmed map destination'
  );
  if not exists (
    select 1 from public.orders where id = v_order and customer_id = v_customer
      and contact_name = 'Checkout buyer' and recipient_name = 'Checkout recipient'
      and recipient_phone = '+12025550124' and delivery_address = 'Confirmed map destination'
      and dest_lat = 45.4236 and dest_lng = -75.7009
  ) then raise exception 'Cash checkout lost buyer, recipient, or destination details'; end if;
  if public.place_cash_on_delivery_order(
    v_customer, v_request, 'retail', v_items, v_fee, 0, 45.4236, -75.7009,
    'morning', 'Checkout buyer', 'checkout@example.invalid', '+12025550123',
    'Checkout recipient', '+12025550124', 'Confirmed map destination'
  ) <> v_order then raise exception 'Cash retry created a different order'; end if;
  if (select stock from public.products where id = v_product) <> 19 then
    raise exception 'Cash retry deducted stock twice';
  end if;
  v_rejected := false;
  begin
    perform public.place_cash_on_delivery_order(
      v_customer, v_request, 'retail', v_items, v_fee, 0, 45.4236, -75.7009,
      'morning', 'Checkout buyer', 'checkout@example.invalid', '+12025550123',
      'Different recipient', '+12025550124', 'Confirmed map destination'
    );
  exception when raise_exception then
    if sqlerrm <> 'Checkout request key was reused with different order details' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'Cash retry accepted changed recipient details'; end if;

  v_legacy_order := public.place_cash_on_delivery_order(
    v_customer, v_legacy_request, 'retail', v_items, v_fee, 0, 45.4236, -75.7009,
    'morning', 'Checkout buyer', 'checkout@example.invalid', '+12025550123'
  );
  if not exists (
    select 1 from public.orders where id = v_legacy_order and recipient_name is null
      and recipient_phone is null and delivery_address is null
  ) then raise exception 'Legacy cash RPC no longer preserves its contract'; end if;
  if (select request_hash from public.cash_order_requests where request_key = v_legacy_request)
    is distinct from encode(digest(jsonb_build_object(
      'customer', v_customer, 'mode', 'retail',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', v_product::text, 'qty', '1'
      )),
      'lat', 45.4236::double precision, 'lng', -75.7009::double precision,
      'delivery_window', 'morning', 'name', 'Checkout buyer',
      'email', 'checkout@example.invalid', 'phone', '+12025550123'
    )::text, 'sha256'), 'hex') then
    raise exception 'Legacy request hash changed during the rolling deployment';
  end if;

  insert into public.checkout_payments (
    transaction_ref, customer_id, mode, items, delivery_fee, distance_km, dest_lat, dest_lng,
    customer_email, customer_name, customer_phone, delivery_window, amount, currency,
    payment_amount, exchange_rate, gateway_transaction_id, recipient_name, recipient_phone,
    delivery_address
  ) values (
    v_payment, v_customer, 'retail', v_items, v_fee, 0, 45.4236, -75.7009,
    'checkout@example.invalid', 'Checkout buyer', '+12025550123', 'morning',
    10000 + v_fee, 'USD', 4.25, 4.25 / (10000 + v_fee), v_tracking,
    'Checkout recipient', '+12025550124', 'Confirmed map destination'
  );
  v_paid_order := public.complete_pesapal_payment(v_payment, v_tracking);
  if not exists (
    select 1 from public.orders where id = v_paid_order and customer_id = v_customer
      and contact_name = 'Checkout buyer' and recipient_name = 'Checkout recipient'
      and recipient_phone = '+12025550124' and delivery_address = 'Confirmed map destination'
      and subtotal + delivery_fee = 10000 + v_fee
  ) then raise exception 'Paid checkout lost recipient details or changed base accounting'; end if;
  if public.complete_pesapal_payment(v_payment, v_tracking) <> v_paid_order then
    raise exception 'Repeated payment completion created a different order';
  end if;
  if not exists (
    select 1 from public.checkout_payments where transaction_ref = v_payment
      and status = 'paid' and order_id = v_paid_order and payment_amount = 4.25
      and currency = 'USD' and exchange_rate > 0
  ) then raise exception 'Payment completion changed the stored FX quote'; end if;
  if (select stock from public.products where id = v_product) <> 17 then
    raise exception 'Repeated completion deducted stock twice';
  end if;

  insert into public.checkout_payments (
    transaction_ref, customer_id, mode, items, delivery_fee, distance_km, dest_lat, dest_lng,
    customer_email, customer_name, customer_phone, delivery_window, amount, currency
  ) values (
    v_payment || '-legacy', v_customer, 'retail', v_items, v_fee, 0, 45.4236, -75.7009,
    'checkout@example.invalid', 'Checkout buyer', '+12025550123', 'morning',
    10000 + v_fee, 'TZS'
  );
  if not exists (
    select 1 from public.checkout_payments where transaction_ref = v_payment || '-legacy'
      and payment_amount = amount and exchange_rate = 1
  ) then raise exception 'Legacy TZS insert did not receive its quote snapshot'; end if;
  v_rejected := false;
  begin
    insert into public.checkout_payments (
      transaction_ref, customer_id, mode, items, delivery_fee, distance_km, dest_lat, dest_lng,
      customer_email, customer_name, customer_phone, delivery_window, amount, currency
    ) values (
      v_payment || '-invalid', v_customer, 'retail', v_items, v_fee, 0, 45.4236, -75.7009,
      'checkout@example.invalid', 'Checkout buyer', '+12025550123', 'morning',
      10000 + v_fee, 'USD'
    );
  exception when raise_exception then
    if sqlerrm <> 'Foreign-currency checkouts require an explicit payment amount and exchange rate' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'Foreign checkout accepted a missing FX snapshot'; end if;

  if has_function_privilege('authenticated',
    'public.place_cash_on_delivery_order(uuid,text,text,jsonb,integer,numeric,double precision,double precision,text,text,text,text,text,text,text)',
    'EXECUTE') or has_function_privilege('anon',
    'public.complete_pesapal_payment(text,text)', 'EXECUTE') then
    raise exception 'Checkout RPC grants permit a payment bypass';
  end if;
end;
$test$;

rollback;
select 'PASS' as status, 'Recipient persistence and idempotent cash checkout' as scenario
union all select 'PASS', 'Legacy cash RPC and TZS insert compatibility'
union all select 'PASS', 'FX snapshot, idempotent completion, and RPC access controls';
