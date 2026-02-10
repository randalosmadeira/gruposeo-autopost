
-- Fix: make INSERT policy more restrictive - only allow authenticated users to insert their own OR service role
DROP POLICY "Service role can insert notifications" ON public.cron_notifications;

CREATE POLICY "Users can insert their own notifications"
  ON public.cron_notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);
