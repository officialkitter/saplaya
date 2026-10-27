-- Apply after schema.sql, 002_roles.sql, and mobile_account_payments.sql.

alter table public.orders
  add column if not exists delivery_window text not null default 'morning'
    check (delivery_window in ('morning', 'afternoon')),
  add column if not exists payment_method text not null default 'pesapal'
    check (payment_method in ('pesapal', 'cash_on_delivery')),
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

alter table public.checkout_payments
  add column if not exists delivery_window text not null default 'morning'
    check (delivery_window in ('morning', 'afternoon'));

create table if not exists public.customer_payment_methods (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 40),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (customer_id, phone_e164)
);

create unique index if not exists customer_payment_methods_one_default_uidx
  on public.customer_payment_methods (customer_id)
  where is_default;
alter table public.customer_payment_methods enable row level security;
revoke all on public.customer_payment_methods from anon, authenticated;
grant all on public.customer_payment_methods to service_role;

create or replace function public.save_customer_payment_method(
  p_customer uuid,
  p_label text,
  p_phone_e164 text
) returns public.customer_payment_methods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method public.customer_payment_methods%rowtype;
  v_is_default boolean;
begin
  if p_label is null or length(trim(p_label)) not between 1 and 40
    or p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Invalid saved payment method';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer::text, 0));
  select * into v_method
    from public.customer_payment_methods
    where customer_id = p_customer and phone_e164 = p_phone_e164
    for update;

  if found then
    update public.customer_payment_methods
      set label = trim(p_label)
      where id = v_method.id
      returning * into v_method;
    return v_method;
  end if;

  select not exists (
    select 1 from public.customer_payment_methods
    where customer_id = p_customer and is_default
  ) into v_is_default;

  insert into public.customer_payment_methods (customer_id, label, phone_e164, is_default)
  values (p_customer, trim(p_label), p_phone_e164, v_is_default)
  returning * into v_method;
  return v_method;
end;
$$;

create or replace function public.delete_customer_payment_method(
  p_customer uuid,
  p_method_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted public.customer_payment_methods%rowtype;
  v_next_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_customer::text, 0));
  delete from public.customer_payment_methods
    where id = p_method_id and customer_id = p_customer
    returning * into v_deleted;
  if not found then
    return false;
  end if;

  if v_deleted.is_default then
    select id into v_next_id
      from public.customer_payment_methods
      where customer_id = p_customer
      order by created_at, id
      limit 1;
    if v_next_id is not null then
      update public.customer_payment_methods
        set is_default = true
        where id = v_next_id;
    end if;
  end if;
  return true;
end;
$$;

