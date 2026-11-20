-- Teto Diário de Gasto com serviços pagos (IA, imagem, busca), por organização. Decisão do dono em 20/11/2026:
--   teto de US$ 7,00 por dia; crédito adicional de US$ 2,20 (teto absoluto US$ 9,20); dia = America/Sao_Paulo; aviso aos 80%.
-- Aditiva e reversível (supabase/rollbacks/20261120400000_teto_diario_gasto_rollback.sql). NÃO altera nenhuma tabela nem função existente.
-- IMPORTANTE: aplicar esta migração NÃO liga o teto. Enquanto a constante PAID_SERVICES_BLOCKED (nexus-spend-lock.ts) for true, nada chama
-- estas funções e o bloqueio total continua valendo. Quem liga é a troca da constante + a reimplantação das funções de borda.
--
-- Regras (a mesma lógica está espelhada em supabase/functions/_shared/spend-gate-core.ts, função decideReserve):
--   * gasto do dia = soma de organization_usage_ledger (metric 'cost_usd_micros') no dia local + reservas ativas ainda não confirmadas;
--   * operação NOVA só começa se gasto + reservas + estimativa <= teto (7,00);
--   * operação JÁ INICIADA (mesma operation_key já reservada hoje) ou com o adicional liberado pelo dono no dia corrente
--     só começa se gasto + reservas + estimativa <= teto + adicional (9,20);
--   * NUNCA acima de teto + adicional, e nunca acima de 9.200.000 micros (trava fixa no corpo da função);
--   * a reserva é feita sob advisory lock por organização: reservas simultâneas não estouram o teto;
--   * reserva pendente expira em 15 minutos (devolve o saldo); confirmar depois do prazo ainda registra o gasto real.
-- Medição: chamadas via AIOrchestrator já caem no ledger pelos gatilhos de token_usage_logs (medidas). Imagem, busca e demais rotas sem
-- gatilho entram por RESERVA POR ESTIMATIVA (tabela provider_price_table, tudo 'verified = false' até o dono conferir) e o gasto estimado
-- é gravado no ledger com metadata.estimated = true.
-- Acesso: RLS ligada e nenhum grant para anon/authenticated; funções só para service_role (porta única: função de borda spend-policy
-- e o próprio gate das funções de borda, ambos com chave de serviço).

create schema if not exists private;

-- 1) Política por organização. Sem linha = valores padrão (7,00 / 2,20 / America/Sao_Paulo / 80%).
create table if not exists public.organization_spend_policy (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  daily_cap_usd_micros bigint not null default 7000000 check (daily_cap_usd_micros >= 0),
  extra_allowance_usd_micros bigint not null default 2200000 check (extra_allowance_usd_micros >= 0),
  extra_unlocked_on date,
  extra_unlocked_by uuid references auth.users(id) on delete set null,
  timezone text not null default 'America/Sao_Paulo' check (char_length(timezone) between 3 and 64),
  alert_pct integer not null default 80 check (alert_pct between 1 and 100),
  -- câmbio informado pelo dono (sem valor padrão inventado): só existe conversão em reais se este campo estiver preenchido
  fx_brl_per_usd numeric check (fx_brl_per_usd is null or fx_brl_per_usd > 0),
  -- false = pausa as operações pagas desta organização (423 spend_paused). Não existe "teto desligado".
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index if not exists organization_spend_policy_unlocked_by_idx on public.organization_spend_policy (extra_unlocked_by);
create index if not exists organization_spend_policy_updated_by_idx on public.organization_spend_policy (updated_by);

-- 2) Tabela de preços para ESTIMATIVA das rotas que o ledger não mede. Nada aqui é fato verificado: verified = false até o dono conferir.
create table if not exists public.provider_price_table (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (char_length(provider) between 1 and 60),
  route text not null check (char_length(route) between 1 and 120),
  unit text not null check (unit in ('million_input_tokens', 'million_output_tokens', 'image', 'search', 'task')),
  usd_micros_per_unit bigint not null check (usd_micros_per_unit >= 0),
  verified boolean not null default false,
  source_note text,
  updated_at timestamptz not null default now(),
  constraint provider_price_table_unique unique (provider, route, unit)
);

