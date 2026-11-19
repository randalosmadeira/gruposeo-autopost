-- Modo de conformidade publicitária (Provimento 205/2021 CFOAB) por organização (13/11/2026).
-- Idempotente: pode ser reaplicada. Não altera políticas, grants nem outras colunas.
--
-- O que faz
--  1. organizations.compliance_mode: 'off' | 'advisory' | 'strict', padrão 'advisory' (aviso: nunca bloqueia).
--     As organizações existentes entram em 'advisory' (decisão aprovada pelo dono).
--  2. organizations.compliance_mode_updated_by / _updated_at: quem e quando mudou o modo.
--  3. Gatilho que preenche essas duas colunas no servidor, para que o cliente não possa forjar o autor.
--
-- Permissões: nada novo. A política organizations_admin_update já limita o UPDATE a owner/admin da
-- organização (has_organization_role) e o authenticated já tem UPDATE na tabela; a coluna nova herda isso.
-- A leitura segue organizations_member_select (qualquer membro lê o modo da própria organização).
--
-- Reversão (manual; os dados novos são só desta migração):
--   drop trigger if exists compliance_mode_audit on public.organizations;
--   drop function if exists private.compliance_mode_audit();
--   alter table public.organizations drop constraint if exists organizations_compliance_mode_check;
--   alter table public.organizations drop column if exists compliance_mode_updated_at,
--     drop column if exists compliance_mode_updated_by, drop column if exists compliance_mode;
--   -- Sem a coluna, o publicador volta a tratar toda organização como 'advisory' (resolveComplianceMode, SQLSTATE 42703).
--   -- Para voltar ao bloqueio antigo para todos, ANTES de remover a coluna: update public.organizations set compliance_mode='strict';
create schema if not exists private;

alter table public.organizations add column if not exists compliance_mode text not null default 'advisory';
alter table public.organizations add column if not exists compliance_mode_updated_by uuid;
alter table public.organizations add column if not exists compliance_mode_updated_at timestamptz;

alter table public.organizations drop constraint if exists organizations_compliance_mode_check;
alter table public.organizations add constraint organizations_compliance_mode_check
 check (compliance_mode in ('off','advisory','strict'));

comment on column public.organizations.compliance_mode is
 'Verificação do Provimento 205/2021 da OAB nas publicações: off (não verifica), advisory (avisa, nunca bloqueia; padrão) ou strict (bloqueia). A responsabilidade pela publicidade é do responsável pelo escritório.';
comment on column public.organizations.compliance_mode_updated_by is 'Usuário que alterou compliance_mode pela última vez (preenchido pelo gatilho compliance_mode_audit).';
comment on column public.organizations.compliance_mode_updated_at is 'Momento da última alteração de compliance_mode (preenchido pelo gatilho compliance_mode_audit).';

-- Autor e data da mudança de modo vêm do servidor. Chamadas pela API (authenticated/anon) não escolhem esses
-- valores: mudando o modo, gravam auth.uid() e now(); sem mudar o modo, preservam o histórico anterior.
-- Chamadas de serviço (service_role, SQL do gestor) podem informar o autor; sem informar, só a data é preenchida.
create or replace function private.compliance_mode_audit()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('authenticated','anon') then
  if new.compliance_mode is distinct from old.compliance_mode then
   new.compliance_mode_updated_by := auth.uid();
   new.compliance_mode_updated_at := now();
  else
   new.compliance_mode_updated_by := old.compliance_mode_updated_by;
   new.compliance_mode_updated_at := old.compliance_mode_updated_at;
  end if;
 elsif new.compliance_mode is distinct from old.compliance_mode
   and new.compliance_mode_updated_at is not distinct from old.compliance_mode_updated_at then
  new.compliance_mode_updated_at := now();
 end if;
 return new;
end $$;
revoke all on function private.compliance_mode_audit() from public,anon,authenticated;

drop trigger if exists compliance_mode_audit on public.organizations;
create trigger compliance_mode_audit
 before update of compliance_mode, compliance_mode_updated_by, compliance_mode_updated_at on public.organizations
 for each row execute function private.compliance_mode_audit();
