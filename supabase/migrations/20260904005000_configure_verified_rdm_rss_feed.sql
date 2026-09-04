-- Only configure feeds verified by HTTP during the emergency audit.
update public.projects
set rss_feed_url = 'https://rdmadvogados.com.br/blog/feed/',
    rss_feed_validation = jsonb_build_object(
      'ok', true,
      'status', 200,
      'content_type', 'application/rss+xml',
      'verified_by', 'zica-ia-posts-emergency-audit'
    ),
    rss_feed_validated_at = now(),
    updated_at = now()
where lower(domain) = 'rdmadvogados.com.br'
  and is_connected = true;

update public.articles as article
set rss_feed_url = project.rss_feed_url,
    updated_at = now()
from public.projects as project
where article.project_id = project.id
  and lower(project.domain) = 'rdmadvogados.com.br'
  and project.rss_feed_url is not null
  and article.rss_feed_url is distinct from project.rss_feed_url;
