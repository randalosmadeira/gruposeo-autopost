-- Publication safety guard.
-- Keeps operational scaffolds, review tokens and internal errors out of reader-facing article HTML.
-- The detected condition is preserved in articles.config for auditability.

create or replace function public.guard_article_reader_content()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_content text := coalesce(new.content, '');
  v_codes text[] := array[]::text[];
  v_is_scaffold boolean := false;
begin
  if v_content ~* 'RASCUNHO[[:space:]]+ELEITORAL' then
    v_codes := array_append(v_codes, 'electoral_draft_banner');
    v_is_scaffold := true;
  end if;
  if v_content ~* 'REVIS[AÃ]O[[:space:]]+HUMANA[[:space:]]+OBRIGAT[ÓO]RIA' then
    v_codes := array_append(v_codes, 'human_review_banner');
    v_is_scaffold := true;
  end if;
  if v_content ~* 'ALVO[[:space:]]+EDITORIAL[[:space:]]+CONFIGURADO' then
    v_codes := array_append(v_codes, 'editorial_target_notice');
    v_is_scaffold := true;
  end if;
  if v_content ~* '(este[[:space:]]+)?scaffold[[:space:]]+n[aã]o[[:space:]]+representa[[:space:]]+conte[uú]do[[:space:]]+final' then
    v_codes := array_append(v_codes, 'scaffold_notice');
    v_is_scaffold := true;
  end if;
  if v_content ~* 'antes[[:space:]]+da[[:space:]]+publica[cç][aã]o.{0,180}substitua[[:space:]]+esta[[:space:]]+estrutura' then
    v_codes := array_append(v_codes, 'replace_before_publish');
    v_is_scaffold := true;
  end if;

  if v_is_scaffold then
    -- A scaffold is an internal planning artifact, never reader-facing content.
    new.content := '';
    new.excerpt := null;
  else
    if v_content ~* '\[VERIFICAR[[:space:]]+FONTE[[:space:]]+PRIM[ÁA]RIA\]' then
      v_codes := array_append(v_codes, 'verify_primary_source');
      new.content := regexp_replace(coalesce(new.content, ''), '\[VERIFICAR[[:space:]]+FONTE[[:space:]]+PRIM[ÁA]RIA\]', '', 'gi');
    end if;
    if v_content ~* '\[RECONSULTAR[[:space:]]+FONTE[[:space:]]+EXTERNA\]' then
      v_codes := array_append(v_codes, 'requery_external_source');
      new.content := regexp_replace(coalesce(new.content, ''), '\[RECONSULTAR[[:space:]]+FONTE[[:space:]]+EXTERNA\]', '', 'gi');
    end if;
    if v_content ~* '\[?PENDENTE[[:space:]]+(DE[[:space:]]+)?REVIS[AÃ]O\]?' then
      v_codes := array_append(v_codes, 'pending_review_token');
      new.content := regexp_replace(coalesce(new.content, ''), '\[?PENDENTE[[:space:]]+(DE[[:space:]]+)?REVIS[AÃ]O\]?', '', 'gi');
    end if;
  end if;

  if cardinality(v_codes) > 0 then
    new.config := coalesce(new.config, '{}'::jsonb) || jsonb_build_object(
      'publication_guard_origin_blocked', true,
      'publication_guard_origin_codes', to_jsonb(v_codes),
      'publication_guard_origin_at', now()
    );
  end if;

  return new;
end;
$$;

revoke all on function public.guard_article_reader_content() from public;
revoke all on function public.guard_article_reader_content() from anon;
revoke all on function public.guard_article_reader_content() from authenticated;

-- Existing trigger name is deterministic so the migration is idempotent.
drop trigger if exists trg_guard_article_reader_content on public.articles;
create trigger trg_guard_article_reader_content
before insert or update of content on public.articles
for each row
execute function public.guard_article_reader_content();

-- Sanitize any pre-existing draft/internal scaffolds while preserving the detection in config.
-- Published rows are deliberately not rewritten here; the deployment audit must report them separately.
update public.articles
set content = '',
    excerpt = null,
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'publication_guard_origin_blocked', true,
      'publication_guard_origin_codes', jsonb_build_array('historical_internal_scaffold'),
      'publication_guard_origin_at', now()
    ),
    updated_at = now()
where status::text <> 'published'
  and coalesce(content, '') ~* '(RASCUNHO[[:space:]]+ELEITORAL|REVIS[AÃ]O[[:space:]]+HUMANA[[:space:]]+OBRIGAT[ÓO]RIA|ALVO[[:space:]]+EDITORIAL[[:space:]]+CONFIGURADO|(este[[:space:]]+)?scaffold[[:space:]]+n[aã]o[[:space:]]+representa[[:space:]]+conte[uú]do[[:space:]]+final|antes[[:space:]]+da[[:space:]]+publica[cç][aã]o.{0,180}substitua[[:space:]]+esta[[:space:]]+estrutura)';
