-- Moving the exact same image bytes from an inline data URL to Storage is a
-- storage operation, not an editorial revision. Avoid duplicating multi-MB
-- Base64 into article_versions while preserving normal version history.
create or replace function public.save_article_version()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  next_version integer;
  storage_only boolean;
begin
  storage_only :=
    old.featured_image_url is distinct from new.featured_image_url
    and coalesce((new.config->'image_geo'->>'original_base64_preserved')::boolean, false)
    and old.title is not distinct from new.title
    and old.content is not distinct from new.content
    and old.excerpt is not distinct from new.excerpt
    and old.slug is not distinct from new.slug;

  if storage_only then
    return new;
  end if;

  if old.title is distinct from new.title
     or old.content is distinct from new.content
     or old.excerpt is distinct from new.excerpt
     or old.featured_image_url is distinct from new.featured_image_url
     or old.slug is distinct from new.slug
     or old.config is distinct from new.config then
    perform pg_advisory_xact_lock(hashtextextended(old.id::text, 0));
    select coalesce(max(version_number), 0) + 1 into next_version
      from public.article_versions where article_id = old.id;
    insert into public.article_versions (
      article_id,user_id,version_number,title,content,excerpt,
      featured_image_url,word_count,is_auto_save,change_description
    ) values (
      old.id,old.user_id,next_version,old.title,old.content,old.excerpt,
      old.featured_image_url,old.word_count,true,'Auto-save antes de edição'
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.save_article_version() from public, anon, authenticated;
