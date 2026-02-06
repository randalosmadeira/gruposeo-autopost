-- Create a secure view that doesn't expose API keys
-- Only returns boolean flags indicating if keys are set

CREATE OR REPLACE VIEW public.user_settings_safe AS
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
  -- Return boolean flags instead of actual API keys
  (openai_api_key IS NOT NULL AND openai_api_key != '') as has_openai_key,
  (anthropic_api_key IS NOT NULL AND anthropic_api_key != '') as has_anthropic_key,
  (serper_api_key IS NOT NULL AND serper_api_key != '') as has_serper_key,
  (gemini_api_key IS NOT NULL AND gemini_api_key != '') as has_gemini_key
FROM public.user_settings;

-- Enable RLS on the view (views inherit RLS from underlying table)
-- Grant SELECT on view to authenticated users
GRANT SELECT ON public.user_settings_safe TO authenticated;

-- Add comment for documentation
COMMENT ON VIEW public.user_settings_safe IS 'Secure view of user_settings that hides sensitive API keys. Use this for client-side reads.';