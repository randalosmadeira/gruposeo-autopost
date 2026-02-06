-- Step 1: Recreate the view WITHOUT security_invoker so it can bypass RLS on base table
-- The view itself includes a WHERE clause to filter by user
DROP VIEW IF EXISTS public.user_settings_safe;

CREATE VIEW public.user_settings_safe AS
SELECT 
  id,
  user_id,
  default_language,
  default_tone,
  default_point_of_view,
  ai_provider,
  timezone,
  email_notifications,
  byok_enabled,
  title_model,
  content_model,
  image_model,
  default_ai_model,
  created_at,
  updated_at,
  -- Expose only boolean flags for API keys, never the actual keys
  (openai_api_key IS NOT NULL AND openai_api_key != '') as has_openai_key,
  (anthropic_api_key IS NOT NULL AND anthropic_api_key != '') as has_anthropic_key,
  (serper_api_key IS NOT NULL AND serper_api_key != '') as has_serper_key,
  (gemini_api_key IS NOT NULL AND gemini_api_key != '') as has_gemini_key
FROM public.user_settings
WHERE user_id = auth.uid();

-- Grant SELECT on the view to authenticated users
GRANT SELECT ON public.user_settings_safe TO authenticated;

-- Step 2: Drop the existing SELECT policy on the base table
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;

-- Step 3: Create a new restrictive SELECT policy that denies direct access
-- Users must use the user_settings_safe view instead
CREATE POLICY "Deny direct SELECT - use user_settings_safe view"
ON public.user_settings
FOR SELECT
USING (false);

-- Add a comment explaining the security design
COMMENT ON VIEW public.user_settings_safe IS 'Secure view for user settings that hides API keys. Use this view instead of querying user_settings directly.';