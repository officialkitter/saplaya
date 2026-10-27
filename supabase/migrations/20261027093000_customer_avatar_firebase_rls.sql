drop policy if exists "customers upload own avatar" on storage.objects;
create policy "customers upload own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'customer-avatars'
    and (storage.foldername(name))[1] = (select public.current_customer_auth_user_id())::text
  );

drop policy if exists "customers update own avatar" on storage.objects;
create policy "customers update own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'customer-avatars'
    and (storage.foldername(name))[1] = (select public.current_customer_auth_user_id())::text
  )
  with check (
    bucket_id = 'customer-avatars'
    and (storage.foldername(name))[1] = (select public.current_customer_auth_user_id())::text
  );

drop policy if exists "customers delete own avatar" on storage.objects;
create policy "customers delete own avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'customer-avatars'
    and (storage.foldername(name))[1] = (select public.current_customer_auth_user_id())::text
  );
