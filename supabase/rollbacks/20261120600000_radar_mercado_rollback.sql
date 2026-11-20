-- Rollback do Radar de Mercado.
-- ATENÇÃO: apaga focos, lugares escolhidos, concorrentes, identidades, páginas, listagens de mapas, varreduras, vínculos com a árvore, cobertura, rodadas,
-- placar semanal e rotinas. Exporte antes se quiser guardar. Tabelas e funções de outros módulos não são tocadas
-- (project_alerts só perde as linhas de origem 'radar' e volta ao CHECK antigo; project_events guarda o histórico e não é apagada aqui).
do $$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'zica-radar-run-hourly' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end $$;
delete from public.automation_ingress_keys where name = 'radar-run';
-- o segredo 'zica_radar_run_key' fica no cofre (vault); remova pelo painel se quiser: ele não abre nenhuma porta sem a linha acima.

delete from public.project_alerts where source = 'radar';
alter table public.project_alerts drop constraint if exists project_alerts_source_check;
alter table public.project_alerts add constraint project_alerts_source_check check (source in ('speed', 'backlinks'));
alter table public.project_alerts drop constraint if exists project_alerts_kind_check;
alter table public.project_alerts add constraint project_alerts_kind_check check (kind in ('score_drop', 'field_worse', 'measure_failed', 'links_lost'));

drop function if exists public.project_radar_summary(uuid);
drop function if exists private.project_radar_summary(uuid);
drop table if exists public.radar_schedules;
drop table if exists public.radar_scores;
drop table if exists public.radar_coverage;
drop table if exists public.radar_runs;
drop table if exists public.radar_links;
drop table if exists public.radar_site_scans;
drop table if exists public.radar_map_listings;
drop table if exists public.radar_pages;
drop table if exists public.radar_identity_metrics;
drop table if exists public.radar_identities;
drop table if exists public.radar_competitors;
drop table if exists public.project_focus_places;
drop table if exists public.project_focuses;
drop table if exists public.geo_place_members;
drop table if exists public.geo_places;
