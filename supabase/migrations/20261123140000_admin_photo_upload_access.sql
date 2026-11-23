-- Allow every active team account to upload photos through signed upload URLs.
-- The backend creates those URLs and limits uploaded file metadata.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'team-avatars';

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
where id = 'catalog-product-images';

drop policy if exists "catalog admins upload product images" on storage.objects;
create policy "catalog admins upload product images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'catalog-product-images'
    and exists (
      select 1
      from public.team_members m
      where m.user_id = (select public.current_supabase_auth_user_id())
        and m.status = 'active'
    )
  );

drop policy if exists "catalog admins update product images" on storage.objects;
create policy "catalog admins update product images" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'catalog-product-images'
    and exists (
      select 1
      from public.team_members m
      where m.user_id = (select public.current_supabase_auth_user_id())
        and m.status = 'active'
    )
  )
  with check (
    bucket_id = 'catalog-product-images'
    and exists (
      select 1
      from public.team_members m
      where m.user_id = (select public.current_supabase_auth_user_id())
        and m.status = 'active'
    )
  );

drop policy if exists "catalog admins delete product images" on storage.objects;
create policy "catalog admins delete product images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'catalog-product-images'
    and exists (
      select 1
      from public.team_members m
      where m.user_id = (select public.current_supabase_auth_user_id())
        and m.status = 'active'
    )
  );
