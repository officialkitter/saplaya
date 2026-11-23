-- Existing supervisors with the named configurable role should be able to
-- inspect and add or update farm products.
update public.team_roles
set permissions = array(
  select distinct permission
  from unnest(permissions || array['products.view', 'products.edit']::text[]) as permission
  order by permission
)
where role_key = 'supervisor'
   or lower(btrim(name)) = 'supervisor';
