-- Volta da 20261121300000: apaga as regras por projeto (todos os projetos voltam a 1 artigo por imagem).
begin;
drop table if exists public.curadoria_project_rules;
commit;
