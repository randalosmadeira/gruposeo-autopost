-- Register the canonical WordPress feed endpoints for the electoral domains.
-- They remain unvalidated until WordPress returns RSS/XML instead of 404/HTML.
update public.projects
set rss_feed_url = regexp_replace(wordpress_url, '/+$', '') || '/feed/',
    rss_feed_validation = jsonb_build_object(
      'ok', false,
      'state', 'pending_wordpress_activation',
      'checked_at', now(),
      'reason', case
        when lower(domain) = 'votardeputadofederal.drmadeira1470.com.br' then 'http_404'
        when lower(domain) = 'quemvotar.drmadeira1470.com.br' then 'html_instead_of_rss_xml'
        else 'not_yet_verified'
      end
    ),
    rss_feed_validated_at = null,
    updated_at = now()
where lower(domain) = 'drmadeira1470.com.br'
   or lower(domain) like '%.drmadeira1470.com.br';

update public.articles as article
set rss_feed_url = project.rss_feed_url,
    updated_at = now()
from public.projects as project
where article.project_id = project.id
  and (
    lower(project.domain) = 'drmadeira1470.com.br'
    or lower(project.domain) like '%.drmadeira1470.com.br'
  )
  and project.rss_feed_url is not null
  and article.rss_feed_url is distinct from project.rss_feed_url;
