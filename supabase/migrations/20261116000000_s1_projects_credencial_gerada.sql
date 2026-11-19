-- S1 (A): coluna gerada que diz se o projeto tem credencial WordPress, sem expor o segredo.
-- Aditiva e reversível (rollback: supabase/rollbacks/20261116000000_s1_projects_credencial_gerada_rollback.sql).
-- O navegador passa a ler SÓ esta coluna em vez de wordpress_app_password.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS wordpress_has_credential boolean
  GENERATED ALWAYS AS (
    (coalesce(btrim(wordpress_credential_ref), '') <> '')
    OR (coalesce(btrim(wordpress_app_password), '') <> '')
  ) STORED;

COMMENT ON COLUMN public.projects.wordpress_has_credential IS
  'S1: true quando há referência no cofre (wordpress_credential_ref) ou senha legada. Substitui a leitura da senha pelo navegador.';
