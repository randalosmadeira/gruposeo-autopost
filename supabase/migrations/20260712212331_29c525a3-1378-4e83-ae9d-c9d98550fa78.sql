-- POI hiperlocal: fóruns, delegacias, polos comerciais/tecnológicos, tribunais
CREATE TABLE public.poi_hyperlocal (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  poi_type TEXT NOT NULL CHECK (poi_type IN ('forum','delegacia','polo','tribunal','cartorio','outro')),
  name TEXT NOT NULL,
  slug TEXT,
  full_address TEXT,
  neighborhood TEXT,
  city TEXT NOT NULL,
  state_uf TEXT NOT NULL,
  comarca TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  neighborhoods_served TEXT[] DEFAULT '{}'::text[],
  opening_hours TEXT,
  is_24_7 BOOLEAN NOT NULL DEFAULT false,
  ymyl_subareas TEXT[] DEFAULT '{}'::text[],
  urgency_phone TEXT,
  virtual_channel_url TEXT,
  official_url TEXT,
  discovery_source TEXT NOT NULL DEFAULT 'manual' CHECK (discovery_source IN ('manual','serper','firecrawl','places','import')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
  internal_notes TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poi_hyperlocal_user_status ON public.poi_hyperlocal(user_id, status);
CREATE INDEX idx_poi_hyperlocal_city_neigh ON public.poi_hyperlocal(city, neighborhood);
CREATE INDEX idx_poi_hyperlocal_type ON public.poi_hyperlocal(poi_type);
CREATE INDEX idx_poi_hyperlocal_ymyl ON public.poi_hyperlocal USING GIN (ymyl_subareas);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.poi_hyperlocal TO authenticated;
GRANT ALL ON public.poi_hyperlocal TO service_role;

ALTER TABLE public.poi_hyperlocal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poi_hyperlocal_owner_select" ON public.poi_hyperlocal
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "poi_hyperlocal_owner_insert" ON public.poi_hyperlocal
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "poi_hyperlocal_owner_update" ON public.poi_hyperlocal
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "poi_hyperlocal_owner_delete" ON public.poi_hyperlocal
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_poi_hyperlocal_updated_at
  BEFORE UPDATE ON public.poi_hyperlocal
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();