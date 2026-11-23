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
  v_stock numeric;
begin
  if p_qty <= 0 or p_qty > 10000 then
    raise exception 'Restock quantity must be greater than zero and at most 10000';
  end if;

  update public.products
  set stock = stock + p_qty, harvested_at = now()
  where id = p_product_id and supplier_id = p_supplier_id
  returning stock into v_stock;

  if not found then
    raise exception 'Product not found for this farm';
  end if;

  insert into public.inventory_movements (supplier_id, product_id, kind, qty_change, stock_after)
  values (p_supplier_id, p_product_id, 'restock', p_qty, v_stock);

  return v_stock;
end;
$$;

revoke all on function public.restock_product(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.restock_product(uuid, numeric, uuid) to service_role;
