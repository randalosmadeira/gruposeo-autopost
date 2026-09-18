-- Article translation groups: real hreflang support.
--
-- Context: hreflang today has no data model. Each translation of an article
-- is published as an independent WordPress post with no link back to its
-- siblings, and `public.articles` has no language column at all (only a
-- free-form `config->>'language'` used at generation time, never persisted
-- as a first-class column). This migration only adds the schema needed to
-- group translations of the same article and tag each row's language. No
-- backfill logic, trigger or function is added here — that is deliberately
-- left for a follow-up migration once the grouping/authoring flow exists.
--
-- Schema state confirmed by reading every migration that touches
-- `public.articles`, in chronological order, before writing this file:
--   20260129055644 (CREATE TABLE), 20260210221744 (scheduled_at),
--   20260831064000 (originality_score), 20260831090000 (emotional_intensity,
--   image_prompt, image_disclaimer), 20260902090000 (nicho_detectado,
--   compliance_aplicado, angulo_analise, ...), 20260904040405,
--   20260905203000 (multitenant foundation), 20260907180000
--   (organization_id inherit trigger), 20260913034112, 20260917094128.
-- None of them add a `language` or `translation_group_id` column, so this
-- migration is additive only — nothing here is being recreated.
--
-- RLS: `public.articles` has RLS enabled since its original migration
-- (20260129055644) and its current policies were last recreated as
-- PERMISSIVE in 20260214230501_b0fdaf80-5425-436a-aa20-e74111dfb9b9.sql:
--   articles FOR SELECT/INSERT/UPDATE/DELETE TO authenticated
--   USING/WITH CHECK (auth.uid() = user_id)
-- RLS in Postgres is enforced per row, not per column: a policy that
-- resolves via `auth.uid() = user_id` already governs every column on that
-- row, including the two added below. No new policy is required, and none
-- is added by this migration.
--
-- CHECK constraint on `language`: deliberately NOT added. The task asked to
-- confirm the closed set of values actually used in practice before fixing
-- a CHECK, and that set is not closed today:
--   * supabase/functions/generate-article/index.ts and
--     supabase/functions/_shared/agents/agent-pipeline.ts type `language`
--     as a plain optional string with a soft default of "pt-BR" — no
--     validation, no enum, on either write path.
--   * src/components/article-generator/GeneratorMainConfig.tsx (the main
--     single-article generator UI, which feeds generate-article) offers
--     'pt-BR' | 'en-US' | 'es'.
--   * src/components/shared/ToneVoiceConfig.tsx `languageOptions` (used by
--     the bulk generator, src/pages/BulkArticleGenerator.tsx, another
--     direct writer of articles.config.language) offers
--     'pt-BR' | 'en-US' | 'es-ES' — 'es' vs 'es-ES' already disagree
--     between two live paths that both end up on this table.
--   * src/components/authority-planner/LocaleCard.tsx additionally uses
--     'pt-PT' and 'en-GB' for a related but separate feature.
-- Fixing a CHECK list now would risk rejecting inserts that the app already
-- produces. Per the task's own instruction, no constraint is safer than a
-- wrong one; this is left to a later migration once the values are
-- unified across the front-end and edge functions.

alter table public.articles
  add column if not exists language text not null default 'pt-BR';

alter table public.articles
  add column if not exists translation_group_id uuid null;

create index if not exists articles_translation_group_idx
  on public.articles (translation_group_id)
  where translation_group_id is not null;

comment on column public.articles.language is
  'BCP-47-ish language tag for this article row, promoted from the generation-time config->>''language'' field. Existing rows default to ''pt-BR'' without a data backfill from config, since config.language is not guaranteed to be present or trustworthy on every historical row.';

comment on column public.articles.translation_group_id is
  'Groups rows that are translations of the same source article, for real hreflang linking across WordPress posts. NULL means the article has no known translations yet.';
