-- Add new fields to user_settings for AI configuration
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS byok_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_provider text DEFAULT 'gemini',
ADD COLUMN IF NOT EXISTS gemini_api_key text,
ADD COLUMN IF NOT EXISTS title_model text DEFAULT 'gemini-3-pro-preview',
ADD COLUMN IF NOT EXISTS content_model text DEFAULT 'gemini-3-pro-preview',
ADD COLUMN IF NOT EXISTS image_model text DEFAULT 'gemini-3-pro-image-preview',
ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Sao_Paulo';

-- Create prompt_templates table
CREATE TABLE IF NOT EXISTS public.prompt_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  template_type TEXT DEFAULT 'blog',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own templates" 
ON public.prompt_templates 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own templates" 
ON public.prompt_templates 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates" 
ON public.prompt_templates 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates" 
ON public.prompt_templates 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_prompt_templates_updated_at
BEFORE UPDATE ON public.prompt_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add seo_plugin column to projects table
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS seo_plugin text DEFAULT 'none';