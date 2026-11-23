-- ========================================
-- Enhanced Ordering, Commissions & Notifications
-- ========================================

-- User roles and agent profiles
do $$
begin
  create type user_role as enum ('customer', 'agent', 'supplier_admin', 'platform_admin');
exception
  when duplicate_object then null;
end $$;

-- Agent profiles with commission tracking
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  commission_rate numeric not null default 10.0, -- percentage
  total_commissions integer default 0,
  total_orders_claimed integer default 0,
  bank_account jsonb, -- {account_number, bank_name, account_holder}
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on agents (user_id);
create index on agents (is_active);

-- Order claims: agents claim orders to earn commissions
create table if not exists order_claims (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  claimed_at timestamptz default now(),
  completed_at timestamptz,
  commission_earned integer, -- calculated when order completes
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  notes text,
  created_at timestamptz default now(),
  unique (order_id) -- only one agent can claim an order
);

create index on order_claims (agent_id);
create index on order_claims (status);
create index on order_claims (claimed_at desc);
create index on order_claims (completed_at desc);

-- Commission tracking
create table if not exists commissions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  order_claim_id uuid references order_claims(id) on delete cascade,
  amount integer not null,
  percentage numeric not null, -- the rate used
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'cancelled')),
  payment_date timestamptz,
  payment_method text, -- bank_transfer, mobile_money, etc
  reference_number text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on commissions (agent_id);
create index on commissions (status);
create index on commissions (created_at desc);

-- Order for another user (like Uber)
alter table orders add column if not exists ordered_by uuid references auth.users(id);
alter table orders add column if not exists recipient_name text;
alter table orders add column if not exists recipient_phone text;
alter table orders add column if not exists recipient_email text;
alter table orders add column if not exists special_instructions text;

create index on orders (ordered_by);
create index on orders (customer_id);

-- Notifications queue (email & push)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null, -- 'order_placed', 'order_claimed', 'order_completed', 'commission_earned', etc
  subject text not null,
  body text not null,
  data jsonb, -- order_id, agent_name, amount, etc
  email_sent boolean default false,
  email_sent_at timestamptz,
  push_sent boolean default false,
  push_sent_at timestamptz,
  email_error text,
  push_error text,
  read boolean default false,
  read_at timestamptz,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '30 days')
);

create index on notifications (user_id, created_at desc);
create index on notifications (created_at desc);
create index on notifications (email_sent, created_at);
create index on notifications (push_sent, created_at);

-- Audit logs for data deletion & compliance
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null, -- 'farm_deleted', 'user_data_wiped', 'order_cancelled', etc
  actor_id uuid references auth.users(id),
  target_type text, -- 'farm', 'user', 'order', etc
  target_id uuid,
  details jsonb, -- what was deleted, why, etc
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

create index on audit_logs (action, created_at desc);
create index on audit_logs (target_type, target_id);
create index on audit_logs (created_at desc);

-- Cache metadata for performance
create table if not exists cache_metadata (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  ttl integer not null default 3600, -- seconds
  last_updated timestamptz default now(),
  hit_count integer default 0,
  miss_count integer default 0,
  size_bytes integer
);

-- Delete-related tables
create table if not exists deletion_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('farm', 'user_account', 'order_history')),
  target_id uuid,
  status text not null default 'pending' check (status in ('pending', 'approved', 'completed', 'cancelled')),
  reason text,
  verified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index on deletion_requests (requester_id, status);
create index on deletion_requests (target_type, target_id);
create index on deletion_requests (created_at desc);

-- ========================================
-- Updated Functions for New Features
-- ========================================

-- Calculate commission when order is claimed
create or replace function calculate_order_commission(
  p_order_id uuid,
  p_agent_id uuid
)
returns integer
language plpgsql
security definer as $$
declare
  v_subtotal integer;
  v_commission_rate numeric;
  v_commission integer;