-- 3) Reservas de gasto (uma por chamada paga). Não confundir com usage_quota_reservations (cota de artigos).
create table if not exists public.spend_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  day date not null,
  operation_key text,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  estimate_usd_micros bigint not null check (estimate_usd_micros >= 0),
  actual_usd_micros bigint check (actual_usd_micros is null or actual_usd_micros >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'committed', 'released', 'expired')),
  started boolean not null default false,
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spend_reservations_idem_unique unique (organization_id, idempotency_key)
);
create index if not exists spend_reservations_hot_idx on public.spend_reservations (organization_id, day, status, expires_at);
create index if not exists spend_reservations_operation_idx on public.spend_reservations (organization_id, operation_key, day) where operation_key is not null;

alter table public.organization_spend_policy enable row level security;
alter table public.provider_price_table enable row level security;
alter table public.spend_reservations enable row level security;
revoke all on table public.organization_spend_policy, public.provider_price_table, public.spend_reservations from public, anon, authenticated;
grant all on table public.organization_spend_policy, public.provider_price_table, public.spend_reservations to service_role;

-- 4) Preços iniciais. TODOS não verificados. Texto: US$ por 1 milhão de tokens x 1.000.000 (= micros por milhão de tokens).
--    Os modelos de texto repetem model_pricing_catalog (migração 20260917094128, "preços de lista aproximados"); os demais são
--    estimativas conservadoras do projeto, NÃO conferidas na tabela de preços do provedor.
insert into public.provider_price_table (provider, route, unit, usd_micros_per_unit, verified, source_note) values
  ('openai', 'gpt-4.1', 'million_input_tokens', 2000000, false, 'model_pricing_catalog (aproximado)'),
  ('openai', 'gpt-4.1', 'million_output_tokens', 8000000, false, 'model_pricing_catalog (aproximado)'),
  ('openai', 'gpt-4o', 'million_input_tokens', 2500000, false, 'model_pricing_catalog (aproximado)'),
  ('openai', 'gpt-4o', 'million_output_tokens', 10000000, false, 'model_pricing_catalog (aproximado)'),
  ('openai', 'gpt-4o-mini', 'million_input_tokens', 150000, false, 'model_pricing_catalog (aproximado)'),
  ('openai', 'gpt-4o-mini', 'million_output_tokens', 600000, false, 'model_pricing_catalog (aproximado)'),
  ('openai', 'gpt-4.1-mini', 'million_input_tokens', 400000, false, 'estimativa do projeto, não verificada'),
  ('openai', 'gpt-4.1-mini', 'million_output_tokens', 1600000, false, 'estimativa do projeto, não verificada'),
  ('openai', 'gpt-5-mini', 'million_input_tokens', 300000, false, 'token-logger.ts (2025), não verificada'),
  ('openai', 'gpt-5-mini', 'million_output_tokens', 1250000, false, 'token-logger.ts (2025), não verificada'),
  ('anthropic', 'claude-sonnet-4-5-20250929', 'million_input_tokens', 3000000, false, 'model_pricing_catalog (aproximado)'),
  ('anthropic', 'claude-sonnet-4-5-20250929', 'million_output_tokens', 15000000, false, 'model_pricing_catalog (aproximado)'),
  ('anthropic', 'claude-haiku-4-5-20251001', 'million_input_tokens', 1000000, false, 'model_pricing_catalog (aproximado)'),
  ('anthropic', 'claude-haiku-4-5-20251001', 'million_output_tokens', 5000000, false, 'model_pricing_catalog (aproximado)'),
  ('gemini', 'gemini-2.0-flash', 'million_input_tokens', 100000, false, 'token-logger.ts (2025), não verificada'),
  ('gemini', 'gemini-2.0-flash', 'million_output_tokens', 400000, false, 'token-logger.ts (2025), não verificada'),
  ('gemini', 'gemini-2.5-flash', 'million_input_tokens', 300000, false, 'estimativa do projeto, não verificada'),
  ('gemini', 'gemini-2.5-flash', 'million_output_tokens', 2500000, false, 'estimativa do projeto, não verificada'),
  ('gemini', 'gemini-2.5-pro', 'million_input_tokens', 1250000, false, 'token-logger.ts (2025), não verificada'),
  ('gemini', 'gemini-2.5-pro', 'million_output_tokens', 10000000, false, 'token-logger.ts (2025), não verificada'),
  ('*', 'text_fallback', 'million_input_tokens', 5000000, false, 'modelo desconhecido: valor conservador do projeto, não verificado'),
  ('*', 'text_fallback', 'million_output_tokens', 20000000, false, 'modelo desconhecido: valor conservador do projeto, não verificado'),
  ('openai', 'images', 'image', 250000, false, 'gpt-image-2: placeholder conservador do projeto, NÃO verificado'),
  ('gemini', 'images', 'image', 40000, false, 'token-logger.ts (Imagen), não verificado'),
  ('serper', 'search', 'search', 2000, false, 'placeholder conservador do projeto, NÃO verificado'),
  ('dataforseo', 'task', 'task', 10000, false, 'placeholder conservador do projeto, NÃO verificado'),
  ('brave', 'search', 'search', 10000, false, 'placeholder conservador do projeto, NÃO verificado'),
  ('serpapi', 'search', 'search', 15000, false, 'placeholder conservador do projeto, NÃO verificado'),
  ('perplexity', 'search', 'search', 10000, false, 'placeholder conservador do projeto, NÃO verificado')
