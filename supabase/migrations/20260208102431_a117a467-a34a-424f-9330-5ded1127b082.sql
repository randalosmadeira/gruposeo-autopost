-- Create table to store article version history
CREATE TABLE public.article_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  title TEXT,
  content TEXT,
  excerpt TEXT,
  featured_image_url TEXT,
  word_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  change_description TEXT,
  is_auto_save BOOLEAN DEFAULT false
);

-- Create index for faster queries
CREATE INDEX idx_article_versions_article_id ON public.article_versions(article_id);
CREATE INDEX idx_article_versions_user_id ON public.article_versions(user_id);
CREATE INDEX idx_article_versions_created_at ON public.article_versions(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.article_versions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own article versions" 
ON public.article_versions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own article versions" 
ON public.article_versions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own article versions" 
ON public.article_versions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Function to auto-save version before article update
CREATE OR REPLACE FUNCTION public.save_article_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Get the next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
  FROM public.article_versions
  WHERE article_id = OLD.id;
  
  -- Only save if content actually changed
  IF OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO public.article_versions (
      article_id,
      user_id,
      version_number,
      title,
      content,
      excerpt,
      featured_image_url,
      word_count,
      is_auto_save,
      change_description
    ) VALUES (
      OLD.id,
      OLD.user_id,
      next_version,
      OLD.title,
      OLD.content,
      OLD.excerpt,
      OLD.featured_image_url,
      OLD.word_count,
      true,
      'Auto-save antes de edição'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-save versions
CREATE TRIGGER trigger_save_article_version
BEFORE UPDATE ON public.articles
FOR EACH ROW
EXECUTE FUNCTION public.save_article_version();