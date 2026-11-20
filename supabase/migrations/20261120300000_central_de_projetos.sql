-- Central de Projetos: ciclo de vida (ativo, pausado, arquivado), saúde, exclusão definitiva segura e verificador de integridade.
-- Aditiva e reversível (supabase/rollbacks/20261120300000_central_de_projetos_rollback.sql). NÃO apaga nem altera nenhum projeto existente:
-- todos continuam 'ativo'. Este arquivo foi escrito e revisado localmente; NÃO foi aplicado em nenhum banco.
--
--  1) projects: lifecycle_status, archived_at, archived_by, paused_reason (+ paused_at e paused_snapshot, que guardam o estado anterior
--     dos agendamentos para o "Retomar"/"Restaurar" devolver exatamente o que estava ligado). O navegador só LÊ lifecycle_status,
--     archived_at e paused_reason; quem muda é a função de borda `project-lifecycle` (um gatilho recusa mudança vinda do navegador).
--  2) Excluir direto deixa de ser possível pelo navegador (gatilho BEFORE DELETE): a exclusão definitiva só passa por
--     private.project_purge, chamada pela função de borda depois de arquivar/exportar/confirmar o nome.
--  3) project_lifecycle_events: histórico de pausar/arquivar/restaurar/excluir SEM chave estrangeira (não some junto com o projeto).
--  4) private.project_health_inputs(org): os fatos de saúde de todos os projetos da organização em UMA chamada.
--  5) private.project_delete_plan(projeto): o que seria apagado, por tabela, com o comportamento real da FK lido de pg_constraint.
--  6) private.project_purge(projeto, ator): apaga em etapas, na ordem certa, contando o que removeu (ver regras abaixo).
--  7) private.project_orphan_scan(org): linhas sem projeto (FK nula) por tabela, para o verificador de integridade.
-- Acesso: RLS ligada e nenhum grant para anon/authenticated nas tabelas novas; execute das funções só para service_role.
--
-- REGRAS DA EXCLUSÃO DEFINITIVA (project_purge)
--  - As FKs para projects se comportam de 4 jeitos: CASCADE (apaga junto), SET NULL (deixaria o dado órfão, sem dono),
--    RESTRICT e NO ACTION (bloqueiam a exclusão do projeto). A purga trata TODOS pelo mesmo caminho: apaga explicitamente as linhas do
--    projeto em cada tabela dependente, na ordem restrict/no action -> set null -> cascade, repetindo quando uma tabela está presa a outra
--    (até não haver mais progresso). Só então apaga o projeto.
--  - Dado com histórico NÃO fica órfão: artigos, auditorias, uploads, agendamentos de RSS etc. (FK set null) são APAGADOS junto, na exclusão
--    definitiva. Isto só é chamado depois de o projeto estar arquivado (ou totalmente vazio), de a pessoa exportar e de digitar o nome.
--  - Tabelas que têm coluna project_id mas NÃO têm FK para projects não são tocadas (não dá para saber o que são): aparecem no plano e
--    no resultado como "sem vínculo formal", e o verificador de integridade as aponta.
--  - Tudo roda numa única transação: se alguma tabela não puder ser limpa, nada é apagado.
--  - Segredos no cofre (tokens OAuth do Google/Bing, credencial do WordPress, segredo da chave de sinais) são removidos em melhor esforço;
--    se o cofre recusar, o resultado diz "falhou" e o projeto mesmo assim é excluído (os segredos ficam sem uso).

-- 1) Colunas de ciclo de vida
alter table public.projects
  add column if not exists lifecycle_status text not null default 'ativo',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid,
  add column if not exists paused_reason text,
  add column if not exists paused_at timestamptz,
  add column if not exists paused_snapshot jsonb;
alter table public.projects drop constraint if exists projects_lifecycle_status_check;
alter table public.projects add constraint projects_lifecycle_status_check check (lifecycle_status in ('ativo', 'pausado', 'arquivado'));
alter table public.projects drop constraint if exists projects_paused_reason_check;
alter table public.projects add constraint projects_paused_reason_check check (paused_reason is null or char_length(paused_reason) <= 300);
alter table public.projects drop constraint if exists projects_paused_snapshot_check;
alter table public.projects add constraint projects_paused_snapshot_check check (paused_snapshot is null or jsonb_typeof(paused_snapshot) = 'object');
create index if not exists projects_org_lifecycle_idx on public.projects (organization_id, lifecycle_status);

