-- NEXUS · Motores & APIs (12/11/2026): provedores, saúde, tráfego orgânico (GSC/Bing) e RPCs de leitura.
-- Nada aqui executa chamadas pagas. Idempotente: pode ser reaplicada.
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. Provedores e status da credencial (mantém tudo o que já era permitido e acrescenta os novos)
-- ---------------------------------------------------------------------------
alter table public.organization_provider_credentials drop constraint if exists organization_provider_credentials_provider_check;
alter table public.organization_provider_credentials add constraint organization_provider_credentials_provider_check
 check(provider in ('openai','anthropic','gemini','serper','perplexity','gsc','bing_webmaster','dataforseo','serpapi','brave'));
alter table public.organization_provider_credentials drop constraint if exists organization_provider_credentials_status_check;
alter table public.organization_provider_credentials add constraint organization_provider_credentials_status_check
 check(status in ('stored_unverified','active','paused','revoked','invalid','disabled'));

-- Grava/lê o segredo no Vault. Leitura continua restrita a active/stored_unverified (portão de execução).
-- secret_last_four: últimos 4 caracteres [A-Za-z0-9_-] do segredo; para o JSON do gsc usa o fim do private_key_id (identificador, não segredo).
create or replace function private.nexus_provider_secret(p_org uuid,p_actor uuid,p_provider text,p_secret text default null)
returns text language plpgsql security definer set search_path='' as $$
declare secret_name text; secret_id uuid; result text; v_last4 text;
begin
 if p_provider not in ('openai','anthropic','gemini','serper','perplexity','gsc','bing_webmaster','dataforseo','serpapi','brave') then raise exception 'unsupported_provider'; end if;
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and status='active' and role in ('owner','admin'))
 and not exists(select 1 from public.organizations where id=p_org and owner_user_id=p_actor) then raise exception 'forbidden'; end if;
 secret_name:='nexus_org_'||p_org||'_'||p_provider;
 if p_secret is not null then
   if length(p_secret)<12 or length(p_secret)>4096 then raise exception 'invalid_credential'; end if;
   if p_provider='gsc' then
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

-- Leitura para testes de saúde (sem ator: usada também pela auditoria agendada). Só service_role.
-- Inclui 'invalid' para permitir reteste depois de corrigir permissões no provedor; nunca devolve segredo de credencial pausada/revogada/desabilitada.
create or replace function private.nexus_provider_secret_read(p_org uuid,p_provider text)
returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if p_provider not in ('openai','anthropic','gemini','serper','perplexity','gsc','bing_webmaster','dataforseo','serpapi','brave') then raise exception 'unsupported_provider'; end if;
 select s.decrypted_secret into result from vault.decrypted_secrets s join public.organization_provider_credentials c on c.vault_secret_name=s.name
 where c.organization_id=p_org and c.provider=p_provider and c.status in ('active','stored_unverified','invalid');
 return result;
end $$;

-- Remove o segredo do Vault e a linha da credencial (dono/admin). Retorna true se havia credencial.
create or replace function private.nexus_provider_secret_remove(p_org uuid,p_actor uuid,p_provider text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_name text;
begin
 if p_provider not in ('openai','anthropic','gemini','serper','perplexity','gsc','bing_webmaster','dataforseo','serpapi','brave') then raise exception 'unsupported_provider'; end if;
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and status='active' and role in ('owner','admin'))
 and not exists(select 1 from public.organizations where id=p_org and owner_user_id=p_actor) then raise exception 'forbidden'; end if;
 select vault_secret_name into v_name from public.organization_provider_credentials where organization_id=p_org and provider=p_provider;
 if v_name is null then return false; end if;
 delete from vault.secrets where name=v_name;
 delete from public.organization_provider_credentials where organization_id=p_org and provider=p_provider;
 return true;
end $$;

create or replace function public.nexus_provider_secret_read(p_org uuid,p_provider text)
returns text language sql security invoker set search_path='' as $$select private.nexus_provider_secret_read(p_org,p_provider);$$;
create or replace function public.nexus_provider_secret_remove(p_org uuid,p_actor uuid,p_provider text)
returns boolean language sql security invoker set search_path='' as $$select private.nexus_provider_secret_remove(p_org,p_actor,p_provider);$$;

