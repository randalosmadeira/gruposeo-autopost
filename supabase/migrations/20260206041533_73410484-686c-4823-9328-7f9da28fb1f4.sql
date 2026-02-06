-- Create table for article problem reports
CREATE TABLE public.article_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  credits_refunded INTEGER DEFAULT 0,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add check constraint for category
ALTER TABLE public.article_reports ADD CONSTRAINT article_reports_category_check 
CHECK (category IN ('quality', 'irrelevant', 'formatting', 'incomplete', 'technical', 'other'));

-- Add check constraint for status
ALTER TABLE public.article_reports ADD CONSTRAINT article_reports_status_check 
CHECK (status IN ('pending', 'reviewing', 'approved', 'rejected', 'refunded'));

-- Add check constraint for description minimum length
ALTER TABLE public.article_reports ADD CONSTRAINT article_reports_description_min_length 
CHECK (length(description) >= 10);

-- Enable Row Level Security
ALTER TABLE public.article_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can create their own reports"
ON public.article_reports
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own reports"
ON public.article_reports
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending reports"
ON public.article_reports
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending');

-- Create trigger for updated_at
CREATE TRIGGER update_article_reports_updated_at
BEFORE UPDATE ON public.article_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_article_reports_user_id ON public.article_reports(user_id);
CREATE INDEX idx_article_reports_article_id ON public.article_reports(article_id);
CREATE INDEX idx_article_reports_status ON public.article_reports(status);