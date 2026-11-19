-- Rollback da Visão Geral/Estrutura e dos cliques de contato. ATENÇÃO: apaga os mapas guardados do domínio e os sinais 'cta_click' já gravados.
drop function if exists public.site_overview_data(uuid, integer);
drop function if exists private.site_overview_data(uuid, integer);
delete from public.nexus_site_signals where kind = 'cta_click';
alter table public.nexus_site_signals drop constraint if exists nexus_site_signals_kind_check;
alter table public.nexus_site_signals add constraint nexus_site_signals_kind_check check (kind in ('ai_bot_hit', 'ai_referral', 'search_referral', 'human_pageview'));
-- (restaurar private.nexus_record_signals sem 'cta_click': reaplicar o trecho original de 20261112120000_nexus_observatory.sql)
drop table if exists public.project_site_maps;
