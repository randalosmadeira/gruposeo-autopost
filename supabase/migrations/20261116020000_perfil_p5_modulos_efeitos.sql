-- P5 do Perfil do Projeto: a decisão de módulo passa a TER EFEITO nas rotinas do projeto.
-- Regras de segurança (valem para tudo abaixo):
--   * Decisão não gravada = nada muda. Só "desligar" explícito pausa; "religar" restaura EXATAMENTE o que aquele desligamento pausou.
--   * Nada é apagado. Pausar = trocar o interruptor que cada rotina já tem (is_active/active) e guardar os ids afetados.
--   * Só linhas do próprio projeto; só tabelas/colunas da lista fechada `module_effects`.
--   * As funções só executam com a chave de serviço (a função de borda confere papel owner/admin antes).
-- Aditiva e reversível: supabase/rollbacks/20261116020000_perfil_p5_modulos_efeitos_rollback.sql (restaura o que estiver pausado e remove).

alter table public.project_modules
  add column if not exists paused_state jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'project_modules_paused_state_object' and conrelid = 'public.project_modules'::regclass) then
    alter table public.project_modules add constraint project_modules_paused_state_object check (jsonb_typeof(paused_state) = 'object');
  end if;
end $$;

-- Lista fechada: qual interruptor cada módulo controla.
create table if not exists public.module_effects (
  module_code text not null references public.module_catalog(code) on delete cascade,
  table_name  text not null,
  flag_column text not null,
  label       text not null check (length(label) between 3 and 120),
  primary key (module_code, table_name),
  constraint module_effects_table_allowed check (table_name in ('news_agents', 'rss_schedules', 'monitored_portals', 'keyword_link_rules', 'nexus_prompts', 'electoral_portal_resources')),
  constraint module_effects_flag_allowed check (flag_column in ('is_active', 'active'))
);
alter table public.module_effects enable row level security;
revoke all on table public.module_effects from public, anon, authenticated;
grant all on table public.module_effects to service_role;

insert into public.module_effects (module_code, table_name, flag_column, label) values
  ('news_agents',        'news_agents',                'is_active', 'Agentes de notícias'),
  ('news_rewriter',      'monitored_portals',          'is_active', 'Portais monitorados'),
  ('news_rewriter',      'rss_schedules',              'is_active', 'Agendas de RSS'),
  ('internal_linking',   'keyword_link_rules',         'is_active', 'Regras de links por palavra-chave'),
  ('nexus_observatory',  'nexus_prompts',              'active',    'Perguntas de acompanhamento às IAs'),
  ('electoral_campaign', 'electoral_portal_resources', 'active',    'Recursos editoriais do portal eleitoral')
on conflict (module_code, table_name) do nothing;

-- O que seria pausado agora (só leitura): usado pela confirmação na tela.
create or replace function public.preview_project_module(p_project uuid, p_module text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e record;
  n integer;
  result jsonb := '[]'::jsonb;
begin
  for e in select table_name, flag_column, label from public.module_effects where module_code = p_module order by table_name loop
    execute format('select count(*) from public.%I where project_id = $1 and %I = true', e.table_name, e.flag_column) into n using p_project;
    result := result || jsonb_build_array(jsonb_build_object('table', e.table_name, 'label', e.label, 'active', n));
  end loop;
  return result;
end;
$$;

-- Grava a decisão E aplica o efeito, na mesma transação.
create or replace function public.apply_project_module(p_project uuid, p_module text, p_enabled boolean, p_reason text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  proj record;
  cat record;
  e record;
  prev jsonb;
  paused jsonb;
  old_ids uuid[];
  new_ids uuid[];
  all_ids uuid[];
  n integer;
  changed jsonb := '[]'::jsonb;
  now_ts timestamptz := now();
begin
  select id, organization_id into proj from public.projects where id = p_project for update;
  if not found then raise exception 'project_not_found'; end if;
  select code, core into cat from public.module_catalog where code = p_module;
  if not found then raise exception 'module_unknown'; end if;
  if cat.core and not p_enabled then raise exception 'core_module_cannot_be_disabled'; end if;

  select paused_state into prev from public.project_modules where project_id = p_project and module_code = p_module for update;
  prev := coalesce(prev, '{}'::jsonb);
  paused := prev;

  for e in select table_name, flag_column, label from public.module_effects where module_code = p_module order by table_name loop
    old_ids := coalesce(array(select jsonb_array_elements_text(coalesce(prev -> e.table_name, '[]'::jsonb))::uuid), '{}'::uuid[]);
    if p_enabled then
      n := 0;
      if cardinality(old_ids) > 0 then
        execute format('update public.%I set %I = true where project_id = $1 and id = any($2) and %I = false', e.table_name, e.flag_column, e.flag_column) using p_project, old_ids;
        get diagnostics n = row_count;
      end if;
      paused := paused - e.table_name;
      changed := changed || jsonb_build_array(jsonb_build_object('table', e.table_name, 'label', e.label, 'restored', n));
    else
      execute format('with u as (update public.%I set %I = false where project_id = $1 and %I = true returning id) select coalesce(array_agg(id), ''{}''::uuid[]) from u', e.table_name, e.flag_column, e.flag_column) into new_ids using p_project;
      n := cardinality(new_ids);
      all_ids := coalesce(array(select distinct x from unnest(new_ids || old_ids) as x), '{}'::uuid[]);
      if cardinality(all_ids) > 0 then paused := jsonb_set(paused, array[e.table_name], to_jsonb(all_ids), true); end if;
      changed := changed || jsonb_build_array(jsonb_build_object('table', e.table_name, 'label', e.label, 'paused', n));
    end if;
  end loop;

  insert into public.project_modules (project_id, organization_id, module_code, enabled, reason, decided_by, decided_at, updated_at, paused_state)
  values (p_project, proj.organization_id, p_module, p_enabled, nullif(left(coalesce(p_reason, ''), 500), ''), p_actor, now_ts, now_ts, paused)
  on conflict (project_id, module_code) do update
    set enabled = excluded.enabled, reason = excluded.reason, decided_by = excluded.decided_by, decided_at = excluded.decided_at, updated_at = excluded.updated_at, paused_state = excluded.paused_state;

  return jsonb_build_object('enabled', p_enabled, 'effects', changed);
end;
$$;

revoke all on function public.preview_project_module(uuid, text) from public, anon, authenticated;
revoke all on function public.apply_project_module(uuid, text, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.preview_project_module(uuid, text) to service_role;
grant execute on function public.apply_project_module(uuid, text, boolean, text, uuid) to service_role;
