-- Client brand media: private, organization-scoped storage and explicit preview approval.
-- The existing tables/constraints were inspected before this migration was authored.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-brand-assets',
  'organization-brand-assets',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.organization_brand_assets
  drop constraint if exists organization_brand_assets_status_check;

alter table public.organization_brand_assets
  add constraint organization_brand_assets_status_check
  check (status in ('uploaded','processing','preview_ready','ready','rejected','archived'));

drop policy if exists organization_brand_assets_member_select on storage.objects;
create policy organization_brand_assets_member_select
on storage.objects for select to authenticated
using (
  bucket_id = 'organization-brand-assets'
  and exists (
    select 1 from public.organization_members membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

drop policy if exists organization_brand_assets_editor_insert on storage.objects;
create policy organization_brand_assets_editor_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'organization-brand-assets'
  and exists (
    select 1 from public.organization_members membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner','admin','editor')
  )
);

drop policy if exists organization_brand_assets_editor_update on storage.objects;
create policy organization_brand_assets_editor_update
on storage.objects for update to authenticated
using (
  bucket_id = 'organization-brand-assets'
  and exists (
    select 1 from public.organization_members membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner','admin','editor')
  )
)
with check (
  bucket_id = 'organization-brand-assets'
  and exists (
    select 1 from public.organization_members membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner','admin','editor')
  )
);

drop policy if exists organization_brand_assets_admin_delete on storage.objects;
create policy organization_brand_assets_admin_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'organization-brand-assets'
  and exists (
    select 1 from public.organization_members membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner','admin')
  )
);

comment on column public.organization_brand_assets.status is
  'uploaded -> processing -> preview_ready -> ready; ready requires explicit client approval.';
