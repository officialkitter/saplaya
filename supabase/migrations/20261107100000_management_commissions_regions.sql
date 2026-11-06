-- Employee profiles, regional operation scopes, sales assignments, and weekly incentives.
-- Apply after the existing team roles, supplier, order, and catalog migrations.

alter table public.suppliers
  add column if not exists country_code text,
  add column if not exists country_name text,
  add column if not exists region_code text,
  add column if not exists region_name text,
  add column if not exists district_code text,
  add column if not exists district_name text;

alter table public.supplier_applications
  add column if not exists country_code text,
  add column if not exists country_name text,
  add column if not exists region_code text,
  add column if not exists region_name text,
  add column if not exists district_code text,
  add column if not exists district_name text;

alter table public.supplier_orders
  add column if not exists status_updated_by uuid references public.team_members(id) on delete set null;

alter table public.team_roles drop constraint if exists team_roles_permissions_valid;
alter table public.team_roles
  add constraint team_roles_permissions_valid check (
    permissions <@ array[
      'dashboard.view', 'orders.view', 'orders.update_status',
      'products.view', 'products.edit', 'stock.adjust', 'inventory.view',
      'catalog.manage', 'suppliers.view_all', 'suppliers.manage',
      'team.view', 'team.manage', 'settings.manage',
      'finance.view', 'marketing.view', 'stores.view', 'system.view',
      'team.roles.manage', 'management.view', 'management.manage'
    ]::text[]
    and (
      not permissions && array['finance.view', 'marketing.view', 'stores.view', 'system.view']::text[]
      or 'dashboard.view' = any(permissions)
    )
  );

update public.team_roles
set permissions = array(
  select distinct permission
  from unnest(permissions || array['management.view', 'management.manage']::text[]) as permission
  order by permission
)
where role_key = 'platform_owner';

