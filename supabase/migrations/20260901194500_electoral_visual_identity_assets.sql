create table if not exists public.electoral_visual_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  campaign_preset_id text not null default 'madeira-1470-sp-2026',
  asset_kind text not null default 'reference' check (asset_kind in ('reference','generated','variant')),
  status text not null default 'draft' check (status in ('draft','processing','ready','approved','rejected','archived')),
  storage_path text not null,
  source_asset_id uuid references public.electoral_visual_assets(id) on delete set null,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  alt_text text,
  overlay_config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.electoral_image_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  campaign_preset_id text not null default 'madeira-1470-sp-2026',
  status text not null default 'queued' check (status in ('queued','validating','provider_not_configured','processing','completed','failed','cancelled')),
  provider text not null default 'unconfigured',
  generation_mode text not null default 'face-reference' check (generation_mode in ('face-reference','lora','faceid','format-variant','overlay-only')),
  fidelity_preference numeric(4,3) not null default 0.960 check (fidelity_preference >= 0 and fidelity_preference <= 1),
  reference_asset_ids uuid[] not null default '{}'::uuid[],
  requested_formats jsonb not null default '[{"name":"discover-og","width":1200,"height":630},{"name":"discover-16x9","width":1200,"height":675},{"name":"vertical","width":1080,"height":1920},{"name":"square","width":1080,"height":1080}]'::jsonb,
  overlay_config jsonb not null default '{}'::jsonb,
  prompt_context text,
  output_asset_ids uuid[] not null default '{}'::uuid[],
  provider_job_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists electoral_visual_assets_user_preset_idx on public.electoral_visual_assets(user_id, campaign_preset_id, created_at desc);
create index if not exists electoral_image_jobs_user_preset_idx on public.electoral_image_jobs(user_id, campaign_preset_id, created_at desc);
create unique index if not exists electoral_visual_assets_one_default_idx on public.electoral_visual_assets(user_id, campaign_preset_id) where is_default and status = 'approved';

alter table public.electoral_visual_assets enable row level security;
alter table public.electoral_image_jobs enable row level security;

create policy "electoral_visual_assets_select_own" on public.electoral_visual_assets for select to authenticated using (auth.uid() = user_id);
create policy "electoral_visual_assets_insert_own" on public.electoral_visual_assets for insert to authenticated with check (auth.uid() = user_id);
create policy "electoral_visual_assets_update_own" on public.electoral_visual_assets for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "electoral_visual_assets_delete_own" on public.electoral_visual_assets for delete to authenticated using (auth.uid() = user_id);
create policy "electoral_image_jobs_select_own" on public.electoral_image_jobs for select to authenticated using (auth.uid() = user_id);
create policy "electoral_image_jobs_insert_own" on public.electoral_image_jobs for insert to authenticated with check (auth.uid() = user_id);
create policy "electoral_image_jobs_update_own" on public.electoral_image_jobs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "electoral_image_jobs_delete_own" on public.electoral_image_jobs for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('electoral-assets','electoral-assets',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "electoral_assets_storage_select_own" on storage.objects for select to authenticated using (bucket_id = 'electoral-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "electoral_assets_storage_insert_own" on storage.objects for insert to authenticated with check (bucket_id = 'electoral-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "electoral_assets_storage_update_own" on storage.objects for update to authenticated using (bucket_id = 'electoral-assets' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'electoral-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "electoral_assets_storage_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'electoral-assets' and (storage.foldername(name))[1] = auth.uid()::text);
