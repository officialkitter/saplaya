insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-avatars',
  'customer-avatars',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "customers read own avatars" on storage.objects;
create policy "customers read own avatars" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customer-avatars'
    and (storage.foldername(name))[1] = (select public.current_customer_auth_user_id())::text
  );

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
