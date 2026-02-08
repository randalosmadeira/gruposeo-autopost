-- Create table for monitored portals/sources
CREATE TABLE public.monitored_portals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Portal info
  portal_name TEXT NOT NULL,
  portal_url TEXT NOT NULL,
  portal_domain TEXT NOT NULL,
  rss_feed_url TEXT,
  
  -- Content preferences
  niches TEXT[] DEFAULT '{}',
  preferred_keywords TEXT[] DEFAULT '{}',
  excluded_keywords TEXT[] DEFAULT '{}',
  
  -- Article configuration
  article_length TEXT DEFAULT 'medium' CHECK (article_length IN ('short', 'medium', 'long')),
  default_angle TEXT,
  
  -- SEO settings
  custom_slug_prefix TEXT,
  auto_title BOOLEAN DEFAULT true,
  auto_meta_description BOOLEAN DEFAULT true,
  preserve_original_seo BOOLEAN DEFAULT true,
  seo_preservation_percent INTEGER DEFAULT 95,
  
  -- Scheduling
  is_active BOOLEAN DEFAULT true,
  monitoring_frequency TEXT DEFAULT 'hourly' CHECK (monitoring_frequency IN ('realtime', 'hourly', 'daily', 'weekly')),
  active_hours TEXT[] DEFAULT ARRAY['00:00', '23:59'],
  active_days TEXT[] DEFAULT ARRAY['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'],
  max_articles_per_day INTEGER DEFAULT 5,
  next_check_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Auto-publish settings
  auto_publish BOOLEAN DEFAULT false,
  publish_delay_minutes INTEGER DEFAULT 0,
  
  -- Sitemap integration
  update_sitemap BOOLEAN DEFAULT true,
  sitemap_priority NUMERIC(2,1) DEFAULT 0.8,
  
  -- Stats
  articles_generated INTEGER DEFAULT 0,
  last_check_at TIMESTAMP WITH TIME ZONE,
  last_article_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.monitored_portals ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own monitored portals"
  ON public.monitored_portals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own monitored portals"
  ON public.monitored_portals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own monitored portals"
  ON public.monitored_portals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own monitored portals"
  ON public.monitored_portals FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_monitored_portals_updated_at
  BEFORE UPDATE ON public.monitored_portals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_monitored_portals_user ON public.monitored_portals(user_id);
CREATE INDEX idx_monitored_portals_active ON public.monitored_portals(is_active, next_check_at) WHERE is_active = true;
CREATE INDEX idx_monitored_portals_project ON public.monitored_portals(project_id);