create table if not exists public.team_member_profiles (
  team_member_id uuid primary key references public.team_members(id) on delete cascade,
  phone text,
  age smallint check (age between 16 and 120),
  job_title text,
  bio text check (length(bio) <= 1000),
  avatar_url text,
  operation_scope_mode text not null default 'global'
    check (operation_scope_mode in ('global', 'restricted')),
  updated_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-avatars', 'team-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.team_member_operation_scopes (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  country_name text not null check (length(btrim(country_name)) between 2 and 100),
  region_code text not null check (length(btrim(region_code)) between 1 and 100),
  region_name text not null check (length(btrim(region_name)) between 1 and 100),
  district_code text,
  district_name text,
  created_at timestamptz not null default now(),
  check ((district_code is null) = (district_name is null))
);

create unique index if not exists team_member_operation_scopes_unique_idx
  on public.team_member_operation_scopes
    (team_member_id, country_code, region_code, coalesce(district_code, ''));
create index if not exists team_member_operation_scopes_member_idx
  on public.team_member_operation_scopes (team_member_id);
create index if not exists suppliers_operation_location_idx
  on public.suppliers (country_code, region_code, district_code);

create table if not exists public.supplier_order_assignments (
  supplier_order_id uuid primary key references public.supplier_orders(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete restrict,
  assigned_by uuid not null references public.team_members(id) on delete restrict,
  assigned_at timestamptz not null default now()
);

create index if not exists supplier_order_assignments_member_idx
  on public.supplier_order_assignments (team_member_id, assigned_at desc);

create table if not exists public.team_commission_settings (
  id text primary key check (id = 'primary'),
  margin_pool_pct numeric not null default 10 check (margin_pool_pct between 0 and 100),
  incentive_budget_pct numeric not null default 1 check (incentive_budget_pct between 0 and 100),
  bonus_rate_pct numeric not null default 0.1 check (bonus_rate_pct between 0 and 100),
  period text not null default 'weekly' check (period = 'weekly'),
  updated_at timestamptz not null default now(),
  check (bonus_rate_pct <= incentive_budget_pct)
);

insert into public.team_commission_settings (id)
values ('primary')
on conflict (id) do nothing;

create table if not exists public.team_commission_tiers (
  id uuid primary key default gen_random_uuid(),
  target_sales_tzs bigint not null check (target_sales_tzs > 0),
  commission_rate_pct numeric not null check (commission_rate_pct between 0.2 and 0.5),
  created_at timestamptz not null default now(),
  unique (target_sales_tzs)
);

create or replace function public.save_team_member_management_profile(
  p_team_member_id uuid,
  p_profile jsonb,
  p_scopes jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope_mode text;
  v_is_platform boolean;
begin
  if jsonb_typeof(p_profile) <> 'object' or jsonb_typeof(p_scopes) <> 'array' then
    raise exception 'Invalid team member management profile';
  end if;
  select r.scope = 'platform'
    into v_is_platform
    from public.team_members m
    join public.team_roles r on r.role_key = m.role
    where m.id = p_team_member_id;
  if v_is_platform is null then raise exception 'Team member not found'; end if;

  v_scope_mode := coalesce(p_profile->>'operation_scope_mode', 'global');
  if v_scope_mode not in ('global', 'restricted') then raise exception 'Invalid operation scope'; end if;
  if not v_is_platform and (v_scope_mode <> 'global' or jsonb_array_length(p_scopes) > 0) then
    raise exception 'Farm team members cannot have platform operation scopes';
  end if;
  if v_scope_mode = 'restricted' and jsonb_array_length(p_scopes) = 0 then
    raise exception 'Select at least one operation area for a restricted account';
  end if;
  if v_scope_mode = 'global' and jsonb_array_length(p_scopes) > 0 then
    raise exception 'Remove individual operation areas before granting global access';
  end if;
  if jsonb_array_length(p_scopes) > 100 then raise exception 'Too many operation areas'; end if;

  insert into public.team_member_profiles (
    team_member_id, phone, age, job_title, bio, avatar_url, operation_scope_mode, updated_at
  ) values (
    p_team_member_id,
    nullif(btrim(p_profile->>'phone'), ''),
    nullif(p_profile->>'age', '')::smallint,
    nullif(btrim(p_profile->>'job_title'), ''),
    nullif(btrim(p_profile->>'bio'), ''),
    nullif(btrim(p_profile->>'avatar_url'), ''),
    v_scope_mode,
    now()
  )
  on conflict (team_member_id) do update set
    phone = excluded.phone,
    age = excluded.age,
    job_title = excluded.job_title,
    bio = excluded.bio,
    avatar_url = excluded.avatar_url,
    operation_scope_mode = excluded.operation_scope_mode,
    updated_at = excluded.updated_at;

  delete from public.team_member_operation_scopes where team_member_id = p_team_member_id;
  insert into public.team_member_operation_scopes (
    team_member_id, country_code, country_name, region_code, region_name, district_code, district_name
  )
  select p_team_member_id, country_code, country_name, region_code, region_name, district_code, district_name
  from jsonb_to_recordset(p_scopes) as scope(
    country_code text, country_name text, region_code text, region_name text,
    district_code text, district_name text
  );
end;
$$;

create or replace function public.save_team_commission_policy(
  p_margin_pool_pct numeric,
  p_incentive_budget_pct numeric,
  p_bonus_rate_pct numeric,
  p_tiers jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_rate numeric;
begin
  if p_margin_pool_pct not between 0 and 100
    or p_incentive_budget_pct not between 0 and 1
    or p_bonus_rate_pct not between 0 and p_incentive_budget_pct
    or jsonb_typeof(p_tiers) <> 'array'
    or jsonb_array_length(p_tiers) > 30 then
    raise exception 'Invalid weekly commission policy';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_tiers) as tier(target_sales_tzs bigint, commission_rate_pct numeric)
    where target_sales_tzs is null or target_sales_tzs <= 0
      or commission_rate_pct is null or commission_rate_pct not between 0.2 and 0.5
  ) then
    raise exception 'Commission targets must be positive and commission rates must be between 0.2% and 0.5%';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_tiers) as lower_tier(target_sales_tzs bigint, commission_rate_pct numeric)
    join jsonb_to_recordset(p_tiers) as higher_tier(target_sales_tzs bigint, commission_rate_pct numeric)
      on lower_tier.target_sales_tzs < higher_tier.target_sales_tzs
    where lower_tier.commission_rate_pct > higher_tier.commission_rate_pct
  ) then
    raise exception 'Higher sales targets cannot have a lower commission rate';
  end if;
  if exists (
    select target_sales_tzs
    from jsonb_to_recordset(p_tiers) as tier(target_sales_tzs bigint, commission_rate_pct numeric)
    group by target_sales_tzs having count(*) > 1
  ) then
    raise exception 'Commission target values must be unique';
  end if;

  select coalesce(max(commission_rate_pct), 0) into v_max_rate
  from jsonb_to_recordset(p_tiers) as tier(target_sales_tzs bigint, commission_rate_pct numeric);
  if v_max_rate + p_bonus_rate_pct > p_incentive_budget_pct then
    raise exception 'Commission and bonus rates exceed the incentive budget';
  end if;

  update public.team_commission_settings
  set margin_pool_pct = p_margin_pool_pct,
      incentive_budget_pct = p_incentive_budget_pct,
      bonus_rate_pct = p_bonus_rate_pct,
      updated_at = now()
  where id = 'primary';
  delete from public.team_commission_tiers;
  insert into public.team_commission_tiers (target_sales_tzs, commission_rate_pct)
  select target_sales_tzs, commission_rate_pct
  from jsonb_to_recordset(p_tiers) as tier(target_sales_tzs bigint, commission_rate_pct numeric);
