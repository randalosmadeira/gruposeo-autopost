-- NEXUS · GA4 + plano de gerenciamento gestor x cliente (13/11/2026).
-- Nada aqui executa chamadas pagas (a GA4 Data API é gratuita). Idempotente: pode ser reaplicada.
--
-- O que esta migração faz
--  1. provedor `ga4` nas credenciais e no histórico de saúde; funções do cofre com `ga4` e aceitando o gestor (CEO) como ator;
--  2. nexus_providers_overview com `ga4` (logo depois de bing_webmaster);
--  3. nexus_client_requests (solicitações do cliente; limite de 20 abertas por organização, atômico);
--  4. nexus_analytics_daily (GA4) + RPCs nexus_analytics_summary e nexus_content_performance (security invoker);
--  5. estatísticas da auditoria (GA4 + índice de conteúdos) e marca de sincronização aceitando `ga4`;
--  6. nexus_project_integrations_set (grava ga4_property_id / gsc_property em projects.commercial_info, atômico, sem apagar outras chaves);
--  7. fechamento no banco do limite gestor x cliente: nexus_can_manage_technical + gatilhos em projects (chaves de integração) e
--     organizations (coluna `kind`). Sem isso um dono de organização cliente alteraria `commercial_info`/`kind` direto pela API REST.
--
-- Reversão (manual, na ordem inversa; os dados novos são só desta migração):
--   drop trigger if exists nexus_guard_org_kind on public.organizations;
--   drop trigger if exists nexus_guard_project_integrations on public.projects;
--   drop function if exists private.nexus_guard_org_kind(), private.nexus_guard_project_integrations();
--   drop function if exists public.nexus_can_manage_technical(uuid), public.nexus_project_integrations_set(uuid,uuid,text,boolean,text,boolean),
--     private.nexus_project_integrations_set(uuid,uuid,text,boolean,text,boolean), public.nexus_content_performance(uuid,date,date),
--     public.nexus_analytics_summary(uuid,date,date), public.nexus_url_path(text), public.nexus_client_request_create(uuid,uuid,uuid,text,text),
--     private.nexus_client_request_create(uuid,uuid,uuid,text,text), private.nexus_is_manager(uuid);
--   drop table if exists public.nexus_analytics_daily, public.nexus_client_requests;
--   -- restaurar nexus_providers_overview, private.nexus_provider_secret*, private.nexus_audit_project_stats e private.nexus_audit_mark_sync
--   -- reaplicando as versões de 20261112130000_nexus_providers.sql e 20261112140000_nexus_audit.sql;
--   -- remover 'ga4' dos dois checks de provedor (apague antes qualquer linha com provider='ga4').
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. Provedor `ga4`
-- ---------------------------------------------------------------------------
alter table public.organization_provider_credentials drop constraint if exists organization_provider_credentials_provider_check;
alter table public.organization_provider_credentials add constraint organization_provider_credentials_provider_check
 check(provider in ('openai','anthropic','gemini','serper','perplexity','gsc','bing_webmaster','ga4','dataforseo','serpapi','brave'));
alter table public.nexus_provider_health drop constraint if exists nexus_provider_health_provider_check;
alter table public.nexus_provider_health add constraint nexus_provider_health_provider_check
 check(provider in ('openai','anthropic','gemini','serper','perplexity','gsc','bing_webmaster','ga4','dataforseo','serpapi','brave'));

-- Gestor da plataforma (CEO): `app_metadata.app_role = 'ceo'` no usuário (mesmo critério de public.is_ceo(), que lê o JWT).
-- Usada só por funções do servidor (a Edge Function passa o p_actor); nunca exposta a authenticated.
create or replace function private.nexus_is_manager(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=p_user and coalesce(u.raw_app_meta_data->>'app_role','')='ceo');
$$;
revoke all on function private.nexus_is_manager(uuid) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.nexus_is_manager(uuid) to service_role;

-- Cofre: mesmas regras da versão anterior + `ga4` + o gestor (CEO) pode gravar/remover credencial de qualquer organização
-- (a Edge Function só chama estas funções depois de provar `can_manage_technical`; aqui o ator continua exigido).
create or replace function private.nexus_provider_secret(p_org uuid,p_actor uuid,p_provider text,p_secret text default null)
returns text language plpgsql security definer set search_path='' as $$
declare secret_name text; secret_id uuid; result text; v_last4 text;
begin
 if p_provider not in ('openai','anthropic','gemini','serper','perplexity','gsc','bing_webmaster','ga4','dataforseo','serpapi','brave') then raise exception 'unsupported_provider'; end if;
 if not private.nexus_is_manager(p_actor)
 and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and status='active' and role in ('owner','admin'))
 and not exists(select 1 from public.organizations where id=p_org and owner_user_id=p_actor) then raise exception 'forbidden'; end if;
 secret_name:='nexus_org_'||p_org||'_'||p_provider;
 if p_secret is not null then
   if length(p_secret)<12 or length(p_secret)>4096 then raise exception 'invalid_credential'; end if;
   if p_provider in ('gsc','ga4') then
     begin
       v_last4:=right(regexp_replace(coalesce((p_secret::jsonb)->>'private_key_id',''),'[^A-Za-z0-9_-]','','g'),4);
     exception when others then v_last4:=null;
     end;
   end if;
   if v_last4 is null or length(v_last4)<4 then
     v_last4:=lpad(right(regexp_replace(p_secret,'[^A-Za-z0-9_-]','','g'),4),4,'x');
   end if;
   select id into secret_id from vault.secrets where name=secret_name;
   if secret_id is null then perform vault.create_secret(p_secret,secret_name); else perform vault.update_secret(secret_id,p_secret,secret_name); end if;
   insert into public.organization_provider_credentials(organization_id,provider,vault_secret_name,secret_last_four,status,created_by)
   values(p_org,p_provider,secret_name,v_last4,'stored_unverified',p_actor)
   on conflict(organization_id,provider) do update set vault_secret_name=excluded.vault_secret_name,secret_last_four=excluded.secret_last_four,status='stored_unverified',updated_at=now();
   return 'stored_unverified';
 end if;
 select s.decrypted_secret into result from vault.decrypted_secrets s join public.organization_provider_credentials c on c.vault_secret_name=s.name
 where c.organization_id=p_org and c.provider=p_provider and c.status in ('active','stored_unverified');
 return result;
