-- EXCEÇÃO DO DIA do teto de gasto (20/11/2026), por ordem expressa do dono ("quebrar o teto").
-- A trava fixa de US$ 9,20/dia continua valendo SEMPRE, salvo na organização e no dia gravados em organization_spend_policy.exception_day,
-- quando o limite absoluto passa a ser exception_absolute_usd_micros (máx. US$ 100). No dia seguinte a exceção deixa de valer sozinha.
-- Só a decisão do banco muda (spend_reserve, spend_status, spend_policy); o resto do desenho (reserva/confirmação/ledger) é o mesmo.
-- Volta: supabase/rollbacks/20261121400000_teto_excecao_do_dia_rollback.sql (restaura as definições anteriores).
begin;
alter table public.organization_spend_policy add column if not exists exception_day date;
alter table public.organization_spend_policy add column if not exists exception_absolute_usd_micros bigint check (exception_absolute_usd_micros is null or (exception_absolute_usd_micros >= 0 and exception_absolute_usd_micros <= 100000000));
alter table public.organization_spend_policy add column if not exists exception_note text check (exception_note is null or char_length(exception_note) <= 500);

CREATE OR REPLACE FUNCTION private.spend_policy(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'cap', coalesce(p.daily_cap_usd_micros, 7000000),
    'extra', coalesce(p.extra_allowance_usd_micros, 2200000),
    'extra_unlocked_on', p.extra_unlocked_on,
    'tz', coalesce(p.timezone, 'America/Sao_Paulo'),
    'alert_pct', coalesce(p.alert_pct, 80),
    'fx', p.fx_brl_per_usd,
    'enabled', coalesce(p.enabled, true),
    'exception_day', p.exception_day,
    'exception_abs', p.exception_absolute_usd_micros
  )
  from (select 1) d
  left join public.organization_spend_policy p on p.organization_id = p_org;
$function$;

CREATE OR REPLACE FUNCTION private.spend_reserve(p_org uuid, p_estimate_usd_micros bigint, p_idempotency_key text, p_context jsonb DEFAULT '{}'::jsonb, p_started_job boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pol jsonb; v_tz text; v_tot jsonb; v_today date;
  v_exc boolean; v_cap bigint; v_extra bigint; v_abs bigint; v_unlocked boolean; v_enabled boolean;
  v_spent bigint; v_res bigint; v_used bigint; v_started boolean; v_limit bigint; v_op text; v_id uuid; v_state text;
  v_existing public.spend_reservations;
begin
  if p_org is null then raise exception 'organization_required'; end if;
  if p_estimate_usd_micros is null or p_estimate_usd_micros < 0 then raise exception 'invalid_estimate'; end if;
  if length(trim(coalesce(p_idempotency_key, ''))) < 8 then raise exception 'invalid_idempotency_key'; end if;
  if jsonb_typeof(coalesce(p_context, '{}'::jsonb)) <> 'object' then raise exception 'invalid_context'; end if;

  -- um Ãºnico lugar de decisÃ£o por organizaÃ§Ã£o: reservas simultÃ¢neas esperam aqui e enxergam o saldo jÃ¡ descontado
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':spend', 0));

  v_pol := private.spend_policy(p_org);
  v_tz := v_pol->>'tz';
  v_cap := (v_pol->>'cap')::bigint;
  v_extra := (v_pol->>'extra')::bigint;
  v_abs := least(v_cap + v_extra, 9200000); -- trava fixa: nunca acima de US$ 9,20, seja qual for a polÃ­tica gravada
  v_enabled := (v_pol->>'enabled')::boolean;

  update public.spend_reservations set status = 'expired', updated_at = now()
   where organization_id = p_org and status = 'reserved' and expires_at <= now();

  v_tot := private.spend_totals(p_org, v_tz);
  v_today := (v_tot->>'day')::date;
  -- EXCEÇÃO DO DIA (ordem expressa do dono): só vale no dia gravado em organization_spend_policy.exception_day; amanhã volta a trava fixa de US$ 9,20
  v_exc := coalesce((v_pol->>'exception_day')::date = v_today, false) and (v_pol->>'exception_abs') is not null;
  if v_exc then v_abs := (v_pol->>'exception_abs')::bigint; end if;
  v_unlocked := coalesce((v_pol->>'extra_unlocked_on')::date = v_today, false);
  v_spent := (v_tot->>'spent')::bigint;
  v_res := (v_tot->>'reserved')::bigint;
  v_used := v_spent + v_res;

  select * into v_existing from public.spend_reservations where organization_id = p_org and idempotency_key = p_idempotency_key;
  if found and v_existing.status in ('reserved', 'committed') then
    return jsonb_build_object('allowed', true, 'duplicate', true, 'reservation_id', v_existing.id, 'reservation_status', v_existing.status);
  end if;

  if not v_enabled then
    return jsonb_build_object('allowed', false, 'code', 'spend_paused', 'reason', 'paused', 'spent', v_spent, 'reserved', v_res,
      'cap', v_cap, 'extra', v_extra, 'extra_unlocked', v_unlocked, 'state', private.spend_state(v_used, v_cap, v_extra, v_unlocked, (v_pol->>'alert_pct')::integer));
  end if;

  v_op := nullif(p_context->>'operation_key', '');
  v_started := coalesce(p_started_job, false)
    or (v_op is not null and exists (
      select 1 from public.spend_reservations r
       where r.organization_id = p_org and r.day = v_today and r.operation_key = v_op and r.status in ('reserved', 'committed')));
  v_limit := case when v_started or v_unlocked or v_exc then v_abs else least(v_cap, v_abs) end;

  if v_used + p_estimate_usd_micros > v_limit then
    return jsonb_build_object('allowed', false, 'code', 'daily_cap_reached',
      'reason', case when v_used + p_estimate_usd_micros > v_abs then 'absolute_cap' else 'cap' end,
      'spent', v_spent, 'reserved', v_res, 'estimate', p_estimate_usd_micros, 'cap', v_cap, 'extra', v_extra,
      'extra_unlocked', v_unlocked, 'started', v_started,
      'state', private.spend_state(v_used, v_cap, v_extra, v_unlocked, (v_pol->>'alert_pct')::integer));
  end if;

  if v_existing.id is not null then
    update public.spend_reservations
       set status = 'reserved', estimate_usd_micros = p_estimate_usd_micros, actual_usd_micros = null, day = v_today, operation_key = v_op,
           started = v_started, context = coalesce(p_context, '{}'::jsonb), expires_at = now() + interval '15 minutes', updated_at = now()
     where id = v_existing.id returning id into v_id;
  else
    insert into public.spend_reservations (organization_id, day, operation_key, idempotency_key, estimate_usd_micros, started, context)
    values (p_org, v_today, v_op, p_idempotency_key, p_estimate_usd_micros, v_started, coalesce(p_context, '{}'::jsonb))
    returning id into v_id;
  end if;

  v_state := private.spend_state(v_used + p_estimate_usd_micros, v_cap, v_extra, v_unlocked, (v_pol->>'alert_pct')::integer);
  return jsonb_build_object('allowed', true, 'duplicate', false, 'reservation_id', v_id, 'state', v_state,
    'spent', v_spent, 'reserved', v_res + p_estimate_usd_micros, 'cap', v_cap, 'extra', v_extra, 'extra_unlocked', v_unlocked, 'started', v_started);
