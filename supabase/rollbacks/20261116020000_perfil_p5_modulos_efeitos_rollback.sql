-- Rollback do P5. ANTES de remover, religa tudo que algum desligamento de módulo pausou (nada fica parado por causa de uma função que deixou de existir).
do $$
declare
  m record;
  e record;
  ids uuid[];
begin
  for m in select project_id, module_code, paused_state from public.project_modules where paused_state <> '{}'::jsonb loop
    for e in select table_name, flag_column from public.module_effects where module_code = m.module_code loop
      ids := coalesce(array(select jsonb_array_elements_text(coalesce(m.paused_state -> e.table_name, '[]'::jsonb))::uuid), '{}'::uuid[]);
      if cardinality(ids) > 0 then
        execute format('update public.%I set %I = true where project_id = $1 and id = any($2) and %I = false', e.table_name, e.flag_column, e.flag_column) using m.project_id, ids;
      end if;
    end loop;
  end loop;
end $$;

drop function if exists public.apply_project_module(uuid, text, boolean, text, uuid);
drop function if exists public.preview_project_module(uuid, text);
drop table if exists public.module_effects;
alter table public.project_modules drop constraint if exists project_modules_paused_state_object;
alter table public.project_modules drop column if exists paused_state;
