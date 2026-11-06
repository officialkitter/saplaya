-- Owner-managed tier percentages and quantity-activated order modes.
-- Run after 20261104190000_volume_location_delivery.sql.

alter table public.platform_settings
  add column if not exists tier_price_percentages jsonb not null
    default '{"wholesale":70,"bulk":65,"mega_bulk":55}'::jsonb;

alter table public.platform_settings
  drop constraint if exists platform_settings_tier_price_percentages_check;
alter table public.platform_settings
  add constraint platform_settings_tier_price_percentages_check
  check (
    jsonb_typeof(tier_price_percentages) = 'object'
    and (tier_price_percentages->>'wholesale')::numeric between 1 and 99
    and (tier_price_percentages->>'bulk')::numeric between 1 and 99
    and (tier_price_percentages->>'mega_bulk')::numeric between 1 and 99
    and (tier_price_percentages->>'wholesale')::numeric > (tier_price_percentages->>'bulk')::numeric
    and (tier_price_percentages->>'bulk')::numeric > (tier_price_percentages->>'mega_bulk')::numeric
  );

create or replace function public.derive_catalog_tier_prices()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_percentages jsonb;
begin
  select tier_price_percentages into v_percentages
  from public.platform_settings where id = 'primary';
  v_percentages := coalesce(v_percentages, '{"wholesale":70,"bulk":65,"mega_bulk":55}'::jsonb);

  new.wholesale_price := least(new.retail_price - 1, greatest(1,
    round(new.retail_price * (v_percentages->>'wholesale')::numeric / 100)::integer));
  new.bulk_price := least(new.wholesale_price, greatest(1,
    round(new.retail_price * (v_percentages->>'bulk')::numeric / 100)::integer));
  new.mega_bulk_price := least(new.bulk_price, greatest(1,
    round(new.retail_price * (v_percentages->>'mega_bulk')::numeric / 100)::integer));
  return new;
end;
$$;

drop trigger if exists trg_derive_catalog_tier_prices on public.catalog_products;
create trigger trg_derive_catalog_tier_prices
before insert or update of retail_price, price_approved on public.catalog_products
for each row execute function public.derive_catalog_tier_prices();

create or replace function public.reprice_approved_catalog_products()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tier_price_percentages is distinct from old.tier_price_percentages then
    update public.catalog_products
    set retail_price = retail_price, updated_at = now()
    where price_approved;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reprice_approved_catalog_products on public.platform_settings;
create trigger trg_reprice_approved_catalog_products
after update of tier_price_percentages on public.platform_settings
for each row execute function public.reprice_approved_catalog_products();

create or replace function public.derive_product_tier_prices()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_percentages jsonb;
begin
  select tier_price_percentages into v_percentages
  from public.platform_settings where id = 'primary';
  v_percentages := coalesce(v_percentages, '{"wholesale":70,"bulk":65,"mega_bulk":55}'::jsonb);

  new.wholesale_price := least(new.retail_price - 1, greatest(1,
    round(new.retail_price * (v_percentages->>'wholesale')::numeric / 100)::integer));
  new.bulk_price := least(new.wholesale_price, greatest(1,
    round(new.retail_price * (v_percentages->>'bulk')::numeric / 100)::integer));
  new.mega_bulk_price := least(new.bulk_price, greatest(1,
    round(new.retail_price * (v_percentages->>'mega_bulk')::numeric / 100)::integer));
  return new;
end;
$$;

drop trigger if exists trg_derive_product_tier_prices on public.products;
create trigger trg_derive_product_tier_prices
before insert or update of retail_price on public.products
for each row execute function public.derive_product_tier_prices();

create or replace function public.sync_product_volume_prices_from_catalog()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.catalog_product_id is not null then
    update public.products p
    set wholesale_price = c.wholesale_price,
        bulk_price = c.bulk_price,
        mega_bulk_price = c.mega_bulk_price,
        wholesale_min_qty = c.wholesale_min_qty
    from public.catalog_products c
    where p.id = new.id and c.id = new.catalog_product_id
      and (p.wholesale_price, p.bulk_price, p.mega_bulk_price, p.wholesale_min_qty)
          is distinct from (c.wholesale_price, c.bulk_price, c.mega_bulk_price, c.wholesale_min_qty);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_product_volume_prices_from_catalog on public.products;
create trigger trg_sync_product_volume_prices_from_catalog
after insert or update of catalog_product_id, retail_price on public.products
for each row execute function public.sync_product_volume_prices_from_catalog();

-- Recalculate existing approved prices immediately; historical order-item prices remain snapshots.
update public.catalog_products set retail_price = retail_price, updated_at = now() where price_approved;
update public.products set retail_price = retail_price where catalog_product_id is null;

alter table public.orders drop constraint if exists orders_mode_check;
alter table public.orders add constraint orders_mode_check
  check (mode in ('retail', 'wholesale', 'bulk', 'mega_bulk'));