on conflict (provider, route, unit) do nothing;

-- 5) Funções internas (schema private). Os wrappers public.* abaixo são security invoker e só o service_role executa.

-- 5.1) Política efetiva (com padrões quando a organização ainda não tem linha).
create or replace function private.spend_policy(p_org uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cap', coalesce(p.daily_cap_usd_micros, 7000000),
    'extra', coalesce(p.extra_allowance_usd_micros, 2200000),
    'extra_unlocked_on', p.extra_unlocked_on,
    'tz', coalesce(p.timezone, 'America/Sao_Paulo'),
    'alert_pct', coalesce(p.alert_pct, 80),
    'fx', p.fx_brl_per_usd,
    'enabled', coalesce(p.enabled, true)
  )
  from (select 1) d
  left join public.organization_spend_policy p on p.organization_id = p_org;
$$;

-- 5.2) Estado a partir de gasto+reservas ('livre','aviso','teto_atingido','adicional_liberado','esgotado'). Espelha computeState (TS).
create or replace function private.spend_state(p_used bigint, p_cap bigint, p_extra bigint, p_unlocked boolean, p_alert_pct integer)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_used >= least(p_cap + p_extra, 9200000) then 'esgotado'
    when p_used >= p_cap and p_unlocked then 'adicional_liberado'
    when p_used >= p_cap then 'teto_atingido'
    when p_cap > 0 and p_used * 100 >= p_cap * p_alert_pct then 'aviso'
    else 'livre'
  end;
$$;

