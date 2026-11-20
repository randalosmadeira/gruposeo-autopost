-- Rollback da Indexação avançada e do barramento de eventos do projeto.
-- ATENÇÃO: apaga o inventário de URLs, o estado de indexação, o histórico de envios, a higiene, as chaves do IndexNow cadastradas aqui
-- e TODA a linha do tempo (project_events). Exporte antes se quiser guardar. As tabelas e funções de outros módulos não são tocadas.
-- (A tabela legada indexnow_config e a função indexnow-notify nunca foram alteradas por esta migração.)
drop function if exists public.project_indexation_summary(uuid);
drop function if exists private.project_indexation_summary(uuid);
drop function if exists public.indexation_gsc_pages(uuid, integer, integer);
drop function if exists private.indexation_gsc_pages(uuid, integer, integer);
drop table if exists public.index_keys;
drop table if exists public.index_hygiene;
drop table if exists public.index_submissions;
drop table if exists public.index_status;
drop table if exists public.index_urls;
drop table if exists public.project_events;
drop function if exists public.project_events_append_only();
