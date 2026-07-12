CREATE TABLE public.hyperlocal_template_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_kind TEXT NOT NULL CHECK (template_kind IN ('forum','delegacia','polo')),
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by_ai BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, template_kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hyperlocal_template_overrides TO authenticated;
GRANT ALL ON public.hyperlocal_template_overrides TO service_role;

ALTER TABLE public.hyperlocal_template_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hl_tpl_owner_select" ON public.hyperlocal_template_overrides
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "hl_tpl_owner_insert" ON public.hyperlocal_template_overrides
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "hl_tpl_owner_update" ON public.hyperlocal_template_overrides
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "hl_tpl_owner_delete" ON public.hyperlocal_template_overrides
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_hl_tpl_updated_at
  BEFORE UPDATE ON public.hyperlocal_template_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();