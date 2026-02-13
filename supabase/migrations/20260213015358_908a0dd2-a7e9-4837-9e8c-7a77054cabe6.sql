
-- Create storage bucket for temporary analysis file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('analysis-uploads', 'analysis-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can upload/read/delete their own files
CREATE POLICY "Users can upload analysis files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'analysis-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read their own analysis files"
ON storage.objects FOR SELECT
USING (bucket_id = 'analysis-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own analysis files"
ON storage.objects FOR DELETE
USING (bucket_id = 'analysis-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Table to track uploaded files and analysis status
CREATE TABLE public.analysis_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'gsc', 'ubersuggest', 'generic'
  file_format TEXT NOT NULL, -- 'csv', 'xlsx', 'pdf'
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploaded', -- uploaded, analyzing, completed, error, cleaned
  analysis_result JSONB,
  corrections_applied JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  analyzed_at TIMESTAMP WITH TIME ZONE,
  cleaned_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.analysis_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own uploads"
ON public.analysis_uploads FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own uploads"
ON public.analysis_uploads FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own uploads"
ON public.analysis_uploads FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own uploads"
ON public.analysis_uploads FOR DELETE
USING (auth.uid() = user_id);

-- Index for cleanup queries
CREATE INDEX idx_analysis_uploads_status ON public.analysis_uploads(status);
CREATE INDEX idx_analysis_uploads_user ON public.analysis_uploads(user_id);
