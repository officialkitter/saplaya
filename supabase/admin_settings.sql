create table if not exists public.platform_settings (
  id text primary key check (id = 'primary'),
  hub_name text not null default 'Saplaya Operations Hub',
  free_radius_km numeric not null default 5 check (free_radius_km >= 0),
  mid_radius_km numeric not null default 10 check (mid_radius_km > free_radius_km),
  mid_fee integer not null default 2000 check (mid_fee >= 0),
  far_fee integer not null default 4000 check (far_fee >= mid_fee),
  commission_pct numeric not null default 8 check (commission_pct between 0 and 40),
  wholesale_min_default integer not null default 10 check (wholesale_min_default > 0),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id)
values ('primary')
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

alter table public.products
  add column if not exists low_stock_at numeric not null default 10;