alter table public.checkout_payments drop constraint if exists checkout_payments_mode_check;
alter table public.checkout_payments add constraint checkout_payments_mode_check
  check (mode in ('retail', 'wholesale', 'bulk', 'mega_bulk'));

alter table public.orders drop constraint if exists orders_delivery_window_check;
alter table public.checkout_payments drop constraint if exists checkout_payments_delivery_window_check;
alter table public.orders alter column delivery_window set default 'morning';
alter table public.checkout_payments alter column delivery_window set default 'morning';
alter table public.orders add constraint orders_delivery_window_check
  check (delivery_window in ('morning', 'evening', '12h', '24h', '48h', '72h', '7d', '10d', '14d'));
alter table public.checkout_payments add constraint checkout_payments_delivery_window_check
  check (delivery_window in ('morning', 'evening', '12h', '24h', '48h', '72h', '7d', '10d', '14d'));

create or replace function public.volume_unit_price(
  p_qty numeric,
  p_wholesale_min_qty integer,
  p_retail_price integer,
  p_wholesale_price integer,
  p_bulk_price integer,
  p_mega_bulk_price integer,
  p_mode text
) returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when p_qty >= p_wholesale_min_qty::numeric * 100 then p_mega_bulk_price
    when p_qty >= p_wholesale_min_qty::numeric * 10 then p_bulk_price
    when p_mode = 'wholesale' or p_qty >= p_wholesale_min_qty then p_wholesale_price
    else p_retail_price
  end
$$;

