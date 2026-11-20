-- Volta da migração 20261121200000: apaga as tabelas do lote de imagens, a chave de automação e o segredo do cofre.
-- As imagens já gravadas nos artigos NÃO são desfeitas (ficam em articles.featured_image_url e no bucket article-images).
begin;
drop table if exists public.curadoria_image_jobs;
drop table if exists public.curadoria_image_budget;
delete from public.automation_ingress_keys where name = 'curadoria-imagens';
delete from vault.secrets where name = 'zica_curadoria_imagens_key';
commit;
