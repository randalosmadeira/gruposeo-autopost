
-- gbp_audits
CREATE TABLE public.gbp_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  business_name TEXT NOT NULL,
  category TEXT,
  city TEXT NOT NULL,
  country TEXT DEFAULT 'br',
  language TEXT DEFAULT 'pt-br',
  search_query TEXT,
  own_place JSONB,
  serp_data JSONB,
  local_pack JSONB,
  ai_insights JSONB,
  ai_provider TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbp_audits TO authenticated;
GRANT ALL ON public.gbp_audits TO service_role;
ALTER TABLE public.gbp_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gbp_audits_owner_all" ON public.gbp_audits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_gbp_audits_updated BEFORE UPDATE ON public.gbp_audits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_gbp_audits_user ON public.gbp_audits(user_id, created_at DESC);

-- gbp_competitors
CREATE TABLE public.gbp_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.gbp_audits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id TEXT,
  name TEXT NOT NULL,
  address TEXT,
  category TEXT,
  rating NUMERIC,
  reviews_count INTEGER,
  phone TEXT,
  website TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  price_level TEXT,
  hours JSONB,
  raw JSONB,
  tracked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbp_competitors TO authenticated;
GRANT ALL ON public.gbp_competitors TO service_role;
ALTER TABLE public.gbp_competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gbp_competitors_owner_all" ON public.gbp_competitors FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_gbp_competitors_updated BEFORE UPDATE ON public.gbp_competitors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_gbp_competitors_audit ON public.gbp_competitors(audit_id);
CREATE INDEX idx_gbp_competitors_user ON public.gbp_competitors(user_id);

-- gbp_competitor_snapshots (timeline)
CREATE TABLE public.gbp_competitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES public.gbp_competitors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  rating NUMERIC,
  reviews_count INTEGER,
  posts_count INTEGER,
  photos_count INTEGER,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competitor_id, snapshot_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbp_competitor_snapshots TO authenticated;
GRANT ALL ON public.gbp_competitor_snapshots TO service_role;
ALTER TABLE public.gbp_competitor_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gbp_snapshots_owner_all" ON public.gbp_competitor_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_gbp_snapshots_competitor_date ON public.gbp_competitor_snapshots(competitor_id, snapshot_date DESC);
