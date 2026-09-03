create or replace function public.guard_article_ready_preflight()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  body_text text := coalesce(new.content, '');
  reasons text[] := array[]::text[];
  cfg jsonb := coalesce(new.config, '{}'::jsonb);
  source_pending boolean := false;
begin
  if new.status::text <> 'ready' then
    return new;
  end if;

  if btrim(body_text) = '' then
    reasons := array_append(reasons, 'empty_content');
  end if;

  if coalesce((cfg->>'publication_guard_origin_blocked')::boolean, false) then
    reasons := array_append(reasons, 'origin_guard_blocked');
  end if;

  if coalesce((cfg->>'needs_primary_source')::boolean, false) then
    reasons := array_append(reasons, 'needs_primary_source');
    source_pending := true;
  end if;

  if cfg ? 'review_pass' and coalesce((cfg->>'review_pass')::boolean, false) = false then
    reasons := array_append(reasons, 'review_not_approved');
  end if;

  if coalesce((cfg->'complianceSnapshot'->>'canPublish')::boolean, true) = false then
    reasons := array_append(reasons, 'electoral_compliance_blocked');
  end if;

  if body_text ~* '\[(VERIFICAR|VALIDAR|CONFIRMAR)[^\]\r\n]{0,240}\]' then
    reasons := array_append(reasons, 'verification_marker');
    source_pending := true;
  end if;

  if body_text ~* '\[RECONSULTAR[^\]\r\n]{0,240}\]' then
    reasons := array_append(reasons, 'requery_marker');
    source_pending := true;
  end if;

  if body_text ~* 'NOTA[[:space:]]+EDITORIAL[[:space:]]*:[\s\S]{0,240}(FONTE[[:space:]]+OFICIAL|PUBLICA(C|Ç)(A|Ã)O[[:space:]]+FINAL|REVIS(A|Ã)O[[:space:]]+HUMANA)' then
    reasons := array_append(reasons, 'editorial_verification_notice');
    source_pending := true;
  end if;

  if body_text ~* 'MODELO[[:space:]]+EDITORIAL[^.]{0,220}(ATUALIZA(C|Ç)(A|Ã)O|REVIS(A|Ã)O[[:space:]]+HUMANA)' then
    reasons := array_append(reasons, 'editorial_verification_notice');
    source_pending := true;
  end if;

  if array_length(reasons, 1) is not null then
    new.status := 'draft';
    new.error_message := case
      when 'empty_content' = any(reasons) then 'Preflight editorial bloqueou READY: conteúdo vazio.'
      when 'electoral_compliance_blocked' = any(reasons) then 'Preflight eleitoral bloqueou READY: homologação/compliance pendente.'
      when source_pending then 'Preflight editorial bloqueou READY: revisão ou fonte oficial pendente.'
      else 'Preflight editorial bloqueou READY: artigo ainda não homologado.'
    end;
    new.config := cfg || jsonb_build_object(
      'publication_preflight_pass', false,
      'publication_preflight_blocked_at', now(),
      'publication_preflight_reasons', to_jsonb(reasons),
      'needs_primary_source', source_pending,
      'review_pass', false
    );
    return new;
  end if;

  new.error_message := null;
  new.config := (cfg - 'publication_preflight_blocked_at' - 'publication_preflight_reasons') || jsonb_build_object(
    'publication_preflight_pass', true,
    'publication_preflight_passed_at', now()
  );
  return new;
end;
$function$;
