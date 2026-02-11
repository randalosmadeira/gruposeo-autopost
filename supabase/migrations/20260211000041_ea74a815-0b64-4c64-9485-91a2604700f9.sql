
-- ===== PROJECTS: Add empresa/nicho/compliance fields =====
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS nicho text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS compliance_rules text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tom_padrao text DEFAULT 'profissional',
  ADD COLUMN IF NOT EXISTS pov_padrao text DEFAULT '3p_singular',
  ADD COLUMN IF NOT EXISTS empresa_nome text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS empresa_telefone text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS empresa_endereco text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS empresa_whatsapp text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS links_prioritarios text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS palavras_secundarias text[] DEFAULT '{}';

-- ===== ARTICLES: Add nicho/compliance/metricas Verniz fields =====
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS nicho_detectado text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS compliance_aplicado text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS angulo_analise text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS metricas_verniz jsonb DEFAULT NULL;