-- 5.3) Qual organização paga a chamada: projeto > artigo > usuário (única organização própria ou única participação ativa).
--      Ambíguo ou sem relação = null (o gate nega: falha fechada).
create or replace function private.spend_resolve_org(p_user uuid, p_project uuid, p_article uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_owner uuid; v_count integer;
begin
  if p_project is not null then
    select p.organization_id, p.user_id into v_org, v_owner from public.projects p where p.id = p_project;
  elsif p_article is not null then
    select a.organization_id, a.user_id into v_org, v_owner from public.articles a where a.id = p_article;
  end if;
  if v_org is not null then
    if p_user is null then return v_org; end if;
    if v_owner = p_user
       or exists (select 1 from public.organization_members m where m.organization_id = v_org and m.user_id = p_user and m.status = 'active')
       or exists (select 1 from public.organizations o where o.id = v_org and o.owner_user_id = p_user) then
      return v_org;
    end if;
    return null;
  end if;
  if p_project is not null or p_article is not null or p_user is null then return null; end if;
  select count(*), min(x.id::text)::uuid into v_count, v_org from (
    select o.id from public.organizations o where o.owner_user_id = p_user
    union
    select m.organization_id from public.organization_members m where m.user_id = p_user and m.status = 'active'
  ) x;
  if v_count = 1 then return v_org; end if;
  return null;
end; $$;

-- 5.4) Totais do dia local: gasto do ledger (e a parte estimada) + reservas ativas.
create or replace function private.spend_totals(p_org uuid, p_tz text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_today date; v_from timestamptz; v_to timestamptz; v_spent bigint; v_est bigint; v_res bigint;
begin
  v_today := (now() at time zone p_tz)::date;
  v_from := v_today::timestamp at time zone p_tz;
  v_to := (v_today + 1)::timestamp at time zone p_tz;
  select coalesce(sum(l.amount), 0), coalesce(sum(l.amount) filter (where l.metadata->>'estimated' = 'true'), 0)
    into v_spent, v_est
    from public.organization_usage_ledger l
   where l.organization_id = p_org and l.metric = 'cost_usd_micros' and l.occurred_at >= v_from and l.occurred_at < v_to;
  select coalesce(sum(r.estimate_usd_micros), 0) into v_res
    from public.spend_reservations r
   where r.organization_id = p_org and r.day = v_today and r.status = 'reserved' and r.expires_at > now();
  return jsonb_build_object('day', v_today, 'spent', v_spent, 'estimated_spent', v_est, 'reserved', v_res);
end; $$;

-- 5.5) Situação do dia (painel e função spend-policy).
create or replace function private.spend_status(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_pol jsonb := private.spend_policy(p_org);
  v_tz text := v_pol->>'tz';
  v_tot jsonb := private.spend_totals(p_org, v_pol->>'tz');
  v_cap bigint := (v_pol->>'cap')::bigint;
  v_extra bigint := (v_pol->>'extra')::bigint;
  v_abs bigint := least((v_pol->>'cap')::bigint + (v_pol->>'extra')::bigint, 9200000);
  v_today date := (v_tot->>'day')::date;
  v_unlocked boolean := coalesce((v_pol->>'extra_unlocked_on')::date = v_today, false);
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
end; $$;

-- 5.6) Reserva atômica. Devolve jsonb: {allowed:true, reservation_id, duplicate, state, ...} ou {allowed:false, code, reason, ...}.
create or replace function private.spend_reserve(
  p_org uuid, p_estimate_usd_micros bigint, p_idempotency_key text, p_context jsonb default '{}'::jsonb, p_started_job boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_pol jsonb; v_tz text; v_tot jsonb; v_today date;
  v_cap bigint; v_extra bigint; v_abs bigint; v_unlocked boolean; v_enabled boolean;
  v_spent bigint; v_res bigint; v_used bigint; v_started boolean; v_limit bigint; v_op text; v_id uuid; v_state text;
  v_existing public.spend_reservations;
begin
  if p_org is null then raise exception 'organization_required'; end if;
  if p_estimate_usd_micros is null or p_estimate_usd_micros < 0 then raise exception 'invalid_estimate'; end if;
  if length(trim(coalesce(p_idempotency_key, ''))) < 8 then raise exception 'invalid_idempotency_key'; end if;
  if jsonb_typeof(coalesce(p_context, '{}'::jsonb)) <> 'object' then raise exception 'invalid_context'; end if;

  -- um único lugar de decisão por organização: reservas simultâneas esperam aqui e enxergam o saldo já descontado
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':spend', 0));

  v_pol := private.spend_policy(p_org);
  v_tz := v_pol->>'tz';
  v_cap := (v_pol->>'cap')::bigint;
  v_extra := (v_pol->>'extra')::bigint;
  v_abs := least(v_cap + v_extra, 9200000); -- trava fixa: nunca acima de US$ 9,20, seja qual for a política gravada
  v_enabled := (v_pol->>'enabled')::boolean;

  update public.spend_reservations set status = 'expired', updated_at = now()
   where organization_id = p_org and status = 'reserved' and expires_at <= now();

  v_tot := private.spend_totals(p_org, v_tz);
  v_today := (v_tot->>'day')::date;
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
  v_limit := case when v_started or v_unlocked then v_abs else least(v_cap, v_abs) end;

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
end; $$;

