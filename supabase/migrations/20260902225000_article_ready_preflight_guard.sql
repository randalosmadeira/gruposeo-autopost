create or replace function public.guard_article_ready_preflight()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  body_text text := coalesce(new.content, '');
  reasons text[] := array[]::text[];
  cfg jsonb := coalesce(new.config, '{}'::jsonb);
begin
  if new.status::text <> 'ready' then
    return new;
  end if;

  if body_text ~* '\[(VERIFICAR|VALIDAR|CONFIRMAR)[^\]\r\n]{0,240}\]' then
    reasons := array_append(reasons, 'verification_marker');
  end if;

  if body_text ~* '\[RECONSULTAR[^\]\r\n]{0,240}\]' then
    reasons := array_append(reasons, 'requery_marker');
  end if;

  if body_text ~* 'NOTA[[:space:]]+EDITORIAL[[:space:]]*:[\s\S]{0,240}(FONTE[[:space:]]+OFICIAL|PUBLICA(C|Ç)(A|Ã)O[[:space:]]+FINAL|REVIS(A|Ã)O[[:space:]]+HUMANA)' then
    reasons := array_append(reasons, 'editorial_verification_notice');
  end if;

  if body_text ~* 'MODELO[[:space:]]+EDITORIAL[^.]{0,220}(ATUALIZA(C|Ç)(A|Ã)O|REVIS(A|Ã)O[[:space:]]+HUMANA)' then
    reasons := array_append(reasons, 'editorial_verification_notice');
  end if;

  if array_length(reasons, 1) is not null then
    new.status := 'draft';
    new.error_message := 'Preflight editorial bloqueou READY: revisão ou fonte oficial pendente.';
    new.config := cfg || jsonb_build_object(
      'publication_preflight_pass', false,
      'publication_preflight_blocked_at', now(),
      'publication_preflight_reasons', to_jsonb(reasons),
      'needs_primary_source', true,
      'review_pass', false
    );
    return new;
  end if;

  new.config := (cfg - 'publication_preflight_blocked_at' - 'publication_preflight_reasons') || jsonb_build_object(
    'publication_preflight_pass', true,
    'publication_preflight_passed_at', now()
  );
  return new;
end;
$$;

drop trigger if exists trg_guard_article_ready_preflight on public.articles;
create trigger trg_guard_article_ready_preflight
before insert or update of status, content on public.articles
for each row
execute function public.guard_article_ready_preflight();

comment on function public.guard_article_ready_preflight() is
'Fail-closed preflight: artigos com marcadores de verificação/reconsulta ou notas editoriais de fonte pendente não podem permanecer em status ready.';
