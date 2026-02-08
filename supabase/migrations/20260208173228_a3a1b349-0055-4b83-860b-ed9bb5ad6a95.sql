-- Add agent_name and target_function columns to prompt_templates for better organization
ALTER TABLE public.prompt_templates 
ADD COLUMN IF NOT EXISTS agent_name TEXT,
ADD COLUMN IF NOT EXISTS target_function TEXT CHECK (target_function IN ('article_generator', 'news_rewriter', 'landing_page', 'authority_planner', 'bulk_generator', 'image_generator', 'content_variations'));

-- Add description column if not exists
ALTER TABLE public.prompt_templates 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Create an index for faster filtering by target_function
CREATE INDEX IF NOT EXISTS idx_prompt_templates_target_function 
ON public.prompt_templates(target_function) WHERE target_function IS NOT NULL;