-- 5.7) Confirma a reserva com o custo real (ou estimado). p_record_ledger = false quando o gasto já foi para o ledger por outro caminho
--      (gatilhos de token_usage_logs). Confirmar reserva já expirada ainda registra o gasto: a verdade vale mais que o prazo.
create or replace function private.spend_commit(
  p_reservation uuid, p_actual_usd_micros bigint default null, p_record_ledger boolean default true, p_meta jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.spend_reservations; v_actual bigint; v_user uuid; v_project uuid; v_ledger uuid;
begin
  select * into r from public.spend_reservations where id = p_reservation;
  if not found then raise exception 'reservation_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.organization_id::text || ':spend', 0));
  select * into r from public.spend_reservations where id = p_reservation;
  if r.status = 'committed' then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  if p_actual_usd_micros is not null and p_actual_usd_micros < 0 then raise exception 'invalid_actual'; end if;
  v_actual := coalesce(p_actual_usd_micros, r.estimate_usd_micros);
  update public.spend_reservations set status = 'committed', actual_usd_micros = v_actual, updated_at = now() where id = r.id;
  if coalesce(p_record_ledger, true) and v_actual > 0 then
    select u.id into v_user from auth.users u where u.id = nullif(r.context->>'user_id', '')::uuid;
    select pr.id into v_project from public.projects pr where pr.id = nullif(r.context->>'project_id', '')::uuid;
    insert into public.organization_usage_ledger (organization_id, user_id, project_id, metric, amount, provider, model, metadata)
    values (r.organization_id, v_user, v_project, 'cost_usd_micros', v_actual, r.context->>'provider', r.context->>'model',
      jsonb_build_object('source', 'spend_gate', 'estimated', coalesce((p_meta->>'estimated')::boolean, false), 'reservation_id', r.id,
        'module', r.context->>'module', 'operation', coalesce(r.context->>'operation', r.context->>'module'), 'route', r.context->>'route',
        'estimate_usd_micros', r.estimate_usd_micros) || coalesce(p_meta, '{}'::jsonb))
    returning id into v_ledger;
  end if;
  return jsonb_build_object('ok', true, 'duplicate', false, 'actual_usd_micros', v_actual, 'ledger_id', v_ledger);
end; $$;

-- 5.8) Devolve o saldo de uma reserva que não virou chamada (erro antes de gastar).
create or replace function private.spend_release(p_reservation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.spend_reservations;
begin
  select * into r from public.spend_reservations where id = p_reservation;
  if not found then return jsonb_build_object('ok', true, 'released', false); end if;
  perform pg_advisory_xact_lock(hashtextextended(r.organization_id::text || ':spend', 0));
  update public.spend_reservations set status = 'released', updated_at = now() where id = p_reservation and status = 'reserved';
  return jsonb_build_object('ok', true, 'released', found);
end; $$;

-- 5.9) Libera o crédito adicional SÓ no dia corrente (o papel é conferido na função de borda). Cria a linha de política se faltar.
create or replace function private.spend_unlock_extra(p_org uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tz text; v_today date;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':spend', 0));
  v_tz := private.spend_policy(p_org)->>'tz';
  v_today := (now() at time zone v_tz)::date;
  insert into public.organization_spend_policy (organization_id, extra_unlocked_on, extra_unlocked_by, updated_by)
  values (p_org, v_today, p_actor, p_actor)
  on conflict (organization_id) do update
    set extra_unlocked_on = v_today, extra_unlocked_by = p_actor, updated_by = p_actor, updated_at = now();
  return private.spend_status(p_org);
end; $$;

