-- NEXUS-ZP-P0-EDITORIAL-QUEUE-AUTOCORRECTION-007
-- Revalidates only the Blog RDM ready queue identified in the 2026-09-13
-- incident. Normal article_versions triggers preserve the previous content.

with repaired as (
  select
    id,
    case
      when content ~* '</p>\s*<p\b' then
        '<h2>Contexto e informações principais</h2>' || E'\n' ||
        regexp_replace(
          content,
          '(</p>\s*)(<p\b)',
          E'\\1<h2>Pontos de atenção</h2>\\2',
          'i'
        )
      else '<h2>Contexto e informações principais</h2>' || E'\n' || content
    end as repaired_content
  from public.articles
  where organization_id = '04f16755-dedb-4f1b-a0a3-1a83054b36a0'::uuid
    and project_id = 'fab1032d-56a4-4e59-b3d4-4a68d3d4bf0a'::uuid
    and status = 'ready'
    and coalesce(word_count, 0) >= 500
    and content !~* '<h2(?:\s|>)'
)
update public.articles a
set content = r.repaired_content,
    config = coalesce(a.config, '{}'::jsonb) || jsonb_build_object(
      'editorial_structure_auto_repaired', true,
      'editorial_structure_inserted_headings',
        case when r.repaired_content ~* '<h2>Pontos de atenção</h2>' then 2 else 1 end,
      'editorial_queue_revalidated_at', now(),
      'editorial_queue_revalidation_version', '2026-09-13.1'
    ),
    error_message = null,
    updated_at = now()
from repaired r
where a.id = r.id;

-- Redirect 17 broken contact CTAs from Google Maps to the commercial
-- WhatsApp number configured on this project. The visible anchor is preserved.
update public.articles
set content = regexp_replace(
      content,
      '((whatsapp|telefone|contato|fale|ligue)[^\n\]]{0,80}\[[^]]*\]\()(https?://)?(www\.)?google\.[a-z.]+/maps[^)]*(\))',
      E'\\1https://wa.me/5511951730074\\5',
      'gi'
    ),
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'broken_contact_cta_auto_repaired', true,
      'broken_contact_cta_auto_repaired_at', now()
    ),
    updated_at = now()
where organization_id = '04f16755-dedb-4f1b-a0a3-1a83054b36a0'::uuid
  and project_id = 'fab1032d-56a4-4e59-b3d4-4a68d3d4bf0a'::uuid
  and status = 'ready'
  and content ~* '(whatsapp|telefone|contato|fale|ligue)[^\n\]]{0,80}\[[^]]*\]\((https?://)?(www\.)?google\.[a-z.]+/maps';

-- Normalize the single legacy raw Markdown heading found by the queue audit.
-- This mirrors normalizeEditorialHtml and satisfies the published invariant.
update public.articles
set content = replace(regexp_replace(
      regexp_replace(content, '(^|[\n\r])[[:space:]]*#{1,2}[[:space:]]+([^\n\r<]+)', E'\\1<h2>\\2</h2>', 'gi'),
      '(^|[\n\r])[[:space:]]*#{3,6}[[:space:]]+([^\n\r<]+)', E'\\1<h3>\\2</h3>', 'gi'
    ), repeat(chr(96), 3), ''),
    updated_at = now()
where organization_id = '04f16755-dedb-4f1b-a0a3-1a83054b36a0'::uuid
  and project_id = 'fab1032d-56a4-4e59-b3d4-4a68d3d4bf0a'::uuid
  and status = 'ready'
  and (
    content ~ '(^|[\n\r])[[:space:]]*#{1,6}[[:space:]]+'
    or position(repeat(chr(96), 3) in content) > 0
  );

-- Correct objective title typos found during the queue-wide review. Slugs of
-- already published WordPress records remain unchanged to preserve permalinks.
update public.articles
set title = case
      when lower(btrim(title)) = 'tornozelera eletronica' then 'Tornozeleira eletrônica'
      when lower(btrim(title)) = 'omo saber se fulano ta preso' then 'Como saber se uma pessoa está presa'
      else title
    end,
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'title_typo_auto_repaired', true,
      'title_typo_auto_repaired_at', now()
    ),
    updated_at = now()
where organization_id = '04f16755-dedb-4f1b-a0a3-1a83054b36a0'::uuid
  and lower(btrim(title)) in ('tornozelera eletronica', 'omo saber se fulano ta preso');

-- Six queue records already have an exact published slug in the target site.
-- Reconcile them with the existing post instead of creating WordPress slug-2.
with existing(article_slug, wordpress_url) as (
  values
    ('como-conseguir-tornozeleira-eletronica', 'https://rdmadvogados.com.br/blog/como-conseguir-tornozeleira-eletronica/'),
    ('tornozeleira-eletronica', 'https://rdmadvogados.com.br/blog/tornozelera-eletronica/'),
    ('diferenca-entre-liberdade-provisoria-e-revogacao-de-prisao', 'https://rdmadvogados.com.br/blog/diferenca-entre-liberdade-provisoria-e-revogacao-de-prisao/'),
    ('modelo-de-habeas-corpus', 'https://rdmadvogados.com.br/blog/modelo-de-habeas-corpus/'),
    ('como-saber-se-uma-pessoa-esta-presa', 'https://rdmadvogados.com.br/blog/omo-saber-se-fulano-ta-preso/'),
    ('documentos-para-visitar-preso', 'https://rdmadvogados.com.br/blog/documentos-para-visitar-preso/')
)
update public.articles a
set status = 'published',
    published_url = e.wordpress_url,
    published_at = coalesce(a.published_at, now()),
    error_message = null,
    config = coalesce(a.config, '{}'::jsonb) || jsonb_build_object(
      'duplicate_of_url', e.wordpress_url,
      'duplicate_resolution', 'linked_existing_wordpress_post',
      'duplicate_reconciled_at', now(),
      'editorial_queue_revalidation_version', '2026-09-13.1'
    ),
    updated_at = now()
from existing e
where coalesce(
        nullif(a.slug, ''),
        trim(both '-' from regexp_replace(
          lower(translate(a.title, 'áàãâéêíóôõúüç', 'aaaaeeiooouuc')),
          '[^a-z0-9]+', '-', 'g'
        ))
      ) = e.article_slug
  and a.organization_id = '04f16755-dedb-4f1b-a0a3-1a83054b36a0'::uuid
  and a.project_id = 'fab1032d-56a4-4e59-b3d4-4a68d3d4bf0a'::uuid
  and a.status = 'ready';
