-- NEXUS · Visibilidade (Zica Visibility Index), bloco V1, backend (13/11/2026).
-- Nada aqui chama serviço pago. Idempotente: pode ser reaplicada. Depende só do bloco do Observatório (20261112120000): nexus_operations,
-- nexus_citations, nexus_competitor_mentions, nexus_url_host, nexus_safe_timestamptz, is_organization_member. Não depende da migração do GA4.
--
-- O que esta migração faz
--  1. public.nexus_competitors: concorrentes cadastrados por projeto (RLS: membro lê; escrita só service_role pela Edge Function nexus-visibility,
--     que exige gestor). Limite de 100 por projeto e coerência organização x projeto garantidos por gatilho (atômico, com trava consultiva).
--  2. public.nexus_vis_flag: lê uma flag booleana de um JSON aceitando vários nomes de chave (`mentioned` e `rdm_mentioned`, `cited` e `rdm_cited`).
--     Motivo (achado na leitura do banco em 13/11): as 20 observações manuais guardam `output.rdm_mentioned` / `output.rdm_cited`, e o resumo
--     antigo (nexus_observatory_summary) só lê `output.mentioned` / `output.cited`.
--  3. public.nexus_visibility_observations: devolve, em UM jsonb, as observações do período já com citações e concorrentes (não há teto de 1.000
--     linhas do PostgREST). Só service_role executa (o portão de acesso é a Edge Function).
--  4. public.nexus_visibility_history: histórico de uma pergunta (com o texto da resposta guardado). Só service_role.
--  As sugestões de concorrentes NÃO são gravadas: a ação `competitors` as calcula na leitura (nada de semeadura, nada a desfazer).
--
-- Reversão (manual, na ordem inversa; os dados novos são só desta migração):
--   drop function if exists public.nexus_visibility_history(uuid,text,text[],int), public.nexus_visibility_observations(uuid,date,date,text[],text,int),
--     public.nexus_vis_flag(jsonb,text[]);
--   drop trigger if exists nexus_competitors_guard on public.nexus_competitors;
--   drop function if exists private.nexus_competitors_guard();
--   drop table if exists public.nexus_competitors;
--   drop function if exists public.nexus_domains_valid(text[]);
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. Concorrentes
-- ---------------------------------------------------------------------------
-- Até 10 domínios, cada um em minúsculas, sem protocolo/caminho/www, sem repetição. Função pura (usada no CHECK).
create or replace function public.nexus_domains_valid(p_domains text[])
returns boolean language sql immutable set search_path='' as $$
 select p_domains is not null
  and coalesce(array_length(p_domains,1),0)<=10
  and not exists(select 1 from unnest(p_domains) d where d is null or length(d)>253 or d !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$')
  and (select count(*) from unnest(p_domains) d)=(select count(distinct d) from unnest(p_domains) d);
$$;
revoke all on function public.nexus_domains_valid(text[]) from public,anon,authenticated;
grant execute on function public.nexus_domains_valid(text[]) to service_role;

create table if not exists public.nexus_competitors (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id) on delete cascade,
 name text not null check(char_length(name) between 2 and 160 and name=btrim(name)),
 domains text[] not null default '{}' check(public.nexus_domains_valid(domains)),
 kind text not null default 'escritorio' check(kind in ('escritorio','advogado_individual','portal','outro')),
 status text not null default 'suggested' check(status in ('suggested','tracked','ignored')),
 source text not null default 'manual' check(source in ('manual','auto_observation')),
 created_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists nexus_competitors_project_name_uq on public.nexus_competitors(project_id,lower(name));
create index if not exists nexus_competitors_project_status_idx on public.nexus_competitors(project_id,status);
create index if not exists nexus_competitors_org_idx on public.nexus_competitors(organization_id);

-- Coerência organização x projeto, limite de 100 por projeto (com trava consultiva: dois inserts simultâneos não furam o teto) e updated_at.
create or replace function private.nexus_competitors_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.project_id is distinct from old.project_id or new.organization_id is distinct from old.organization_id then
  if not exists(select 1 from public.projects p where p.id=new.project_id and p.organization_id=new.organization_id) then
   raise exception 'organization_project_mismatch';
  end if;
 end if;
 if tg_op='INSERT' then
  perform pg_advisory_xact_lock(hashtextextended('nexus_competitors:'||new.project_id::text,0));
  if (select count(*) from public.nexus_competitors c where c.project_id=new.project_id)>=100 then
   raise exception 'too_many_competitors';
  end if;
 end if;
 new.updated_at:=now();
 return new;
end $$;
revoke all on function private.nexus_competitors_guard() from public,anon,authenticated;
drop trigger if exists nexus_competitors_guard on public.nexus_competitors;
create trigger nexus_competitors_guard before insert or update on public.nexus_competitors
 for each row execute function private.nexus_competitors_guard();

alter table public.nexus_competitors enable row level security;
revoke all on public.nexus_competitors from public,anon,authenticated;
-- Membros leem, exceto `created_by` (quem cadastrou não é assunto do cliente). Escrita só service_role.
grant select(id,organization_id,project_id,name,domains,kind,status,source,created_at,updated_at) on public.nexus_competitors to authenticated;
grant all on public.nexus_competitors to service_role;
drop policy if exists nexus_competitor_read on public.nexus_competitors;
create policy nexus_competitor_read on public.nexus_competitors for select to authenticated using(public.is_organization_member(organization_id));

-- ---------------------------------------------------------------------------
-- 2. Flag booleana com várias chaves possíveis (a primeira que for 'true' ou 'false' vale; nenhuma = null = "não informado")
-- ---------------------------------------------------------------------------
create or replace function public.nexus_vis_flag(p_json jsonb,p_keys text[])
returns boolean language plpgsql immutable set search_path='' as $$
declare k text; v text;
begin
 foreach k in array p_keys loop
  v:=lower(coalesce(p_json->>k,''));
  if v in ('true','false') then return v::boolean; end if;
 end loop;
 return null;
end $$;
revoke all on function public.nexus_vis_flag(jsonb,text[]) from public,anon,authenticated;
grant execute on function public.nexus_vis_flag(jsonb,text[]) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Observações do período (uma linha por observação válida: status 'succeeded', kind ai_observation|serp)
-- Período em UTC e INCLUSIVO nas duas pontas (padrão: últimos 28 dias; no máximo 800 dias). Mais recentes primeiro; teto p_limit (<= 20000):
-- se houver mais, `truncated` = true e as mais antigas ficam de fora. NÃO devolve `output.raw` nem observer/evidence_path (nada técnico).
-- Risco de personalização: output/input.personalization_risk = true OU sessão iniciada na conta do titular (session_state 'logged_in...').
-- own_aliases = nomes que o observador registrou como variações da marca (input.variants) + nome do projeto; own_hosts = site do projeto.
-- ---------------------------------------------------------------------------
create or replace function public.nexus_visibility_observations(p_project uuid,p_from date default null,p_to date default null,p_engines text[] default null,p_topic text default null,p_limit int default 20000)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_to date:=coalesce(p_to,(now() at time zone 'utc')::date);
 v_from date:=coalesce(p_from,coalesce(p_to,(now() at time zone 'utc')::date)-27);
 v_lim int:=least(greatest(coalesce(p_limit,20000),1),20000);
 v_start timestamptz; v_end timestamptz; r jsonb;
begin
 if v_from>v_to or v_to-v_from>800 then raise exception 'period_invalid'; end if;
 v_start:=(v_from::timestamp at time zone 'utc');
 v_end:=((v_to+1)::timestamp at time zone 'utc');
 with ops as (
  select o.id,o.input,o.output,
   coalesce(nullif(o.input->>'engine',''),case o.kind when 'serp' then 'google_serp' else 'chatgpt_api' end) as engine,
   nullif(o.input->>'topic','') as topic,
   coalesce(public.nexus_safe_timestamptz(o.output->>'collected_at'),public.nexus_safe_timestamptz(o.input->>'observed_at'),o.updated_at) as observed_at
  from public.nexus_operations o
  where o.project_id=p_project and o.kind in ('ai_observation','serp') and o.status='succeeded'
 ), sel0 as (
  select * from ops
  where observed_at>=v_start and observed_at<v_end and (p_engines is null or engine=any(p_engines)) and (p_topic is null or topic=p_topic)
  order by observed_at desc,id limit v_lim+1
 ), sel as (
  select s.*,row_number() over (order by s.observed_at desc,s.id) as rn from sel0 s
 )
 select jsonb_build_object(
  'period',jsonb_build_object('from',v_from,'to',v_to),
  'truncated',(select count(*) from sel0)>v_lim,
  'observations',coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'engine',s.engine,
    'country',lower(nullif(s.input->>'country','')),'language',nullif(s.input->>'language',''),
    'query',nullif(btrim(s.input->>'query'),''),'topic',s.topic,'intent',nullif(s.input->>'intent',''),
    'repetition',case when (s.input->>'repetition') ~ '^\d{1,3}$' then (s.input->>'repetition')::int end,
    'observed_at',s.observed_at,
    'mentioned',public.nexus_vis_flag(s.output,array['mentioned','brand_mentioned','rdm_mentioned']),
    'cited',public.nexus_vis_flag(s.output,array['cited','brand_cited','rdm_cited']),
    'personalization_risk',coalesce(public.nexus_vis_flag(s.output,array['personalization_risk']),public.nexus_vis_flag(s.input,array['personalization_risk']),false)
      or coalesce(s.output->>'session_state',s.input->>'session_state','') ~* '^logged_in',
    'citations',coalesce((select jsonb_agg(jsonb_build_object('host',c.host,'url',left(c.url,500),'position',c.position,'is_own',c.is_own) order by c.position nulls last,c.id)
       from public.nexus_citations c where c.operation_id=s.id),'[]'::jsonb),
    'competitors',coalesce((select jsonb_agg(jsonb_build_object('name',m.competitor_name,'host',m.competitor_host,'source',m.source) order by m.id)
       from public.nexus_competitor_mentions m where m.operation_id=s.id),'[]'::jsonb)
   ) order by s.observed_at desc,s.id) from sel s where s.rn<=v_lim),'[]'::jsonb),
  'own_aliases',coalesce((select jsonb_agg(x.a order by x.a) from (
     select distinct a from (
      select btrim(v.t) as a from public.nexus_operations o2,jsonb_array_elements_text(case when jsonb_typeof(o2.input->'variants')='array' then o2.input->'variants' else '[]'::jsonb end) as v(t)
       where o2.project_id=p_project and o2.kind in ('ai_observation','serp')
      union select btrim(p.name) from public.projects p where p.id=p_project
     ) z where a is not null and a<>'' and length(a)<=120 order by a limit 50) x),'[]'::jsonb),
  'own_hosts',coalesce((select jsonb_agg(h order by h) from (
     select public.nexus_url_host(p.wordpress_url) as h from public.projects p where p.id=p_project
     union select public.nexus_url_host('https://'||p.domain) from public.projects p where p.id=p_project and coalesce(p.domain,'')<>''
    ) hs where h is not null),'[]'::jsonb)
 ) into r;
 return r;