-- 5.10) Histórico por dia (últimos p_days dias, no máximo 90): total, parte estimada, por provedor, por módulo e por projeto.
create or replace function private.spend_history(p_org uuid, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tz text := private.spend_policy(p_org)->>'tz'; v_days integer := least(greatest(coalesce(p_days, 30), 1), 90); v_from timestamptz; v_out jsonb;
begin
  v_from := (((now() at time zone v_tz)::date - (v_days - 1))::timestamp) at time zone v_tz;
  with led as (
    select (l.occurred_at at time zone v_tz)::date as day, coalesce(l.provider, 'outros') as provider,
           coalesce(l.metadata->>'module', l.metadata->>'operation', 'outros') as module,
           coalesce(l.project_id, a.project_id) as project_id, l.amount, coalesce(l.metadata->>'estimated' = 'true', false) as est
      from public.organization_usage_ledger l
      left join public.articles a on a.id = l.article_id
     where l.organization_id = p_org and l.metric = 'cost_usd_micros' and l.occurred_at >= v_from
  ), per_day as (
    select day, sum(amount) as total, sum(amount) filter (where est) as estimated from led group by day
  ), per_prov as (
    select day, jsonb_object_agg(provider, s) as j from (select day, provider, sum(amount) as s from led group by 1, 2) t group by day
  ), per_mod as (
    select day, jsonb_object_agg(module, s) as j from (select day, module, sum(amount) as s from led group by 1, 2) t group by day
  ), per_proj as (
    select day, jsonb_object_agg(project_id::text, s) as j from (select day, project_id, sum(amount) as s from led where project_id is not null group by 1, 2) t group by day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'day', d.day, 'total_usd_micros', d.total, 'estimated_usd_micros', coalesce(d.estimated, 0),
      'by_provider', coalesce(pp.j, '{}'::jsonb), 'by_module', coalesce(pm.j, '{}'::jsonb), 'by_project', coalesce(pj.j, '{}'::jsonb)
    ) order by d.day desc), '[]'::jsonb)
    into v_out
    from per_day d
    left join per_prov pp on pp.day = d.day
    left join per_mod pm on pm.day = d.day
    left join per_proj pj on pj.day = d.day;
  return jsonb_build_object('days', v_out, 'timezone', v_tz, 'window_days', v_days);
end; $$;

-- 5.11) Custo médio real (últimos 60 dias) por chamada, por artigo e por landing page, para a estimativa "cabem ≈ N". Sem dados = null.
create or replace function private.spend_averages(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_from timestamptz := now() - interval '60 days'; v_calls jsonb; v_article jsonb; v_landing jsonb;
begin
  select jsonb_build_object('n', count(*), 'avg_usd_micros', round(avg(l.amount))) into v_calls
    from public.organization_usage_ledger l
   where l.organization_id = p_org and l.metric = 'cost_usd_micros' and l.amount > 0 and l.occurred_at >= v_from;
  select jsonb_build_object('n', count(*), 'avg_usd_micros', round(avg(t.s))) into v_article
    from (select l.article_id, sum(l.amount) as s from public.organization_usage_ledger l
           where l.organization_id = p_org and l.metric = 'cost_usd_micros' and l.article_id is not null and l.occurred_at >= v_from
           group by l.article_id) t where t.s > 0;
  select jsonb_build_object('n', count(*), 'avg_usd_micros', round(avg(l.amount))) into v_landing
    from public.organization_usage_ledger l
   where l.organization_id = p_org and l.metric = 'cost_usd_micros' and l.amount > 0 and l.occurred_at >= v_from
     and coalesce(l.metadata->>'operation', l.metadata->>'module') in ('landing_page', 'generate-landing-page');
  return jsonb_build_object('calls', v_calls, 'article', v_article, 'landing_page', v_landing);
end; $$;

create or replace function private.spend_price_table()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('provider', p.provider, 'route', p.route, 'unit', p.unit,
    'usd_micros_per_unit', p.usd_micros_per_unit, 'verified', p.verified, 'source_note', p.source_note) order by p.provider, p.route, p.unit), '[]'::jsonb)
  from public.provider_price_table p;
$$;

