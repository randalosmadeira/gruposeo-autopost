-- Create token usage logs table for monitoring AI consumption
CREATE TABLE public.token_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  provider TEXT NOT NULL, -- 'openai', 'gemini'
  model TEXT NOT NULL, -- 'gpt-5', 'gemini-3-pro-preview', etc.
  operation TEXT NOT NULL, -- 'title', 'content', 'image', 'outline'
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  estimated_cost_usd NUMERIC(10, 6) DEFAULT 0, -- Cost in USD
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional info like image dimensions
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_token_usage_user_id ON public.token_usage_logs(user_id);
CREATE INDEX idx_token_usage_article_id ON public.token_usage_logs(article_id);
CREATE INDEX idx_token_usage_created_at ON public.token_usage_logs(created_at DESC);
CREATE INDEX idx_token_usage_provider ON public.token_usage_logs(provider);

-- Enable RLS
ALTER TABLE public.token_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own usage logs"
  ON public.token_usage_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage logs"
  ON public.token_usage_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create a summary view for dashboard stats
CREATE OR REPLACE VIEW public.token_usage_summary AS
SELECT 
  user_id,
  DATE_TRUNC('day', created_at) as date,
  provider,
  operation,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(input_tokens + output_tokens) as total_tokens,
  SUM(estimated_cost_usd) as total_cost_usd
FROM public.token_usage_logs
GROUP BY user_id, DATE_TRUNC('day', created_at), provider, operation;

-- RLS for view (inherits from base table)
COMMENT ON VIEW public.token_usage_summary IS 'Aggregated token usage stats per user/day/provider';