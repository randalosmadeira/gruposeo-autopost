-- Create generation_logs table for tracking progress and history
CREATE TABLE public.generation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  generation_type TEXT NOT NULL DEFAULT 'authority_plan',
  status TEXT NOT NULL DEFAULT 'pending',
  current_step TEXT,
  total_steps INTEGER DEFAULT 0,
  completed_steps INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.generation_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own logs"
ON public.generation_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own logs"
ON public.generation_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own logs"
ON public.generation_logs FOR UPDATE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_generation_logs_user_status ON public.generation_logs(user_id, status);
CREATE INDEX idx_generation_logs_created ON public.generation_logs(created_at DESC);