
-- Add emotional metadata columns to articles table
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS emotional_trigger TEXT;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS emotional_confidence FLOAT;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS image_style TEXT;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS image_source TEXT;
