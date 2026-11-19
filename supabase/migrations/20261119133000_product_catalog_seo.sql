alter table public.products
  add column if not exists updated_at timestamptz;

update public.products
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.products
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.touch_product_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.touch_product_updated_at();

create or replace function public.sync_catalog_product_name_to_farm_products()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.name is distinct from old.name then
    update public.products
    set name = new.name
    where catalog_product_id = new.id
      and name is distinct from new.name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_catalog_product_name_to_farm_products on public.catalog_products;
create trigger trg_sync_catalog_product_name_to_farm_products
after update of name on public.catalog_products
for each row execute function public.sync_catalog_product_name_to_farm_products();

revoke all on function public.touch_product_updated_at() from public, anon, authenticated;
grant execute on function public.touch_product_updated_at() to service_role;
revoke all on function public.sync_catalog_product_name_to_farm_products() from public, anon, authenticated;
grant execute on function public.sync_catalog_product_name_to_farm_products() to service_role;

update public.team_roles
set permissions = array(
  select distinct permission
  from unnest(permissions || array['products.edit']::text[]) as permission
  order by permission
)
where role_key in ('platform_owner', 'platform_manager', 'supplier_staff');
