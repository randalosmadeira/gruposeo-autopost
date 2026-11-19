-- NEXUS Observatory: prompt sets, derived citations/competitors, site signals.
-- Nothing here executes paid calls. Observations arrive manually or via prepared operations.
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Tolerant cast: returns null instead of raising (used by the fan-out trigger and the summary RPC).
create or replace function public.nexus_safe_timestamptz(p_value text)
returns timestamptz language plpgsql immutable set search_path='' as $$
begin
 if p_value is null or p_value='' then return null; end if;
 return p_value::timestamptz;
exception when others then return null;
end $$;
revoke all on function public.nexus_safe_timestamptz(text) from public,anon;
grant execute on function public.nexus_safe_timestamptz(text) to authenticated,service_role;

-- Host of a URL, lowercase, without "www.". Null when the value is not an absolute URL.
create or replace function public.nexus_url_host(p_url text)
returns text language sql immutable set search_path='' as $$
 select nullif(regexp_replace(substring(lower(btrim(p_url)) from '^[a-z][a-z0-9+.-]*://(?:[^/?#@]*@)?([^/?#:]+)'),'^www\.',''),'');
$$;
revoke all on function public.nexus_url_host(text) from public,anon;
grant execute on function public.nexus_url_host(text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 1.1 nexus_prompt_sets
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_prompt_sets (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 name text not null check(char_length(name) between 1 and 120),
 description text,
 markets jsonb not null default '[]'::jsonb check(jsonb_typeof(markets)='array'),
 engines text[] not null default '{}',
 cadence text not null default 'manual' check(cadence in ('manual','weekly','daily')),
 status text not null default 'active' check(status in ('active','paused')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists nexus_prompt_sets_project_idx on public.nexus_prompt_sets(project_id,created_at desc);
drop trigger if exists nexus_prompt_sets_updated_at on public.nexus_prompt_sets;
create trigger nexus_prompt_sets_updated_at before update on public.nexus_prompt_sets
 for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 1.2 nexus_prompts
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_prompts (
 id uuid primary key default gen_random_uuid(),
 prompt_set_id uuid not null references public.nexus_prompt_sets(id) on delete cascade,
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id) on delete cascade,
 topic text not null,
 intent text not null default 'informational' check(intent in ('informational','discovery','transactional','international','branded')),
 query text not null check(char_length(query) between 1 and 500),
 branded boolean not null default false,
 position int not null default 0,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(prompt_set_id,query,intent)
);
create index if not exists nexus_prompts_set_idx on public.nexus_prompts(prompt_set_id,position);
create index if not exists nexus_prompts_project_idx on public.nexus_prompts(project_id);

-- ---------------------------------------------------------------------------
-- 1.3 nexus_citations (derived from nexus_operations)
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_citations (
 id bigserial primary key,
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id) on delete cascade,
 operation_id uuid not null references public.nexus_operations(id) on delete cascade,
 engine text,
 country text,
 language text,
 query text,
 topic text,
 intent text,
 url text not null,
 host text not null,
 is_own boolean not null,
 position int,
 title text,
 observed_at timestamptz not null
);
create index if not exists nexus_citations_project_observed_idx on public.nexus_citations(project_id,observed_at);
create index if not exists nexus_citations_project_host_idx on public.nexus_citations(project_id,host);
create index if not exists nexus_citations_operation_idx on public.nexus_citations(operation_id);

-- ---------------------------------------------------------------------------
-- 1.4 nexus_competitor_mentions (derived)
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_competitor_mentions (
 id bigserial primary key,
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id) on delete cascade,
 operation_id uuid not null references public.nexus_operations(id) on delete cascade,
 engine text,
 country text,
 query text,
 topic text,
 intent text,
 competitor_name text not null,
 competitor_host text,
 source text not null default 'mention' check(source in ('citation','mention','map_pack','organic')),
 observed_at timestamptz not null
);
create index if not exists nexus_competitor_mentions_project_observed_idx on public.nexus_competitor_mentions(project_id,observed_at);
create index if not exists nexus_competitor_mentions_operation_idx on public.nexus_competitor_mentions(operation_id);