-- O navegador só lê estas três (a lista completa de colunas legíveis está em src/lib/project-columns.ts; um teste confere as duas).
grant select (lifecycle_status, archived_at, paused_reason) on public.projects to authenticated;

-- 2) Proteção: o navegador não muda o ciclo de vida nem exclui projeto diretamente. Chave de serviço (função de borda), postgres e as funções
--    private.* passam. O papel efetivo de uma requisição do navegador é 'authenticated' (ou 'anon').
create or replace function public.projects_lifecycle_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('authenticated', 'anon') then
      raise exception 'project_delete_via_central' using hint = 'Use a Central de Projetos: arquivar e, depois, excluir definitivamente.';
    end if;
    return old;
  end if;
  if current_user in ('authenticated', 'anon')
     and (new.lifecycle_status, new.archived_at, new.archived_by, new.paused_reason, new.paused_at, new.paused_snapshot)
         is distinct from (old.lifecycle_status, old.archived_at, old.archived_by, old.paused_reason, old.paused_at, old.paused_snapshot) then
    raise exception 'project_lifecycle_via_central' using hint = 'Pause, arquive e restaure pela Central de Projetos.';
  end if;
  return new;
end $$;
revoke all on function public.projects_lifecycle_guard() from public, anon, authenticated;
drop trigger if exists projects_lifecycle_guard_upd on public.projects;
create trigger projects_lifecycle_guard_upd before update on public.projects for each row execute function public.projects_lifecycle_guard();
drop trigger if exists projects_lifecycle_guard_del on public.projects;
create trigger projects_lifecycle_guard_del before delete on public.projects for each row execute function public.projects_lifecycle_guard();

-- 3) Histórico do ciclo de vida. SEM chaves estrangeiras de propósito: o registro de uma exclusão tem de sobreviver ao projeto e à organização.
create table if not exists public.project_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  project_name text not null check (char_length(project_name) <= 300),
  event text not null check (event in ('pausado', 'retomado', 'arquivado', 'restaurado', 'exportado', 'excluido')),
  actor uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists project_lifecycle_events_project_idx on public.project_lifecycle_events (project_id, created_at desc);
create index if not exists project_lifecycle_events_org_idx on public.project_lifecycle_events (organization_id, created_at desc);
alter table public.project_lifecycle_events enable row level security;
revoke all on table public.project_lifecycle_events from public, anon, authenticated;
grant all on table public.project_lifecycle_events to service_role;