end $$;

create or replace function private.nexus_provider_secret_read(p_org uuid,p_provider text)
returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if p_provider not in ('openai','anthropic','gemini','serper','perplexity','gsc','bing_webmaster','ga4','dataforseo','serpapi','brave') then raise exception 'unsupported_provider'; end if;
 select s.decrypted_secret into result from vault.decrypted_secrets s join public.organization_provider_credentials c on c.vault_secret_name=s.name
 where c.organization_id=p_org and c.provider=p_provider and c.status in ('active','stored_unverified','invalid');
 return result;
end $$;

create or replace function private.nexus_provider_secret_remove(p_org uuid,p_actor uuid,p_provider text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_name text;
begin
 if p_provider not in ('openai','anthropic','gemini','serper','perplexity','gsc','bing_webmaster','ga4','dataforseo','serpapi','brave') then raise exception 'unsupported_provider'; end if;
 if not private.nexus_is_manager(p_actor)
 and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and status='active' and role in ('owner','admin'))
 and not exists(select 1 from public.organizations where id=p_org and owner_user_id=p_actor) then raise exception 'forbidden'; end if;
 select vault_secret_name into v_name from public.organization_provider_credentials where organization_id=p_org and provider=p_provider;
 if v_name is null then return false; end if;
 delete from vault.secrets where name=v_name;
 delete from public.organization_provider_credentials where organization_id=p_org and provider=p_provider;
 return true;
end $$;
-- (os invólucros public.* e os grants de 20261112130000 continuam valendo: mesma assinatura)