end; $function$;

CREATE OR REPLACE FUNCTION private.spend_status(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pol jsonb := private.spend_policy(p_org);
  v_tz text := v_pol->>'tz';
  v_tot jsonb := private.spend_totals(p_org, v_pol->>'tz');
  v_cap bigint := (v_pol->>'cap')::bigint;
  v_extra bigint := (v_pol->>'extra')::bigint;
  v_abs bigint := case when (v_pol->>'exception_day')::date = (v_tot->>'day')::date and (v_pol->>'exception_abs') is not null
                       then (v_pol->>'exception_abs')::bigint
                       else least((v_pol->>'cap')::bigint + (v_pol->>'extra')::bigint, 9200000) end;
  v_today date := (v_tot->>'day')::date;
  v_unlocked boolean := coalesce((v_pol->>'extra_unlocked_on')::date = v_today, false)
                        or (coalesce((v_pol->>'exception_day')::date = v_today, false) and (v_pol->>'exception_abs') is not null);
  v_used bigint := (v_tot->>'spent')::bigint + (v_tot->>'reserved')::bigint;
  v_from timestamptz := v_today::timestamp at time zone (v_pol->>'tz');
  v_to timestamptz := (v_today + 1)::timestamp at time zone (v_pol->>'tz');
  v_projects jsonb; v_modules jsonb; v_providers jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('project_id', t.project_id, 'name', t.name, 'usd_micros', t.s) order by t.s desc), '[]'::jsonb) into v_projects from (
    select coalesce(l.project_id, a.project_id) as project_id, max(pr.name) as name, sum(l.amount) as s
      from public.organization_usage_ledger l
      left join public.articles a on a.id = l.article_id
      left join public.projects pr on pr.id = coalesce(l.project_id, a.project_id)
     where l.organization_id = p_org and l.metric = 'cost_usd_micros' and l.occurred_at >= v_from and l.occurred_at < v_to
       and coalesce(l.project_id, a.project_id) is not null
     group by 1 order by 3 desc limit 5) t;
  select coalesce(jsonb_agg(jsonb_build_object('module', t.m, 'usd_micros', t.s) order by t.s desc), '[]'::jsonb) into v_modules from (
    select coalesce(l.metadata->>'module', l.metadata->>'operation', 'outros') as m, sum(l.amount) as s
      from public.organization_usage_ledger l
     where l.organization_id = p_org and l.metric = 'cost_usd_micros' and l.occurred_at >= v_from and l.occurred_at < v_to
     group by 1 order by 2 desc limit 5) t;
  select coalesce(jsonb_agg(jsonb_build_object('provider', t.p, 'usd_micros', t.s) order by t.s desc), '[]'::jsonb) into v_providers from (
    select coalesce(l.provider, 'outros') as p, sum(l.amount) as s
      from public.organization_usage_ledger l
     where l.organization_id = p_org and l.metric = 'cost_usd_micros' and l.occurred_at >= v_from and l.occurred_at < v_to
     group by 1 order by 2 desc limit 8) t;
  return jsonb_build_object(
    'day', v_today, 'timezone', v_tz,
    'spent_usd_micros', (v_tot->>'spent')::bigint, 'estimated_usd_micros', (v_tot->>'estimated_spent')::bigint,
    'reserved_usd_micros', (v_tot->>'reserved')::bigint, 'used_usd_micros', v_used,
    'cap_usd_micros', v_cap, 'extra_usd_micros', v_extra, 'absolute_usd_micros', v_abs, 'extra_unlocked', v_unlocked,
    'remaining_to_cap_usd_micros', greatest(v_cap - v_used, 0), 'remaining_absolute_usd_micros', greatest(v_abs - v_used, 0),
    'state', private.spend_state(v_used, v_cap, v_extra, v_unlocked, (v_pol->>'alert_pct')::integer),
    'alert_pct', (v_pol->>'alert_pct')::integer, 'fx_brl_per_usd', v_pol->'fx', 'enabled', (v_pol->>'enabled')::boolean,
    'top_projects', v_projects, 'top_modules', v_modules, 'top_providers', v_providers
  );
end; $function$;

commit;
