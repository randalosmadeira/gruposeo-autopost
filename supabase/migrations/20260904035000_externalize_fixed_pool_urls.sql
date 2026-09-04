-- Fixed-pool images are already authoritative remote assets. Reuse their URLs
-- instead of keeping a multi-megabyte copy in every article row.
update public.articles as article
set
  featured_image_url = asset.external_url,
  config = jsonb_set(
    coalesce(article.config, '{}'::jsonb),
    '{image_geo,externalized_at}',
    to_jsonb(now()),
    true
  ),
  updated_at = now()
from public.module_image_assets as asset
where article.featured_image_url like 'data:%'
  and article.config->'image_geo'->>'asset_id' = asset.id::text
  and asset.source_type = 'external_url'
  and asset.external_url is not null
  and btrim(asset.external_url) <> ''
  and coalesce((article.config->'image_geo'->>'background_edited')::boolean, false) = false;
