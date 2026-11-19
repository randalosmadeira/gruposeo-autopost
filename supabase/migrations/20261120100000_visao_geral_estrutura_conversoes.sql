-- Visão Geral e Estrutura do negócio (item 2) + cliques de contato como conversão (item 4). Aditiva e reversível
-- (supabase/rollbacks/20261120100000_visao_geral_estrutura_conversoes_rollback.sql).
--  1) project_site_maps: foto guardada do mapa do domínio (sitemaps, seções, subdomínios, robots, llms.txt) por projeto.
--  2) nexus_site_signals aceita o tipo 'cta_click' (clique em WhatsApp, telefone, e-mail ou formulário), sem dado pessoal.
--  3) site_overview_data(): agregações do Search Console, GA4 e sinais feitas NO BANCO (a tabela do Search Console tem dezenas de milhares de linhas).
-- Acesso: RLS ligada e nenhum grant para anon/authenticated; a única porta é a função de borda `site-overview` (chave de serviço),
-- que confere participação na organização e papel.

-- 1) Mapa do domínio
create table if not exists public.project_site_maps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  host text not null check (char_length(host) between 3 and 200),
  is_primary boolean not null default false,
  fetched_at timestamptz not null default now(),
  home_kind text check (home_kind is null or home_kind in ('site', 'listagem', 'padrao', 'vazio', 'fora_do_ar')),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  requested_by uuid references auth.users(id) on delete set null
);
create index if not exists project_site_maps_project_idx on public.project_site_maps (project_id, host, fetched_at desc);
create index if not exists project_site_maps_org_idx on public.project_site_maps (organization_id);
create index if not exists project_site_maps_requested_by_idx on public.project_site_maps (requested_by);
drop trigger if exists project_site_maps_org on public.project_site_maps;
create trigger project_site_maps_org before insert or update of project_id, organization_id on public.project_site_maps for each row execute function public.profile_assert_project_org();
alter table public.project_site_maps enable row level security;
revoke all on table public.project_site_maps from public, anon, authenticated;
grant all on table public.project_site_maps to service_role;

-- 2) Cliques de contato como sinal
alter table public.nexus_site_signals drop constraint if exists nexus_site_signals_kind_check;
alter table public.nexus_site_signals add constraint nexus_site_signals_kind_check check (kind in ('ai_bot_hit', 'ai_referral', 'search_referral', 'human_pageview', 'cta_click'));

