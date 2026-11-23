-- Persist the exact PesaPal checkout URL for secure iframe resume.
alter table public.checkout_payments
  add column if not exists redirect_url text;

-- Claims are valid permissions for the existing role system.
alter table public.team_roles drop constraint if exists team_roles_permissions_valid;
alter table public.team_roles
  add constraint team_roles_permissions_valid check (
    permissions <@ array[
      'dashboard.view', 'orders.view', 'orders.update_status',
      'products.view', 'products.edit', 'stock.adjust', 'inventory.view',
      'catalog.manage', 'suppliers.view_all', 'suppliers.manage',
      'team.view', 'team.manage', 'settings.manage',
      'finance.view', 'marketing.view', 'stores.view', 'system.view',
      'team.roles.manage', 'management.view', 'management.manage',
      'claims.view', 'claims.claim'
    ]::text[]
    and (
      not permissions && array['finance.view', 'marketing.view', 'stores.view', 'system.view']::text[]
      or 'dashboard.view' = any(permissions)
    )
  );

update public.team_roles
set permissions = array(
  select distinct permission
  from unnest(permissions || array['claims.view', 'claims.claim']::text[]) as permission
  order by permission
)
where role_key in ('platform_owner', 'platform_manager', 'supplier_owner', 'supplier_staff', 'driver');

-- Make employee claims usable without requiring the separate management-assignment permission.
create or replace function public.validate_supplier_order_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee_status text;
  v_assignee_permissions text[];
  v_assigner_status text;
  v_assigner_permissions text[];
begin
  select m.status, r.permissions
    into v_assignee_status, v_assignee_permissions
    from public.team_members m
    join public.team_roles r on r.role_key = m.role
    where m.id = new.team_member_id;
  if v_assignee_status is distinct from 'active' then
    raise exception 'Choose an active employee';
  end if;

  select m.status, r.permissions
    into v_assigner_status, v_assigner_permissions
    from public.team_members m
    join public.team_roles r on r.role_key = m.role
    where m.id = new.assigned_by;
  if v_assigner_status is distinct from 'active'
    or (
      new.assigned_by = new.team_member_id
        and not ('claims.claim' = any(coalesce(v_assignee_permissions, '{}'::text[])))
    )
    or (
      new.assigned_by is distinct from new.team_member_id
        and not ('management.manage' = any(coalesce(v_assigner_permissions, '{}'::text[])))
    ) then
    raise exception 'Only an authorized employee or order manager can assign this claim';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_supplier_order_assignment on public.supplier_order_assignments;
create trigger trg_validate_supplier_order_assignment
before insert or update on public.supplier_order_assignments
for each row execute function public.validate_supplier_order_assignment();

revoke all on function public.validate_supplier_order_assignment() from public, anon, authenticated;
