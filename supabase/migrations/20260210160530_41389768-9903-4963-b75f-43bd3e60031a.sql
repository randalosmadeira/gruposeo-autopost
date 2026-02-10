
-- Remove overly permissive policy and let service_role bypass RLS naturally
DROP POLICY "Service role can manage agent runs" ON public.seo_agent_runs;