revoke all on function private.nexus_provider_secret(uuid,uuid,text,text),public.nexus_provider_secret(uuid,uuid,text,text),
 private.nexus_provider_secret_read(uuid,text),public.nexus_provider_secret_read(uuid,text),
 private.nexus_provider_secret_remove(uuid,uuid,text),public.nexus_provider_secret_remove(uuid,uuid,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.nexus_provider_secret(uuid,uuid,text,text),public.nexus_provider_secret(uuid,uuid,text,text),
 private.nexus_provider_secret_read(uuid,text),public.nexus_provider_secret_read(uuid,text),
 private.nexus_provider_secret_remove(uuid,uuid,text),public.nexus_provider_secret_remove(uuid,uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. nexus_provider_health: histórico dos testes de saúde (detail sem segredo; escrita só service_role)
-- Retenção: nenhuma automática. Limpeza manual sugerida:
--   delete from public.nexus_provider_health where checked_at < now() - interval '90 days';
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_provider_health (
 id bigserial primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 provider text not null check(provider in ('openai','anthropic','gemini','serper','perplexity','gsc','bing_webmaster','dataforseo','serpapi','brave')),
 checked_at timestamptz not null default now(),
 ok boolean not null,
 latency_ms int check(latency_ms is null or latency_ms>=0),
 http_status int,
 detail text check(detail is null or char_length(detail)<=300),
 quota jsonb check(quota is null or jsonb_typeof(quota)='object'),
 cost_micros int not null default 0 check(cost_micros>=0),
 triggered_by uuid
);
create index if not exists nexus_provider_health_org_provider_idx on public.nexus_provider_health(organization_id,provider,checked_at desc);
alter table public.nexus_provider_health enable row level security;
revoke all on public.nexus_provider_health from public,anon,authenticated;
grant select on public.nexus_provider_health to authenticated;
grant all on public.nexus_provider_health to service_role;
grant usage,select on sequence public.nexus_provider_health_id_seq to service_role;
drop policy if exists nexus_provider_health_read on public.nexus_provider_health;
create policy nexus_provider_health_read on public.nexus_provider_health for select to authenticated using(public.is_organization_member(organization_id));

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='nexus_provider_health') then
  alter publication supabase_realtime add table public.nexus_provider_health;
 end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. nexus_search_performance: dados reais de tráfego orgânico (GSC e Bing). Colunas de texto "not null default ''" para compor a chave única.
-- Atenção ao gravar: truncar query (500) e page (1000) — a chave única é um índice btree (limite ~2700 bytes por entrada).
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_search_performance (
 id bigserial primary key,
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id) on delete cascade,
 source text not null check(source in ('gsc','bing')),
 day date not null,
 query text not null default '',
 page text not null default '',
 country text not null default '',
 device text not null default '',
 clicks int not null default 0 check(clicks>=0),
 impressions int not null default 0 check(impressions>=0),
 ctr numeric,
 position numeric,
 synced_at timestamptz not null default now(),
 unique(project_id,source,day,query,page,country,device)
);
create index if not exists nexus_search_performance_project_day_idx on public.nexus_search_performance(project_id,day);
alter table public.nexus_search_performance enable row level security;
revoke all on public.nexus_search_performance from public,anon,authenticated;
grant select on public.nexus_search_performance to authenticated;
grant all on public.nexus_search_performance to service_role;
grant usage,select on sequence public.nexus_search_performance_id_seq to service_role;
drop policy if exists nexus_search_performance_read on public.nexus_search_performance;
create policy nexus_search_performance_read on public.nexus_search_performance for select to authenticated using(public.is_organization_member(organization_id));