-- 6) Wrappers públicos (security invoker; só o service_role executa), mesmo padrão de nexus_reserve_operation.
create or replace function public.spend_policy(p_org uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.spend_policy(p_org); $$;
create or replace function public.spend_resolve_org(p_user uuid, p_project uuid, p_article uuid) returns uuid language sql security invoker set search_path = '' as $$ select private.spend_resolve_org(p_user, p_project, p_article); $$;
create or replace function public.spend_status(p_org uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.spend_status(p_org); $$;
create or replace function public.spend_reserve(p_org uuid, p_estimate_usd_micros bigint, p_idempotency_key text, p_context jsonb default '{}'::jsonb, p_started_job boolean default false)
  returns jsonb language sql security invoker set search_path = '' as $$ select private.spend_reserve(p_org, p_estimate_usd_micros, p_idempotency_key, p_context, p_started_job); $$;
create or replace function public.spend_commit(p_reservation uuid, p_actual_usd_micros bigint default null, p_record_ledger boolean default true, p_meta jsonb default '{}'::jsonb)
  returns jsonb language sql security invoker set search_path = '' as $$ select private.spend_commit(p_reservation, p_actual_usd_micros, p_record_ledger, p_meta); $$;
create or replace function public.spend_release(p_reservation uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.spend_release(p_reservation); $$;
create or replace function public.spend_unlock_extra(p_org uuid, p_actor uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.spend_unlock_extra(p_org, p_actor); $$;
create or replace function public.spend_history(p_org uuid, p_days integer default 30) returns jsonb language sql security invoker set search_path = '' as $$ select private.spend_history(p_org, p_days); $$;
create or replace function public.spend_averages(p_org uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.spend_averages(p_org); $$;
create or replace function public.spend_price_table() returns jsonb language sql security invoker set search_path = '' as $$ select private.spend_price_table(); $$;

revoke all on function
  private.spend_policy(uuid), private.spend_state(bigint, bigint, bigint, boolean, integer), private.spend_resolve_org(uuid, uuid, uuid),
  private.spend_totals(uuid, text), private.spend_status(uuid), private.spend_reserve(uuid, bigint, text, jsonb, boolean),
  private.spend_commit(uuid, bigint, boolean, jsonb), private.spend_release(uuid), private.spend_unlock_extra(uuid, uuid),
  private.spend_history(uuid, integer), private.spend_averages(uuid), private.spend_price_table(),
  public.spend_policy(uuid), public.spend_resolve_org(uuid, uuid, uuid), public.spend_status(uuid),
  public.spend_reserve(uuid, bigint, text, jsonb, boolean), public.spend_commit(uuid, bigint, boolean, jsonb), public.spend_release(uuid),
  public.spend_unlock_extra(uuid, uuid), public.spend_history(uuid, integer), public.spend_averages(uuid), public.spend_price_table()
  from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function
  private.spend_policy(uuid), private.spend_state(bigint, bigint, bigint, boolean, integer), private.spend_resolve_org(uuid, uuid, uuid),
  private.spend_totals(uuid, text), private.spend_status(uuid), private.spend_reserve(uuid, bigint, text, jsonb, boolean),
  private.spend_commit(uuid, bigint, boolean, jsonb), private.spend_release(uuid), private.spend_unlock_extra(uuid, uuid),
  private.spend_history(uuid, integer), private.spend_averages(uuid), private.spend_price_table(),
  public.spend_policy(uuid), public.spend_resolve_org(uuid, uuid, uuid), public.spend_status(uuid),
  public.spend_reserve(uuid, bigint, text, jsonb, boolean), public.spend_commit(uuid, bigint, boolean, jsonb), public.spend_release(uuid),
  public.spend_unlock_extra(uuid, uuid), public.spend_history(uuid, integer), public.spend_averages(uuid), public.spend_price_table()
  to service_role;

comment on table public.organization_spend_policy is 'Teto diário de gasto com serviços pagos por organização (US$ 7,00 + adicional US$ 2,20 liberável pelo dono, dia em America/Sao_Paulo).';
comment on table public.provider_price_table is 'Preços para ESTIMATIVA das rotas pagas não medidas pelo ledger. verified=false até conferência do dono.';
comment on table public.spend_reservations is 'Reservas de gasto por chamada paga (expiram em 15 minutos). Não é a cota mensal de artigos (usage_quota_reservations).';
