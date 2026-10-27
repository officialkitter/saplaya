drop policy if exists "customers manage own profile" on public.customer_profiles;
create policy "customers manage own profile" on public.customer_profiles
  for all to authenticated
  using (customer_id = (select public.current_customer_auth_user_id()))
  with check (customer_id = (select public.current_customer_auth_user_id()));
