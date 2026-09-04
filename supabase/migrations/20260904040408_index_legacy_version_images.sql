-- Temporary partial index used by the one-time history externalizer. It avoids
-- repeatedly scanning the multi-gigabyte article_versions relation.
set statement_timeout = 0;
create index if not exists idx_article_versions_inline_image_migration
  on public.article_versions(created_at, id)
  where featured_image_url like 'data:image/%;base64,%';
reset statement_timeout;
