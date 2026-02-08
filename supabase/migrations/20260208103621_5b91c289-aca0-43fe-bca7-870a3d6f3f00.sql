-- Add scheduled_at column for article scheduling
ALTER TABLE public.articles
ADD COLUMN scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add index for scheduled articles queries
CREATE INDEX idx_articles_scheduled_at ON public.articles (scheduled_at) WHERE scheduled_at IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.articles.scheduled_at IS 'Date and time when the article is scheduled for publication';