-- Rollback de S1 (A). Só rode DEPOIS de desfazer S1 (B) e de voltar o painel antigo, senão o painel novo quebra.
ALTER TABLE public.projects DROP COLUMN IF EXISTS wordpress_has_credential;
