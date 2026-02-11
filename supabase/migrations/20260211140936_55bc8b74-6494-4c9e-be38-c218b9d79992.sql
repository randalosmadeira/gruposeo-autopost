
-- Add social media and strategic link columns to projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS social_instagram text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS social_youtube text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS social_linkedin text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS social_twitter text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS social_tiktok text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS social_google_maps text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS social_linktree text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cta_comunidade text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cta_conclusao text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cta_leads text DEFAULT NULL;
