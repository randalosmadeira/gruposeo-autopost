-- Fix the existing user_settings_safe view to use SECURITY INVOKER
DROP VIEW IF EXISTS public.user_settings_safe;

CREATE VIEW public.user_settings_safe 
WITH (security_invoker = true)
AS
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
  -- Boolean flags instead of actual API keys
  (openai_api_key IS NOT NULL AND openai_api_key != '') as has_openai_key,
  (anthropic_api_key IS NOT NULL AND anthropic_api_key != '') as has_anthropic_key,
  (serper_api_key IS NOT NULL AND serper_api_key != '') as has_serper_key,
  (gemini_api_key IS NOT NULL AND gemini_api_key != '') as has_gemini_key
FROM public.user_settings
WHERE auth.uid() = user_id;

COMMENT ON VIEW public.user_settings_safe IS 'Safe view of user settings without exposing API keys - uses SECURITY INVOKER';