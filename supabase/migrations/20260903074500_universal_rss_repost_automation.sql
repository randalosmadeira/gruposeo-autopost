-- Universal RSS association + 95% AI repost automation. Non-destructive.

alter table public.projects
  add column if not exists rss_feed_url text,
  add column if not exists rss_feed_validation jsonb not null default '{}'::jsonb,
  add column if not exists rss_feed_validated_at timestamptz;

alter table public.articles
  add column if not exists rss_feed_url text,
  add column if not exists source_canonical_url text;

alter table public.monitored_portals
  add column if not exists automation_mode text not null default 'ai_95',
  add column if not exists rss_feed_validation jsonb not null default '{}'::jsonb,
  add column if not exists rss_feed_validated_at timestamptz,
  add column if not exists last_ai_profile jsonb not null default '{}'::jsonb,
  add column if not exists last_ai_confidence numeric(5,2),
  add column if not exists last_articles_found integer not null default 0,
  add column if not exists last_success_at timestamptz;

update public.monitored_portals
set automation_mode='ai_95',
    article_length='medium',
    default_angle='AUTO_SEMANTIC',
    preserve_original_seo=false,
    seo_preservation_percent=0,
    updated_at=now()
where is_active=true;

alter table public.monitored_portals
  drop constraint if exists monitored_portals_automation_mode_check;
alter table public.monitored_portals
  add constraint monitored_portals_automation_mode_check
  check (automation_mode in ('manual','assisted','ai_95'));

create index if not exists idx_articles_rss_feed_url
  on public.articles(rss_feed_url)
  where rss_feed_url is not null;

create index if not exists idx_projects_rss_feed_url
  on public.projects(rss_feed_url)
  where rss_feed_url is not null;

create index if not exists idx_monitored_portals_automation_mode
  on public.monitored_portals(automation_mode,is_active,next_check_at);

comment on column public.projects.rss_feed_url is 'Feed RSS/Atom validado e associado ao projeto; nunca substitui canonical/permalink.';
comment on column public.articles.rss_feed_url is 'Feed RSS/Atom associado ao conteúdo; canonical permanece em published_url/source_canonical_url.';
comment on column public.monitored_portals.automation_mode is 'manual, assisted ou ai_95. ai_95 delega nicho, ângulo, extensão, keyword, categoria/tags e recomendação de publicação à IA.';