-- 4) Fatos de saúde de todos os projetos da organização. As tabelas de módulos mais novos são lidas só se existirem (to_regclass);
--    módulo ausente = bloco null (a tela mostra "sem dados"), nunca zero inventado.
create or replace function private.project_health_inputs(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_extras jsonb := '{}'::jsonb;
  v_one jsonb;
  s record;
  r record;
  pid text;
  v_out jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(id), '{}') into v_ids from public.projects where organization_id = p_org;

  -- Fontes opcionais: cada linha devolve (project_id, data).
  for s in select * from (values
    ('profile', 'public.project_profile_extended', $q$select project_id, jsonb_build_object('status', status, 'completeness', completeness, 'confirmed', status = 'confirmed') as data from public.project_profile_extended where organization_id = $1$q$),
    ('taxonomy', 'public.project_taxonomy_nodes', $q$select project_id, jsonb_build_object('nodes', count(*), 'approved', count(*) filter (where status = 'aprovado')) as data from public.project_taxonomy_nodes where organization_id = $1 group by project_id$q$),
    ('site_map', 'public.project_site_maps', $q$select project_id, jsonb_build_object('reads', count(*), 'last_at', max(fetched_at)) as data from public.project_site_maps where organization_id = $1 group by project_id$q$),
    ('speed_schedule', 'public.project_speed_schedules', $q$select project_id, jsonb_build_object('scheduled', true, 'enabled', enabled, 'frequency', frequency, 'consecutive_failures', consecutive_failures, 'last_run_at', last_run_at) as data from public.project_speed_schedules where organization_id = $1$q$),
    ('speed_runs', 'public.project_speed_runs', $q$select project_id, jsonb_build_object('runs', count(*), 'last_at', max(fetched_at), 'last_score', (array_agg(performance_score order by fetched_at desc))[1]) as data from public.project_speed_runs where organization_id = $1 and kind = 'own' group by project_id$q$),
    ('alerts', 'public.project_alerts', $q$select project_id, jsonb_build_object('open_speed', count(*) filter (where source = 'speed'), 'open_backlinks', count(*) filter (where source = 'backlinks')) as data from public.project_alerts where organization_id = $1 and dismissed_at is null group by project_id$q$),
    ('backlinks', 'public.project_backlinks', $q$select project_id, jsonb_build_object('total', count(*), 'live', count(*) filter (where status = 'live'), 'last_checked_at', max(last_checked_at)) as data from public.project_backlinks where organization_id = $1 and kind = 'own' group by project_id$q$),
    ('funnel_cfg', 'public.project_funnels', $q$select project_id, jsonb_build_object('configured', true) as data from public.project_funnels where organization_id = $1$q$),
    ('funnel_entries', 'public.project_funnel_entries', $q$select project_id, jsonb_build_object('entries', count(*), 'last_month', max(month)) as data from public.project_funnel_entries where organization_id = $1 group by project_id$q$),
    ('obs_prompts', 'public.nexus_prompts', $q$select project_id, jsonb_build_object('prompts', count(*)) as data from public.nexus_prompts where organization_id = $1 group by project_id$q$),
    ('obs_citations', 'public.nexus_citations', $q$select project_id, jsonb_build_object('citations', count(*)) as data from public.nexus_citations where organization_id = $1 group by project_id$q$)
  ) as t(k, tbl, q) loop
    if to_regclass(s.tbl) is not null then
      execute format('select coalesce(jsonb_object_agg(project_id::text, data), ''{}''::jsonb) from (%s) t', s.q) into v_one using p_org;
      v_extras := v_extras || jsonb_build_object(s.k, v_one);
    end if;
  end loop;

  for r in
    select p.id,
      jsonb_build_object(
        'id', p.id, 'name', p.name, 'domain', nullif(btrim(coalesce(p.domain, '')), ''), 'wordpress_url', nullif(btrim(coalesce(p.wordpress_url, '')), ''),
        'created_at', p.created_at, 'lifecycle_status', p.lifecycle_status, 'archived_at', p.archived_at, 'paused_reason', p.paused_reason,
        'wordpress', jsonb_build_object('connected', (coalesce(btrim(p.wordpress_url), '') <> '' and coalesce(p.wordpress_has_credential, false)),
          'plugin_version', p.wordpress_plugin_version, 'mode', p.wordpress_connector_mode, 'connected_at', p.wordpress_connected_at, 'last_verified_at', p.wordpress_last_verified_at),
        'articles', jsonb_build_object('total', coalesce(a.total, 0), 'published', coalesce(a.published, 0), 'last_published_at', a.last_published_at),
        'gsc', jsonb_build_object('rows', coalesce(g.rows, 0), 'last_day', g.last_day),
        'ga4', jsonb_build_object('rows', coalesce(n.rows, 0), 'last_day', n.last_day),
        'providers', coalesce(o.providers, '[]'::jsonb),
        'signals', jsonb_build_object('tracking_key', k.project_id is not null, 'last_batch_at', k.last_batch_at, 'last_day', sg.last_day, 'cta_28d', coalesce(sg.cta, 0)),
        'automation', jsonb_build_object('news_agents_active', coalesce(na.n, 0), 'rss_active', coalesce(rs.n, 0))
      ) as base,
      p.nexus_profile_status as profile_status
    from public.projects p
    left join (select project_id, count(*) as total, count(*) filter (where status = 'published') as published, max(published_at) filter (where status = 'published') as last_published_at from public.articles where project_id = any(v_ids) group by project_id) a on a.project_id = p.id
    left join (select project_id, count(*) as rows, max(day) as last_day from public.nexus_search_performance where project_id = any(v_ids) and source = 'gsc' group by project_id) g on g.project_id = p.id
    left join (select project_id, count(*) as rows, max(day) as last_day from public.nexus_analytics_daily where project_id = any(v_ids) group by project_id) n on n.project_id = p.id
    left join (select project_id, jsonb_agg(provider order by provider) as providers from public.nexus_oauth_connections where project_id = any(v_ids) group by project_id) o on o.project_id = p.id
    left join public.nexus_site_keys k on k.project_id = p.id
    left join (select project_id, max(day) as last_day, coalesce(sum(hits) filter (where kind = 'cta_click' and day >= current_date - 27), 0) as cta from public.nexus_site_signals where project_id = any(v_ids) group by project_id) sg on sg.project_id = p.id
    left join (select project_id, count(*) as n from public.news_agents where project_id = any(v_ids) and is_active group by project_id) na on na.project_id = p.id
    left join (select project_id, count(*) as n from public.rss_schedules where project_id = any(v_ids) and coalesce(is_active, false) group by project_id) rs on rs.project_id = p.id
    where p.organization_id = p_org
    order by p.created_at
  loop
    pid := r.id::text;
    v_out := v_out || jsonb_build_array(r.base || jsonb_build_object(
      'profile', coalesce(v_extras -> 'profile' -> pid, case when r.profile_status = 'complete' then jsonb_build_object('status', 'complete', 'completeness', null, 'confirmed', null) else null end),
      'taxonomy', case when v_extras ? 'taxonomy' then coalesce(v_extras -> 'taxonomy' -> pid, '{"nodes":0,"approved":0}'::jsonb) else null end,
      'site_map', case when v_extras ? 'site_map' then coalesce(v_extras -> 'site_map' -> pid, '{"reads":0,"last_at":null}'::jsonb) else null end,
      'speed', case when v_extras ? 'speed_schedule' or v_extras ? 'speed_runs' then jsonb_build_object(
          'scheduled', coalesce((v_extras -> 'speed_schedule' -> pid ->> 'scheduled')::boolean, false),
          'enabled', coalesce((v_extras -> 'speed_schedule' -> pid ->> 'enabled')::boolean, false),
          'frequency', v_extras -> 'speed_schedule' -> pid -> 'frequency',
          'consecutive_failures', coalesce((v_extras -> 'speed_schedule' -> pid ->> 'consecutive_failures')::int, 0),
          'runs', coalesce((v_extras -> 'speed_runs' -> pid ->> 'runs')::int, 0),
          'last_run_at', coalesce(v_extras -> 'speed_runs' -> pid -> 'last_at', v_extras -> 'speed_schedule' -> pid -> 'last_run_at'),
          'last_score', v_extras -> 'speed_runs' -> pid -> 'last_score') else null end,
      'alerts', case when v_extras ? 'alerts' then coalesce(v_extras -> 'alerts' -> pid, '{"open_speed":0,"open_backlinks":0}'::jsonb) else null end,
      'backlinks', case when v_extras ? 'backlinks' then coalesce(v_extras -> 'backlinks' -> pid, '{"total":0,"live":0,"last_checked_at":null}'::jsonb) else null end,
      'funnel', case when v_extras ? 'funnel_cfg' then jsonb_build_object(
          'configured', v_extras -> 'funnel_cfg' ? pid,
          'entries', coalesce((v_extras -> 'funnel_entries' -> pid ->> 'entries')::int, 0),
          'last_month', v_extras -> 'funnel_entries' -> pid -> 'last_month') else null end,
      'observatory', case when v_extras ? 'obs_prompts' or v_extras ? 'obs_citations' then jsonb_build_object(
          'prompts', coalesce((v_extras -> 'obs_prompts' -> pid ->> 'prompts')::int, 0),
          'citations', coalesce((v_extras -> 'obs_citations' -> pid ->> 'citations')::int, 0)) else null end
    ));
  end loop;
  return v_out;
