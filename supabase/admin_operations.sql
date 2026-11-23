create or replace function public.restock_product(
  p_product_id uuid,
  p_qty numeric,
  p_supplier_id uuid
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product products%rowtype;
  v_stock numeric;
begin
  if p_qty <= 0 or p_qty > 10000 then
    raise exception 'Restock quantity must be greater than zero and at most 10000';
  end if;

  select * into v_product
  from products
  where id = p_product_id and supplier_id = p_supplier_id
  for update;

  if not found then
    raise exception 'Product not found for this farm';
  end if;

  update products
  set stock = stock + p_qty, harvested_at = now()
  where id = p_product_id
  returning stock into v_stock;

  insert into inventory_movements (supplier_id, product_id, kind, qty_change, stock_after)
  values (p_supplier_id, p_product_id, 'restock', p_qty, v_stock);

  return v_stock;
end;
$$;

revoke all on function public.restock_product(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.restock_product(uuid, numeric, uuid) to service_role;

create or replace function public.create_product_with_stock(
  p_supplier_id uuid,
  p_name text,
  p_category text,
  p_unit text,
  p_retail_price integer,
  p_wholesale_price integer,
  p_wholesale_min_qty integer,
  p_stock numeric,
  p_low_stock_at numeric,
  p_image_url text,
  p_active boolean
) returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product products%rowtype;
begin
  insert into products (
    supplier_id, name, category, unit, retail_price, wholesale_price,
    wholesale_min_qty, stock, low_stock_at, image_url, active
  ) values (
    p_supplier_id, p_name, p_category, p_unit, p_retail_price, p_wholesale_price,
    p_wholesale_min_qty, p_stock, p_low_stock_at, p_image_url, p_active
  ) returning * into v_product;

  if p_stock > 0 then
    insert into inventory_movements (supplier_id, product_id, kind, qty_change, stock_after)
    values (p_supplier_id, v_product.id, 'adjustment', p_stock, p_stock);
  end if;

  return v_product;
end;
$$;

revoke all on function public.create_product_with_stock(uuid, text, text, text, integer, integer, integer, numeric, numeric, text, boolean)
  from public, anon, authenticated;
grant execute on function public.create_product_with_stock(uuid, text, text, text, integer, integer, integer, numeric, numeric, text, boolean)
  to service_role;
