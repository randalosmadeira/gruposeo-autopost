alter table public.organization_brand_assets
  add column if not exists usage_count integer not null default 0 check (usage_count >= 0),
  add column if not exists last_used_at timestamptz;

create index if not exists organization_brand_assets_generation_pool_idx
  on public.organization_brand_assets (organization_id, status, slot)
  where status = 'ready';

comment on column public.organization_brand_assets.usage_count is
  'Number of article covers generated from the explicitly approved reusable asset.';

-- Electoral imagery must never be a global fallback for ordinary articles.
update public.module_image_assets
set is_active = false, updated_at = now()
where module_key = 'article'
  and project_id is null
  and (coalesce(alt_text, '') ilike '%1470%' or coalesce(label, '') ilike '%1470%');

-- Quarantine previously selected electoral covers from non-electoral projects.
update public.articles article
set featured_image_url = null,
    image_source = null,
    config = jsonb_set(
      coalesce(article.config, '{}'::jsonb) - 'image_geo',
      '{image_quarantine}',
      jsonb_build_object(
        'reason', 'electoral_asset_on_non_electoral_project',
        'previous_url', article.featured_image_url,
        'quarantined_at', now()
      ),
      true
    ),
    updated_at = now()
where article.featured_image_url is not null
  and exists (
    select 1 from public.module_image_assets asset
    where asset.id::text = article.config #>> '{image_geo,asset_id}'
      and (coalesce(asset.alt_text, '') ilike '%1470%' or coalesce(asset.label, '') ilike '%1470%')
  )
  and not exists (
    select 1 from public.electoral_portal_resources electoral
    where electoral.project_id = article.project_id
  );

-- Explicitly enable the approved dual-provider mode for the unrestricted master accounts.
select set_config('request.jwt.claim.role', 'service_role', true);
update public.user_settings settings
set byok_enabled = true, ai_provider = 'dual', updated_at = now()
where settings.user_id in (
  select id from auth.users
  where lower(email) in ('randalos.madeira.ceo@gmail.com', 'gestor@gruposeomkt.com.br')
);
