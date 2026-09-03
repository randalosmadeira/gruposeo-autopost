create or replace function public.inherit_project_rss_for_article()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.project_id is not null and (new.rss_feed_url is null or btrim(new.rss_feed_url)='') then
    select p.rss_feed_url, coalesce(p.rss_feed_validation,'{}'::jsonb), p.rss_feed_validated_at
      into new.rss_feed_url, new.rss_feed_validation, new.rss_feed_validated_at
    from public.projects p
    where p.id=new.project_id and p.user_id=new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inherit_project_rss_for_article on public.articles;
create trigger trg_inherit_project_rss_for_article
before insert or update of project_id,rss_feed_url on public.articles
for each row execute function public.inherit_project_rss_for_article();

update public.articles a
set rss_feed_url=p.rss_feed_url,
    rss_feed_validation=coalesce(p.rss_feed_validation,'{}'::jsonb),
    rss_feed_validated_at=p.rss_feed_validated_at
from public.projects p
where a.project_id=p.id and a.user_id=p.user_id
  and p.rss_feed_url is not null
  and (a.rss_feed_url is null or btrim(a.rss_feed_url)='');
