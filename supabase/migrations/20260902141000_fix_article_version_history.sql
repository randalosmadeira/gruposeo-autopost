-- Corrige o histórico do editor para registrar todas as alterações editoriais relevantes.
-- Também cria uma fotografia inicial para artigos que ainda não possuem histórico.

CREATE UNIQUE INDEX IF NOT EXISTS article_versions_article_version_uidx
  ON public.article_versions (article_id, version_number);

CREATE OR REPLACE FUNCTION public.save_article_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_version INTEGER;
BEGIN
  IF OLD.title IS DISTINCT FROM NEW.title
     OR OLD.content IS DISTINCT FROM NEW.content
     OR OLD.excerpt IS DISTINCT FROM NEW.excerpt
     OR OLD.featured_image_url IS DISTINCT FROM NEW.featured_image_url
     OR OLD.slug IS DISTINCT FROM NEW.slug
     OR OLD.config IS DISTINCT FROM NEW.config THEN

    PERFORM pg_advisory_xact_lock(hashtextextended(OLD.id::text, 0));

    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO next_version
      FROM public.article_versions
     WHERE article_id = OLD.id;

    INSERT INTO public.article_versions (
      article_id,
      user_id,
      version_number,
      title,
      content,
      excerpt,
      featured_image_url,
      word_count,
      is_auto_save,
      change_description
    ) VALUES (
      OLD.id,
      OLD.user_id,
      next_version,
      OLD.title,
      OLD.content,
      OLD.excerpt,
      OLD.featured_image_url,
      OLD.word_count,
      true,
      'Auto-save antes de edição'
    );
  END IF;

  RETURN NEW;
END;
$function$;

INSERT INTO public.article_versions (
  article_id,
  user_id,
  version_number,
  title,
  content,
  excerpt,
  featured_image_url,
  word_count,
  is_auto_save,
  change_description
)
SELECT
  a.id,
  a.user_id,
  1,
  a.title,
  a.content,
  a.excerpt,
  a.featured_image_url,
  a.word_count,
  false,
  'Estado inicial capturado pelo editor'
FROM public.articles a
WHERE NOT EXISTS (
  SELECT 1
  FROM public.article_versions v
  WHERE v.article_id = a.id
);
