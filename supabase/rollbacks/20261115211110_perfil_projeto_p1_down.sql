-- Reversão do marco P1 do Perfil (20261115211110_perfil_projeto_p1.sql).
-- Remove SOMENTE o que o P1 criou e devolve a lista de tipos de custo ao estado anterior (serp, ai_observation, editorial_review, pilot).
-- ATENÇÃO antes de rodar em produção: se já existirem operações em nexus_operations com os tipos novos (prospect_* ou profile_*),
-- a restauração do CHECK falha de propósito (protege dado). Resolver essas linhas antes.
-- O bucket 'project-profile-uploads' só é apagado se estiver vazio (o Storage não permite apagar bucket com arquivo por SQL).

begin;

-- 1) custo: restaurar o CHECK e a função de reserva como eram
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.nexus_operations'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%ai_observation%';
  if c is not null then execute format('alter table public.nexus_operations drop constraint %I', c); end if;
  alter table public.nexus_operations add constraint nexus_operations_kind_check
    check (kind in ('serp','ai_observation','editorial_review','pilot'));
end $$;

create or replace function private.nexus_reserve_operation(p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare op public.nexus_operations; program public.nexus_programs; ceiling bigint;
begin
  select * into op from public.nexus_operations where id = p_operation;
  if op.id is null then raise exception 'operation_not_found'; end if;
  if op.kind not in ('serp','ai_observation') then raise exception 'global_paid_services_blocked'; end if;
  select * into program from public.nexus_programs where organization_id = op.organization_id for update;
  select * into op from public.nexus_operations where id = p_operation for update;
  if op.status <> 'prepared' then raise exception 'operation_already_claimed'; end if;
  if program.organization_id is null or not program.execution_enabled or program.budget_usd_micros = 0 then raise exception 'budget_paused'; end if;
  ceiling := (program.settings -> 'cost_ceilings_usd_micros' ->> op.kind)::bigint;
  if ceiling is null or ceiling <= 0 or nullif(program.settings ->> 'pricing_verified_at', '') is null then raise exception 'pricing_not_configured'; end if;
  if program.reserved_usd_micros + program.consumed_usd_micros + ceiling > program.budget_usd_micros then raise exception 'budget_exceeded'; end if;
  update public.nexus_programs set reserved_usd_micros = reserved_usd_micros + ceiling, updated_at = now() where organization_id = op.organization_id;
  update public.nexus_operations set status = 'reserved', reserved_usd_micros = ceiling, updated_at = now() where id = op.id;
  return jsonb_build_object('reserved', ceiling);
end $$;

-- 2) armazenamento: políticas e, se vazio, o bucket
drop policy if exists project_profile_uploads_member_select on storage.objects;
drop policy if exists project_profile_uploads_member_insert on storage.objects;
drop policy if exists project_profile_uploads_admin_delete on storage.objects;
do $$
begin
  if not exists (select 1 from storage.objects where bucket_id = 'project-profile-uploads') then
    begin
      delete from storage.buckets where id = 'project-profile-uploads';
    exception when others then
      raise notice 'bucket project-profile-uploads mantido (remover pelo painel ou API do Storage): %', sqlerrm;
    end;
  else
    raise notice 'bucket project-profile-uploads tem arquivos e foi mantido';
  end if;
end $$;

-- 3) tabelas (ordem inversa das dependências; as políticas e os gatilhos caem junto)
drop table if exists public.project_findings;
drop table if exists public.project_analysis_checks;
drop table if exists public.project_analysis_runs;
drop table if exists public.project_modules;
drop table if exists public.module_catalog;
drop table if exists public.project_profile_snapshots;
drop table if exists public.project_profile_assets;
drop table if exists public.project_profile_messages;
drop table if exists public.project_profile_conversations;
drop table if exists public.project_profile_facts;
drop table if exists public.project_profile_private;
drop table if exists public.project_profile_extended;

-- 4) funções
drop function if exists public.profile_assert_project_org();
drop function if exists public.profile_storage_org(text);
drop function if exists public.profile_touch();

commit;
