create or replace function public.publish_approved_catalog_listings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
  set active = true
  where catalog_product_id = new.id
    and stock > 0
    and not active;
  return new;
end;
$$;

drop trigger if exists trg_publish_approved_catalog_listings on public.catalog_products;
create trigger trg_publish_approved_catalog_listings
after update of price_approved on public.catalog_products
for each row
when (new.price_approved and not old.price_approved)
execute function public.publish_approved_catalog_listings();
revoke all on function public.publish_approved_catalog_listings() from public, anon, authenticated;
