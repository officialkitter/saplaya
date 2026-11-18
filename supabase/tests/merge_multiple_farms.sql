-- Run as postgres after 20261117200000_merge_multiple_farms.sql.
-- All fixtures and stock changes are rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $test$
declare
  v_target uuid := gen_random_uuid();
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_good uuid := least(v_a, v_b);
  v_bad uuid := greatest(v_a, v_b);
  v_third uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_catalog uuid := gen_random_uuid();
  v_rejected boolean := false;
begin
  insert into public.suppliers (id, name, status) values
    (v_target, 'Merge target ' || v_target, 'active'),
    (v_good, 'Merge good ' || v_good, 'active'),
    (v_bad, 'Merge bad ' || v_bad, 'suspended'),
    (v_third, 'Merge third ' || v_third, 'active');
  insert into public.catalog_products (id, name, category, retail_price, wholesale_price, price_approved)
  values (v_catalog, 'Merge product ' || v_product, 'Produce', 100, 80, true);
  insert into public.products (id, supplier_id, catalog_product_id, name, retail_price, wholesale_price, stock, active)
  values (v_product, v_good, v_catalog, 'Merge product ' || v_product, 100, 80, 5, true);

  begin
    perform public.merge_multiple_farm_records(array[v_good, v_bad], v_target);
  exception when raise_exception then
    if sqlerrm <> 'The source farm is not active or was already merged' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'An inactive source was accepted'; end if;
  if (select merged_into_supplier_id from public.suppliers where id = v_good) is not null
     or (select stock from public.products where id = v_product) is distinct from 5
     or exists (select 1 from public.products where supplier_id = v_target) then
    raise exception 'A failed batch left a partial merge';
  end if;

  update public.suppliers set status = 'active' where id = v_bad;
  perform public.merge_multiple_farm_records(array[v_good, v_bad, v_third], v_target);
  if (select count(*) from public.suppliers
      where id = any(array[v_good, v_bad, v_third])
        and status = 'suspended' and merged_into_supplier_id = v_target) <> 3 then
    raise exception 'Not all source farms were merged';
  end if;
  if (select stock from public.products where supplier_id = v_target and name = 'Merge product ' || v_product) is distinct from 5
     or (select stock from public.products where id = v_product) is distinct from 0 then
    raise exception 'Stock was not transferred exactly once';
  end if;
  if not has_function_privilege('service_role', 'public.merge_multiple_farm_records(uuid[],uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.merge_multiple_farm_records(uuid[],uuid)', 'execute')
     or has_function_privilege('anon', 'public.merge_multiple_farm_records(uuid[],uuid)', 'execute') then
    raise exception 'Unexpected merge function privileges';
  end if;
end;
$test$;

rollback;