revoke all on function public.save_customer_payment_method(uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_customer_payment_method(uuid, text, text) to service_role;
revoke all on function public.delete_customer_payment_method(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_customer_payment_method(uuid, uuid) to service_role;

create table if not exists public.customer_push_tokens (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists customer_push_tokens_customer_idx
  on public.customer_push_tokens (customer_id);
alter table public.customer_push_tokens enable row level security;
revoke all on public.customer_push_tokens from anon, authenticated;
grant all on public.customer_push_tokens to service_role;

create table if not exists public.cash_order_requests (
  request_key text primary key,
  customer_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null,
  order_id uuid unique references public.orders(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.cash_order_requests enable row level security;
revoke all on public.cash_order_requests from anon, authenticated;
grant all on public.cash_order_requests to service_role;

create or replace function public.place_cash_on_delivery_order(
  p_customer uuid,
  p_request_key text,
  p_mode text,
  p_items jsonb,
  p_fee integer,
  p_distance numeric,
  p_lat double precision,
  p_lng double precision,
  p_delivery_window text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order uuid;
  v_existing_customer uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_expected_price integer;
  v_qty numeric;
  v_request_hash text;
  v_stored_request_hash text;
begin
  if p_request_key is null or length(p_request_key) < 16 or length(p_request_key) > 120 then
    raise exception 'Invalid checkout request key';
  end if;
  if p_mode not in ('retail', 'wholesale') then
    raise exception 'Invalid order mode';
  end if;
  if p_delivery_window not in ('morning', 'afternoon') then
    raise exception 'Invalid delivery window';
  end if;
  if p_customer_name is null or p_customer_email is null or p_customer_phone is null then
    raise exception 'Delivery contact details are required';
  end if;

  v_request_hash := encode(digest(jsonb_build_object(
    'customer', p_customer,
    'mode', p_mode,
    'items', (
      select jsonb_agg(jsonb_build_object('product_id', item->>'product_id', 'qty', item->>'qty') order by ordinality)
      from jsonb_array_elements(p_items) with ordinality as entries(item, ordinality)
    ),
    'lat', p_lat,
    'lng', p_lng,
    'delivery_window', p_delivery_window,
    'name', p_customer_name,
    'email', p_customer_email,
    'phone', p_customer_phone
  )::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(p_request_key, 0));
  select customer_id, request_hash, order_id into v_existing_customer, v_stored_request_hash, v_order
    from public.cash_order_requests
    where request_key = p_request_key
    for update;

  if found then
    if v_existing_customer <> p_customer then
      raise exception 'Checkout request belongs to another customer';
    end if;
    if v_stored_request_hash is distinct from v_request_hash then
      raise exception 'Checkout request key was reused with different order details';
    end if;
    if v_order is not null then
      return v_order;
    end if;
  else
    insert into public.cash_order_requests (request_key, customer_id, request_hash)
      values (p_request_key, p_customer, v_request_hash);
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product
      from public.products
      where id = (v_item->>'product_id')::uuid
      for update;
    if not found or not v_product.active then
      raise exception 'One or more items are no longer available';
    end if;

    v_qty := (v_item->>'qty')::numeric;
    v_expected_price := case
      when p_mode = 'wholesale' then v_product.wholesale_price
      else v_product.retail_price
    end;
    if v_product.stock < v_qty then
      raise exception 'Not enough stock for %', v_product.name;
    end if;
    if p_mode = 'wholesale' and v_qty < v_product.wholesale_min_qty then
      raise exception 'Wholesale minimum for % is %', v_product.name, v_product.wholesale_min_qty;
    end if;
    if (v_item->>'unit_price')::integer is distinct from v_expected_price then
      raise exception 'The price for % has changed. Refresh your basket and try again.', v_product.name;
    end if;
  end loop;

  v_order := public.place_paid_order(
    p_customer, p_mode, p_items, p_fee, p_distance, p_lat, p_lng
  );

  update public.orders
    set delivery_window = p_delivery_window,
        payment_method = 'cash_on_delivery',
        contact_name = p_customer_name,
        contact_email = p_customer_email,
        contact_phone = p_customer_phone
    where id = v_order;
  update public.cash_order_requests
    set order_id = v_order
    where request_key = p_request_key;

  return v_order;
end;
$$;

revoke all on function public.place_cash_on_delivery_order(
  uuid, text, text, jsonb, integer, numeric, double precision, double precision, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.place_cash_on_delivery_order(
  uuid, text, text, jsonb, integer, numeric, double precision, double precision, text, text, text, text
) to service_role;

create or replace function public.complete_pesapal_payment(
  p_transaction_ref text,
  p_order_tracking_id text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.checkout_payments%rowtype;
  v_order_id uuid;
  v_order_subtotal integer;
begin
  select * into v_payment
    from public.checkout_payments
    where transaction_ref = p_transaction_ref
    for update;

  if not found then
    raise exception 'Payment reference not found';
  end if;

  if v_payment.order_id is not null then
    if v_payment.gateway_transaction_id <> p_order_tracking_id then
      raise exception 'Payment transaction does not match';
    end if;
    return v_payment.order_id;
  end if;

  if v_payment.gateway_transaction_id is distinct from p_order_tracking_id then
    raise exception 'Payment tracking ID does not match';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Payment is not pending';
  end if;

  v_order_id := public.place_paid_order(
    v_payment.customer_id,
    v_payment.mode,
    v_payment.items,
    v_payment.delivery_fee,
    v_payment.distance_km,
    v_payment.dest_lat,
    v_payment.dest_lng
  );

  select subtotal into v_order_subtotal
    from public.orders
    where id = v_order_id;
  if v_order_subtotal + v_payment.delivery_fee <> v_payment.amount then
    raise exception 'Paid amount does not match the order total';
  end if;

  update public.orders
    set delivery_window = v_payment.delivery_window,
        payment_method = 'pesapal'
    where id = v_order_id;
  update public.checkout_payments
    set status = 'paid',
        order_id = v_order_id,
        paid_at = now()
    where transaction_ref = p_transaction_ref;

  return v_order_id;
end;
$$;

revoke all on function public.complete_pesapal_payment(text, text) from public, anon, authenticated;
grant execute on function public.complete_pesapal_payment(text, text) to service_role;
