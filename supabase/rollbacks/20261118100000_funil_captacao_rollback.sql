-- Rollback do funil de captação. ATENÇÃO: apaga a configuração e os números mensais lançados. Exporte antes se quiser guardá-los.
drop table if exists public.project_funnel_entries;
drop table if exists public.project_funnels;