begin
  select o.subtotal into v_subtotal from orders o where o.id = p_order_id;
  select a.commission_rate into v_commission_rate from agents a where a.id = p_agent_id;
  
  if v_subtotal is null or v_commission_rate is null then
    raise exception 'Order or agent not found';
  end if;
  
  v_commission := round(v_subtotal * v_commission_rate / 100.0);
  return v_commission;
end $$;

-- Claim order as agent
create or replace function claim_order(
  p_order_id uuid,
  p_agent_id uuid
)
returns json
language plpgsql
security definer as $$
declare
  v_commission integer;
  v_claim record;
begin
  -- Check if order already claimed
  if exists (select 1 from order_claims where order_id = p_order_id and status != 'cancelled') then
    raise exception 'Order already claimed by another agent';
  end if;
  
  -- Calculate commission
  v_commission := calculate_order_commission(p_order_id, p_agent_id);
  
  -- Create claim
  insert into order_claims (order_id, agent_id, commission_earned)
  values (p_order_id, p_agent_id, v_commission)
  returning * into v_claim;
  
  -- Create commission record
  insert into commissions (agent_id, order_claim_id, amount, percentage)
  select p_agent_id, v_claim.id, v_commission, a.commission_rate
  from agents a where a.id = p_agent_id;
  
  -- Update agent stats
  update agents
  set total_orders_claimed = total_orders_claimed + 1,
      total_commissions = total_commissions + v_commission
  where id = p_agent_id;
  
  -- Queue notification
  insert into notifications (user_id, type, subject, body, data)
  select a.user_id, 'order_claimed', 'Order Claimed Successfully',
         'You have claimed order #' || substr(p_order_id::text, 1, 8) || ' and earned TZS ' || v_commission,
         jsonb_build_object('order_id', p_order_id, 'commission', v_commission)
  from agents a where a.id = p_agent_id;
  
  return json_build_object(
    'claim_id', v_claim.id,
    'order_id', p_order_id,
    'commission', v_commission,
    'status', v_claim.status
  );
end $$;

-- Complete order and finalize commission
create or replace function complete_order_claim(
  p_claim_id uuid
)
returns json
language plpgsql
security definer as $$
declare
  v_claim record;
  v_agent_id uuid;
begin
  select * into v_claim from order_claims where id = p_claim_id;
  
  if not found then
    raise exception 'Claim not found';
  end if;
  
  -- Update claim
  update order_claims
  set status = 'completed', completed_at = now()
  where id = p_claim_id;
  
  -- Mark commission as approved
  update commissions
  set status = 'approved'
  where order_claim_id = p_claim_id and status = 'pending';
  
  return json_build_object(
    'claim_id', v_claim.id,
    'status', 'completed',
    'commission', v_claim.commission_earned
  );
end $$;

-- Handle farm deletion with cascade
create or replace function delete_farm_cascade(
  p_farm_id uuid
)
returns json
language plpgsql
security definer as $$
declare
  v_order_count integer;
  v_product_count integer;
  v_admin_id uuid;
begin
  select admin_user_id into v_admin_id from suppliers where id = p_farm_id;
  
  -- Count deletions
  select count(*) into v_product_count from products where supplier_id = p_farm_id;
  select count(*) into v_order_count from orders o
    where exists (select 1 from supplier_orders so where so.order_id = o.id and so.supplier_id = p_farm_id);
  
  -- Log audit
  insert into audit_logs (action, actor_id, target_type, target_id, details)
  values ('farm_deleted', v_admin_id, 'supplier', p_farm_id,
    jsonb_build_object('products_deleted', v_product_count, 'orders_affected', v_order_count)
  );
  
  -- Delete farm cascade
  delete from inventory_movements where supplier_id = p_farm_id;
  delete from products where supplier_id = p_farm_id;
  delete from supplier_orders where supplier_id = p_farm_id;
  delete from suppliers where id = p_farm_id;
  
  return json_build_object(
    'success', true,
    'farm_id', p_farm_id,
    'products_deleted', v_product_count,
    'orders_affected', v_order_count
  );
end $$;

-- Handle user account data wipe
create or replace function wipe_user_data(
  p_user_id uuid,
  p_reason text
)
returns json
language plpgsql
security definer as $$
declare
  v_order_count integer;
  v_agent_record record;
