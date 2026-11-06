drop view if exists public.storefront_products;
create view public.storefront_products as
select p.id, p.name, p.category, p.unit, p.retail_price, p.wholesale_price,
       p.wholesale_min_qty, p.stock, p.image_url, p.harvested_at
from public.products p
join public.suppliers s on s.id = p.supplier_id
left join public.catalog_products c on c.id = p.catalog_product_id
where p.active
  and p.stock > 0
  and s.status = 'active'
  and (p.catalog_product_id is null or c.price_approved);
grant select on public.storefront_products to anon, authenticated;
revoke select on public.products from anon, authenticated;

alter table public.checkout_payments
  add column if not exists client_platform text not null default 'mobile'
    check (client_platform in ('mobile', 'web'));

alter table public.suppliers
  add column if not exists merged_into_supplier_id uuid
    references public.suppliers(id) on delete set null;
alter table public.suppliers
  add constraint suppliers_merged_farm_stays_suspended
  check (merged_into_supplier_id is null or status = 'suspended');

create or replace function public.merge_farm_records(
  p_source_supplier_id uuid,
  p_target_supplier_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_supplier public.suppliers%rowtype;
  v_target_supplier public.suppliers%rowtype;
  v_source_product public.products%rowtype;
  v_target_product public.products%rowtype;
  v_target_product_id uuid;
  v_stock numeric;
  v_products_merged integer := 0;
  v_products_created integer := 0;
begin
  if p_source_supplier_id = p_target_supplier_id then
    raise exception 'Choose two different farms';
  end if;

  perform id
  from public.suppliers
  where id in (p_source_supplier_id, p_target_supplier_id)
  order by id
  for update;

  select * into v_source_supplier
  from public.suppliers
  where id = p_source_supplier_id;
  if not found or v_source_supplier.status <> 'active'
     or v_source_supplier.merged_into_supplier_id is not null then
    raise exception 'The source farm is not active or was already merged';
  end if;

  select * into v_target_supplier
  from public.suppliers
  where id = p_target_supplier_id;
  if not found or v_target_supplier.status <> 'active'
     or v_target_supplier.merged_into_supplier_id is not null then
    raise exception 'Choose an active target farm';
  end if;

  if exists (
    select 1
    from public.supplier_orders so
    where so.supplier_id = p_source_supplier_id
      and so.status not in ('delivered', 'cancelled')
  ) then
    raise exception 'Complete or cancel the source farm''s open orders before merging';
  end if;

  for v_source_product in
    select * from public.products
    where supplier_id = p_source_supplier_id and active
    order by id
    for update
  loop
    v_stock := v_source_product.stock;
    select * into v_target_product
    from public.products
    where supplier_id = p_target_supplier_id
      and (
        (v_source_product.catalog_product_id is not null
          and catalog_product_id = v_source_product.catalog_product_id)
        or lower(btrim(name)) = lower(btrim(v_source_product.name))
      )
    order by active desc, stock desc, id
    limit 1
    for update;

    if found then
      v_target_product_id := v_target_product.id;
      update public.products
      set stock = stock + v_stock,
          active = active or v_source_product.active
      where id = v_target_product_id;
      v_products_merged := v_products_merged + 1;
    else
      insert into public.products
      select (
        jsonb_populate_record(
          null::public.products,
          to_jsonb(v_source_product) || jsonb_build_object(
            'id', gen_random_uuid(),
            'supplier_id', p_target_supplier_id
          )
        )
      ).*
      returning id into v_target_product_id;
      v_products_created := v_products_created + 1;
    end if;

    if v_stock <> 0 then
      insert into public.inventory_movements
        (supplier_id, product_id, kind, qty_change, stock_after)
      values
        (p_source_supplier_id, v_source_product.id, 'adjustment', -v_stock, 0),
        (p_target_supplier_id, v_target_product_id, 'adjustment', v_stock,
          (select stock from public.products where id = v_target_product_id));
    end if;

    update public.products
    set active = false, stock = 0
    where id = v_source_product.id;
  end loop;

  update public.suppliers
  set status = 'suspended',
      merged_into_supplier_id = p_target_supplier_id
  where id = p_source_supplier_id;

  return jsonb_build_object(
    'source_supplier_id', p_source_supplier_id,
    'target_supplier_id', p_target_supplier_id,
    'products_merged', v_products_merged,
    'products_created', v_products_created
  );
end;
$$;

create or replace function public.archive_farm_record(
  p_supplier_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier public.suppliers%rowtype;
  v_product public.products%rowtype;
begin
  select * into v_supplier
  from public.suppliers
  where id = p_supplier_id
  for update;
  if not found then
    raise exception 'Farm not found';
  end if;
  if v_supplier.merged_into_supplier_id is not null then
    raise exception 'This farm was already merged into another farm';
  end if;
  if exists (
    select 1
    from public.supplier_orders so
    where so.supplier_id = p_supplier_id
      and so.status not in ('delivered', 'cancelled')
  ) then
    raise exception 'Complete or cancel this farm''s open orders before removing it';
  end if;

  for v_product in
    select * from public.products
    where supplier_id = p_supplier_id and active
    order by id
    for update
  loop
    if v_product.stock <> 0 then
      insert into public.inventory_movements
        (supplier_id, product_id, kind, qty_change, stock_after)
      values (p_supplier_id, v_product.id, 'adjustment', -v_product.stock, 0);
    end if;
    update public.products
    set active = false, stock = 0
    where id = v_product.id;
  end loop;

  update public.suppliers
  set status = 'suspended'
  where id = p_supplier_id;

  return jsonb_build_object('supplier_id', p_supplier_id, 'archived', true);
end;
$$;

create or replace function public.merge_farm_products(
  p_source_product_id uuid,
  p_target_product_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.products%rowtype;
  v_target public.products%rowtype;
  v_source_stock numeric;
  v_target_stock numeric;
begin
  if p_source_product_id = p_target_product_id then
    raise exception 'Choose two different products';
  end if;

  perform id
  from public.products
  where id in (p_source_product_id, p_target_product_id)
  order by id
  for update;

  select * into v_source from public.products where id = p_source_product_id;
  if not found or not v_source.active then
    raise exception 'The source product is not active';
  end if;
  select * into v_target from public.products where id = p_target_product_id;
  if not found or not v_target.active then
    raise exception 'Choose an active target product';
  end if;
  if v_source.supplier_id <> v_target.supplier_id then
    raise exception 'Products can only be merged within the same farm; farm stock is kept separate';
  end if;
  if exists (
    select 1
    from public.order_items oi
    join public.supplier_orders so on so.id = oi.supplier_order_id
    where oi.product_id = p_source_product_id
      and so.status not in ('delivered', 'cancelled')
  ) then
    raise exception 'Complete or cancel orders for the source product before merging';
  end if;

  v_source_stock := v_source.stock;
  v_target_stock := v_target.stock + v_source_stock;
  update public.products
  set stock = v_target_stock
  where id = p_target_product_id;
  update public.products
  set stock = 0, active = false
  where id = p_source_product_id;

  if v_source_stock <> 0 then
    insert into public.inventory_movements
      (supplier_id, product_id, kind, qty_change, stock_after)
    values
      (v_source.supplier_id, p_source_product_id, 'adjustment', -v_source_stock, 0),
      (v_target.supplier_id, p_target_product_id, 'adjustment', v_source_stock, v_target_stock);
  end if;

  return jsonb_build_object(
    'source_product_id', p_source_product_id,
    'target_product_id', p_target_product_id,
    'stock_transferred', v_source_stock
  );
end;
$$;

create or replace function public.archive_farm_product(
  p_product_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_has_history boolean;
begin
  select * into v_product
  from public.products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'Product not found';
  end if;
  if exists (
    select 1
    from public.order_items oi
    join public.supplier_orders so on so.id = oi.supplier_order_id
    where oi.product_id = p_product_id
      and so.status not in ('delivered', 'cancelled')
  ) then
    raise exception 'Complete or cancel orders for this product before removing it';
  end if;

  select exists (select 1 from public.order_items where product_id = p_product_id)
      or exists (select 1 from public.inventory_movements where product_id = p_product_id)
      or exists (select 1 from public.catalog_price_proposals where product_id = p_product_id)
    into v_has_history;

  if not v_has_history then
    delete from public.products where id = p_product_id;
    return jsonb_build_object('product_id', p_product_id, 'archived', false);
  end if;

  if v_product.stock <> 0 then
    insert into public.inventory_movements
      (supplier_id, product_id, kind, qty_change, stock_after)
    values (v_product.supplier_id, p_product_id, 'adjustment', -v_product.stock, 0);
  end if;
  update public.products
  set active = false, stock = 0
  where id = p_product_id;
  return jsonb_build_object('product_id', p_product_id, 'archived', true);
end;
$$;

revoke all on function public.merge_farm_records(uuid, uuid) from public, anon, authenticated;
revoke all on function public.archive_farm_record(uuid) from public, anon, authenticated;
revoke all on function public.merge_farm_products(uuid, uuid) from public, anon, authenticated;
revoke all on function public.archive_farm_product(uuid) from public, anon, authenticated;

grant execute on function public.merge_farm_records(uuid, uuid) to service_role;
grant execute on function public.archive_farm_record(uuid) to service_role;
grant execute on function public.merge_farm_products(uuid, uuid) to service_role;
grant execute on function public.archive_farm_product(uuid) to service_role;

revoke all on function public.merge_farm_records(uuid, uuid) from public, anon, authenticated;
revoke all on function public.archive_farm_record(uuid) from public, anon, authenticated;
revoke all on function public.merge_farm_products(uuid, uuid) from public, anon, authenticated;
revoke all on function public.archive_farm_product(uuid) from public, anon, authenticated;
grant execute on function public.merge_farm_records(uuid, uuid) to service_role;
grant execute on function public.archive_farm_record(uuid) to service_role;
grant execute on function public.merge_farm_products(uuid, uuid) to service_role;
grant execute on function public.archive_farm_product(uuid) to service_role;
