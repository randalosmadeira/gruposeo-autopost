-- Remove the temporary acceleration index after legacy Base64 images have
-- been copied byte-for-byte to Storage and their version references updated.
DROP INDEX IF EXISTS public.idx_article_versions_inline_image_migration;
