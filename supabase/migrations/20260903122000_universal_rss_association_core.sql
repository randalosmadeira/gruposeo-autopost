alter table public.projects
  add column if not exists rss_feed_url text,
  add column if not exists rss_feed_validation jsonb not null default '{}'::jsonb,
  add column if not exists rss_feed_validated_at timestamptz;

alter table public.articles
  add column if not exists rss_feed_url text,
  add column if not exists source_canonical_url text,
  add column if not exists rss_feed_validation jsonb not null default '{}'::jsonb,
  add column if not exists rss_feed_validated_at timestamptz;

alter table public.monitored_portals
  add column if not exists rss_feed_validation jsonb not null default '{}'::jsonb,
  add column if not exists rss_feed_validated_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_articles_found integer not null default 0,
  add column if not exists last_ai_profile jsonb not null default '{}'::jsonb,
  add column if not exists last_ai_confidence numeric,
  add column if not exists automation_mode text not null default 'ai_95';

alter table public.rss_schedules
  add column if not exists editorial_autonomy boolean not null default true,
  add column if not exists last_decision jsonb,
  add column if not exists last_error text;

update public.rss_schedules set editorial_autonomy=true where editorial_autonomy is distinct from true;

drop index if exists public.uq_wordpress_operations_active_article;
create unique index if not exists uq_wordpress_operations_active_article_project
  on public.wordpress_operations(article_id, project_id, operation_type)
  where article_id is not null and status in ('scheduled','pending','processing','retry');

create unique index if not exists uq_rss_schedules_project_feed
  on public.rss_schedules(project_id, feed_url)
  where project_id is not null;

create unique index if not exists uq_monitored_portals_project_feed
  on public.monitored_portals(project_id, rss_feed_url)
  where project_id is not null and rss_feed_url is not null;

create index if not exists idx_articles_rss_feed_url on public.articles(rss_feed_url) where rss_feed_url is not null;
create index if not exists idx_projects_rss_feed_url on public.projects(rss_feed_url) where rss_feed_url is not null;
create index if not exists idx_rss_schedules_due_active on public.rss_schedules(next_run_at,id) where is_active is true;

comment on column public.projects.rss_feed_url is 'Validated RSS/Atom feed associated with the project canonical site URL. It never replaces canonical URLs.';
comment on column public.articles.rss_feed_url is 'Validated RSS/Atom feed associated with the article destination/source context; canonical article URL remains unchanged.';
comment on column public.articles.source_canonical_url is 'Canonical URL of source material when content originates from RSS/repost workflow.';
