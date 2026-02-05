-- Create wordpress_stats table to store synchronized statistics from WordPress sites
CREATE TABLE public.wordpress_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Article statistics
  total_articles INTEGER DEFAULT 0,
  published_articles INTEGER DEFAULT 0,
  draft_articles INTEGER DEFAULT 0,
  pending_articles INTEGER DEFAULT 0,
  
  -- Sync statistics
  synced_articles INTEGER DEFAULT 0,
  sync_errors INTEGER DEFAULT 0,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  
  -- Content health
  articles_needing_attention INTEGER DEFAULT 0,
  missing_featured_images INTEGER DEFAULT 0,
  seo_issues INTEGER DEFAULT 0,
  broken_links INTEGER DEFAULT 0,
  
  -- Internal linking
  total_internal_links INTEGER DEFAULT 0,
  articles_without_links INTEGER DEFAULT 0,
  
  -- Comments
  total_comments INTEGER DEFAULT 0,
  pending_comments INTEGER DEFAULT 0,
  approved_comments INTEGER DEFAULT 0,
  
  -- Publishing trends (last 7 days)
  publishing_trend JSONB DEFAULT '[]'::jsonb,
  
  -- Auto-corrections applied
  auto_corrections_applied INTEGER DEFAULT 0,
  
  -- Raw sync data from plugin
  raw_data JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wordpress_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own wordpress stats"
  ON public.wordpress_stats
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wordpress stats"
  ON public.wordpress_stats
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wordpress stats"
  ON public.wordpress_stats
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wordpress stats"
  ON public.wordpress_stats
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_wordpress_stats_updated_at
  BEFORE UPDATE ON public.wordpress_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_wordpress_stats_project_id ON public.wordpress_stats(project_id);
CREATE INDEX idx_wordpress_stats_user_id ON public.wordpress_stats(user_id);