-- ---------------------------------------------------------------------------
-- 1.7 nexus_site_keys (secret lives in Vault as nexus_site_<site_id>; only its sha256 is stored here)
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_site_keys (
 project_id uuid primary key references public.projects(id) on delete cascade,
 organization_id uuid not null references public.organizations(id),
 site_id text not null unique check(site_id ~ '^[a-z0-9]{12}$'),
 secret_sha256 text not null,
 allowed_origins text[] not null default '{}',
 created_at timestamptz not null default now(),
 rotated_at timestamptz,
 last_batch_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 1.8 nexus_site_signals (aggregated counters, no PII, no IP, no full UA)
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_site_signals (
 id bigserial primary key,
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id) on delete cascade,
 site_host text not null default '',
 day date not null,
 kind text not null check(kind in ('ai_bot_hit','ai_referral','search_referral','human_pageview')),
 agent text not null default '',
 path text not null default '' check(char_length(path)<=200),
 hits int not null default 0 check(hits>=0),
 unique(project_id,site_host,day,kind,agent,path)
);
create index if not exists nexus_site_signals_project_day_idx on public.nexus_site_signals(project_id,day);

-- ---------------------------------------------------------------------------
-- 1.9 nexus_signal_batches (dedupe of server batches; no pg_cron cleanup yet: delete rows older than 30 days manually)
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_signal_batches (
 site_id text not null,
 batch_id text not null,
 received_at timestamptz not null default now(),
 events int not null default 0,
 primary key(site_id,batch_id)
);
create index if not exists nexus_signal_batches_received_idx on public.nexus_signal_batches(received_at);

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.nexus_prompt_sets enable row level security;
alter table public.nexus_prompts enable row level security;
alter table public.nexus_citations enable row level security;
alter table public.nexus_competitor_mentions enable row level security;
alter table public.nexus_site_keys enable row level security;
alter table public.nexus_site_signals enable row level security;
alter table public.nexus_signal_batches enable row level security;
revoke all on public.nexus_prompt_sets,public.nexus_prompts,public.nexus_citations,public.nexus_competitor_mentions,
 public.nexus_site_keys,public.nexus_site_signals,public.nexus_signal_batches from public,anon,authenticated;
grant select on public.nexus_prompt_sets,public.nexus_prompts,public.nexus_citations,public.nexus_competitor_mentions,public.nexus_site_signals to authenticated;
-- site_keys: members read everything except the secret hash.
grant select(project_id,organization_id,site_id,allowed_origins,created_at,rotated_at,last_batch_at) on public.nexus_site_keys to authenticated;
grant all on public.nexus_prompt_sets,public.nexus_prompts,public.nexus_citations,public.nexus_competitor_mentions,
 public.nexus_site_keys,public.nexus_site_signals,public.nexus_signal_batches to service_role;
grant usage,select on sequence public.nexus_citations_id_seq,public.nexus_competitor_mentions_id_seq,public.nexus_site_signals_id_seq to service_role;
drop policy if exists nexus_prompt_set_read on public.nexus_prompt_sets;
create policy nexus_prompt_set_read on public.nexus_prompt_sets for select to authenticated using(public.is_organization_member(organization_id));
drop policy if exists nexus_prompt_read on public.nexus_prompts;
create policy nexus_prompt_read on public.nexus_prompts for select to authenticated using(public.is_organization_member(organization_id));
drop policy if exists nexus_citation_read on public.nexus_citations;
create policy nexus_citation_read on public.nexus_citations for select to authenticated using(public.is_organization_member(organization_id));
drop policy if exists nexus_competitor_mention_read on public.nexus_competitor_mentions;
create policy nexus_competitor_mention_read on public.nexus_competitor_mentions for select to authenticated using(public.is_organization_member(organization_id));
drop policy if exists nexus_site_key_read on public.nexus_site_keys;
create policy nexus_site_key_read on public.nexus_site_keys for select to authenticated using(public.is_organization_member(organization_id));
drop policy if exists nexus_site_signal_read on public.nexus_site_signals;
create policy nexus_site_signal_read on public.nexus_site_signals for select to authenticated using(public.is_organization_member(organization_id));
-- nexus_signal_batches has no organization_id: RLS on, no policy for authenticated (service_role only).

-- ---------------------------------------------------------------------------
-- Provider constraint: add perplexity (gemini already allowed) and keep the secret RPC in sync.
-- ---------------------------------------------------------------------------
alter table public.organization_provider_credentials drop constraint if exists organization_provider_credentials_provider_check;
alter table public.organization_provider_credentials add constraint organization_provider_credentials_provider_check
 check(provider in ('openai','anthropic','gemini','serper','perplexity'));

