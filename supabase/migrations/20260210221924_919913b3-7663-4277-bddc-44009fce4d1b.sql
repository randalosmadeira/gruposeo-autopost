
-- Fix security definer view - use SECURITY INVOKER instead
CREATE OR REPLACE VIEW emotional_trigger_stats 
WITH (security_invoker = true)
AS
SELECT 
  user_id,
  emotional_trigger,
  image_source,
  COUNT(*) as total_articles,
  AVG(emotional_confidence) as avg_confidence,
  COUNT(CASE WHEN image_source = 'original' THEN 1 END) as reused_count,
  COUNT(CASE WHEN image_source = 'caricature' THEN 1 END) as caricature_count,
  MIN(created_at) as first_article,
  MAX(created_at) as last_article
FROM articles
WHERE emotional_trigger IS NOT NULL
GROUP BY user_id, emotional_trigger, image_source;