end $$;
revoke all on function public.nexus_visibility_observations(uuid,date,date,text[],text,int) from public,anon,authenticated;
grant execute on function public.nexus_visibility_observations(uuid,date,date,text[],text,int) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Histórico de uma pergunta (texto exato, comparado sem espaços nas pontas), mais recentes primeiro, até 100 itens.
-- `answer_excerpt` é o texto da resposta que o observador guardou (até 4.000 caracteres; vazio vira null).
-- ---------------------------------------------------------------------------
create or replace function public.nexus_visibility_history(p_project uuid,p_query text,p_engines text[] default null,p_limit int default 50)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_lim int:=least(greatest(coalesce(p_limit,50),1),100); r jsonb;
begin
 if p_query is null or btrim(p_query)='' then raise exception 'query_required'; end if;
 with ops as (
  select o.id,o.input,o.output,
   coalesce(nullif(o.input->>'engine',''),case o.kind when 'serp' then 'google_serp' else 'chatgpt_api' end) as engine,
   coalesce(public.nexus_safe_timestamptz(o.output->>'collected_at'),public.nexus_safe_timestamptz(o.input->>'observed_at'),o.updated_at) as observed_at
  from public.nexus_operations o
  where o.project_id=p_project and o.kind in ('ai_observation','serp') and o.status='succeeded' and btrim(o.input->>'query')=btrim(p_query)
 ), sel as (
  select * from ops where p_engines is null or engine=any(p_engines) order by observed_at desc,id limit v_lim
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'observed_at',s.observed_at,'engine',s.engine,'country',lower(nullif(s.input->>'country','')),
   'mentioned',public.nexus_vis_flag(s.output,array['mentioned','brand_mentioned','rdm_mentioned']),
   'cited',public.nexus_vis_flag(s.output,array['cited','brand_cited','rdm_cited']),
   'personalization_risk',coalesce(public.nexus_vis_flag(s.output,array['personalization_risk']),public.nexus_vis_flag(s.input,array['personalization_risk']),false)
      or coalesce(s.output->>'session_state',s.input->>'session_state','') ~* '^logged_in',
   'answer_excerpt',nullif(left(btrim(coalesce(s.output->>'answer_excerpt','')),4000),''),
   'citations',coalesce((select jsonb_agg(jsonb_build_object('host',c.host,'url',left(c.url,500),'position',c.position,'is_own',c.is_own) order by c.position nulls last,c.id)
      from public.nexus_citations c where c.operation_id=s.id),'[]'::jsonb),
   'competitors',coalesce((select jsonb_agg(jsonb_build_object('name',m.competitor_name,'host',m.competitor_host,'source',m.source) order by m.id)
      from public.nexus_competitor_mentions m where m.operation_id=s.id),'[]'::jsonb)
  ) order by s.observed_at desc,s.id),'[]'::jsonb) into r from sel s;
 return r;
end $$;
revoke all on function public.nexus_visibility_history(uuid,text,text[],int) from public,anon,authenticated;
grant execute on function public.nexus_visibility_history(uuid,text,text[],int) to service_role;
