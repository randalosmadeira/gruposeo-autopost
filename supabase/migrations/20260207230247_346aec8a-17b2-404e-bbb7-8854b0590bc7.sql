-- Fix security definer views by using SECURITY INVOKER (default, but explicit for clarity)
-- Drop and recreate views with proper security settings

-- Fix token_usage_summary view
DROP VIEW IF EXISTS public.token_usage_summary;

CREATE VIEW public.token_usage_summary 
WITH (security_invoker = true)
AS
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

COMMENT ON VIEW public.token_usage_summary IS 'Aggregated token usage stats per user/day/provider - uses SECURITY INVOKER';