-- ---------------------------------------------------------------------------
-- 4. RPC nexus_providers_overview(p_org). security invoker: o RLS de quem chama vale em todas as tabelas lidas
-- (para quem não é membro, a lista vem sem credencial/saúde/uso e o programa vem vazio). Nunca lê o segredo.
-- Uso por motor -> provedor (janela de 30 dias por updated_at; só status succeeded/failed/uncertain):
--   chatgpt_api->openai, gemini_api->gemini, claude_api->anthropic, perplexity_api->perplexity, google_serp->serper,
--   dataforseo_google|dataforseo_bing->dataforseo, serpapi_google|serpapi_bing->serpapi, brave_search->brave;
--   kind='serp' sem engine -> serper; kind='ai_observation' sem engine -> openai. Observações manuais (engines *_web etc.) não contam.
-- ---------------------------------------------------------------------------
create or replace function public.nexus_providers_overview(p_org uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r jsonb;
begin
 with catalog as (
  select p.provider,p.ord from unnest(array['gsc','bing_webmaster','serper','dataforseo','serpapi','brave','openai','gemini','anthropic','perplexity','copilot']) with ordinality as p(provider,ord)
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
-- 5. RPC nexus_search_performance_summary. security invoker. Período em UTC (padrão: últimos 28 dias).
-- Somas sobre as linhas sincronizadas (GSC omite consultas anonimizadas: pode ficar abaixo do total do painel do Google).
-- ctr = cliques/impressões; position = média ponderada por impressões ignorando linhas com position<=0 (o Bing grava 0 quando não há posição válida). Cliques de GSC e Bing são somados (buscadores distintos).
-- ---------------------------------------------------------------------------
create or replace function public.nexus_search_performance_summary(p_project uuid,p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_to date:=coalesce(p_to,(now() at time zone 'utc')::date);
 v_from date:=coalesce(p_from,coalesce(p_to,(now() at time zone 'utc')::date)-27);
 r jsonb;
begin
 with perf as (
  select s.* from public.nexus_search_performance s where s.project_id=p_project and s.day between v_from and v_to
 )
 select jsonb_build_object(
  'period',jsonb_build_object('from',v_from,'to',v_to),
  'totals',(select jsonb_build_object('clicks',coalesce(sum(clicks),0),'impressions',coalesce(sum(impressions),0),
     'ctr',case when coalesce(sum(impressions),0)=0 then null else round(sum(clicks)::numeric/sum(impressions),4) end,
     'position',round(sum(position*impressions) filter (where position>0)/nullif(sum(impressions) filter (where position>0),0),2)) from perf),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('day',t.day,'clicks',t.clicks,'impressions',t.impressions,'position',t.position) order by t.day)
    from (select day,sum(clicks)::bigint as clicks,sum(impressions)::bigint as impressions,
      round(sum(position*impressions) filter (where position>0)/nullif(sum(impressions) filter (where position>0),0),2) as position from perf group by day) t),'[]'::jsonb),
  'top_queries',coalesce((select jsonb_agg(jsonb_build_object('query',t.query,'clicks',t.clicks,'impressions',t.impressions,'ctr',t.ctr,'position',t.position) order by t.clicks desc,t.impressions desc,t.query)
    from (select query,sum(clicks)::bigint as clicks,sum(impressions)::bigint as impressions,
      case when sum(impressions)=0 then null else round(sum(clicks)::numeric/sum(impressions),4) end as ctr,
      round(sum(position*impressions) filter (where position>0)/nullif(sum(impressions) filter (where position>0),0),2) as position
      from perf where query<>'' group by query order by sum(clicks) desc,sum(impressions) desc,query limit 20) t),'[]'::jsonb),
  'top_pages',coalesce((select jsonb_agg(jsonb_build_object('page',t.page,'clicks',t.clicks,'impressions',t.impressions,'ctr',t.ctr,'position',t.position) order by t.clicks desc,t.impressions desc,t.page)
    from (select page,sum(clicks)::bigint as clicks,sum(impressions)::bigint as impressions,
      case when sum(impressions)=0 then null else round(sum(clicks)::numeric/sum(impressions),4) end as ctr,
      round(sum(position*impressions) filter (where position>0)/nullif(sum(impressions) filter (where position>0),0),2) as position
      from perf where page<>'' group by page order by sum(clicks) desc,sum(impressions) desc,page limit 20) t),'[]'::jsonb),
  'by_country',coalesce((select jsonb_agg(jsonb_build_object('country',t.country,'clicks',t.clicks,'impressions',t.impressions) order by t.clicks desc,t.impressions desc,t.country)
    from (select country,sum(clicks)::bigint as clicks,sum(impressions)::bigint as impressions from perf where country<>'' group by country order by sum(clicks) desc,sum(impressions) desc,country limit 10) t),'[]'::jsonb),
  'by_device',coalesce((select jsonb_agg(jsonb_build_object('device',t.device,'clicks',t.clicks,'impressions',t.impressions) order by t.clicks desc,t.impressions desc,t.device)
    from (select device,sum(clicks)::bigint as clicks,sum(impressions)::bigint as impressions from perf where device<>'' group by device order by sum(clicks) desc,sum(impressions) desc,device) t),'[]'::jsonb),
  'by_source',coalesce((select jsonb_agg(jsonb_build_object('source',t.source,'clicks',t.clicks,'impressions',t.impressions) order by t.source)
    from (select source,sum(clicks)::bigint as clicks,sum(impressions)::bigint as impressions from perf group by source) t),'[]'::jsonb),
  'last_synced_at',(select max(synced_at) from public.nexus_search_performance s where s.project_id=p_project)
 ) into r;
 return r;
end $$;
revoke all on function public.nexus_search_performance_summary(uuid,date,date) from public,anon;
grant execute on function public.nexus_search_performance_summary(uuid,date,date) to authenticated,service_role;
