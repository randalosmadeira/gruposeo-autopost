-- Rollback do monitoramento da Velocidade e dos Backlinks. ATENÇÃO: apaga agendamentos, avisos e a lista de backlinks. Exporte antes se quiser guardá-los.
do $$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'zica-site-monitor-10min' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end $$;
delete from public.automation_ingress_keys where name = 'site-monitor';
delete from vault.secrets where name = 'zica_site_monitor_key';
drop table if exists public.project_backlink_settings;
drop table if exists public.project_backlinks;
drop table if exists public.project_alerts;
drop table if exists public.project_speed_schedules;