create or replace function private.nexus_provider_secret(p_org uuid,p_actor uuid,p_provider text,p_secret text default null)
returns text language plpgsql security definer set search_path='' as $$
declare secret_name text; secret_id uuid; result text;
begin
 if p_provider not in ('openai','anthropic','gemini','serper','perplexity') then raise exception 'unsupported_provider'; end if;
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and status='active' and role in ('owner','admin'))
 and not exists(select 1 from public.organizations where id=p_org and owner_user_id=p_actor) then raise exception 'forbidden'; end if;
 secret_name:='nexus_org_'||p_org||'_'||p_provider;
 if p_secret is not null then
   if length(p_secret)<12 or length(p_secret)>4096 then raise exception 'invalid_credential'; end if;
   select id into secret_id from vault.secrets where name=secret_name;
   if secret_id is null then perform vault.create_secret(p_secret,secret_name); else perform vault.update_secret(secret_id,p_secret,secret_name); end if;
   insert into public.organization_provider_credentials(organization_id,provider,vault_secret_name,secret_last_four,status,created_by)
   values(p_org,p_provider,secret_name,right(p_secret,4),'stored_unverified',p_actor)
   on conflict(organization_id,provider) do update set vault_secret_name=excluded.vault_secret_name,secret_last_four=excluded.secret_last_four,status='stored_unverified',updated_at=now();
   return 'stored_unverified';
 end if;
 select s.decrypted_secret into result from vault.decrypted_secrets s join public.organization_provider_credentials c on c.vault_secret_name=s.name
 where c.organization_id=p_org and c.provider=p_provider and c.status in ('active','stored_unverified');
 return result;
end $$;

-- ---------------------------------------------------------------------------
-- 1.5 Fan-out: nexus_operations -> nexus_citations / nexus_competitor_mentions
-- security definer so it works whoever writes the operation; never raises to the caller.
-- ---------------------------------------------------------------------------
create or replace function private.nexus_fanout_observation()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_engine text; v_country text; v_language text; v_query text; v_topic text; v_intent text;
 v_observed timestamptz; v_own text[]:='{}'; v_h text; item jsonb; ord int; v_url text; v_title text;
 v_name text; v_host text; v_source text; arr jsonb;