create or replace function public.place_paid_order(
  p_customer uuid,
  p_mode text,
  p_items jsonb,
  p_fee integer,
  p_distance numeric,
  p_lat double precision,
  p_lng double precision
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid;
  v_item jsonb;
  v_prod public.products%rowtype;
  v_supplier_order uuid;
  v_price integer;
  v_subtotal integer := 0;
  v_qty numeric;
  v_expected_mode text := 'retail';
begin
  if p_mode not in ('retail', 'wholesale', 'bulk', 'mega_bulk') then
    raise exception 'Invalid order mode';
  end if;

  insert into public.orders (customer_id, mode, subtotal, delivery_fee, distance_km, dest_lat, dest_lng)
  values (p_customer, p_mode, 0, p_fee, p_distance, p_lat, p_lng)
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_prod from public.products
    where id = (v_item->>'product_id')::uuid for update;
    v_qty := (v_item->>'qty')::numeric;
    if not found or not v_prod.active or v_prod.stock < v_qty then
      raise exception 'Not enough stock for %', coalesce(v_prod.name, 'item');
    end if;
    if p_mode = 'wholesale' and v_qty < v_prod.wholesale_min_qty then
      raise exception 'Wholesale minimum for % is %', v_prod.name, v_prod.wholesale_min_qty;
    end if;
    if v_qty >= v_prod.wholesale_min_qty::numeric * 100 then
      v_expected_mode := 'mega_bulk';
    elsif v_qty >= v_prod.wholesale_min_qty::numeric * 10 and v_expected_mode <> 'mega_bulk' then
      v_expected_mode := 'bulk';
    elsif v_qty >= v_prod.wholesale_min_qty and v_expected_mode = 'retail' then
      v_expected_mode := 'wholesale';
    end if;
    v_price := public.volume_unit_price(
      v_qty, v_prod.wholesale_min_qty, v_prod.retail_price, v_prod.wholesale_price,
      v_prod.bulk_price, v_prod.mega_bulk_price, p_mode
    );
    if v_price is null then raise exception 'A volume price is not configured for %', v_prod.name; end if;
    if (v_item->>'unit_price')::integer is distinct from v_price then
      raise exception 'The price for % has changed. Refresh your basket and try again.', v_prod.name;
    end if;

    v_subtotal := v_subtotal + round(v_price * v_qty);
    insert into public.supplier_orders (order_id, supplier_id)
    values (v_order, v_prod.supplier_id)
    on conflict (order_id, supplier_id) do update set updated_at = now()
    returning id into v_supplier_order;
    insert into public.order_items (order_id, supplier_order_id, product_id, supplier_id, qty, unit_price)
    values (v_order, v_supplier_order, v_prod.id, v_prod.supplier_id, v_qty, v_price);
    update public.products set stock = stock - v_qty where id = v_prod.id;
    insert into public.inventory_movements (supplier_id, product_id, order_id, kind, qty_change, stock_after)
    values (v_prod.supplier_id, v_prod.id, v_order, 'sale', -v_qty, v_prod.stock - v_qty);
  end loop;

  if p_mode = 'wholesale' and v_expected_mode = 'retail' then v_expected_mode := 'wholesale'; end if;
  if p_mode <> v_expected_mode then
    raise exception 'Order mode does not match the basket quantities; refresh checkout.';
  end if;
  update public.orders set subtotal = v_subtotal where id = v_order;
  return v_order;
end;
$$;

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
  v_configured_fee integer;
  v_distance_fee integer;
  v_expected_fee integer;
  v_settings public.platform_settings%rowtype;
begin
  if p_request_key is null or length(p_request_key) < 16 or length(p_request_key) > 120 then
    raise exception 'Invalid checkout request key';
  end if;
  if p_mode not in ('retail', 'wholesale', 'bulk', 'mega_bulk') then
    raise exception 'Invalid order mode';
  end if;
  if p_mode in ('retail', 'wholesale') then
    if p_delivery_window not in ('morning', 'evening') then raise exception 'Choose a morning or evening delivery window'; end if;
    v_configured_fee := 0;
  else
    if p_delivery_window not in ('12h', '24h', '48h', '72h', '7d', '10d', '14d') then
      raise exception 'Choose a valid bulk delivery timeframe';
    end if;
    select * into v_settings from public.platform_settings where id = 'primary';
    if not found then raise exception 'Delivery pricing is not configured'; end if;
    v_configured_fee := (v_settings.delivery_option_fees->>p_delivery_window)::integer;
    if v_configured_fee is null or v_configured_fee < 0 then raise exception 'This delivery option has not been configured'; end if;
  end if;
  select * into v_settings from public.platform_settings where id = 'primary';
  if not found then raise exception 'Delivery pricing is not configured'; end if;
  v_distance_fee := case
    when p_distance <= v_settings.free_radius_km then 0
    when p_distance <= v_settings.mid_radius_km then v_settings.mid_fee
    else v_settings.far_fee
  end;
  v_expected_fee := v_distance_fee + v_configured_fee;
  if p_fee is distinct from v_expected_fee then raise exception 'The delivery charge has changed. Refresh checkout and try again.'; end if;
  if p_customer_name is null or p_customer_email is null or p_customer_phone is null then
    raise exception 'Delivery contact details are required';
  end if;

  v_request_hash := encode(digest(jsonb_build_object(
    'customer', p_customer, 'mode', p_mode,
    'items', (select jsonb_agg(jsonb_build_object('product_id', item->>'product_id', 'qty', item->>'qty') order by ordinality)
      from jsonb_array_elements(p_items) with ordinality as entries(item, ordinality)),
    'lat', p_lat, 'lng', p_lng, 'delivery_window', p_delivery_window,
    'name', p_customer_name, 'email', p_customer_email, 'phone', p_customer_phone
  )::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(p_request_key, 0));
  select customer_id, request_hash, order_id
    into v_existing_customer, v_stored_request_hash, v_order
    from public.cash_order_requests where request_key = p_request_key for update;
  if found then
    if v_existing_customer <> p_customer then raise exception 'Checkout request belongs to another customer'; end if;
    if v_stored_request_hash is distinct from v_request_hash then raise exception 'Checkout request key was reused with different order details'; end if;
    if v_order is not null then return v_order; end if;
  else
    insert into public.cash_order_requests (request_key, customer_id, request_hash) values (p_request_key, p_customer, v_request_hash);
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid for update;
    if not found or not v_product.active then raise exception 'One or more items are no longer available'; end if;
    v_qty := (v_item->>'qty')::numeric;
    if v_product.stock < v_qty then raise exception 'Not enough stock for %', v_product.name; end if;
    if p_mode = 'wholesale' and v_qty < v_product.wholesale_min_qty then
      raise exception 'Wholesale minimum for % is %', v_product.name, v_product.wholesale_min_qty;
    end if;
    v_expected_price := public.volume_unit_price(
      v_qty, v_product.wholesale_min_qty, v_product.retail_price, v_product.wholesale_price,
      v_product.bulk_price, v_product.mega_bulk_price, p_mode
    );
    if v_expected_price is null or (v_item->>'unit_price')::integer is distinct from v_expected_price then
      raise exception 'The price or order mode changed. Refresh checkout and try again.';
    end if;
  end loop;

  v_order := public.place_paid_order(p_customer, p_mode, p_items, p_fee, p_distance, p_lat, p_lng);
  update public.orders
    set delivery_window = p_delivery_window, delivery_speed_fee = v_configured_fee,
        payment_method = 'cash_on_delivery', contact_name = p_customer_name,
        contact_email = p_customer_email, contact_phone = p_customer_phone
    where id = v_order;
  update public.cash_order_requests set order_id = v_order where request_key = p_request_key;
  return v_order;
end;
$$;

revoke all on function public.place_paid_order(uuid, text, jsonb, integer, numeric, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.place_paid_order(uuid, text, jsonb, integer, numeric, double precision, double precision)
  to service_role;
revoke all on function public.place_cash_on_delivery_order(
  uuid, text, text, jsonb, integer, numeric, double precision, double precision, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.place_cash_on_delivery_order(
  uuid, text, text, jsonb, integer, numeric, double precision, double precision, text, text, text, text
) to service_role;
