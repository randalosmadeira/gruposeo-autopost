
ALTER TABLE public.hyperlocal_title_templates
  DROP CONSTRAINT IF EXISTS hyperlocal_title_templates_category_check;

ALTER TABLE public.hyperlocal_title_templates
  ADD CONSTRAINT hyperlocal_title_templates_category_check
  CHECK (category = ANY (ARRAY[
    'criminal_24h', 'colarinho_branco', 'isp', 'fraude_bancaria', 'aeroporto', 'foruns',
    'tributario', 'ordem_economica', 'execucao_fiscal', 'credito_fomento'
  ]));
