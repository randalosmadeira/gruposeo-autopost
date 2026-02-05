-- Create news_agents table
CREATE TABLE public.news_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  topics TEXT[] NOT NULL DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT false,
  
  -- Configuration
  search_internal_links BOOLEAN DEFAULT false,
  cite_sources_inline BOOLEAN DEFAULT true,
  cite_sources_footer BOOLEAN DEFAULT false,
  auto_publish BOOLEAN DEFAULT false,
  post_type TEXT DEFAULT 'blog',
  language TEXT DEFAULT 'pt-BR',
  country TEXT DEFAULT 'BR',
  
  -- Stats
  articles_generated INTEGER DEFAULT 0,
  last_run_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.news_agents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own news agents"
ON public.news_agents
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own news agents"
ON public.news_agents
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own news agents"
ON public.news_agents
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own news agents"
ON public.news_agents
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_news_agents_updated_at
BEFORE UPDATE ON public.news_agents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index
CREATE INDEX idx_news_agents_user_id ON public.news_agents(user_id);
CREATE INDEX idx_news_agents_project_id ON public.news_agents(project_id);
CREATE INDEX idx_news_agents_is_active ON public.news_agents(is_active);