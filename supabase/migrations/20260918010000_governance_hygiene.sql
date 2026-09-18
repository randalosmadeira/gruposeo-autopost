-- Higiene de governança pós-auditoria 2026-09-18.
--
-- 1) is_ceo() já existe em produção (aplicada fora do fluxo de migração, em
--    algum momento anterior) e é referenciada por pelo menos 10 migrações
--    já versionadas. Esta migração a registra formalmente no histórico do
--    repositório, com CREATE OR REPLACE e a definição EXATA já confirmada em
--    produção via pg_get_functiondef, para eliminar o drift entre banco e
--    repositório sem alterar comportamento (idempotente).
create or replace function public.is_ceo()
returns boolean
language sql
stable
set search_path to ''
as $function$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'app_role') = 'ceo', false);
$function$;

-- 2) Corrige o advisor de performance "auth_rls_initplan" em token_usage_logs:
--    auth.uid() era reavaliado linha a linha; envolver em (select auth.uid())
--    permite ao planejador resolver uma vez por statement. Mesmo efeito de
--    autorização, apenas mais eficiente em tabelas de alto volume.
alter policy token_usage_logs_owner_insert on public.token_usage_logs
  with check (user_id = (select auth.uid()));

alter policy token_usage_logs_owner_or_member_select on public.token_usage_logs
  using (
    user_id = (select auth.uid())
    or (organization_id is not null and is_organization_member(organization_id))
  );
