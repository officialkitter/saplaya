-- Apply after schema.sql and 002_roles.sql. Seed prices are unapproved references,
-- not live inventory; supplier listings and actual stock remain separate.

create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  unit text not null default 'kg',
  retail_price integer not null check (retail_price > 0),
  wholesale_price integer not null check (wholesale_price > 0 and wholesale_price < retail_price),
  wholesale_min_qty integer not null default 10 check (wholesale_min_qty > 0),
  image_url text,
  price_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists catalog_products_normalized_name_uidx
  on public.catalog_products (lower(btrim(name)));

create table if not exists public.catalog_price_proposals (
  id uuid primary key default gen_random_uuid(),
  catalog_product_id uuid not null references public.catalog_products(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  retail_price integer not null check (retail_price > 0),
  wholesale_price integer not null check (wholesale_price > 0 and wholesale_price < retail_price),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create unique index if not exists catalog_price_proposals_one_pending_per_product_uidx
  on public.catalog_price_proposals (catalog_product_id, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';

alter table public.products
  add column if not exists catalog_product_id uuid references public.catalog_products(id);
create index if not exists products_catalog_product_id_idx
  on public.products (catalog_product_id);

alter table public.catalog_products enable row level security;
alter table public.catalog_price_proposals enable row level security;
revoke all on public.catalog_products, public.catalog_price_proposals from anon, authenticated;
grant all on public.catalog_products, public.catalog_price_proposals to service_role;

-- Existing live prices become the first canonical prices; disagreement is held for owner review.
insert into public.catalog_products (name, category, unit, retail_price, wholesale_price, wholesale_min_qty, price_approved)
select
  min(p.name),
  coalesce(min(p.category), 'Produce'),
  min(p.unit),
  min(p.retail_price),
  min(p.wholesale_price),
  greatest(1, min(p.wholesale_min_qty)),
  count(distinct (p.retail_price, p.wholesale_price)) = 1
from public.products p
group by lower(btrim(p.name))
on conflict do nothing;

insert into public.catalog_products (name, category, unit, retail_price, wholesale_price, wholesale_min_qty)
values
  ('Amaranth leaves', 'Leafy greens', 'bunch', 1500, 1200, 10),
  ('Arugula', 'Leafy greens', 'bunch', 1800, 1400, 10),
  ('Avocado', 'Fruit', 'piece', 1500, 1200, 10),
  ('Banana', 'Fruit', 'kg', 2500, 2000, 10),
  ('Basil', 'Herbs', 'bunch', 1200, 900, 10),
  ('Beans, common', 'Legumes', 'kg', 4500, 3800, 10),
  ('Beans, kidney', 'Legumes', 'kg', 5000, 4200, 10),
  ('Beans, lima', 'Legumes', 'kg', 4800, 4000, 10),
  ('Beetroot', 'Root vegetables', 'kg', 2500, 2000, 10),
  ('Bell pepper, green', 'Vegetables', 'kg', 3500, 2900, 10),
  ('Bell pepper, red', 'Vegetables', 'kg', 4500, 3800, 10),
  ('Bitter gourd', 'Vegetables', 'kg', 3000, 2400, 10),
  ('Black-eyed peas', 'Legumes', 'kg', 4500, 3800, 10),
  ('Bottle gourd', 'Vegetables', 'kg', 2200, 1800, 10),
  ('Broccoli', 'Vegetables', 'kg', 5000, 4200, 10),
  ('Cabbage, green', 'Vegetables', 'head', 2500, 2000, 10),
  ('Cabbage, red', 'Vegetables', 'head', 3500, 2900, 10),
  ('Carrot', 'Root vegetables', 'kg', 2500, 2000, 10),
  ('Cassava', 'Root vegetables', 'kg', 1800, 1400, 10),
  ('Cauliflower', 'Vegetables', 'head', 4000, 3300, 10),
  ('Celery', 'Vegetables', 'bunch', 2500, 2000, 10),
  ('Chard', 'Leafy greens', 'bunch', 1500, 1200, 10),
  ('Chickpeas', 'Legumes', 'kg', 5000, 4200, 10),
  ('Chili pepper', 'Vegetables', 'kg', 5000, 4200, 10),
  ('Chives', 'Herbs', 'bunch', 1000, 800, 10),
  ('Coconut', 'Fruit', 'piece', 2500, 2000, 10),
  ('Coriander leaves', 'Herbs', 'bunch', 1000, 800, 10),
  ('Cucumber', 'Vegetables', 'kg', 2200, 1800, 10),
  ('Custard apple', 'Fruit', 'kg', 4000, 3300, 10),
  ('Drumstick pods', 'Vegetables', 'kg', 3500, 2900, 10),
  ('Eggplant', 'Vegetables', 'kg', 2500, 2000, 10),
  ('Fenugreek leaves', 'Leafy greens', 'bunch', 1200, 900, 10),
  ('Garlic', 'Vegetables', 'kg', 7000, 6000, 10),
  ('Ginger', 'Root vegetables', 'kg', 6000, 5000, 10),
  ('Green beans', 'Vegetables', 'kg', 3500, 2900, 10),
  ('Green peas', 'Legumes', 'kg', 4500, 3800, 10),
  ('Guava', 'Fruit', 'kg', 3000, 2400, 10),
  ('Kale', 'Leafy greens', 'bunch', 1800, 1400, 10),
  ('Lemon', 'Fruit', 'kg', 3000, 2400, 10),
  ('Lettuce', 'Leafy greens', 'head', 2500, 2000, 10),
  ('Lime', 'Fruit', 'kg', 3000, 2400, 10),
  ('Maize, dry', 'Grains', 'kg', 1800, 1400, 10),
  ('Maize, fresh cob', 'Grains', 'cob', 800, 600, 20),
  ('Mango', 'Fruit', 'kg', 3000, 2400, 10),
  ('Millet', 'Grains', 'kg', 3000, 2500, 10),
  ('Mint', 'Herbs', 'bunch', 1000, 800, 10),
  ('Mushroom', 'Vegetables', 'kg', 8000, 6800, 10),
  ('Okra', 'Vegetables', 'kg', 3000, 2400, 10),
  ('Onion, red', 'Vegetables', 'kg', 2500, 2000, 10),
  ('Onion, spring', 'Vegetables', 'bunch', 1200, 900, 10),
  ('Orange', 'Fruit', 'kg', 3000, 2400, 10),
  ('Papaya', 'Fruit', 'kg', 2500, 2000, 10),
  ('Passion fruit', 'Fruit', 'kg', 5000, 4200, 10),
  ('Peanut', 'Legumes', 'kg', 5000, 4200, 10),
  ('Pear', 'Fruit', 'kg', 6000, 5000, 10),
  ('Pineapple', 'Fruit', 'piece', 3500, 2900, 10),
  ('Plantain', 'Fruit', 'kg', 2500, 2000, 10),
  ('Potato, Irish', 'Root vegetables', 'kg', 2500, 2000, 10),
  ('Potato, sweet', 'Root vegetables', 'kg', 2000, 1600, 10),
  ('Pumpkin', 'Vegetables', 'kg', 1800, 1400, 10),
  ('Pumpkin leaves', 'Leafy greens', 'bunch', 1500, 1200, 10),
  ('Radish', 'Root vegetables', 'kg', 2500, 2000, 10),
  ('Rice, paddy', 'Grains', 'kg', 3500, 2900, 10),
  ('Rosemary', 'Herbs', 'bunch', 1500, 1200, 10),
  ('Roselle leaves', 'Leafy greens', 'bunch', 1500, 1200, 10),
  ('Sorghum', 'Grains', 'kg', 2500, 2000, 10),
  ('Soya beans', 'Legumes', 'kg', 4000, 3300, 10),
  ('Spinach', 'Leafy greens', 'bunch', 1800, 1400, 10),
  ('Spring onion', 'Vegetables', 'bunch', 1200, 900, 10),
  ('Squash', 'Vegetables', 'kg', 2200, 1800, 10),
  ('Strawberry', 'Fruit', 'kg', 10000, 8500, 10),
  ('Sugarcane', 'Fruit', 'piece', 1500, 1200, 10),
  ('Sunflower seed', 'Seeds', 'kg', 4500, 3800, 10),
  ('Tamarind', 'Fruit', 'kg', 4000, 3300, 10),
  ('Taro', 'Root vegetables', 'kg', 2500, 2000, 10),
  ('Thyme', 'Herbs', 'bunch', 1500, 1200, 10),
  ('Tomato', 'Vegetables', 'kg', 3000, 2400, 10),
  ('Turmeric', 'Root vegetables', 'kg', 5000, 4200, 10),
  ('Watermelon', 'Fruit', 'kg', 1800, 1400, 10),
  ('Yam', 'Root vegetables', 'kg', 3000, 2400, 10),
  ('Zucchini', 'Vegetables', 'kg', 3000, 2400, 10),
  ('Apple', 'Fruit', 'kg', 6000, 5000, 10),
  ('Apricot', 'Fruit', 'kg', 7000, 6000, 10),
  ('Artichoke', 'Vegetables', 'piece', 3500, 2900, 10),
  ('Asparagus', 'Vegetables', 'bunch', 5000, 4200, 10),
  ('Bambara groundnut', 'Legumes', 'kg', 4500, 3800, 10),
  ('Black pepper', 'Spices', 'kg', 12000, 10000, 5),
  ('Brinjal', 'Vegetables', 'kg', 2500, 2000, 10),
  ('Cantaloupe', 'Fruit', 'kg', 2500, 2000, 10),
  ('Cashew apple', 'Fruit', 'kg', 3500, 2900, 10),
  ('Cashew nut, raw', 'Nuts', 'kg', 12000, 10000, 5),
  ('Chia seed', 'Seeds', 'kg', 10000, 8500, 5),
  ('Chinese cabbage', 'Leafy greens', 'head', 3000, 2400, 10),
  ('Cocoa bean', 'Seeds', 'kg', 15000, 12500, 5),
  ('Corn, sweet', 'Grains', 'cob', 1000, 800, 20),
  ('Date', 'Fruit', 'kg', 7000, 6000, 10),
  ('Fennel', 'Vegetables', 'kg', 3500, 2900, 10),
  ('Fig', 'Fruit', 'kg', 7000, 6000, 10),
  ('Flaxseed', 'Seeds', 'kg', 7000, 6000, 5),
  ('Jackfruit', 'Fruit', 'kg', 3000, 2400, 10),
  ('Jute mallow', 'Leafy greens', 'bunch', 1500, 1200, 10),
  ('Kohlrabi', 'Vegetables', 'kg', 2500, 2000, 10),
  ('Macadamia nut', 'Nuts', 'kg', 18000, 15000, 5),
  ('Mandarin', 'Fruit', 'kg', 3500, 2900, 10),
  ('Mung beans', 'Legumes', 'kg', 5000, 4200, 10),
  ('Mustard greens', 'Leafy greens', 'bunch', 1800, 1400, 10),
  ('Pigeon peas', 'Legumes', 'kg', 4000, 3300, 10),
  ('Pomegranate', 'Fruit', 'kg', 6000, 5000, 10),
  ('Quinoa', 'Grains', 'kg', 9000, 7500, 5),
  ('Sesame seed', 'Seeds', 'kg', 6000, 5000, 10),
  ('Shallot', 'Vegetables', 'kg', 5000, 4200, 10),
  ('Teff', 'Grains', 'kg', 6000, 5000, 10),
  ('Vanilla bean', 'Spices', 'piece', 4000, 3300, 10),
  ('Winged bean', 'Legumes', 'kg', 4500, 3800, 10)
on conflict do nothing;

update public.products p
set catalog_product_id = c.id,
    retail_price = c.retail_price,
    wholesale_price = c.wholesale_price,
    wholesale_min_qty = c.wholesale_min_qty
from public.catalog_products c
where lower(btrim(p.name)) = lower(btrim(c.name))
  and p.catalog_product_id is null;

create or replace function public.sync_product_catalog_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalog public.catalog_products%rowtype;
begin
  if new.catalog_product_id is not null then
    select * into v_catalog from public.catalog_products where id = new.catalog_product_id;
  else
    select * into v_catalog
      from public.catalog_products
      where lower(btrim(name)) = lower(btrim(new.name))
      limit 1;
  end if;

  if not found then
    insert into public.catalog_products (name, category, unit, retail_price, wholesale_price, wholesale_min_qty)
    values (
      new.name, coalesce(new.category, 'Produce'), new.unit, new.retail_price,
      new.wholesale_price, greatest(1, new.wholesale_min_qty)
    )
    on conflict do nothing
    returning * into v_catalog;

    if v_catalog.id is null then
      select * into v_catalog
        from public.catalog_products
        where lower(btrim(name)) = lower(btrim(new.name))
        limit 1;
    end if;
  end if;

  if v_catalog.id is not null then
    new.catalog_product_id := v_catalog.id;
    if new.retail_price is distinct from v_catalog.retail_price
      or new.wholesale_price is distinct from v_catalog.wholesale_price then
      insert into public.catalog_price_proposals (
        catalog_product_id, supplier_id, product_id, retail_price, wholesale_price
      )
      values (
        v_catalog.id, new.supplier_id, new.id, new.retail_price, new.wholesale_price
      )
      on conflict do nothing;
    end if;
    new.retail_price := v_catalog.retail_price;
    new.wholesale_price := v_catalog.wholesale_price;
    new.wholesale_min_qty := v_catalog.wholesale_min_qty;
    if not v_catalog.price_approved then
      new.active := false;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_product_catalog_price on public.products;
create trigger trg_sync_product_catalog_price
before insert or update of name, retail_price, wholesale_price, wholesale_min_qty, catalog_product_id, active
on public.products
for each row execute function public.sync_product_catalog_price();
revoke all on function public.sync_product_catalog_price() from public, anon, authenticated;

create or replace view public.storefront_products as
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

create or replace function public.admin_update_catalog_product(
  p_id uuid,
  p_category text,
  p_unit text,
  p_retail_price integer,
  p_wholesale_price integer,
  p_wholesale_min_qty integer,
  p_image_url text,
  p_price_approved boolean
) returns public.catalog_products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalog public.catalog_products%rowtype;
begin
  if p_retail_price <= 0 or p_wholesale_price <= 0 or p_wholesale_price >= p_retail_price then
    raise exception 'Wholesale price must be positive and lower than retail price';
  end if;
  if p_wholesale_min_qty <= 0 then
    raise exception 'Wholesale minimum must be positive';
  end if;

  update public.catalog_products
  set category = p_category,
      unit = p_unit,
      retail_price = p_retail_price,
      wholesale_price = p_wholesale_price,
      wholesale_min_qty = p_wholesale_min_qty,
      image_url = p_image_url,
      price_approved = p_price_approved,
      updated_at = now()
  where id = p_id
  returning * into v_catalog;

  if not found then
    raise exception 'Catalog product not found';
  end if;

  update public.products
    set retail_price = v_catalog.retail_price,
        wholesale_price = v_catalog.wholesale_price,
        wholesale_min_qty = v_catalog.wholesale_min_qty,
        category = v_catalog.category,
        unit = v_catalog.unit,
        image_url = coalesce(v_catalog.image_url, image_url)
    where catalog_product_id = v_catalog.id;

  return v_catalog;
end;
$$;

create or replace function public.review_catalog_price_proposal(
  p_proposal_id uuid,
  p_approve boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.catalog_price_proposals%rowtype;
  v_catalog public.catalog_products%rowtype;
begin
  select * into v_proposal
    from public.catalog_price_proposals
    where id = p_proposal_id
    for update;
  if not found then
    raise exception 'Price proposal not found';
  end if;
  if v_proposal.status <> 'pending' then
    raise exception 'Price proposal has already been reviewed';
  end if;

  if p_approve then
    update public.catalog_products
      set retail_price = v_proposal.retail_price,
          wholesale_price = v_proposal.wholesale_price,
          price_approved = true,
          updated_at = now()
      where id = v_proposal.catalog_product_id
      returning * into v_catalog;

    update public.products
      set retail_price = v_catalog.retail_price,
          wholesale_price = v_catalog.wholesale_price,
          wholesale_min_qty = v_catalog.wholesale_min_qty
      where catalog_product_id = v_catalog.id;
  end if;

  update public.catalog_price_proposals
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_at = now()
    where id = p_proposal_id;

  return v_proposal.catalog_product_id;
end;
$$;

revoke all on function public.admin_update_catalog_product(uuid, text, text, integer, integer, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_update_catalog_product(uuid, text, text, integer, integer, integer, text, boolean)
  to service_role;
revoke all on function public.review_catalog_price_proposal(uuid, boolean) from public, anon, authenticated;
grant execute on function public.review_catalog_price_proposal(uuid, boolean) to service_role;
