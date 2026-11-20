-- Rollback da Curadoria de conteúdo.
-- ATENÇÃO: apaga os relatórios de curadoria (article_curation). Os artigos NÃO são tocados (a curadoria nunca os alterou).
-- Sem a tabela, o portão da publicação (publish-to-wordpress) recusa artigo novo por falha de leitura: desligue-o ANTES (variável CURADORIA_GATE=off na função), senão o conteúdo novo não sai.
-- Exporte antes se quiser guardar. Tabelas e funções de outros módulos não são tocadas.
drop function if exists public.project_curation_summary(uuid);
drop function if exists private.project_curation_summary(uuid);
drop table if exists public.article_curation;
drop function if exists public.article_curation_assert_article();
