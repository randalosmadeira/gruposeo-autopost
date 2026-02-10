-- Fix: The UPDATE policy needs WITH CHECK so the modified row passes RLS validation.
-- Currently the SELECT policy is "false" (deny), and Postgres falls back to it for WITH CHECK.
DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;

CREATE POLICY "Users can update their own settings"
ON public.user_settings
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);