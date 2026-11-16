create or replace function public.merge_multiple_farm_records(
  p_source_supplier_ids uuid[],
  p_target_supplier_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id uuid;
  v_results jsonb := '[]'::jsonb;
begin
  if p_target_supplier_id is null or p_source_supplier_ids is null
     or cardinality(p_source_supplier_ids) = 0
     or array_position(p_source_supplier_ids, null) is not null then
    raise exception 'Choose at least one source farm and a target farm';
  end if;
  if p_target_supplier_id = any(p_source_supplier_ids)
     or cardinality(p_source_supplier_ids) <> (
       select count(distinct id) from unnest(p_source_supplier_ids) as source(id)
     ) then
    raise exception 'Choose distinct source farms and a different target farm';
  end if;

  perform id from public.suppliers
  where id = any(p_source_supplier_ids) or id = p_target_supplier_id
  order by id
  for update;

  for v_source_id in select id from unnest(p_source_supplier_ids) as source(id) order by id
  loop
    v_results := v_results || jsonb_build_array(
      public.merge_farm_records(v_source_id, p_target_supplier_id)
    );
  end loop;

  return jsonb_build_object('target_supplier_id', p_target_supplier_id, 'merges', v_results);
end;
$$;

revoke all on function public.merge_multiple_farm_records(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.merge_multiple_farm_records(uuid[], uuid) to service_role;
