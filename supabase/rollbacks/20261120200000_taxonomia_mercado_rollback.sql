-- Rollback do Motor de Taxonomia e Planejador de Campanha de Mercado. ATENÇÃO: apaga a árvore de taxonomia, o escopo geográfico, as campanhas,
-- as consultas, os resultados de busca importados e os concorrentes calculados. Exporte antes se quiser guardá-los.
drop function if exists public.taxonomy_search_sample(uuid, integer, integer);
drop function if exists private.taxonomy_search_sample(uuid, integer, integer);
drop table if exists public.market_competitors;
drop table if exists public.market_serp_results;
drop table if exists public.market_queries;
drop table if exists public.market_campaigns;
drop table if exists public.project_geo_scope;
drop table if exists public.project_taxonomy_edges;
drop table if exists public.project_taxonomy_nodes;
drop table if exists public.ibge_municipios;
