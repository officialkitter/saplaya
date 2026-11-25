-- Run as postgres after 20261125090000_paypal_payment_provider.sql.
-- No provider requests are made; all fixtures and stock changes are rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, extensions;

do $test$
declare
  v_customer uuid := gen_random_uuid();
  v_supplier uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_provider text;
  v_reference text;
  v_gateway_id text;
  v_order uuid;
  v_items jsonb;
  v_fee integer;
  v_rejected boolean;
begin
  select case when 0 <= free_radius_km then 0
    when 0 <= mid_radius_km then mid_fee else far_fee end
    into strict v_fee from public.platform_settings where id = 'primary';
  insert into auth.users (id) values (v_customer);
  insert into public.suppliers (id, name, status)
    values (v_supplier, 'Gateway test ' || v_supplier, 'active');
  insert into public.catalog_products (
    id, name, category, retail_price, wholesale_price, wholesale_min_qty, price_approved
  ) values (v_product, 'Gateway test ' || v_product, 'Produce', 10000, 7000, 10, true);
  insert into public.products (
    id, supplier_id, catalog_product_id, name, retail_price, wholesale_price, wholesale_min_qty, stock, active
  ) values (v_product, v_supplier, v_product, 'Gateway test ' || v_product, 10000, 7000, 10, 20, true);
  v_items := jsonb_build_array(jsonb_build_object('product_id', v_product, 'qty', 1, 'unit_price', 10000));

  foreach v_provider in array array['stripe', 'snippe', 'pesapal', 'paypal'] loop
    v_reference := 'gateway-test-' || gen_random_uuid();
    v_gateway_id := 'provider-test-' || gen_random_uuid();
    insert into public.checkout_payments (
      transaction_ref, customer_id, mode, items, delivery_fee, distance_km, dest_lat, dest_lng,
      customer_email, customer_name, customer_phone, delivery_window, amount, currency,
      payment_amount, exchange_rate, gateway_transaction_id, provider,
      recipient_name, recipient_phone, delivery_address
    ) values (
      v_reference, v_customer, 'retail', v_items, v_fee, 0, 45.4236, -75.7009,
      'gateway@example.invalid', 'Gateway buyer', '+12025550123', 'morning',
      10000 + v_fee, 'TZS', 10000 + v_fee, 1, v_gateway_id, v_provider,
      'Gateway recipient', '+12025550124', 'Confirmed map destination'
    );

    v_rejected := false;
    begin
      perform public.complete_checkout_payment(v_reference,
        case when v_provider = 'stripe' then 'pesapal' else 'stripe' end, v_gateway_id);
    exception when raise_exception then
      if sqlerrm <> 'Payment provider does not match' then raise; end if;
      v_rejected := true;
    end;
    if not v_rejected then raise exception 'Accepted a mismatched provider'; end if;

    v_rejected := false;
    begin
      perform public.complete_checkout_payment(v_reference, v_provider, v_gateway_id || '-wrong');
    exception when raise_exception then
      if sqlerrm <> 'Payment transaction ID does not match' then raise; end if;
      v_rejected := true;
    end;
    if not v_rejected then raise exception 'Accepted a mismatched gateway ID'; end if;

    if v_provider = 'pesapal' then
      v_order := public.complete_pesapal_payment(v_reference, v_gateway_id);
    else
      v_order := public.complete_checkout_payment(v_reference, v_provider, v_gateway_id);
    end if;
    if not exists (
      select 1 from public.orders where id = v_order and customer_id = v_customer
        and payment_method = v_provider and recipient_name = 'Gateway recipient'
        and delivery_address = 'Confirmed map destination' and subtotal + delivery_fee = 10000 + v_fee
    ) then raise exception 'Lost provider, recipient or base accounting details'; end if;
    if not exists (
      select 1 from public.checkout_payments where transaction_ref = v_reference
        and status = 'paid' and order_id = v_order and payment_amount = 10000 + v_fee
    ) then raise exception 'Payment did not persist its completed order'; end if;
    if public.complete_checkout_payment(v_reference, v_provider, v_gateway_id) <> v_order then
      raise exception 'Repeated settlement returned another order';
    end if;
  end loop;

  if (select stock from public.products where id = v_product) <> 17 then
    raise exception 'Settlement or retries deducted incorrect stock';
  end if;
  if has_function_privilege('anon', 'public.complete_checkout_payment(text,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.complete_checkout_payment(text,text,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.complete_checkout_payment(text,text,text)', 'EXECUTE') then
    raise exception 'Gateway completion must be service-role only';
  end if;
end;
$test$;

rollback;
select 'PASS' as status, 'Provider binding and persisted fulfillment for Stripe, Snippe, Pesapal and PayPal' as scenario
union all select 'PASS', 'Idempotent completion, stock accounting and legacy Pesapal wrapper'
union all select 'PASS', 'Customer roles cannot execute gateway completion';
