-- Final reader-facing invariant for article content.
-- Structural model metadata is normalized at write time; unresolved editorial markers can never be persisted as published.

create or replace function public.normalize_article_structural_residue()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.content is null then
    return new;
  end if;

  -- Escaped HTML comments such as &lt;!-- TITLE_SEO: ... --&gt; are never reader-facing content.
  new.content := regexp_replace(
    new.content,
    '&(amp;)?lt;!--[^<]*--&(amp;)?gt;',
    '',
    'gi'
  );

  -- Markdown separators previously arrived as visible paragraphs in WordPress.
  new.content := regexp_replace(
    new.content,
    '<p[^>]*>[[:space:]]*(---|___|\*\*\*)[[:space:]]*</p>',
    '<hr>',
    'gi'
  );

  -- Remove empty paragraphs left after metadata cleanup.
  new.content := regexp_replace(new.content, '<p[^>]*>[[:space:]]*</p>', '', 'gi');

  return new;
end;
$$;

revoke all on function public.normalize_article_structural_residue() from public;
revoke all on function public.normalize_article_structural_residue() from anon;
revoke all on function public.normalize_article_structural_residue() from authenticated;

drop trigger if exists trg_00_normalize_article_structural_residue on public.articles;
create trigger trg_00_normalize_article_structural_residue
before insert or update of content on public.articles
for each row
execute function public.normalize_article_structural_residue();

create or replace function public.guard_published_article_clean()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_content text := coalesce(new.content, '');
begin
  if new.status::text <> 'published' then
    return new;
  end if;

  if v_content ~* '&(amp;)?lt;!--'
     or v_content ~* '(TITLE_SEO|META_DESCRIPTION)[[:space:]]*:'
     or v_content ~* '\[(VERIFICAR|VALIDAR|CONFIRMAR|RECONSULTAR)[^]]*\]'
     or v_content ~ '```'
     or v_content ~ '(^|[\n\r])[[:space:]]*#{1,6}[[:space:]]+' then
    raise exception using
      errcode = '23514',
      message = 'published_article_residue_blocked',
      detail = 'Conteúdo publicado contém metadados técnicos, Markdown cru ou marcador editorial pendente.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_published_article_clean() from public;
revoke all on function public.guard_published_article_clean() from anon;
revoke all on function public.guard_published_article_clean() from authenticated;

drop trigger if exists trg_99_guard_published_article_clean on public.articles;
create trigger trg_99_guard_published_article_clean
before insert or update of status, content on public.articles
for each row
execute function public.guard_published_article_clean();

comment on function public.guard_published_article_clean() is
'Fail-closed invariant: a published article cannot contain escaped metadata comments, TITLE_SEO/META_DESCRIPTION tokens, review markers, code fences or raw Markdown headings.';
