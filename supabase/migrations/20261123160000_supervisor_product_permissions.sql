update public.team_roles
set permissions = array(
  select distinct permission
  from unnest(permissions || array[
    'dashboard.view',
    'orders.view',
    'orders.update_status',
    'products.view',
    'products.edit',
    'stock.adjust',
    'inventory.view',
    'claims.view',
    'claims.claim'
  ]::text[]) as permission
  order by permission
)
where role_key = 'supervisor'
   or role_key ilike '%supervisor%'
   or lower(btrim(name)) = 'supervisor'
   or lower(btrim(name)) like '%supervisor%';
