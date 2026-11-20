-- Rollback da Central de Projetos. ATENÇÕES:
--  1) Projetos ARQUIVADOS ou PAUSADOS voltam a aparecer como ativos (a coluna lifecycle_status some). Os agendamentos que a pausa desligou
--     NÃO são religados por este arquivo: se houver projeto pausado/arquivado, use "Retomar"/"Restaurar" na Central ANTES de reverter.
--  2) O histórico project_lifecycle_events (incluindo o registro de exclusões definitivas) é apagado. Exporte antes se precisar guardar.
--  3) Projetos já EXCLUÍDOS definitivamente não voltam (só com backup do banco).
-- Ordem: portas públicas, funções, gatilhos, tabela de histórico, colunas.
drop function if exists public.project_orphan_scan(uuid);
drop function if exists public.project_purge(uuid, uuid);
drop function if exists public.project_delete_plan(uuid);
drop function if exists public.project_health_inputs(uuid);
drop function if exists private.project_orphan_scan(uuid);
drop function if exists private.project_purge(uuid, uuid);
drop function if exists private.project_delete_plan(uuid);
drop function if exists private.project_health_inputs(uuid);
drop trigger if exists projects_lifecycle_guard_del on public.projects;
drop trigger if exists projects_lifecycle_guard_upd on public.projects;
drop function if exists public.projects_lifecycle_guard();
drop table if exists public.project_lifecycle_events;
drop index if exists public.projects_org_lifecycle_idx;
alter table public.projects drop constraint if exists projects_paused_snapshot_check;
alter table public.projects drop constraint if exists projects_paused_reason_check;
alter table public.projects drop constraint if exists projects_lifecycle_status_check;
alter table public.projects
  drop column if exists paused_snapshot,
  drop column if exists paused_at,
  drop column if exists paused_reason,
  drop column if exists archived_by,
  drop column if exists archived_at,
  drop column if exists lifecycle_status;
