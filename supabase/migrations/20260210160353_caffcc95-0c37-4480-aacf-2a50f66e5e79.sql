
-- Table to track SEO Agent autonomous runs
CREATE TABLE public.seo_agent_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'manual'
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'error'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit results
  meta_issues_found INTEGER DEFAULT 0,
  meta_issues_fixed INTEGER DEFAULT 0,
  links_suggested INTEGER DEFAULT 0,
  links_applied INTEGER DEFAULT 0,
  indexing_submitted INTEGER DEFAULT 0,
  sitemap_updated BOOLEAN DEFAULT false,
  
  -- Details
  summary TEXT,
  details JSONB DEFAULT '{}',
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.seo_agent_runs ENABLE ROW LEVEL SECURITY;

-- Users can view their own runs
CREATE POLICY "Users can view their own agent runs" ON public.seo_agent_runs
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can insert/update (agent runs via edge function)
CREATE POLICY "Service role can manage agent runs" ON public.seo_agent_runs
  FOR ALL USING (true) WITH CHECK (true);

-- Index for fast queries
CREATE INDEX idx_seo_agent_runs_user_project ON public.seo_agent_runs(user_id, project_id);
CREATE INDEX idx_seo_agent_runs_status ON public.seo_agent_runs(status, started_at DESC);
