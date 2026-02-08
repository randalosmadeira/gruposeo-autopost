-- Create RSS schedules table for automated feed monitoring
CREATE TABLE public.rss_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  feed_url TEXT NOT NULL,
  feed_name TEXT NOT NULL,
  niche TEXT DEFAULT 'geral',
  article_length TEXT DEFAULT 'medium',
  frequency TEXT DEFAULT 'daily',
  auto_publish BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  articles_generated INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.rss_schedules ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own RSS schedules"
ON public.rss_schedules
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own RSS schedules"
ON public.rss_schedules
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own RSS schedules"
ON public.rss_schedules
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own RSS schedules"
ON public.rss_schedules
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_rss_schedules_updated_at
BEFORE UPDATE ON public.rss_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();