begin
  -- Count orders
  select count(*) into v_order_count from orders where customer_id = p_user_id;
  
  -- Log audit
  insert into audit_logs (action, actor_id, target_type, target_id, details)
  values ('user_data_wiped', p_user_id, 'auth_user', p_user_id,
    jsonb_build_object('orders_deleted', v_order_count, 'reason', p_reason)
  );
  
  -- If user is an agent, delete agent data
  select * into v_agent_record from agents where user_id = p_user_id;
  if found then
    delete from commissions where agent_id = v_agent_record.id;
    delete from order_claims where agent_id = v_agent_record.id;
    delete from agents where id = v_agent_record.id;
  end if;
  
  -- Delete all orders and related data
  delete from notifications where user_id = p_user_id;
  delete from order_items where order_id in (select id from orders where customer_id = p_user_id);
  delete from supplier_orders where order_id in (select id from orders where customer_id = p_user_id);
  delete from orders where customer_id = p_user_id;
  
  return json_build_object(
    'success', true,
    'user_id', p_user_id,
    'orders_deleted', v_order_count
  );
end $$;

-- ========================================
-- Enable RLS on new tables
-- ========================================
alter table agents enable row level security;
alter table order_claims enable row level security;
alter table commissions enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;
alter table cache_metadata enable row level security;
alter table deletion_requests enable row level security;

-- RLS Policies for agents
create policy "Agents can view their own profile"
  on agents for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.team_members m
      join public.team_roles r on r.role_key = m.role
      where m.user_id = auth.uid() and m.status = 'active' and r.role_key = 'platform_owner'
    )
  );

create policy "Agents can update their own profile"
  on agents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS Policies for order claims
create policy "Agents can view their own claims"
  on order_claims for select
  using (
    agent_id in (select id from agents where user_id = auth.uid())
    or auth.uid() in (select customer_id from orders where id = order_id)
  );

create policy "Agents can update their claims"
  on order_claims for update
  using (agent_id in (select id from agents where user_id = auth.uid()))
  with check (agent_id in (select id from agents where user_id = auth.uid()));

-- RLS Policies for commissions
create policy "Agents can view their commissions"
  on commissions for select
  using (agent_id in (select id from agents where user_id = auth.uid()));

-- RLS Policies for notifications
create policy "Users can view their notifications"
  on notifications for select
  using (auth.uid() = user_id);

create policy "Users can update their notifications"
  on notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS Policies for audit logs (admins only)
create policy "Platform admins can view audit logs"
  on audit_logs for select
  using (
    exists (
      select 1
      from public.team_members m
      join public.team_roles r on r.role_key = m.role
      where m.user_id = auth.uid() and m.status = 'active' and r.role_key = 'platform_owner'
    )
  );

-- RLS Policies for deletion requests
create policy "Users can view their deletion requests"
  on deletion_requests for select
  using (auth.uid() = requester_id);

create policy "Platform admins can view all deletion requests"
  on deletion_requests for select
  using (
    exists (
      select 1
      from public.team_members m
      join public.team_roles r on r.role_key = m.role
      where m.user_id = auth.uid() and m.status = 'active' and r.role_key = 'platform_owner'
    )
  );

-- ========================================
-- Grant function permissions
-- ========================================
revoke all on function calculate_order_commission(uuid, uuid) from public, anon;
revoke all on function claim_order(uuid, uuid) from public, anon;
revoke all on function complete_order_claim(uuid) from public, anon;
revoke all on function delete_farm_cascade(uuid) from public, anon;
revoke all on function wipe_user_data(uuid, text) from public, anon;

grant execute on function calculate_order_commission(uuid, uuid) to authenticated;
grant execute on function claim_order(uuid, uuid) to authenticated;
grant execute on function complete_order_claim(uuid) to authenticated;
grant execute on function delete_farm_cascade(uuid) to authenticated;
grant execute on function wipe_user_data(uuid, text) to authenticated;
