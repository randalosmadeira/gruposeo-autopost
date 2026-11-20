-- Rollback do Teto Diário de Gasto. ATENÇÃO: apaga a política por organização (teto, adicional, câmbio), a tabela de preços para estimativa e o histórico de
-- reservas. As linhas de organization_usage_ledger gravadas pelo gate (metadata.source = 'spend_gate') NÃO são apagadas: são o histórico de gasto.
-- Antes de reverter no banco, volte a constante PAID_SERVICES_BLOCKED para true e reimplante as funções (o bloqueio total não depende destas tabelas).
drop function if exists public.spend_price_table();
drop function if exists public.spend_averages(uuid);
drop function if exists public.spend_history(uuid, integer);
drop function if exists public.spend_unlock_extra(uuid, uuid);
drop function if exists public.spend_release(uuid);
drop function if exists public.spend_commit(uuid, bigint, boolean, jsonb);
drop function if exists public.spend_reserve(uuid, bigint, text, jsonb, boolean);
drop function if exists public.spend_status(uuid);
drop function if exists public.spend_resolve_org(uuid, uuid, uuid);
drop function if exists public.spend_policy(uuid);
drop function if exists private.spend_price_table();
drop function if exists private.spend_averages(uuid);
drop function if exists private.spend_history(uuid, integer);
drop function if exists private.spend_unlock_extra(uuid, uuid);
drop function if exists private.spend_release(uuid);
drop function if exists private.spend_commit(uuid, bigint, boolean, jsonb);
drop function if exists private.spend_reserve(uuid, bigint, text, jsonb, boolean);
drop function if exists private.spend_status(uuid);
drop function if exists private.spend_totals(uuid, text);
drop function if exists private.spend_resolve_org(uuid, uuid, uuid);
drop function if exists private.spend_state(bigint, bigint, bigint, boolean, integer);
drop function if exists private.spend_policy(uuid);
drop table if exists public.spend_reservations;
drop table if exists public.provider_price_table;
drop table if exists public.organization_spend_policy;
