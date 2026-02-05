-- Add new columns to news_agents table for full functionality
ALTER TABLE public.news_agents
ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'news',
ADD COLUMN IF NOT EXISTS rss_feeds TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS news_per_day INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS publish_status TEXT DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS active_days TEXT[] DEFAULT ARRAY['seg', 'ter', 'qua', 'qui', 'sex'],
ADD COLUMN IF NOT EXISTS execution_times TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS search_window TEXT DEFAULT '24h',
ADD COLUMN IF NOT EXISTS image_generation TEXT DEFAULT 'ai',
ADD COLUMN IF NOT EXISTS prompt_template TEXT DEFAULT 'news_article',
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Create table for generated news from agents
CREATE TABLE IF NOT EXISTS public.agent_news (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.news_agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  source_url TEXT,
  source_name TEXT,
  original_title TEXT,
  status TEXT DEFAULT 'pending',
  article_id UUID REFERENCES public.articles(id),
  generated_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_news ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agent_news
CREATE POLICY "Users can view their own agent news"
ON public.agent_news
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own agent news"
ON public.agent_news
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent news"
ON public.agent_news
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agent news"
ON public.agent_news
FOR DELETE
USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_news_agent_id ON public.agent_news(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_news_user_id ON public.agent_news(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_news_status ON public.agent_news(status);