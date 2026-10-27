create or replace function public.stock_catalog_product_for_farm(
  p_catalog_product_id uuid,
  p_supplier_id uuid,
  p_qty numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalog public.catalog_products%rowtype;
  v_product public.products%rowtype;
  v_supplier_status text;
  v_created boolean := false;
begin
  if p_qty <= 0 or p_qty > 10000 then
    raise exception 'Stock quantity must be greater than zero and at most 10000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_supplier_id::text || ':' || p_catalog_product_id::text, 0));

  select * into v_catalog
  from public.catalog_products
  where id = p_catalog_product_id
  for share;
  if not found then
    raise exception 'Shared catalog product not found';
  end if;
  if not v_catalog.price_approved then
    raise exception 'This shared price has not been approved';
  end if;

  select status into v_supplier_status
  from public.suppliers
  where id = p_supplier_id
  for share;
  if not found or v_supplier_status <> 'active' then
    raise exception 'Choose an active farm';
  end if;

  select * into v_product
  from public.products
  where supplier_id = p_supplier_id
    and (catalog_product_id = p_catalog_product_id or lower(btrim(name)) = lower(btrim(v_catalog.name)))
  order by coalesce(catalog_product_id = p_catalog_product_id, false) desc
  limit 1
  for update;

  if found and v_product.stock > 0 then
    return jsonb_build_object(
      'product_id', v_product.id,
      'stock', v_product.stock,
      'created', false,
      'already_stocked', true
    );
  end if;

  if found then
    update public.products
    set catalog_product_id = p_catalog_product_id,
        retail_price = v_catalog.retail_price,
        wholesale_price = v_catalog.wholesale_price,
        wholesale_min_qty = v_catalog.wholesale_min_qty,
        category = v_catalog.category,
        unit = v_catalog.unit,
        image_url = coalesce(v_catalog.image_url, image_url),
        stock = p_qty,
        harvested_at = now()
    where id = v_product.id
    returning * into v_product;
  else
    insert into public.products (
      supplier_id, catalog_product_id, name, category, unit,
      retail_price, wholesale_price, wholesale_min_qty, stock,
      low_stock_at, image_url, active, harvested_at
    ) values (
      p_supplier_id, p_catalog_product_id, v_catalog.name, v_catalog.category, v_catalog.unit,
      v_catalog.retail_price, v_catalog.wholesale_price, v_catalog.wholesale_min_qty, p_qty,
      10, v_catalog.image_url, true, now()
    )
    returning * into v_product;
    v_created := true;
  end if;

  insert into public.inventory_movements (supplier_id, product_id, kind, qty_change, stock_after)
  values (p_supplier_id, v_product.id, 'restock', p_qty, v_product.stock);

  return jsonb_build_object(
    'product_id', v_product.id,
    'stock', v_product.stock,
    'created', v_created,
    'already_stocked', false
  );
end;
$$;

revoke all on function public.stock_catalog_product_for_farm(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.stock_catalog_product_for_farm(uuid, uuid, numeric) to service_role;

create or replace function public.publish_catalog_product_for_farm(
  p_catalog_product_id uuid,
  p_supplier_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalog public.catalog_products%rowtype;
  v_product public.products%rowtype;
  v_supplier_status text;
begin
  select * into v_catalog
  from public.catalog_products
  where id = p_catalog_product_id;
  if not found then
    raise exception 'Shared catalog product not found';
  end if;
  if not v_catalog.price_approved then
    raise exception 'This shared price has not been approved';
  end if;

  select status into v_supplier_status
  from public.suppliers
  where id = p_supplier_id
  for share;
  if not found or v_supplier_status <> 'active' then
    raise exception 'Choose an active farm';
  end if;

  select * into v_product
  from public.products
  where supplier_id = p_supplier_id
    and (catalog_product_id = p_catalog_product_id or lower(btrim(name)) = lower(btrim(v_catalog.name)))
    and stock > 0
  order by coalesce(catalog_product_id = p_catalog_product_id, false) desc
  limit 1
  for update;
  if not found then
    raise exception 'No stocked farm listing was found';
  end if;

  update public.products
  set catalog_product_id = p_catalog_product_id,
      retail_price = v_catalog.retail_price,
      wholesale_price = v_catalog.wholesale_price,
      wholesale_min_qty = v_catalog.wholesale_min_qty,
      active = true
  where id = v_product.id
  returning * into v_product;

  return jsonb_build_object('product_id', v_product.id, 'stock', v_product.stock, 'active', v_product.active);
end;
$$;

revoke all on function public.publish_catalog_product_for_farm(uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_catalog_product_for_farm(uuid, uuid) to service_role;
