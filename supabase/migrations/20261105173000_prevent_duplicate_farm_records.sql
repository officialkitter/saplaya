create or replace function public.prevent_duplicate_farm_listing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_name text := lower(btrim(new.name));
begin
  perform pg_advisory_xact_lock(hashtextextended(new.supplier_id::text || ':' || v_name, 0));

  if exists (
    select 1
    from public.products p
    where p.supplier_id = new.supplier_id
      and p.id is distinct from new.id
      and lower(btrim(p.name)) = v_name
  ) then
    raise exception using
      errcode = '23505',
      message = 'A product with this name already exists at this farm. Use the existing listing or browse the approved catalog.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_farm_listing on public.products;
create trigger trg_prevent_duplicate_farm_listing
before insert or update of supplier_id, name on public.products
for each row execute function public.prevent_duplicate_farm_listing();
revoke all on function public.prevent_duplicate_farm_listing() from public, anon, authenticated;

create or replace function public.prevent_duplicate_farm_name()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_name text := lower(btrim(new.name));
  v_region text := lower(btrim(coalesce(new.region, '')));
begin
  perform pg_advisory_xact_lock(hashtextextended(v_region || ':' || v_name, 0));

  if exists (
    select 1
    from public.suppliers s
    where s.id is distinct from new.id
      and lower(btrim(s.name)) = v_name
      and lower(btrim(coalesce(s.region, ''))) = v_region
  ) then
    raise exception using
      errcode = '23505',
      message = 'A farm with this name and region already exists.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_farm_name on public.suppliers;
create trigger trg_prevent_duplicate_farm_name
before insert or update of name, region on public.suppliers
for each row execute function public.prevent_duplicate_farm_name();
revoke all on function public.prevent_duplicate_farm_name() from public, anon, authenticated;
