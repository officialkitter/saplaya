alter table public.team_members drop constraint if exists team_members_email_key;
alter table public.team_members drop constraint if exists team_members_user_id_key;

drop index if exists public.team_members_email_key;
drop index if exists public.team_members_user_id_key;

create unique index if not exists team_members_email_role_farm_unique
  on public.team_members (lower(email), role, coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'));

create unique index if not exists team_members_user_role_farm_unique
  on public.team_members (user_id, role, coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'))
  where user_id is not null;

