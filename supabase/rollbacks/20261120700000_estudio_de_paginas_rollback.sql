-- Rollback do Estúdio de Páginas.
-- ATENÇÃO: apaga TODAS as páginas do Estúdio (rascunhos, versões, plano de links, imagens vinculadas e o histórico de publicações). Páginas JÁ PUBLICADAS no WordPress ou em
-- pacotes estáticos NÃO são removidas de lá: despublique no Estúdio antes (ou apague no site). Exporte antes se quiser guardar.
-- As tabelas e funções de outros módulos não são tocadas (a migração só leu delas por to_regclass).
drop function if exists public.studio_optional_tables();
drop function if exists private.studio_optional_tables();
drop function if exists public.project_studio_summary(uuid);
drop function if exists private.project_studio_summary(uuid);
drop table if exists public.studio_publications;
drop table if exists public.studio_page_assets;
drop table if exists public.studio_page_links;
drop table if exists public.studio_page_versions;
drop table if exists public.studio_pages;
drop function if exists public.studio_page_versions_immutable();
