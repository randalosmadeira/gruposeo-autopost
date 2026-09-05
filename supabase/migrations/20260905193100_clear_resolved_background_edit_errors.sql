-- Remove only obsolete image errors after a valid replacement image exists.
-- Other operational errors remain available for diagnosis and retry handling.
update public.articles
set error_message = null,
    updated_at = now()
where error_message ilike '%background_edit%'
  and nullif(trim(featured_image_url), '') is not null;
