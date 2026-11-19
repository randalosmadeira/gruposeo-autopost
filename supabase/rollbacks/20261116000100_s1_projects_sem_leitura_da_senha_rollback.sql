-- Rollback de S1 (B): devolve a leitura da tabela inteira (inclusive a senha legada) ao papel authenticated.
GRANT SELECT ON public.projects TO authenticated;
