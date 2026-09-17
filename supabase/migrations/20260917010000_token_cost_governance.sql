-- NEXUS audit remediation (2026-09-16): restore real cost visibility for
-- token_usage_logs.
--
-- Root causes fixed here:
-- 1. token_usage_logs had its SELECT/INSERT policies dropped in
--    20260905195700_enforce_admin_only_technical_controls.sql and never
--    replaced, so any authenticated user (or the org member policy pattern
--    used everywhere else) got zero rows back - the "Consumo de Tokens" card
--    always rendered empty.
-- 2. The application (byok-resolver.ts) always wrote estimated_cost_usd = 0
--    with a cost_pending_pricing_resolution flag that was never resolved.
-- 3. organization_id on new rows was only ever backfilled once, in
--    20260905203000_multitenant_commercial_foundation.sql - there was no
--    ongoing trigger, so every row inserted since then has organization_id
--    NULL and organization_usage_ledger never received a single token/cost
--    entry.

-- 1. Real, single-source-of-truth pricing per model actually emitted by
--    ai-orchestrator.ts (see OPENAI_TEXT/OPENAI_ECONOMY/CLAUDE_TEXT/
--    CLAUDE_ECONOMY). USD per 1,000,000 tokens. These are approximate list
--    prices at the time of writing and should be kept in sync by hand when a
--    provider changes pricing - there is no live pricing API wired in.
create table if not exists public.model_pricing_catalog (
  model text primary key,
  input_cost_per_million numeric(10, 4) not null,
  output_cost_per_million numeric(10, 4) not null,
  updated_at timestamptz not null default now()
);

insert into public.model_pricing_catalog (model, input_cost_per_million, output_cost_per_million) values
  ('claude-sonnet-4-5-20250929', 3.00, 15.00),
  ('claude-haiku-4-5-20251001', 1.00, 5.00),
  ('gpt-4.1', 2.00, 8.00),
  ('gpt-4o', 2.50, 10.00),
  ('gpt-4o-mini', 0.15, 0.60)
on conflict (model) do update set
  input_cost_per_million = excluded.input_cost_per_million,
  output_cost_per_million = excluded.output_cost_per_million,
  updated_at = now();

alter table public.model_pricing_catalog enable row level security;
create policy model_pricing_catalog_read on public.model_pricing_catalog
  for select to authenticated using (true);

-- 2. Recreate the org-aware SELECT/INSERT policies token_usage_logs lost.
--    Same pattern as every other org-scoped table (is_organization_member),
--    plus the original per-user policy for rows not yet attached to an org.
drop policy if exists "Users can view their own usage logs" on public.token_usage_logs;
drop policy if exists "Users can insert their own usage logs" on public.token_usage_logs;
drop policy if exists token_usage_logs_owner_or_member_select on public.token_usage_logs;
drop policy if exists token_usage_logs_owner_insert on public.token_usage_logs;

create policy token_usage_logs_owner_or_member_select on public.token_usage_logs
  for select to authenticated
  using (
    user_id = auth.uid()
    or (organization_id is not null and public.is_organization_member(organization_id))
  );

create policy token_usage_logs_owner_insert on public.token_usage_logs
  for insert to authenticated
  with check (user_id = auth.uid());

-- 3. Inherit organization_id on every new row (mirrors the one-time backfill
--    above and the existing trg_05_inherit_article_organization pattern on
--    articles), then price it from the catalog instead of trusting the
--    caller's estimated_cost_usd.
create or replace function public.price_token_usage_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pricing record;
begin
  if new.organization_id is null then
    if new.article_id is not null then
      select a.organization_id into new.organization_id
      from public.articles a
      where a.id = new.article_id and a.organization_id is not null;
    end if;
    if new.organization_id is null then
      select o.id into new.organization_id
      from public.organizations o
      where o.owner_user_id = new.user_id
      limit 1;
    end if;
  end if;

  select * into v_pricing from public.model_pricing_catalog where model = new.model;
  if found then
    new.estimated_cost_usd := round(
      (coalesce(new.input_tokens, 0)::numeric / 1000000.0) * v_pricing.input_cost_per_million
      + (coalesce(new.output_tokens, 0)::numeric / 1000000.0) * v_pricing.output_cost_per_million,
      6
    );
  end if;
  -- Model not in the catalog yet (e.g. a new default rolled out in
  -- ai-orchestrator.ts before this table is updated): leave whatever cost the
  -- caller sent rather than silently reporting 0 as if it were priced.

  return new;
end;
$$;

drop trigger if exists trg_price_token_usage_log on public.token_usage_logs;
create trigger trg_price_token_usage_log
  before insert on public.token_usage_logs
  for each row execute function public.price_token_usage_log();

-- 4. Mirror every priced row into organization_usage_ledger, which already
--    has a read policy (usage_ledger_member_select) but nothing writing to
--    it for AI usage - only 'article_generated' events existed before this.
create or replace function public.ledger_token_usage_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is null then
    return new;
  end if;
  insert into public.organization_usage_ledger
    (organization_id, user_id, article_id, metric, amount, provider, model, metadata)
  values
    (new.organization_id, new.user_id, new.article_id, 'input_tokens', coalesce(new.input_tokens, 0), new.provider, new.model, jsonb_build_object('token_usage_log_id', new.id, 'operation', new.operation)),
    (new.organization_id, new.user_id, new.article_id, 'output_tokens', coalesce(new.output_tokens, 0), new.provider, new.model, jsonb_build_object('token_usage_log_id', new.id, 'operation', new.operation)),
    (new.organization_id, new.user_id, new.article_id, 'cost_usd_micros', round(coalesce(new.estimated_cost_usd, 0) * 1000000)::bigint, new.provider, new.model, jsonb_build_object('token_usage_log_id', new.id, 'operation', new.operation));
  return new;
end;
$$;

drop trigger if exists trg_ledger_token_usage_log on public.token_usage_logs;
create trigger trg_ledger_token_usage_log
  after insert on public.token_usage_logs
  for each row execute function public.ledger_token_usage_log();

revoke all on function public.price_token_usage_log() from public, anon, authenticated;
revoke all on function public.ledger_token_usage_log() from public, anon, authenticated;