end $$;

-- 5) Plano de exclusão: por tabela que depende de projects (FK), a contagem de linhas do projeto e o comportamento da FK.
create or replace function private.project_delete_plan(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  n bigint;
  v_name text;
  v_tables jsonb := '[]'::jsonb;
  v_nofk jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_checked int := 0;
begin
  select name into v_name from public.projects where id = p_project;
  if not found then return jsonb_build_object('found', false); end if;
  for r in
    select nsp.nspname, rel.relname, a.attname,
      case c.confdeltype when 'c' then 'cascade' when 'n' then 'set null' when 'r' then 'restrict' when 'a' then 'no action' else 'set default' end as on_delete
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.projects'::regclass and array_length(c.conkey, 1) = 1
    order by nsp.nspname, rel.relname
  loop
    v_checked := v_checked + 1;
    execute format('select count(*) from %I.%I where %I = $1', r.nspname, r.relname, r.attname) into n using p_project;
    if n > 0 then
      v_tables := v_tables || jsonb_build_array(jsonb_build_object('table', r.relname, 'schema', r.nspname, 'column', r.attname, 'rows', n, 'on_delete', r.on_delete));
      v_total := v_total + n;
    end if;
  end loop;
  -- Tabelas com coluna project_id mas SEM FK para projects: só informadas, nunca apagadas.
  for r in
    select nsp.nspname, rel.relname
    from pg_attribute a
    join pg_class rel on rel.oid = a.attrelid and rel.relkind in ('r', 'p')
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where a.attname = 'project_id' and not a.attisdropped and nsp.nspname = 'public' and rel.relname <> 'project_lifecycle_events'
      and not exists (select 1 from pg_constraint c where c.conrelid = rel.oid and c.contype = 'f' and c.confrelid = 'public.projects'::regclass and a.attnum = any (c.conkey))
    order by rel.relname
  loop
    begin
      execute format('select count(*) from %I.%I where project_id::text = $1', r.nspname, r.relname) into n using p_project::text;
    exception when others then n := null;
    end;
    if n is null or n > 0 then
      v_nofk := v_nofk || jsonb_build_array(jsonb_build_object('table', r.relname, 'rows', n));
    end if;
  end loop;
  return jsonb_build_object('found', true, 'project_id', p_project, 'name', v_name, 'tables', v_tables, 'tables_checked', v_checked, 'total_rows', v_total, 'without_fk', v_nofk);
end $$;

-- 6) Exclusão definitiva em etapas. Chamada SÓ pela função de borda (que já conferiu papel, projeto arquivado/vazio, nome e exportação).
create or replace function private.project_purge(p_project uuid, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_proj record;
  r record;
  v_todo jsonb := '[]'::jsonb;
  v_item jsonb;
  v_done jsonb := '{}'::jsonb;
  v_left jsonb;
  v_pass int := 0;
  v_progress boolean;
  v_rows bigint;
  v_total bigint := 0;
  v_vault_ids uuid[] := '{}';
  v_vault_names text[] := '{}';
  v_vault text := 'nao_havia';
  v_nofk jsonb;
  v_remaining jsonb;
begin
  select id, name, organization_id, wordpress_credential_ref into v_proj from public.projects where id = p_project for update;
  if not found then raise exception 'project_not_found'; end if;

  -- Segredos do cofre ligados a este projeto (coletados antes de apagar as linhas que os referenciam).
  if to_regclass('public.nexus_oauth_connections') is not null then
    select coalesce(array_agg(vault_secret_id), '{}') into v_vault_ids from public.nexus_oauth_connections where project_id = p_project;
  end if;
  if to_regclass('public.nexus_site_keys') is not null then
    select v_vault_names || coalesce(array_agg('nexus_site_' || site_id), '{}') into v_vault_names from public.nexus_site_keys where project_id = p_project;
  end if;

  -- Fila de tabelas dependentes: restrict/no action primeiro, depois set null, depois cascade.
  for r in
    select nsp.nspname, rel.relname, a.attname,
      case c.confdeltype when 'r' then 1 when 'a' then 1 when 'n' then 2 when 'd' then 2 else 3 end as stage
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.projects'::regclass and array_length(c.conkey, 1) = 1
    order by 4, nsp.nspname, rel.relname
  loop
    v_todo := v_todo || jsonb_build_array(jsonb_build_object('schema', r.nspname, 'table', r.relname, 'column', r.attname, 'stage', r.stage));
  end loop;

  -- Passadas: cada tabela é tentada; se estiver presa a outra (FK), fica para a próxima passada. Para quando nada mais avança.
  loop
    v_pass := v_pass + 1;
    v_progress := false;
    v_remaining := '[]'::jsonb;
    for v_item in select * from jsonb_array_elements(v_todo) loop
      begin
        execute format('delete from %I.%I where %I = $1', v_item ->> 'schema', v_item ->> 'table', v_item ->> 'column') using p_project;
        get diagnostics v_rows = row_count;
        v_done := v_done || jsonb_build_object(v_item ->> 'table', coalesce((v_done ->> (v_item ->> 'table'))::bigint, 0) + v_rows);
        v_total := v_total + v_rows;
        v_progress := true;
      exception when foreign_key_violation or restrict_violation then
        v_remaining := v_remaining || jsonb_build_array(v_item);
      end;
    end loop;
    v_todo := v_remaining;
    exit when jsonb_array_length(v_todo) = 0;
    if not v_progress or v_pass >= 20 then
      raise exception 'purge_blocked: %', (select string_agg(x ->> 'table', ', ') from jsonb_array_elements(v_todo) x);
    end if;
  end loop;

  -- O que fica para trás (tabelas com project_id sem FK): só informado, calculado antes de o projeto sumir.
  v_nofk := coalesce((private.project_delete_plan(p_project) -> 'without_fk'), '[]'::jsonb);

  delete from public.projects where id = p_project;
  if not found then raise exception 'project_delete_failed'; end if;

  -- Cofre (melhor esforço).
  if v_proj.wordpress_credential_ref is not null and btrim(v_proj.wordpress_credential_ref) <> ''
     and not exists (select 1 from public.projects where wordpress_credential_ref = v_proj.wordpress_credential_ref) then
    v_vault_names := v_vault_names || v_proj.wordpress_credential_ref;
  end if;
  if (coalesce(array_length(v_vault_ids, 1), 0) + coalesce(array_length(v_vault_names, 1), 0)) > 0 then
    if to_regclass('vault.secrets') is not null then
      begin
        execute 'delete from vault.secrets where id = any($1) or name = any($2)' using v_vault_ids, v_vault_names;
        v_vault := 'removido';
      exception when others then v_vault := 'falhou';
      end;
    else
      v_vault := 'cofre_indisponivel';
    end if;
  end if;

  insert into public.project_lifecycle_events (organization_id, project_id, project_name, event, actor, details)
  values (v_proj.organization_id, v_proj.id, v_proj.name, 'excluido', p_actor,
    jsonb_build_object('deleted', v_done, 'total_rows', v_total, 'vault', v_vault, 'left_behind', v_nofk));
  return jsonb_build_object('deleted', v_done, 'total_rows', v_total, 'vault', v_vault, 'left_behind', v_nofk, 'passes', v_pass);
end $$;

-- 7) Linhas sem projeto (FK nula) por tabela, restritas à organização (por organization_id; sem ele, pelos membros ativos via user_id).
create or replace function private.project_orphan_scan(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  n bigint;
  v_tables jsonb := '[]'::jsonb;
  v_unver jsonb := '[]'::jsonb;
  v_scope text;
begin
  for r in
    select nsp.nspname, rel.relname, a.attname, rel.oid as relid
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.projects'::regclass and array_length(c.conkey, 1) = 1 and not a.attnotnull and nsp.nspname = 'public'
    order by rel.relname
  loop
    if exists (select 1 from pg_attribute where attrelid = r.relid and attname = 'organization_id' and not attisdropped) then
      v_scope := 'organization_id = $1';
    elsif exists (select 1 from pg_attribute where attrelid = r.relid and attname = 'user_id' and not attisdropped) then
      v_scope := 'user_id in (select user_id from public.organization_members where organization_id = $1 and status = ''active'')';
    else
      v_unver := v_unver || to_jsonb(r.relname::text);
      continue;
    end if;
    execute format('select count(*) from %I.%I where %I is null and %s', r.nspname, r.relname, r.attname, v_scope) into n using p_org;
    if n > 0 then v_tables := v_tables || jsonb_build_array(jsonb_build_object('table', r.relname, 'orphans', n)); end if;
  end loop;
  return jsonb_build_object('tables', v_tables, 'unverifiable', v_unver);
end $$;

-- Portas públicas (PostgREST) só para a chave de serviço, no mesmo padrão de site_overview_data.
create or replace function public.project_health_inputs(p_org uuid) returns jsonb language sql stable security invoker set search_path = '' as $$select private.project_health_inputs(p_org);$$;
create or replace function public.project_delete_plan(p_project uuid) returns jsonb language sql stable security invoker set search_path = '' as $$select private.project_delete_plan(p_project);$$;
create or replace function public.project_purge(p_project uuid, p_actor uuid default null) returns jsonb language sql volatile security invoker set search_path = '' as $$select private.project_purge(p_project, p_actor);$$;
create or replace function public.project_orphan_scan(p_org uuid) returns jsonb language sql stable security invoker set search_path = '' as $$select private.project_orphan_scan(p_org);$$;
revoke all on function private.project_health_inputs(uuid), private.project_delete_plan(uuid), private.project_purge(uuid, uuid), private.project_orphan_scan(uuid) from public, anon, authenticated;
revoke all on function public.project_health_inputs(uuid), public.project_delete_plan(uuid), public.project_purge(uuid, uuid), public.project_orphan_scan(uuid) from public, anon, authenticated;
grant execute on function private.project_health_inputs(uuid), private.project_delete_plan(uuid), private.project_purge(uuid, uuid), private.project_orphan_scan(uuid) to service_role;
grant execute on function public.project_health_inputs(uuid), public.project_delete_plan(uuid), public.project_purge(uuid, uuid), public.project_orphan_scan(uuid) to service_role;