begin
 if new.status is distinct from 'succeeded' or new.kind not in ('ai_observation','serp') then return new; end if;
 begin
  delete from public.nexus_citations where operation_id=new.id;
  delete from public.nexus_competitor_mentions where operation_id=new.id;
  v_engine:=coalesce(nullif(new.input->>'engine',''),case new.kind when 'serp' then 'google_serp' else 'chatgpt_api' end);
  v_country:=lower(nullif(new.input->>'country',''));
  v_language:=nullif(new.input->>'language','');
  v_query:=nullif(new.input->>'query','');
  v_topic:=nullif(new.input->>'topic','');
  v_intent:=nullif(new.input->>'intent','');
  v_observed:=coalesce(public.nexus_safe_timestamptz(new.output->>'collected_at'),public.nexus_safe_timestamptz(new.input->>'observed_at'),new.updated_at);
  -- own hosts: project site (wordpress_url and domain) + explicit input.own_hosts
  for v_h in select public.nexus_url_host(s.u) from (
    select p.wordpress_url as u from public.projects p where p.id=new.project_id
    union all select 'https://'||p.domain from public.projects p where p.id=new.project_id and coalesce(p.domain,'')<>''
   ) s loop
   if v_h is not null then v_own:=v_own||v_h; end if;
  end loop;
  if jsonb_typeof(new.input->'own_hosts')='array' then
   for v_h in select regexp_replace(lower(btrim(t.x)),'^www\.','') from jsonb_array_elements_text(new.input->'own_hosts') as t(x) loop
    if v_h<>'' then v_own:=v_own||v_h; end if;
   end loop;
  end if;

  -- citations: output.citations (ai + serp) and output.organic (serp)
  for arr in select new.output->'citations' union all select new.output->'organic' loop
   if arr is null or jsonb_typeof(arr)<>'array' then continue; end if;
   ord:=0;
   for item in select t.i from jsonb_array_elements(arr) as t(i) loop
    ord:=ord+1;
    if jsonb_typeof(item)='string' then v_url:=item #>> '{}'; v_title:=null;
    elsif jsonb_typeof(item)='object' then v_url:=item->>'url'; v_title:=left(item->>'title',500);
    else continue; end if;
    v_host:=public.nexus_url_host(v_url);
    if v_host is null then continue; end if;
    insert into public.nexus_citations(organization_id,project_id,operation_id,engine,country,language,query,topic,intent,url,host,is_own,position,title,observed_at)
    values(new.organization_id,new.project_id,new.id,v_engine,v_country,v_language,v_query,v_topic,v_intent,left(v_url,2000),v_host,v_host=any(v_own),
     case when jsonb_typeof(item)='object' and (item->>'position') ~ '^\d{1,6}$' then (item->>'position')::int else ord end,v_title,v_observed);
   end loop;
  end loop;

  -- competitors: strings or {name,host?,source?}
  if jsonb_typeof(new.output->'competitors')='array' then
   for item in select t.i from jsonb_array_elements(new.output->'competitors') as t(i) loop
    if jsonb_typeof(item)='string' then v_name:=btrim(item #>> '{}'); v_host:=null; v_source:='mention';
    elsif jsonb_typeof(item)='object' then
     v_name:=btrim(coalesce(item->>'name',''));
     v_host:=coalesce(public.nexus_url_host(item->>'host'),nullif(regexp_replace(lower(btrim(coalesce(item->>'host',''))),'^www\.',''),''));
     v_source:=case when item->>'source' in ('citation','mention','map_pack','organic') then item->>'source' else 'mention' end;
    else continue; end if;
    if v_name is null or v_name='' then continue; end if;
    insert into public.nexus_competitor_mentions(organization_id,project_id,operation_id,engine,country,query,topic,intent,competitor_name,competitor_host,source,observed_at)
    values(new.organization_id,new.project_id,new.id,v_engine,v_country,v_query,v_topic,v_intent,left(v_name,200),left(v_host,255),v_source,v_observed);
   end loop;
  end if;
 exception when others then
  raise warning 'nexus_fanout_observation failed for operation %: %',new.id,sqlerrm;
 end;
 return new;
end $$;
revoke all on function private.nexus_fanout_observation() from public,anon,authenticated;

drop trigger if exists nexus_fanout_observation on public.nexus_operations;
create trigger nexus_fanout_observation after insert or update of status,output on public.nexus_operations
 for each row execute function private.nexus_fanout_observation();

-- ---------------------------------------------------------------------------
-- 1.10 RPCs
-- ---------------------------------------------------------------------------
-- Stores/rotates the site secret in Vault (nexus_site_<site_id>) and the non-reversible sha256 in nexus_site_keys.
-- p_origins null keeps the current origins on rotation.
create or replace function private.nexus_site_key_store(p_org uuid,p_project uuid,p_site_id text,p_secret text,p_origins text[] default null)
returns void language plpgsql security definer set search_path='' as $$
declare secret_name text; secret_id uuid;
begin
 if p_site_id !~ '^[a-z0-9]{12}$' then raise exception 'invalid_site_id'; end if;
 if length(coalesce(p_secret,''))<32 or length(p_secret)>256 then raise exception 'invalid_secret'; end if;
 if not exists(select 1 from public.projects where id=p_project and organization_id=p_org) then raise exception 'project_forbidden'; end if;
 secret_name:='nexus_site_'||p_site_id;
 select id into secret_id from vault.secrets where name=secret_name;
 if secret_id is null then perform vault.create_secret(p_secret,secret_name); else perform vault.update_secret(secret_id,p_secret,secret_name); end if;
 insert into public.nexus_site_keys(project_id,organization_id,site_id,secret_sha256,allowed_origins)
 values(p_project,p_org,p_site_id,encode(sha256(convert_to(p_secret,'UTF8')),'hex'),coalesce(p_origins,'{}'))
 on conflict(project_id) do update set secret_sha256=excluded.secret_sha256,rotated_at=now(),
  allowed_origins=coalesce(p_origins,public.nexus_site_keys.allowed_origins);
end $$;

-- Clear secret for HMAC verification by the zica-signals function (service_role only).
create or replace function private.nexus_site_secret(p_site_id text)
returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if not exists(select 1 from public.nexus_site_keys where site_id=p_site_id) then return null; end if;
 select s.decrypted_secret into result from vault.decrypted_secrets s where s.name='nexus_site_'||p_site_id;
 return result;
end $$;

-- Upserts aggregated counters. p_batch_id null/empty = browser beacon (no dedupe row); otherwise a duplicate batch is ignored.
create or replace function private.nexus_record_signals(p_site_id text,p_batch_id text,p_events jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare k public.nexus_site_keys; n int; used int;
begin
 select * into k from public.nexus_site_keys where site_id=p_site_id;
 if k.project_id is null then raise exception 'site_unknown'; end if;
 if jsonb_typeof(p_events) is distinct from 'array' then raise exception 'events_invalid'; end if;
 if jsonb_array_length(p_events)>500 then raise exception 'too_many_events'; end if;
 if coalesce(p_batch_id,'')<>'' then
  insert into public.nexus_signal_batches(site_id,batch_id,events) values(p_site_id,p_batch_id,jsonb_array_length(p_events)) on conflict do nothing;
  get diagnostics n=row_count;
  if n=0 then return jsonb_build_object('duplicate',true,'accepted',0); end if;
 end if;
 with ev as (
  select coalesce(left(t.e->>'site_host',253),'') as site_host,(t.e->>'day')::date as day,t.e->>'kind' as kind,
   coalesce(left(t.e->>'agent',64),'') as agent,
   coalesce(left(split_part(split_part(coalesce(t.e->>'path',''),'?',1),'#',1),200),'') as path,
   least(greatest(coalesce((t.e->>'hits')::int,1),0),100000) as hits
  from jsonb_array_elements(p_events) as t(e)
  where t.e->>'kind' in ('ai_bot_hit','ai_referral','search_referral','human_pageview')
 ), agg as (
  select site_host,day,kind,agent,path,sum(hits)::int as hits from ev group by 1,2,3,4,5
 )
 insert into public.nexus_site_signals(organization_id,project_id,site_host,day,kind,agent,path,hits)
 select k.organization_id,k.project_id,agg.site_host,agg.day,agg.kind,agg.agent,agg.path,agg.hits from agg
 on conflict(project_id,site_host,day,kind,agent,path) do update set hits=least(public.nexus_site_signals.hits+excluded.hits,2000000000);
 get diagnostics used=row_count;
 update public.nexus_site_keys set last_batch_at=now() where project_id=k.project_id;
 return jsonb_build_object('duplicate',false,'accepted',jsonb_array_length(p_events),'rows',used);
end $$;

-- Thin invoker wrappers so supabase-js (service_role) can reach the private bodies.
create or replace function public.nexus_site_key_store(p_org uuid,p_project uuid,p_site_id text,p_secret text,p_origins text[] default null)
returns void language sql security invoker set search_path='' as $$select private.nexus_site_key_store(p_org,p_project,p_site_id,p_secret,p_origins);$$;
create or replace function public.nexus_site_secret(p_site_id text)
returns text language sql security invoker set search_path='' as $$select private.nexus_site_secret(p_site_id);$$;
create or replace function public.nexus_record_signals(p_site_id text,p_batch_id text,p_events jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.nexus_record_signals(p_site_id,p_batch_id,p_events);$$;

revoke all on function private.nexus_site_key_store(uuid,uuid,text,text,text[]),public.nexus_site_key_store(uuid,uuid,text,text,text[]),
 private.nexus_site_secret(text),public.nexus_site_secret(text),
 private.nexus_record_signals(text,text,jsonb),public.nexus_record_signals(text,text,jsonb) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.nexus_site_key_store(uuid,uuid,text,text,text[]),public.nexus_site_key_store(uuid,uuid,text,text,text[]),
 private.nexus_site_secret(text),public.nexus_site_secret(text),
 private.nexus_record_signals(text,text,jsonb),public.nexus_record_signals(text,text,jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Summary for the dashboard. security invoker: RLS of the caller applies to every table read.
-- Period is computed in UTC. valid = succeeded operations. Rates are over valid (null when 0).
-- cited (per operation) = output.cited is true OR at least one own citation was derived.
-- share_of_voice = own_citations / (own_citations + competitor_mentions), null when both 0.
-- gaps = queries observed in the period with no cited=true in any valid operation; engines_missing = engines that observed them.
-- ---------------------------------------------------------------------------
create or replace function public.nexus_observatory_summary(p_project uuid,p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_to date:=coalesce(p_to,(now() at time zone 'utc')::date);
 v_from date:=coalesce(p_from,coalesce(p_to,(now() at time zone 'utc')::date)-30);
 r jsonb;
begin
 with ops0 as (
  select o.id,o.status,
   coalesce(nullif(o.input->>'engine',''),case o.kind when 'serp' then 'google_serp' else 'chatgpt_api' end) as engine,
   lower(coalesce(nullif(o.input->>'country',''),'br')) as country,
   nullif(o.input->>'query','') as query,nullif(o.input->>'topic','') as topic,nullif(o.input->>'intent','') as intent,
   coalesce((o.output->>'mentioned')='true',false) as out_mentioned,coalesce((o.output->>'cited')='true',false) as out_cited,
   coalesce(public.nexus_safe_timestamptz(o.output->>'collected_at'),public.nexus_safe_timestamptz(o.input->>'observed_at'),o.updated_at) as observed_at
  from public.nexus_operations o
  where o.project_id=p_project and o.kind in ('ai_observation','serp')
 ), ops as (
  select * from ops0 where (observed_at at time zone 'utc')::date between v_from and v_to
 ), valid as (
  select v.id,v.engine,v.country,v.query,v.intent,coalesce(v.topic,v.query,'sem_topico') as tkey,
   (v.observed_at at time zone 'utc')::date as day,
   v.out_mentioned as mentioned,
   (v.out_cited or exists(select 1 from public.nexus_citations c where c.operation_id=v.id and c.is_own)) as cited
  from ops v where v.status='succeeded'
 ), cit as (
  select c.* from public.nexus_citations c join valid v on v.id=c.operation_id
 ), comp as (
  select m.*,coalesce(m.topic,m.query,'sem_topico') as tkey from public.nexus_competitor_mentions m join valid v on v.id=m.operation_id
 ), sig as (
  select s.* from public.nexus_site_signals s where s.project_id=p_project and s.day between v_from and v_to
 )
 select jsonb_build_object(
  'period',jsonb_build_object('from',v_from,'to',v_to),
  'totals',jsonb_build_object(
   'operations',(select count(*) from ops),
   'valid',(select count(*) from valid),
   'mention_rate',(select case when count(*)=0 then null else round(count(*) filter(where mentioned)::numeric/count(*),4) end from valid),
   'citation_rate',(select case when count(*)=0 then null else round(count(*) filter(where cited)::numeric/count(*),4) end from valid),
   'own_citations',(select count(*) from cit where is_own),
   'competitor_mentions',(select count(*) from comp),
   'share_of_voice',(select case when (select count(*) from cit where is_own)+(select count(*) from comp)=0 then null
     else round((select count(*) from cit where is_own)::numeric/((select count(*) from cit where is_own)+(select count(*) from comp)),4) end)),
  'by_engine',coalesce((select jsonb_agg(jsonb_build_object('engine',t.engine,'valid',t.n,'mentioned',t.m,'cited',t.c) order by t.engine)
    from (select engine,count(*) n,count(*) filter(where mentioned) m,count(*) filter(where cited) c from valid group by engine) t),'[]'::jsonb),
  'by_engine_country',coalesce((select jsonb_agg(jsonb_build_object('engine',t.engine,'country',t.country,'valid',t.n,'mentioned',t.m,'cited',t.c) order by t.engine,t.country)
    from (select engine,country,count(*) n,count(*) filter(where mentioned) m,count(*) filter(where cited) c from valid group by engine,country) t),'[]'::jsonb),
  'by_country',coalesce((select jsonb_agg(jsonb_build_object('country',t.country,'valid',t.n,'mentioned',t.m,'cited',t.c) order by t.country)
    from (select country,count(*) n,count(*) filter(where mentioned) m,count(*) filter(where cited) c from valid group by country) t),'[]'::jsonb),
  'by_topic',coalesce((select jsonb_agg(jsonb_build_object('topic',t.tkey,'intent',t.intent,'valid',t.n,'mentioned',t.m,'cited',t.c,'competitors',t.comps) order by t.n desc,t.tkey)
    from (select v.tkey,v.intent,count(*) n,count(*) filter(where v.mentioned) m,count(*) filter(where v.cited) c,
     coalesce((select jsonb_agg(x.competitor_name) from (select distinct k.competitor_name from comp k where k.tkey=v.tkey and k.intent is not distinct from v.intent order by k.competitor_name limit 10) x),'[]'::jsonb) comps
     from valid v group by v.tkey,v.intent) t),'[]'::jsonb),
  'trend',coalesce((select jsonb_agg(jsonb_build_object('day',t.day,'valid',t.n,'mentioned',t.m,'cited',t.c) order by t.day)
    from (select day,count(*) n,count(*) filter(where mentioned) m,count(*) filter(where cited) c from valid group by day) t),'[]'::jsonb),
  'top_competitors',coalesce((select jsonb_agg(jsonb_build_object('name',t.name,'host',t.host,'mentions',t.mentions,'engines',t.engines) order by t.mentions desc,t.name)
    from (select min(k.competitor_name) as name,max(k.competitor_host) as host,count(*) mentions,
      (select jsonb_agg(distinct u.e) from unnest(array_agg(k.engine)) as u(e)) as engines
      from comp k group by lower(k.competitor_name) order by count(*) desc,lower(k.competitor_name) limit 20) t),'[]'::jsonb),
  'own_urls',coalesce((select jsonb_agg(jsonb_build_object('url',t.url,'citations',t.n,'engines',t.engines) order by t.n desc,t.url)
    from (select c.url,count(*) n,(select jsonb_agg(distinct u.e) from unnest(array_agg(c.engine)) as u(e)) as engines
      from cit c where c.is_own group by c.url order by count(*) desc,c.url limit 50) t),'[]'::jsonb),
  'gaps',coalesce((select jsonb_agg(jsonb_build_object('topic',g.topic,'intent',g.intent,'query',g.query,'country',g.country,'engines_missing',g.engines,'competitors',g.comps) order by g.ncomp desc,g.query)
    from (select v.query,v.country,min(v.tkey) as topic,min(v.intent) as intent,
       (select jsonb_agg(distinct u.e) from unnest(array_agg(v.engine)) as u(e)) as engines,
       (select count(distinct lower(k.competitor_name)) from comp k where k.query=v.query and k.country is not distinct from v.country) as ncomp,
       coalesce((select jsonb_agg(x.competitor_name) from (select distinct k.competitor_name from comp k where k.query=v.query and k.country is not distinct from v.country order by k.competitor_name limit 10) x),'[]'::jsonb) as comps
      from valid v where v.query is not null group by v.query,v.country having not bool_or(v.cited)
      order by 6 desc,v.query limit 50) g),'[]'::jsonb),
  'signals',jsonb_build_object(
   'ai_bot_hits',coalesce((select sum(hits) from sig where kind='ai_bot_hit'),0),
   'ai_referrals',coalesce((select sum(hits) from sig where kind='ai_referral'),0),
   'search_referrals',coalesce((select sum(hits) from sig where kind='search_referral'),0),
   'by_agent',coalesce((select jsonb_agg(jsonb_build_object('kind',t.kind,'agent',t.agent,'hits',t.h) order by t.h desc)
     from (select kind,agent,sum(hits) h from sig where kind<>'human_pageview' group by kind,agent order by sum(hits) desc limit 20) t),'[]'::jsonb),
   'by_path',coalesce((select jsonb_agg(jsonb_build_object('path',t.path,'kind',t.kind,'hits',t.h) order by t.h desc)
     from (select path,kind,sum(hits) h from sig where kind<>'human_pageview' group by path,kind order by sum(hits) desc limit 20) t),'[]'::jsonb),
   'last_batch_at',(select k.last_batch_at from public.nexus_site_keys k where k.project_id=p_project))
 ) into r;
 return r;
end $$;
revoke all on function public.nexus_observatory_summary(uuid,date,date) from public,anon;
grant execute on function public.nexus_observatory_summary(uuid,date,date) to authenticated,service_role;

-- Backfill: re-fire the fan-out for observations already stored (status is in the trigger's OF list; updated_at alone would not fire it).
update public.nexus_operations set status=status where status='succeeded' and kind in ('ai_observation','serp');
