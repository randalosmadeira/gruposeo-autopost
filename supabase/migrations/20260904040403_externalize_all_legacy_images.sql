-- Preserve original pool references and record every normalization operation.
alter table public.module_image_assets
  add column if not exists original_source_url text,
  add column if not exists processing_metadata jsonb not null default '{}'::jsonb;

comment on column public.module_image_assets.original_source_url is
  'Immutable source reference retained when a chroma asset is normalized into Storage.';
comment on column public.module_image_assets.processing_metadata is
  'Auditable image normalization metadata. Never stores provider secrets.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('article-images', 'article-images', true, 15728640, array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The Edge Function uses service_role for writes. Public retrieval is required
-- because these are editorial images rendered by WordPress and public portals.
drop policy if exists "article images public read" on storage.objects;
create policy "article images public read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'article-images');
