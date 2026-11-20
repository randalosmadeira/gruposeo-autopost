-- Regra de imagem por projeto (20/11/2026): quantos artigos podem dividir a MESMA imagem antes da curadoria barrar como "repetida".
-- Sem linha = 1 (comportamento de sempre). Portais de notícia podem permitir mais (decisão do dono: Direitos News = 3).
-- RLS ligada sem política e sem permissão para anon/authenticated: só as funções (service role) leem.
-- Volta: supabase/rollbacks/20261121300000_curadoria_regras_por_projeto_rollback.sql
begin;
create table if not exists public.curadoria_project_rules (
  project_id uuid primary key,
  max_image_uses smallint not null default 1 check (max_image_uses between 1 and 10),
  note text check (note is null or char_length(note) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.curadoria_project_rules enable row level security;
revoke all on public.curadoria_project_rules from anon, authenticated, public;
commit;
