create table if not exists public.team_departments (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{1,39}$'),
  name text not null check (length(btrim(name)) between 2 and 80),
  description text not null default '',
  theme_color text not null default '#2E7D32' check (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.team_roles (
  role_key text primary key check (role_key ~ '^[a-z][a-z0-9_-]{1,59}$'),
  name text not null check (length(btrim(name)) between 2 and 80),
  department_id text not null references public.team_departments(id) on update cascade on delete restrict,
  scope text not null check (scope in ('platform', 'farm')),
  permissions text[] not null default '{}',
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  constraint team_roles_permissions_valid check (
    permissions <@ array[
      'dashboard.view', 'orders.view', 'orders.update_status',
      'products.view', 'products.edit', 'stock.adjust', 'inventory.view',
      'catalog.manage', 'suppliers.view_all', 'suppliers.manage',
      'team.view', 'team.manage', 'settings.manage',
      'finance.view', 'marketing.view', 'stores.view', 'system.view',
      'team.roles.manage'
    ]::text[]
    and (
      not permissions && array['finance.view', 'marketing.view', 'stores.view', 'system.view']::text[]
      or 'dashboard.view' = any(permissions)
    )
  )
);

insert into public.team_departments (id, name, description, theme_color)
values
  ('operations', 'Operations', 'Orders, fulfillment and farm operations.', '#2E7D32'),
  ('finance', 'Finance & accounting', 'Delivered order value and payment-method reporting.', '#1565C0'),
  ('marketing', 'Marketing', 'Product and customer demand analytics.', '#8E24AA'),
  ('stores', 'Stores', 'Farm performance and listing operations.', '#EF6C00'),
  ('inventory', 'Inventory', 'Stock levels and inventory movements.', '#00897B'),
  ('system', 'System administration', 'Platform health, access and account administration.', '#455A64'),
  ('logistics', 'Logistics', 'Delivery operations and driver workflows.', '#6D4C41')
on conflict (id) do nothing;

insert into public.team_roles (role_key, name, department_id, scope, permissions, is_builtin)
values
  ('platform_owner', 'Owner', 'system', 'platform', array[
    'dashboard.view', 'orders.view', 'orders.update_status', 'products.view', 'catalog.manage',
    'stock.adjust', 'inventory.view', 'suppliers.view_all', 'suppliers.manage', 'team.view',
    'team.manage', 'settings.manage', 'finance.view', 'marketing.view', 'stores.view',
    'system.view', 'team.roles.manage'
  ], true),
  ('platform_manager', 'Operations manager', 'operations', 'platform', array[
    'dashboard.view', 'orders.view', 'orders.update_status', 'products.view',
    'inventory.view', 'catalog.manage', 'suppliers.view_all', 'suppliers.manage', 'team.view'
  ], true),
  ('supplier_owner', 'Farm owner', 'operations', 'farm', array[
    'dashboard.view', 'orders.view', 'orders.update_status', 'products.view', 'products.edit',
    'stock.adjust', 'inventory.view', 'team.view', 'team.manage'
  ], true),
  ('supplier_staff', 'Farm staff', 'operations', 'farm', array[
    'dashboard.view', 'orders.view', 'orders.update_status', 'products.view',
    'stock.adjust', 'inventory.view'
  ], true),
  ('driver', 'Driver', 'logistics', 'platform', array[
    'orders.view', 'orders.update_status'
  ], true),
  ('finance_officer', 'Finance officer', 'finance', 'platform', array[
    'dashboard.view', 'finance.view'
  ], false),
  ('marketing_officer', 'Marketing officer', 'marketing', 'platform', array[
    'dashboard.view', 'marketing.view'
  ], false),
  ('store_manager', 'Store manager', 'stores', 'platform', array[
    'dashboard.view', 'stores.view', 'suppliers.view_all', 'products.view'
  ], false),
  ('inventory_manager', 'Inventory manager', 'inventory', 'platform', array[
    'dashboard.view', 'inventory.view', 'products.view', 'stock.adjust'
  ], false)
on conflict (role_key) do nothing;

alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members drop constraint if exists team_members_check;
alter table public.team_members drop constraint if exists role_scope;
alter table public.team_members
  add constraint team_members_role_fkey
  foreign key (role) references public.team_roles(role_key)
  on update cascade on delete restrict;

create or replace function public.enforce_team_member_role_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text;
begin
  select scope into v_scope from public.team_roles where role_key = new.role;
  if v_scope is null then
    raise exception 'Unknown team role';
  end if;
  if (v_scope = 'farm') is distinct from (new.supplier_id is not null) then
    raise exception 'This role requires a matching farm or platform assignment';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_team_member_role_scope on public.team_members;
create trigger trg_enforce_team_member_role_scope
before insert or update of role, supplier_id on public.team_members
for each row execute function public.enforce_team_member_role_scope();
revoke all on function public.enforce_team_member_role_scope() from public, anon, authenticated;

create index if not exists team_roles_department_idx on public.team_roles (department_id, name);
create index if not exists team_members_role_idx on public.team_members (role);

alter table public.team_departments enable row level security;
alter table public.team_roles enable row level security;
revoke all on public.team_departments, public.team_roles from public, anon, authenticated;
grant all on public.team_departments, public.team_roles to service_role;

create or replace function public.admin_dashboard_analytics(
  p_from timestamptz,
  p_to timestamptz,
  p_supplier_id uuid default null
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
      and (p_supplier_id is null or so.supplier_id = p_supplier_id)
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
          select customer_id
          from scoped_orders
          group by customer_id
          having count(distinct order_id) > 1
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
      select
        payment_method,
        count(*) as order_count,
        coalesce(sum(order_value) filter (where status = 'delivered'), 0) as delivered_value
      from scoped_orders
      group by payment_method
    ) grouped
  ),
  daily as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', day,
      'orders', orders,
      'delivered_value', delivered_value
    ) order by day), '[]'::jsonb) as data
    from (
      select
        created_at::date as day,
        count(*) as orders,
        coalesce(sum(order_value) filter (where status = 'delivered'), 0) as delivered_value
      from scoped_orders
      group by created_at::date
    ) grouped
  ),
  products as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', name, 'category', category, 'units', units, 'value', value
    ) order by value desc), '[]'::jsonb) as data
    from (
      select
        p.name,
        coalesce(p.category, 'Other') as category,
        sum(oi.qty) as units,
        sum(oi.qty * oi.unit_price) as value
      from public.order_items oi
      join scoped_orders so on so.supplier_order_id = oi.supplier_order_id
      join public.products p on p.id = oi.product_id
      where so.status = 'delivered'
      group by p.name, p.category
      order by value desc
      limit 10
    ) grouped
  ),
  categories as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'category', category, 'value', value
    ) order by value desc), '[]'::jsonb) as data
    from (
      select
        coalesce(p.category, 'Other') as category,
        sum(oi.qty * oi.unit_price) as value
      from public.order_items oi
      join scoped_orders so on so.supplier_order_id = oi.supplier_order_id
      join public.products p on p.id = oi.product_id
      where so.status = 'delivered'
      group by p.category
      order by value desc
      limit 10
    ) grouped
  ),
  modes as (
    select coalesce(jsonb_agg(jsonb_build_object('mode', mode, 'orders', orders, 'value', value)
      order by mode), '[]'::jsonb) as data
    from (
      select mode, count(*) as orders,
        coalesce(sum(order_value) filter (where status = 'delivered'), 0) as value
      from scoped_orders
      group by mode
    ) grouped
  ),
  farms as (
    select coalesce(jsonb_agg(jsonb_build_object('name', supplier_name, 'orders', orders, 'delivered_value', value)
      order by value desc), '[]'::jsonb) as data
    from (
      select supplier_name, count(*) as orders,
        coalesce(sum(order_value) filter (where status = 'delivered'), 0) as value
      from scoped_orders
      group by supplier_id, supplier_name
      order by value desc
      limit 10
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

revoke all on function public.admin_dashboard_analytics(timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.admin_dashboard_analytics(timestamptz, timestamptz, uuid) to service_role;
