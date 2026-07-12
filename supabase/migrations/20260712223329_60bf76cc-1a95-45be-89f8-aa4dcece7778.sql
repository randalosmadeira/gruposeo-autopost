
-- ============ Histórico por artigo gerado ============
CREATE TABLE public.hyperlocal_generation_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  article_id UUID NULL,
  title TEXT NOT NULL,
  keyword TEXT NULL,
  brand TEXT NULL,
  category TEXT NULL,
  fewshot_examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  fewshot_count INTEGER NOT NULL DEFAULT 0,
  template_kind TEXT NULL,
  poi_id UUID NULL,
  regen_attempts INTEGER NOT NULL DEFAULT 0,
  frontload_passes BOOLEAN NULL,
  frontload_word_count INTEGER NULL,
  first_sentence_words INTEGER NULL,
  first_sentence_ok BOOLEAN NULL,
  has_legal_base BOOLEAN NULL,
  has_jurisdiction BOOLEAN NULL,
  validation_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'single',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hgh_user ON public.hyperlocal_generation_history(user_id, created_at DESC);
CREATE INDEX idx_hgh_article ON public.hyperlocal_generation_history(article_id);
CREATE INDEX idx_hgh_category ON public.hyperlocal_generation_history(category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hyperlocal_generation_history TO authenticated;
GRANT ALL ON public.hyperlocal_generation_history TO service_role;

ALTER TABLE public.hyperlocal_generation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own generation history"
  ON public.hyperlocal_generation_history
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_hgh_updated_at
  BEFORE UPDATE ON public.hyperlocal_generation_history
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Versionamento de títulos hiperlocais ============
CREATE TABLE public.hyperlocal_title_template_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL,
  user_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  poi_type TEXT NULL,
  ymyl_subarea TEXT NULL,
  neighborhood_hint TEXT NULL,
  city_hint TEXT NULL,
  is_urgency BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL,
  source TEXT NULL,
  change_reason TEXT NULL,
  changed_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_httv_template ON public.hyperlocal_title_template_versions(template_id, version_number DESC);
CREATE INDEX idx_httv_user ON public.hyperlocal_title_template_versions(user_id);

GRANT SELECT, INSERT, DELETE ON public.hyperlocal_title_template_versions TO authenticated;
GRANT ALL ON public.hyperlocal_title_template_versions TO service_role;

ALTER TABLE public.hyperlocal_title_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own template versions"
  ON public.hyperlocal_title_template_versions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own template versions"
  ON public.hyperlocal_title_template_versions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own template versions"
  ON public.hyperlocal_title_template_versions
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============ Trigger: snapshot ao alterar um título hiperlocal ============
CREATE OR REPLACE FUNCTION public.snapshot_hyperlocal_title_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version INTEGER;
BEGIN
  IF OLD.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.title IS NOT DISTINCT FROM NEW.title
     AND OLD.category IS NOT DISTINCT FROM NEW.category
     AND OLD.poi_type IS NOT DISTINCT FROM NEW.poi_type
     AND OLD.ymyl_subarea IS NOT DISTINCT FROM NEW.ymyl_subarea
     AND OLD.neighborhood_hint IS NOT DISTINCT FROM NEW.neighborhood_hint
     AND OLD.city_hint IS NOT DISTINCT FROM NEW.city_hint
     AND OLD.is_urgency IS NOT DISTINCT FROM NEW.is_urgency
     AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
    FROM public.hyperlocal_title_template_versions
   WHERE template_id = OLD.id;

  INSERT INTO public.hyperlocal_title_template_versions (
    template_id, user_id, version_number, title, category, poi_type,
    ymyl_subarea, neighborhood_hint, city_hint, is_urgency, status, source,
    change_reason, changed_by
  ) VALUES (
    OLD.id, OLD.user_id, next_version, OLD.title, OLD.category, OLD.poi_type,
    OLD.ymyl_subarea, OLD.neighborhood_hint, OLD.city_hint, OLD.is_urgency,
    OLD.status, OLD.source, 'user_edit', OLD.user_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_hyperlocal_title
  BEFORE UPDATE ON public.hyperlocal_title_templates
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_hyperlocal_title_version();
