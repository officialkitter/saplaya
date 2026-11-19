update public.team_roles
set permissions = array(
  select distinct permission
  from unnest(permissions || array['products.edit', 'team.manage']::text[]) as permission
  order by permission
)
where role_key = 'platform_manager';

update public.team_roles
set permissions = array(
  select distinct permission
  from unnest(permissions || array['products.edit']::text[]) as permission
  order by permission
)
where role_key = 'supplier_staff';