create or replace function private.nexus_record_signals(p_site_id text, p_batch_id text, p_events jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k public.nexus_site_keys; n int; used int;
begin
 select * into k from public.nexus_site_keys where site_id = p_site_id;
 if k.project_id is null then raise exception 'site_unknown'; end if;
 if jsonb_typeof(p_events) is distinct from 'array' then raise exception 'events_invalid'; end if;
 if jsonb_array_length(p_events) > 500 then raise exception 'too_many_events'; end if;
 if coalesce(p_batch_id, '') <> '' then
  insert into public.nexus_signal_batches(site_id, batch_id, events) values (p_site_id, p_batch_id, jsonb_array_length(p_events)) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('duplicate', true, 'accepted', 0); end if;
 end if;
 with ev as (
  select coalesce(left(t.e->>'site_host', 253), '') as site_host, (t.e->>'day')::date as day, t.e->>'kind' as kind,
   coalesce(left(t.e->>'agent', 64), '') as agent,
   coalesce(left(split_part(split_part(coalesce(t.e->>'path', ''), '?', 1), '#', 1), 200), '') as path,
   least(greatest(coalesce((t.e->>'hits')::int, 1), 0), 100000) as hits
  from jsonb_array_elements(p_events) as t(e)
  where t.e->>'kind' in ('ai_bot_hit', 'ai_referral', 'search_referral', 'human_pageview', 'cta_click')
 ), agg as (
  select site_host, day, kind, agent, path, sum(hits)::int as hits from ev group by 1, 2, 3, 4, 5
 )
 insert into public.nexus_site_signals(organization_id, project_id, site_host, day, kind, agent, path, hits)
 select k.organization_id, k.project_id, agg.site_host, agg.day, agg.kind, agg.agent, agg.path, agg.hits from agg
 on conflict (project_id, site_host, day, kind, agent, path) do update set hits = least(public.nexus_site_signals.hits + excluded.hits, 2000000000);
 get diagnostics used = row_count;
 update public.nexus_site_keys set last_batch_at = now() where project_id = k.project_id;
 return jsonb_build_object('duplicate', false, 'accepted', jsonb_array_length(p_events), 'rows', used);
end $$;

-- 3) Agregações da Visão Geral. Janela de p_days dias terminando no ÚLTIMO dia com dado de cada fonte (o Search Console atrasa 2 a 3 dias),
--    comparada com a janela anterior de mesmo tamanho. GA4: os TOTAIS vêm só das linhas do site (page = ''), nunca da soma com as linhas de página.
create or replace function private.site_overview_data(p_project uuid, p_days integer)
returns jsonb language sql stable security definer set search_path = '' as $$
with prm as (select greatest(1, least(coalesce(p_days, 28), 180)) as d),
g as (select max(day) as e from public.nexus_search_performance where project_id = p_project),
gw as (select e as cur_to, e - ((select d from prm) - 1) as cur_from, e - (select d from prm) as prev_to, e - (2 * (select d from prm) - 1) as prev_from from g where e is not null),
gs as (
  select s.*, case when s.day between (select cur_from from gw) and (select cur_to from gw) then 'cur' when s.day between (select prev_from from gw) and (select prev_to from gw) then 'prev' end as win,
    split_part(regexp_replace(s.page, '^https?://', ''), '/', 1) as host,
    coalesce(nullif(split_part(regexp_replace(s.page, '^https?://[^/]+', ''), '/', 2), ''), '(raiz)') as section
  from public.nexus_search_performance s where s.project_id = p_project and s.day >= (select prev_from from gw)
),
gsc_tot as (select win, sum(clicks)::bigint as clicks, sum(impressions)::bigint as impressions, round((sum(position * impressions) / nullif(sum(impressions), 0))::numeric, 1) as position from gs where win is not null group by win),
gsc_host as (select host, count(distinct page) as pages, sum(clicks)::bigint as clicks, sum(impressions)::bigint as impressions, round((sum(position * impressions) / nullif(sum(impressions), 0))::numeric, 1) as position from gs where win = 'cur' group by host order by sum(impressions) desc limit 25),
gsc_sec as (select host, section, count(distinct page) as pages, sum(clicks)::bigint as clicks, sum(impressions)::bigint as impressions, round((sum(position * impressions) / nullif(sum(impressions), 0))::numeric, 1) as position from gs where win = 'cur' group by host, section order by sum(impressions) desc limit 80),
gsc_page as (select page, sum(clicks)::bigint as clicks, sum(impressions)::bigint as impressions, round((sum(position * impressions) / nullif(sum(impressions), 0))::numeric, 1) as position from gs where win = 'cur' and page <> '' group by page order by sum(clicks) desc, sum(impressions) desc limit 15),
gsc_q as (select query, sum(clicks)::bigint as clicks, sum(impressions)::bigint as impressions, round((sum(position * impressions) / nullif(sum(impressions), 0))::numeric, 1) as position from gs where win = 'cur' and query <> '' group by query order by sum(impressions) desc limit 20),
a as (select max(day) as e from public.nexus_analytics_daily where project_id = p_project and page = ''),
aw as (select e as cur_to, e - ((select d from prm) - 1) as cur_from, e - (select d from prm) as prev_to, e - (2 * (select d from prm) - 1) as prev_from from a where e is not null),
an as (
  select n.*, case when n.day between (select cur_from from aw) and (select cur_to from aw) then 'cur' when n.day between (select prev_from from aw) and (select prev_to from aw) then 'prev' end as win
  from public.nexus_analytics_daily n where n.project_id = p_project and n.day >= (select prev_from from aw)
),
ga_tot as (select win, sum(sessions)::bigint as sessions, sum(page_views)::bigint as views, sum(users)::bigint as users, sum(key_events)::bigint as key_events, coalesce(sum(sessions) filter (where is_ai), 0)::bigint as ai_sessions from an where page = '' and win is not null group by win),
ga_ch as (select channel, sum(sessions)::bigint as sessions from an where page = '' and win = 'cur' group by channel order by sum(sessions) desc limit 10),
ga_pg as (select page, sum(page_views)::bigint as views, sum(sessions)::bigint as sessions from an where page <> '' and win = 'cur' group by page order by sum(page_views) desc limit 15),
sg as (select kind, agent, sum(hits)::bigint as hits from public.nexus_site_signals where project_id = p_project and day >= current_date - ((select d from prm) - 1) group by kind, agent),
ar as (select count(*) filter (where status = 'published') as published, max(published_at) filter (where status = 'published') as last_published_at, count(*) as total from public.articles where project_id = p_project)
select jsonb_build_object(
  'days', (select d from prm),
  'gsc', jsonb_build_object('window', (select to_jsonb(gw) from gw),
     'totals', coalesce((select jsonb_object_agg(win, to_jsonb(gsc_tot) - 'win') from gsc_tot), '{}'::jsonb),
     'by_host', coalesce((select jsonb_agg(to_jsonb(gsc_host)) from gsc_host), '[]'::jsonb),
     'by_section', coalesce((select jsonb_agg(to_jsonb(gsc_sec)) from gsc_sec), '[]'::jsonb),
     'top_pages', coalesce((select jsonb_agg(to_jsonb(gsc_page)) from gsc_page), '[]'::jsonb),
     'top_queries', coalesce((select jsonb_agg(to_jsonb(gsc_q)) from gsc_q), '[]'::jsonb)),
  'ga4', jsonb_build_object('window', (select to_jsonb(aw) from aw),
     'totals', coalesce((select jsonb_object_agg(win, to_jsonb(ga_tot) - 'win') from ga_tot), '{}'::jsonb),
     'channels', coalesce((select jsonb_agg(to_jsonb(ga_ch)) from ga_ch), '[]'::jsonb),
     'top_pages', coalesce((select jsonb_agg(to_jsonb(ga_pg)) from ga_pg), '[]'::jsonb)),
  'signals', coalesce((select jsonb_agg(to_jsonb(sg)) from sg), '[]'::jsonb),
  'articles', (select to_jsonb(ar) from ar)
);
$$;

create or replace function public.site_overview_data(p_project uuid, p_days integer)
returns jsonb language sql stable security invoker set search_path = '' as $$select private.site_overview_data(p_project, p_days);$$;
revoke all on function private.site_overview_data(uuid, integer), public.site_overview_data(uuid, integer) from public, anon, authenticated;
grant execute on function private.site_overview_data(uuid, integer), public.site_overview_data(uuid, integer) to service_role;