-- ---------------------------------------------------------------------------
-- 2. nexus_providers_overview com `ga4` (mesma lógica da versão anterior; só o catálogo muda)
-- ---------------------------------------------------------------------------
create or replace function public.nexus_providers_overview(p_org uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r jsonb;
begin
 with catalog as (
  select p.provider,p.ord from unnest(array['gsc','bing_webmaster','ga4','serper','dataforseo','serpapi','brave','openai','gemini','anthropic','perplexity','copilot']) with ordinality as p(provider,ord)
 ), cred as (
  select c.provider,c.secret_last_four,c.status,c.updated_at from public.organization_provider_credentials c where c.organization_id=p_org
 ), h7 as (
  select h.provider,count(*)::int as checks,(count(*) filter(where h.ok))::int as oks,round(avg(h.latency_ms))::int as avg_latency
  from public.nexus_provider_health h where h.organization_id=p_org and h.checked_at>=now()-interval '7 days' group by h.provider
 ), hl as (
  select distinct on (h.provider) h.provider,h.checked_at,h.ok,h.latency_ms,h.http_status,h.detail,h.quota,h.cost_micros
  from public.nexus_provider_health h where h.organization_id=p_org order by h.provider,h.checked_at desc,h.id desc
 ), ops as (
  select o.status,o.updated_at,
   case when nullif(o.input->>'engine','') is null then
    case o.kind when 'serp' then 'serper' when 'ai_observation' then 'openai' end
   else
    case o.input->>'engine'
     when 'chatgpt_api' then 'openai' when 'gemini_api' then 'gemini' when 'claude_api' then 'anthropic' when 'perplexity_api' then 'perplexity'
     when 'google_serp' then 'serper' when 'dataforseo_google' then 'dataforseo' when 'dataforseo_bing' then 'dataforseo'
     when 'serpapi_google' then 'serpapi' when 'serpapi_bing' then 'serpapi' when 'brave_search' then 'brave'
    end
   end as provider
  from public.nexus_operations o
  where o.organization_id=p_org and o.kind in ('serp','ai_observation') and o.status in ('succeeded','failed','uncertain')
 ), u as (
  select provider,
   (count(*) filter(where status='succeeded' and updated_at>=now()-interval '30 days'))::int as valid,
   (count(*) filter(where status='failed' and updated_at>=now()-interval '30 days'))::int as failed,
   (count(*) filter(where status='uncertain' and updated_at>=now()-interval '30 days'))::int as uncertain,
   max(updated_at) filter(where status='succeeded') as last_success
  from ops where provider is not null group by provider
 )
 select jsonb_build_object(
  'providers',coalesce((select jsonb_agg(jsonb_build_object(
    'provider',c.provider,
    'credential',jsonb_build_object('stored',cr.provider is not null,'last_four',cr.secret_last_four,'status',cr.status,'updated_at',cr.updated_at),
    'last_health',case when hl.provider is null then null else jsonb_build_object('checked_at',hl.checked_at,'ok',hl.ok,'latency_ms',hl.latency_ms,'http_status',hl.http_status,'detail',hl.detail,'quota',hl.quota,'cost_micros',hl.cost_micros) end,
    'checks_7d',coalesce(h7.checks,0),'ok_7d',coalesce(h7.oks,0),'avg_latency_ms_7d',h7.avg_latency,
    'usage',jsonb_build_object('valid_30d',coalesce(u.valid,0),'failed_30d',coalesce(u.failed,0),'uncertain_30d',coalesce(u.uncertain,0),'last_success_at',u.last_success)
   ) order by c.ord)
   from catalog c left join cred cr on cr.provider=c.provider left join h7 on h7.provider=c.provider left join hl on hl.provider=c.provider left join u on u.provider=c.provider),'[]'::jsonb),
  'program',coalesce((select jsonb_build_object('execution_enabled',g.execution_enabled,'budget_usd_micros',g.budget_usd_micros,'reserved_usd_micros',g.reserved_usd_micros,'consumed_usd_micros',g.consumed_usd_micros,'settings',g.settings)
    from public.nexus_programs g where g.organization_id=p_org),
   jsonb_build_object('execution_enabled',false,'budget_usd_micros',0,'reserved_usd_micros',0,'consumed_usd_micros',0,'settings','{}'::jsonb))
 ) into r;
 return r;
end $$;
revoke all on function public.nexus_providers_overview(uuid) from public,anon;
grant execute on function public.nexus_providers_overview(uuid) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3. Limite gestor x cliente no banco
-- ---------------------------------------------------------------------------
-- can_manage_technical = gestor (CEO) OU (organização interna E papel owner/admin). Em organização cliente, nem o owner passa.
-- Só responde sobre quem chama (auth.uid()): não serve de oráculo sobre terceiros.
create or replace function public.nexus_can_manage_technical(p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.is_ceo(),false)
  or exists(
   select 1 from public.organizations o
   where o.id=p_org and o.kind='internal'
    and (o.owner_user_id=(select auth.uid())
     or exists(select 1 from public.organization_members m where m.organization_id=o.id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin'))));
$$;
revoke all on function public.nexus_can_manage_technical(uuid) from public,anon;
grant execute on function public.nexus_can_manage_technical(uuid) to authenticated,service_role;

-- Chaves de integração em projects.commercial_info só mudam por gestor/org interna admin (a Edge Function usa service_role e passa direto).
-- Detalhe: authenticated tem UPDATE em projects via a política projects_org_update (owner/admin/editor), inclusive em organização cliente.
create or replace function private.nexus_guard_project_integrations()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_old jsonb:='{}'::jsonb; v_new jsonb:=coalesce(new.commercial_info,'{}'::jsonb);
begin
 if current_user not in ('authenticated','anon') then return new; end if;
 if tg_op='UPDATE' then v_old:=coalesce(old.commercial_info,'{}'::jsonb); end if;
 if (v_new->'ga4_property_id') is not distinct from (v_old->'ga4_property_id')
 and (v_new->'gsc_property') is not distinct from (v_old->'gsc_property') then return new; end if;
 if not public.nexus_can_manage_technical(new.organization_id) then
  raise exception using errcode='42501', message='manager_required_for_integrations';
 end if;
 return new;
end $$;
revoke all on function private.nexus_guard_project_integrations() from public,anon,authenticated;
drop trigger if exists nexus_guard_project_integrations on public.projects;
create trigger nexus_guard_project_integrations before insert or update of commercial_info on public.projects
 for each row execute function private.nexus_guard_project_integrations();

-- `organizations.kind` define quem é "cliente": se o próprio cliente pudesse trocá-lo (authenticated tem UPDATE na coluna e a política
-- organizations_admin_update deixa owner/admin atualizar), viraria "interno" e ganharia as ações técnicas. Só o gestor altera.
create or replace function private.nexus_guard_org_kind()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and new.kind is distinct from old.kind and not coalesce(public.is_ceo(),false) then
  raise exception using errcode='42501', message='manager_required_to_change_organization_kind';
 end if;
 return new;
end $$;
revoke all on function private.nexus_guard_org_kind() from public,anon,authenticated;
drop trigger if exists nexus_guard_org_kind on public.organizations;
create trigger nexus_guard_org_kind before update of kind on public.organizations
 for each row execute function private.nexus_guard_org_kind();

-- ---------------------------------------------------------------------------
-- 4. nexus_client_requests: solicitações do cliente (qualquer membro cria; só o gestor atualiza, pela Edge Function)
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_client_requests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 project_id uuid references public.projects(id) on delete set null,
 requested_by uuid not null,
 kind text not null check(kind in ('connect_source','plugin_link','plugin_update','new_observation_round','report','access','other')),
 message text not null check(char_length(message) between 3 and 1000),
 status text not null default 'open' check(status in ('open','in_progress','done','rejected')),
 manager_note text check(manager_note is null or char_length(manager_note)<=1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 resolved_at timestamptz
);
create index if not exists nexus_client_requests_org_status_idx on public.nexus_client_requests(organization_id,status,created_at desc);
create index if not exists nexus_client_requests_project_idx on public.nexus_client_requests(project_id) where project_id is not null;
alter table public.nexus_client_requests enable row level security;
revoke all on public.nexus_client_requests from public,anon,authenticated;
grant select on public.nexus_client_requests to authenticated;
grant all on public.nexus_client_requests to service_role;
drop policy if exists nexus_client_requests_read on public.nexus_client_requests;
create policy nexus_client_requests_read on public.nexus_client_requests for select to authenticated using(public.is_organization_member(organization_id));
drop trigger if exists nexus_client_requests_updated_at on public.nexus_client_requests;
create trigger nexus_client_requests_updated_at before update on public.nexus_client_requests for each row execute function public.update_updated_at_column();

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='nexus_client_requests') then
  alter publication supabase_realtime add table public.nexus_client_requests;
 end if;
end $$;

-- Criação atômica com limite de 20 solicitações abertas (open + in_progress) por organização: trava consultiva por organização
-- evita que duas chamadas simultâneas passem juntas do limite. Erros por mensagem fixa (a Edge Function traduz em HTTP).
create or replace function private.nexus_client_request_create(p_org uuid,p_project uuid,p_user uuid,p_kind text,p_message text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_message text:=btrim(coalesce(p_message,'')); v_open int; r public.nexus_client_requests;
begin
 if p_kind is null or p_kind not in ('connect_source','plugin_link','plugin_update','new_observation_round','report','access','other') then raise exception 'request_kind_invalid'; end if;
 if char_length(v_message) not between 3 and 1000 then raise exception 'request_message_invalid'; end if;
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user and status='active') and not private.nexus_is_manager(p_user) then raise exception 'organization_membership_required'; end if;
 if p_project is not null and not exists(select 1 from public.projects where id=p_project and organization_id=p_org) then raise exception 'project_forbidden'; end if;
 perform pg_advisory_xact_lock(hashtextextended('nexus_client_requests:'||p_org::text,0));
 select count(*)::int into v_open from public.nexus_client_requests where organization_id=p_org and status in ('open','in_progress');
 if v_open>=20 then raise exception 'too_many_open_requests'; end if;
 insert into public.nexus_client_requests(organization_id,project_id,requested_by,kind,message) values(p_org,p_project,p_user,p_kind,v_message) returning * into r;
 return to_jsonb(r);
end $$;
create or replace function public.nexus_client_request_create(p_org uuid,p_project uuid,p_user uuid,p_kind text,p_message text)
returns jsonb language sql security invoker set search_path='' as $$select private.nexus_client_request_create(p_org,p_project,p_user,p_kind,p_message);$$;
revoke all on function private.nexus_client_request_create(uuid,uuid,uuid,text,text),public.nexus_client_request_create(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.nexus_client_request_create(uuid,uuid,uuid,text,text),public.nexus_client_request_create(uuid,uuid,uuid,text,text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. nexus_analytics_daily: GA4 por dia. Duas famílias de linhas (ver _shared/nexus-ga4.ts):
--    page=''  -> totais do SITE (sem pagePath; base de totais, série diária, canais e fontes de IA);
--    page<>'' -> por PÁGINA (ranking de páginas e desempenho por área). Não some uma família com a outra.
-- Ao gravar: page <= 1000 caracteres, source/channel <= 200 (a chave única é um btree, limite ~2700 bytes por entrada).
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_analytics_daily (
 id bigserial primary key,
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id) on delete cascade,
 day date not null,
 page text not null default '',
 channel text not null default '',
 source text not null default '',
 is_ai boolean not null default false,
 sessions int not null default 0 check(sessions>=0),
 engaged_sessions int not null default 0 check(engaged_sessions>=0),
 page_views int not null default 0 check(page_views>=0),
 users int not null default 0 check(users>=0),
 engagement_seconds numeric not null default 0 check(engagement_seconds>=0),
 key_events numeric not null default 0 check(key_events>=0),
 synced_at timestamptz not null default now(),
 unique(project_id,day,page,channel,source)
);
create index if not exists nexus_analytics_daily_project_day_idx on public.nexus_analytics_daily(project_id,day);
alter table public.nexus_analytics_daily enable row level security;
revoke all on public.nexus_analytics_daily from public,anon,authenticated;
grant select on public.nexus_analytics_daily to authenticated;
grant all on public.nexus_analytics_daily to service_role;
grant usage,select on sequence public.nexus_analytics_daily_id_seq to service_role;
drop policy if exists nexus_analytics_daily_read on public.nexus_analytics_daily;
create policy nexus_analytics_daily_read on public.nexus_analytics_daily for select to authenticated using(public.is_organization_member(organization_id));

-- Caminho normalizado de uma URL/caminho: sem esquema e host, sem query/fragmento, sem barras finais ('/' quando vazio), minúsculas.
-- Percent-encoding não é decodificado (só igualado em minúsculas): caminhos com acentos codificados de formas diferentes caem em "unmatched".
create or replace function public.nexus_url_path(p text)
returns text language plpgsql immutable set search_path='' as $$
declare v text:=btrim(coalesce(p,''));
begin
 v:=regexp_replace(v,'^[a-zA-Z][a-zA-Z0-9+.-]*://[^/?#]*','');
 v:=regexp_replace(v,'[?#].*$','');
 v:=regexp_replace(v,'/+$','');
 if v='' then return '/'; end if;
 if left(v,1)<>'/' then v:='/'||v; end if;
 return lower(v);
end $$;
revoke all on function public.nexus_url_path(text) from public,anon;
grant execute on function public.nexus_url_path(text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 6. RPC nexus_analytics_summary. security invoker (o RLS de quem chama vale). Período em UTC (padrão: últimos 28 dias).
-- Totais, série diária, canais e fontes de IA vêm das linhas do SITE (page=''); o ranking vem das linhas por PÁGINA.
-- Usuários = soma por dia/canal/fonte (não é o total de usuários únicos do painel do GA4).
-- ---------------------------------------------------------------------------
create or replace function public.nexus_analytics_summary(p_project uuid,p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_to date:=coalesce(p_to,(now() at time zone 'utc')::date);
 v_from date:=coalesce(p_from,coalesce(p_to,(now() at time zone 'utc')::date)-27);
 r jsonb;
begin
 if v_from>v_to or v_to-v_from>366 then raise exception 'period_invalid'; end if;
 with site as (
  select d.* from public.nexus_analytics_daily d where d.project_id=p_project and d.page='' and d.day between v_from and v_to
 ), pages as (
  select d.* from public.nexus_analytics_daily d where d.project_id=p_project and d.page<>'' and d.day between v_from and v_to
 )
 select jsonb_build_object(
  'period',jsonb_build_object('from',v_from,'to',v_to),
  'totals',(select jsonb_build_object('sessions',coalesce(sum(sessions),0)::bigint,'engaged_sessions',coalesce(sum(engaged_sessions),0)::bigint,
     'page_views',coalesce(sum(page_views),0)::bigint,'users',coalesce(sum(users),0)::bigint,
     'engagement_rate',case when coalesce(sum(sessions),0)=0 then null else round(sum(engaged_sessions)::numeric/sum(sessions),4) end,
     'avg_engagement_seconds',case when coalesce(sum(sessions),0)=0 then null else round(sum(engagement_seconds)/sum(sessions),1) end,
     'key_events',coalesce(sum(key_events),0)) from site),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('day',t.day,'sessions',t.sessions,'engaged_sessions',t.engaged,'page_views',t.views,'users',t.users,'key_events',t.keys,'ai_sessions',t.ai) order by t.day)
    from (select day,sum(sessions)::bigint as sessions,sum(engaged_sessions)::bigint as engaged,sum(page_views)::bigint as views,sum(users)::bigint as users,sum(key_events) as keys,
      (coalesce(sum(sessions) filter(where is_ai),0))::bigint as ai from site group by day) t),'[]'::jsonb),
  'top_pages',coalesce((select jsonb_agg(jsonb_build_object('page',t.page,'sessions',t.sessions,'engaged_sessions',t.engaged,'page_views',t.views,'users',t.users,'key_events',t.keys,
      'avg_engagement_seconds',t.avg_eng) order by t.sessions desc,t.views desc,t.page)
    from (select page,sum(sessions)::bigint as sessions,sum(engaged_sessions)::bigint as engaged,sum(page_views)::bigint as views,sum(users)::bigint as users,sum(key_events) as keys,
      case when sum(sessions)=0 then null else round(sum(engagement_seconds)/sum(sessions),1) end as avg_eng
      from pages group by page order by sum(sessions) desc,sum(page_views) desc,page limit 20) t),'[]'::jsonb),
  'by_channel',coalesce((select jsonb_agg(jsonb_build_object('channel',t.channel,'sessions',t.sessions,'engaged_sessions',t.engaged,'users',t.users,'key_events',t.keys) order by t.sessions desc,t.channel)
    from (select channel,sum(sessions)::bigint as sessions,sum(engaged_sessions)::bigint as engaged,sum(users)::bigint as users,sum(key_events) as keys
      from site group by channel order by sum(sessions) desc,channel limit 20) t),'[]'::jsonb),
  'ai_referrals',jsonb_build_object(
   'totals',(select jsonb_build_object('sessions',coalesce(sum(sessions),0)::bigint,'engaged_sessions',coalesce(sum(engaged_sessions),0)::bigint,'users',coalesce(sum(users),0)::bigint,'key_events',coalesce(sum(key_events),0),
      'share_of_sessions',case when (select coalesce(sum(sessions),0) from site)=0 then null else round(coalesce(sum(sessions),0)::numeric/(select sum(sessions) from site),4) end) from site where is_ai),
   'by_source',coalesce((select jsonb_agg(jsonb_build_object('source',t.source,'sessions',t.sessions,'engaged_sessions',t.engaged,'key_events',t.keys) order by t.sessions desc,t.source)
     from (select source,sum(sessions)::bigint as sessions,sum(engaged_sessions)::bigint as engaged,sum(key_events) as keys from site where is_ai group by source order by sum(sessions) desc,source limit 20) t),'[]'::jsonb)),
  'notes',jsonb_build_array('Totais, série diária, canais e fontes de IA usam as linhas do site (sem página); o ranking usa as linhas por página, onde uma sessão aparece em cada página visitada.',
    'Usuários = soma por dia, canal e fonte; não equivale ao total de usuários únicos do painel do Google Analytics.'),
  'last_synced_at',(select max(synced_at) from public.nexus_analytics_daily x where x.project_id=p_project)
 ) into r;
 return r;
end $$;
revoke all on function public.nexus_analytics_summary(uuid,date,date) from public,anon;
grant execute on function public.nexus_analytics_summary(uuid,date,date) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 7. RPC nexus_content_performance: por ÁREA (wordpress_article_index.topic_cluster; analysis_version=1000 = classificação por palavras-chave).
-- Junção por caminho da URL (host ignorado, barra final ignorada, minúsculas): GSC (source='gsc') e GA4 (linhas por página) com o índice.
-- Só artigos publicados do índice; um caminho aparece uma vez (o de menor wp_post_id). Páginas com tráfego sem artigo no índice vão para `unmatched`
-- (`{count, items}`: o total e até 50 itens de cada lado). Até 10 páginas por área (só as com algum tráfego, ordenadas por cliques GSC e sessões GA4).
-- security invoker: o RLS de quem chama vale (wordpress_article_index é do usuário dono; a Edge Function chama com service_role após autorizar).
-- ---------------------------------------------------------------------------
create or replace function public.nexus_content_performance(p_project uuid,p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_to date:=coalesce(p_to,(now() at time zone 'utc')::date);
 v_from date:=coalesce(p_from,coalesce(p_to,(now() at time zone 'utc')::date)-27);
 r jsonb;
begin
 if v_from>v_to or v_to-v_from>366 then raise exception 'period_invalid'; end if;
 with art as (
  select distinct on (public.nexus_url_path(i.wp_post_url)) i.id,i.wp_post_title as title,i.wp_post_url as url,public.nexus_url_path(i.wp_post_url) as path,
   coalesce(nullif(btrim(i.topic_cluster),''),'nao-classificado') as area,(i.analysis_version=1000) as heuristic
  from public.wordpress_article_index i
  where i.project_id=p_project and coalesce(i.wp_post_status,'publish') in ('publish','published') and coalesce(i.wp_post_url,'')<>''
  order by public.nexus_url_path(i.wp_post_url),i.wp_post_id,i.id
 ), g as (
  select public.nexus_url_path(s.page) as path,min(s.page) as page,sum(s.clicks)::bigint as clicks,sum(s.impressions)::bigint as impressions,
   sum(s.position*s.impressions) filter(where s.position>0) as pw,sum(s.impressions) filter(where s.position>0) as pi
  from public.nexus_search_performance s
  where s.project_id=p_project and s.source='gsc' and s.page<>'' and s.day between v_from and v_to group by 1
 ), a as (
  select public.nexus_url_path(d.page) as path,min(d.page) as page,sum(d.sessions)::bigint as sessions,sum(d.engaged_sessions)::bigint as engaged,sum(d.key_events) as keys,
   (coalesce(sum(d.sessions) filter(where d.is_ai),0))::bigint as ai
  from public.nexus_analytics_daily d
  where d.project_id=p_project and d.page<>'' and d.day between v_from and v_to group by 1
 ), m as (
  select art.id,art.title,art.url,art.path,art.area,art.heuristic,coalesce(g.clicks,0) as clicks,coalesce(g.impressions,0) as impressions,g.pw,g.pi,
   coalesce(a.sessions,0) as sessions,coalesce(a.engaged,0) as engaged,coalesce(a.keys,0) as keys,coalesce(a.ai,0) as ai
  from art left join g on g.path=art.path left join a on a.path=art.path
 ), areas as (
  select area,count(*)::int as articles,(count(*) filter(where heuristic))::int as heur,sum(clicks)::bigint as clicks,sum(impressions)::bigint as impressions,
   sum(pw) as pw,sum(pi) as pi,sum(sessions)::bigint as sessions,sum(engaged)::bigint as engaged,sum(keys) as keys,sum(ai)::bigint as ai
  from m group by area
 ), ug as (
  select g.* from g where not exists(select 1 from art where art.path=g.path)
 ), ua as (
  select a.* from a where not exists(select 1 from art where art.path=a.path)
 )
 select jsonb_build_object(
  'period',jsonb_build_object('from',v_from,'to',v_to),
  'areas',coalesce((select jsonb_agg(jsonb_build_object(
     'area',x.area,'articles',x.articles,'heuristic_articles',x.heur,
     'gsc',jsonb_build_object('clicks',x.clicks,'impressions',x.impressions,'ctr',case when x.impressions=0 then null else round(x.clicks::numeric/x.impressions,4) end,'position',round(x.pw/nullif(x.pi,0),2)),
     'ga4',jsonb_build_object('sessions',x.sessions,'engaged_sessions',x.engaged,'key_events',x.keys,'ai_sessions',x.ai),
     'top_pages',coalesce((select jsonb_agg(jsonb_build_object('url',t.url,'title',t.title,
         'gsc',jsonb_build_object('clicks',t.clicks,'impressions',t.impressions,'ctr',case when t.impressions=0 then null else round(t.clicks::numeric/t.impressions,4) end,'position',round(t.pw/nullif(t.pi,0),2)),
         'ga4',jsonb_build_object('sessions',t.sessions,'engaged_sessions',t.engaged,'key_events',t.keys,'ai_sessions',t.ai)) order by t.clicks desc,t.sessions desc,t.title)
       from (select * from m where m.area=x.area and (m.clicks+m.impressions+m.sessions)>0 order by m.clicks desc,m.sessions desc,m.title limit 10) t),'[]'::jsonb)
    ) order by x.clicks desc,x.sessions desc,x.area) from areas x),'[]'::jsonb),
  'unmatched',jsonb_build_object(
   'gsc_pages',jsonb_build_object('count',(select count(*)::int from ug),'items',coalesce((select jsonb_agg(jsonb_build_object('page',t.page,'clicks',t.clicks,'impressions',t.impressions,'ctr',case when t.impressions=0 then null else round(t.clicks::numeric/t.impressions,4) end,'position',round(t.pw/nullif(t.pi,0),2)) order by t.clicks desc,t.impressions desc,t.page)
     from (select * from ug order by clicks desc,impressions desc,page limit 50) t),'[]'::jsonb)),
   'ga4_pages',jsonb_build_object('count',(select count(*)::int from ua),'items',coalesce((select jsonb_agg(jsonb_build_object('page',t.page,'sessions',t.sessions,'engaged_sessions',t.engaged,'key_events',t.keys,'ai_sessions',t.ai) order by t.sessions desc,t.page)
     from (select * from ua order by sessions desc,page limit 50) t),'[]'::jsonb))),
  'analysis_version',case when exists(select 1 from art where heuristic) then 1000 end,
  'classification',jsonb_build_object('total_articles',(select count(*)::int from art),'heuristic_articles',(select count(*)::int from art where heuristic),'method','keywords'),
  'notes',to_jsonb(array_remove(array[
    'A junção usa o caminho da URL (endereço do site ignorado, barra final ignorada, minúsculas).',
    case when exists(select 1 from art where heuristic) then 'Áreas classificadas por palavras-chave (índice derivado do banco, analysis_version 1000); não é revisão jurídica.' end,
    case when not exists(select 1 from art) then 'O índice de conteúdos deste projeto está vazio: não há artigos para agrupar por área.' end,
    case when exists(select 1 from ug) or exists(select 1 from ua) then 'Há páginas com tráfego sem correspondência no índice de conteúdos; veja "unmatched".' end
   ],null))
 ) into r;
 return r;
end $$;
revoke all on function public.nexus_content_performance(uuid,date,date) from public,anon;
grant execute on function public.nexus_content_performance(uuid,date,date) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 8. Auditoria: estatísticas por projeto com GA4 e índice de conteúdos; marca de sincronização aceita `ga4`.
-- (mesma função de 20261112140000 + ga4_property_id, ga4 e content_index; o invólucro public.* não muda)
-- ---------------------------------------------------------------------------
create or replace function private.nexus_audit_project_stats(p_org uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r jsonb:='[]'::jsonb; p record; v_settings jsonb; v_search jsonb; v_src text; v_rows int; v_last date; v_synced timestamptz; v_mark jsonb; v_mark_at timestamptz;
 v_has_perf boolean:=to_regclass('public.nexus_search_performance') is not null;
 v_ga4 jsonb; v_content jsonb; v_idx_total int; v_idx_avg numeric; v_idx_unclassified int;
begin
 select settings into v_settings from public.nexus_programs where organization_id=p_org;
 for p in select id,commercial_info from public.projects where organization_id=p_org order by created_at desc limit 100 loop
  v_search:='{}'::jsonb;
  foreach v_src in array array['gsc','bing'] loop
   v_rows:=0; v_last:=null; v_synced:=null;
   if v_has_perf then
    execute 'select max(day),max(synced_at),(select count(*)::int from (select 1 from public.nexus_search_performance where project_id=$1 and source=$2 limit 1000) c) from public.nexus_search_performance where project_id=$1 and source=$2'
     into v_last,v_synced,v_rows using p.id,v_src;
   end if;
   v_mark:=coalesce(v_settings #> array['audit_sync',p.id::text,v_src],'{}'::jsonb);
   v_mark_at:=public.nexus_safe_timestamptz(v_mark->>'last_sync_at');
   v_search:=v_search||jsonb_build_object(v_src,jsonb_build_object('rows',coalesce(v_rows,0),'last_day',v_last,
    'last_synced_at',greatest(v_mark_at,v_synced),'last_full_sync_at',v_mark->>'last_full_sync_at'));
  end loop;
  -- GA4
  select max(day),max(synced_at),(select count(*)::int from (select 1 from public.nexus_analytics_daily where project_id=p.id limit 1000) c)
   into v_last,v_synced,v_rows from public.nexus_analytics_daily where project_id=p.id;
  v_mark:=coalesce(v_settings #> array['audit_sync',p.id::text,'ga4'],'{}'::jsonb);
  v_mark_at:=public.nexus_safe_timestamptz(v_mark->>'last_sync_at');
  v_ga4:=jsonb_build_object('rows',coalesce(v_rows,0),'last_day',v_last,'last_synced_at',greatest(v_mark_at,v_synced),'last_full_sync_at',v_mark->>'last_full_sync_at');
  -- Índice de conteúdos publicados (links internos e áreas não classificadas)
  select count(*)::int,round(avg(i.internal_links_count),2),(count(*) filter(where nullif(btrim(coalesce(i.topic_cluster,'')),'') is null or i.topic_cluster='nao-classificado'))::int
   into v_idx_total,v_idx_avg,v_idx_unclassified
   from public.wordpress_article_index i where i.project_id=p.id and coalesce(i.wp_post_status,'publish') in ('publish','published');
  v_content:=jsonb_build_object('total',coalesce(v_idx_total,0),'internal_links_avg',v_idx_avg,'unclassified',coalesce(v_idx_unclassified,0));
  r:=r||jsonb_build_array(jsonb_build_object(
   'project_id',p.id,
   'ga4_property_id',nullif(btrim(coalesce(p.commercial_info->>'ga4_property_id','')),''),
   'prompt_sets',(select count(*)::int from public.nexus_prompt_sets s where s.project_id=p.id),
   'prompts',(select count(*)::int from public.nexus_prompts x where x.project_id=p.id and x.active),
   'last_observation_at',(select max(o.updated_at) from public.nexus_operations o where o.project_id=p.id and o.kind in ('serp','ai_observation') and o.status='succeeded'),
   'site_key',(select jsonb_build_object('site_id',k.site_id,'created_at',k.created_at,'last_batch_at',k.last_batch_at) from public.nexus_site_keys k where k.project_id=p.id),
   'search',v_search,'ga4',v_ga4,'content_index',v_content));
 end loop;
 return r;
end $$;

create or replace function private.nexus_audit_mark_sync(p_org uuid,p_project uuid,p_source text,p_full boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare v_now text:=to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 if p_source not in ('gsc','bing','ga4') then raise exception 'invalid_source'; end if;
 if not exists(select 1 from public.projects where id=p_project and organization_id=p_org) then raise exception 'project_forbidden'; end if;
 update public.nexus_programs set settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('audit_sync',
   coalesce(settings->'audit_sync','{}'::jsonb)||jsonb_build_object(p_project::text,
    coalesce(settings->'audit_sync'->(p_project::text),'{}'::jsonb)||jsonb_build_object(p_source,
     coalesce(settings->'audit_sync'->(p_project::text)->p_source,'{}'::jsonb)||jsonb_build_object('last_sync_at',v_now)
      ||case when p_full then jsonb_build_object('last_full_sync_at',v_now) else '{}'::jsonb end)))
 where organization_id=p_org;
end $$;

-- ---------------------------------------------------------------------------
-- 9. nexus_project_integrations_set: grava ga4_property_id / gsc_property em projects.commercial_info sem apagar outras chaves.
-- Parâmetros *_set indicam "alterar esta chave"; texto vazio remove. A mesma propriedade GA4 não pode estar em dois projetos da organização
-- (`ga4_property_already_used`); trava consultiva por organização torna a checagem atômica. Só service_role (a Edge Function prova antes o gestor).
-- ---------------------------------------------------------------------------
create or replace function private.nexus_project_integrations_set(p_org uuid,p_project uuid,p_ga4 text,p_set_ga4 boolean,p_gsc text,p_set_gsc boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_info jsonb; v_ga4 text:=nullif(btrim(coalesce(p_ga4,'')),''); v_gsc text:=nullif(btrim(coalesce(p_gsc,'')),'');
begin
 perform pg_advisory_xact_lock(hashtextextended('nexus_project_integrations:'||p_org::text,0));
 select commercial_info into v_info from public.projects where id=p_project and organization_id=p_org for update;
 if not found then raise exception 'project_forbidden'; end if;
 if jsonb_typeof(v_info)<>'object' then raise exception 'commercial_info_invalid'; end if;
 if coalesce(p_set_ga4,false) then
  if v_ga4 is null then
   v_info:=v_info-'ga4_property_id';
  else
   if v_ga4 !~ '^[0-9]{5,15}$' then raise exception 'ga4_property_invalid'; end if;
   if exists(select 1 from public.projects x where x.organization_id=p_org and x.id<>p_project and x.commercial_info->>'ga4_property_id'=v_ga4) then raise exception 'ga4_property_already_used'; end if;
   v_info:=v_info||jsonb_build_object('ga4_property_id',v_ga4);
  end if;
 end if;
 if coalesce(p_set_gsc,false) then
  if v_gsc is null then
   v_info:=v_info-'gsc_property';
  else
   if char_length(v_gsc)>200 then raise exception 'gsc_property_invalid'; end if;
   v_info:=v_info||jsonb_build_object('gsc_property',v_gsc);
  end if;
 end if;
 update public.projects set commercial_info=v_info where id=p_project;
 return jsonb_build_object('ga4_property_id',v_info->>'ga4_property_id','gsc_property',v_info->>'gsc_property');
end $$;
create or replace function public.nexus_project_integrations_set(p_org uuid,p_project uuid,p_ga4 text,p_set_ga4 boolean,p_gsc text,p_set_gsc boolean)
returns jsonb language sql security invoker set search_path='' as $$select private.nexus_project_integrations_set(p_org,p_project,p_ga4,p_set_ga4,p_gsc,p_set_gsc);$$;
revoke all on function private.nexus_project_integrations_set(uuid,uuid,text,boolean,text,boolean),public.nexus_project_integrations_set(uuid,uuid,text,boolean,text,boolean) from public,anon,authenticated;
grant execute on function private.nexus_project_integrations_set(uuid,uuid,text,boolean,text,boolean),public.nexus_project_integrations_set(uuid,uuid,text,boolean,text,boolean) to service_role;
