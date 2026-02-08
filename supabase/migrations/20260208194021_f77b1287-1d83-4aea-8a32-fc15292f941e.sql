-- Enable realtime for articles (for instant UI updates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'articles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.articles;
  END IF;
END $$;

-- Performance index for large lists + filters
CREATE INDEX IF NOT EXISTS idx_articles_user_status_created_at
  ON public.articles (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_articles_user_created_at
  ON public.articles (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_articles_user_scheduled_at
  ON public.articles (user_id, scheduled_at DESC);