end;
$$;

create or replace function public.get_weekly_team_commission_sales(
  p_from timestamptz,
  p_to timestamptz,
  p_team_member_id uuid default null,
  p_supplier_ids uuid[] default null
) returns table (
  team_member_id uuid,
  full_name text,
  email text,
  sales_value_tzs bigint,
  delivered_supplier_orders bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    member.id,
    member.full_name,
    member.email,
    round(coalesce(sum(item.qty * item.unit_price), 0))::bigint,
    count(distinct supplier_order.id)::bigint
  from public.supplier_order_assignments assignment
  join public.team_members member on member.id = assignment.team_member_id
  join public.supplier_orders supplier_order on supplier_order.id = assignment.supplier_order_id
  left join public.order_items item on item.supplier_order_id = supplier_order.id
  where supplier_order.status = 'delivered'
    and supplier_order.updated_at >= p_from
    and supplier_order.updated_at < p_to
    and (p_team_member_id is null or member.id = p_team_member_id)
    and (p_supplier_ids is null or supplier_order.supplier_id = any(p_supplier_ids))
  group by member.id, member.full_name, member.email
$$;

create or replace function public.validate_supplier_order_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid;
  v_assignee_status text;
  v_assignee_supplier_id uuid;
  v_scope_mode text;
  v_assignee_permissions text[];
  v_assigner_status text;
  v_assigner_permissions text[];
begin
  select supplier_id into v_supplier_id
  from public.supplier_orders where id = new.supplier_order_id;
  if v_supplier_id is null then raise exception 'Supplier order not found'; end if;

  select m.status, m.supplier_id, r.permissions, coalesce(p.operation_scope_mode, 'global')
    into v_assignee_status, v_assignee_supplier_id, v_assignee_permissions, v_scope_mode
    from public.team_members m
    join public.team_roles r on r.role_key = m.role
    left join public.team_member_profiles p on p.team_member_id = m.id
    where m.id = new.team_member_id and r.scope = 'platform';
  if v_assignee_status is distinct from 'active'
    or v_assignee_supplier_id is not null
    or not ('management.view' = any(coalesce(v_assignee_permissions, '{}'::text[]))) then
    raise exception 'Choose an active platform team member with commission access';
  end if;
  if v_scope_mode = 'restricted' and not exists (
    select 1
    from public.team_member_operation_scopes scope
    join public.suppliers supplier on supplier.id = v_supplier_id
    where scope.team_member_id = new.team_member_id
      and scope.country_code = supplier.country_code
      and scope.region_code = supplier.region_code
      and (scope.district_code is null or scope.district_code = supplier.district_code)
  ) then
    raise exception 'The assigned employee is not authorized for this farm region';
  end if;

  select m.status, r.permissions into v_assigner_status, v_assigner_permissions
  from public.team_members m
  join public.team_roles r on r.role_key = m.role
  where m.id = new.assigned_by;
  if v_assigner_status is distinct from 'active'
    or not ('management.manage' = any(coalesce(v_assigner_permissions, '{}'::text[]))) then
    raise exception 'The assigning member is not authorized to assign orders';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_supplier_order_assignment on public.supplier_order_assignments;
create trigger trg_validate_supplier_order_assignment
before insert or update on public.supplier_order_assignments
for each row execute function public.validate_supplier_order_assignment();

revoke all on function public.save_team_member_management_profile(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.save_team_commission_policy(numeric, numeric, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.get_weekly_team_commission_sales(timestamptz, timestamptz, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.validate_supplier_order_assignment() from public, anon, authenticated;
grant execute on function public.save_team_member_management_profile(uuid, jsonb, jsonb) to service_role;
grant execute on function public.save_team_commission_policy(numeric, numeric, numeric, jsonb) to service_role;
grant execute on function public.get_weekly_team_commission_sales(timestamptz, timestamptz, uuid, uuid[]) to service_role;

alter table public.team_member_profiles enable row level security;
alter table public.team_member_operation_scopes enable row level security;
alter table public.supplier_order_assignments enable row level security;
alter table public.team_commission_settings enable row level security;
alter table public.team_commission_tiers enable row level security;

revoke all on public.team_member_profiles, public.team_member_operation_scopes,
  public.supplier_order_assignments, public.team_commission_settings, public.team_commission_tiers
  from public, anon, authenticated;
grant all on public.team_member_profiles, public.team_member_operation_scopes,
  public.supplier_order_assignments, public.team_commission_settings, public.team_commission_tiers
  to service_role;

create or replace function public.admin_dashboard_analytics_scoped(
  p_from timestamptz,
  p_to timestamptz,
  p_supplier_ids uuid[]
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped_orders as (
    select
      so.id as supplier_order_id,
      so.order_id,
      so.supplier_id,
      so.status,
      so.updated_at,
      o.created_at,
      o.mode,
      o.payment_method,
      o.customer_id,
      s.name as supplier_name,
      coalesce((
        select sum(oi.qty * oi.unit_price)
        from public.order_items oi
        where oi.supplier_order_id = so.id
      ), 0) as order_value
    from public.supplier_orders so
    join public.orders o on o.id = so.order_id
    join public.suppliers s on s.id = so.supplier_id
    where o.created_at >= p_from
      and o.created_at < p_to
      and so.supplier_id = any(coalesce(p_supplier_ids, '{}'::uuid[]))
  ),
  summary as (
    select
      count(*) as order_count,
      count(*) filter (where status = 'pending') as pending_orders,
      count(*) filter (where status in ('packing', 'en_route')) as in_progress_orders,
      count(*) filter (where status = 'delivered') as delivered_orders,
      count(*) filter (where status = 'cancelled') as cancelled_orders,
      coalesce(sum(order_value) filter (where status = 'delivered'), 0) as delivered_value,
      coalesce(sum(order_value) filter (where status in ('pending', 'packing', 'en_route')), 0) as open_order_value,
      coalesce(sum(order_value) filter (where status = 'cancelled'), 0) as cancelled_value,
      count(distinct customer_id) as unique_customers,
      count(distinct customer_id) filter (
        where customer_id in (
          select customer_id from scoped_orders
          group by customer_id having count(distinct order_id) > 1
        )
      ) as returning_customers
    from scoped_orders
  ),
  payments as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'method', coalesce(payment_method, 'unknown'),
      'orders', order_count,
      'delivered_value', delivered_value
    ) order by order_count desc), '[]'::jsonb) as data
    from (
      select payment_method, count(*) as order_count,
        coalesce(sum(order_value) filter (where status = 'delivered'), 0) as delivered_value
      from scoped_orders group by payment_method
    ) grouped
  ),
  daily as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', day, 'orders', orders, 'delivered_value', delivered_value
    ) order by day), '[]'::jsonb) as data
    from (
      select created_at::date as day, count(*) as orders,
        coalesce(sum(order_value) filter (where status = 'delivered'), 0) as delivered_value
      from scoped_orders group by created_at::date
    ) grouped
  ),
  products as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', name, 'category', category, 'units', units, 'value', value
    ) order by value desc), '[]'::jsonb) as data
    from (
      select p.name, coalesce(p.category, 'Other') as category,
        sum(oi.qty) as units, sum(oi.qty * oi.unit_price) as value
      from public.order_items oi
      join scoped_orders so on so.supplier_order_id = oi.supplier_order_id
      join public.products p on p.id = oi.product_id
      where so.status = 'delivered'
      group by p.name, p.category order by value desc limit 10
    ) grouped
  ),
  categories as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'category', category, 'value', value
    ) order by value desc), '[]'::jsonb) as data
    from (
      select coalesce(p.category, 'Other') as category,
        sum(oi.qty * oi.unit_price) as value
      from public.order_items oi
      join scoped_orders so on so.supplier_order_id = oi.supplier_order_id
      join public.products p on p.id = oi.product_id
      where so.status = 'delivered'
      group by p.category order by value desc limit 10
    ) grouped
  ),
  modes as (
    select coalesce(jsonb_agg(jsonb_build_object('mode', mode, 'orders', orders, 'value', value)
      order by mode), '[]'::jsonb) as data
    from (
      select mode, count(*) as orders,
        coalesce(sum(order_value) filter (where status = 'delivered'), 0) as value
      from scoped_orders group by mode
    ) grouped
  ),
  farms as (
    select coalesce(jsonb_agg(jsonb_build_object('name', supplier_name, 'orders', orders, 'delivered_value', value)
      order by value desc), '[]'::jsonb) as data
    from (
      select supplier_name, count(*) as orders,
        coalesce(sum(order_value) filter (where status = 'delivered'), 0) as value
      from scoped_orders group by supplier_id, supplier_name
      order by value desc limit 10
    ) grouped
  )
  select jsonb_build_object(
    'summary', (select to_jsonb(summary) from summary),
    'payments', (select data from payments),
    'daily', (select data from daily),
    'top_products', (select data from products),
    'categories', (select data from categories),
    'modes', (select data from modes),
    'farms', (select data from farms)
  );
$$;

revoke all on function public.admin_dashboard_analytics_scoped(timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.admin_dashboard_analytics_scoped(timestamptz, timestamptz, uuid[]) to service_role;
