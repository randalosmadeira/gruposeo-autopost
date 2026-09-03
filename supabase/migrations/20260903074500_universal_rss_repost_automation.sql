-- Universal RSS association + 95% AI repost automation. Non-destructive.

alter table public.projects
  add column if not exists rss_feed_url text,
  add column if not exists rss_feed_validation jsonb not null default '{}'::jsonb,
  add column if not exists rss_feed_validated_at timestamptz;

alter table public.articles
  add column if not exists rss_feed_url text,
  add column if not exists source_rss_feed_url text,
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

create or replace function public.zica_project_rss_same_host()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  wp_host text;
  rss_host text;
begin
  if new.rss_feed_url is null or new.wordpress_url is null then return new; end if;
  wp_host := lower(substring(new.wordpress_url from '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/:?#]+)'));
  rss_host := lower(substring(new.rss_feed_url from '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/:?#]+)'));
  if wp_host is null or rss_host is null or wp_host <> rss_host then
    if tg_op='UPDATE' then
      new.rss_feed_url := old.rss_feed_url;
      new.rss_feed_validation := old.rss_feed_validation;
      new.rss_feed_validated_at := old.rss_feed_validated_at;
    else
      new.rss_feed_url := null;
      new.rss_feed_validation := '{}'::jsonb;
      new.rss_feed_validated_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zica_project_rss_same_host on public.projects;
create trigger trg_zica_project_rss_same_host
before insert or update of rss_feed_url,wordpress_url
on public.projects
for each row execute function public.zica_project_rss_same_host();

create or replace function public.zica_separate_repost_rss()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if coalesce(new.config->>'type','')='rewrite'
     and new.source_canonical_url is not null
     and new.rss_feed_url is not null
     and coalesce(new.config->>'rss_feed_url','')=new.rss_feed_url then
    new.source_rss_feed_url := coalesce(new.source_rss_feed_url,new.rss_feed_url);
    new.rss_feed_url := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zica_separate_repost_rss on public.articles;
create trigger trg_zica_separate_repost_rss
before insert or update of rss_feed_url,source_rss_feed_url,source_canonical_url,config
on public.articles
for each row execute function public.zica_separate_repost_rss();

create index if not exists idx_articles_rss_feed_url
  on public.articles(rss_feed_url)
  where rss_feed_url is not null;
create index if not exists idx_articles_source_rss_feed_url
  on public.articles(source_rss_feed_url)
  where source_rss_feed_url is not null;
create index if not exists idx_projects_rss_feed_url
  on public.projects(rss_feed_url)
  where rss_feed_url is not null;
create index if not exists idx_monitored_portals_automation_mode
  on public.monitored_portals(automation_mode,is_active,next_check_at);

comment on column public.projects.rss_feed_url is 'Feed RSS/Atom próprio e validado do site de destino; nunca substitui canonical/permalink e deve compartilhar host com wordpress_url.';
comment on column public.articles.rss_feed_url is 'Feed RSS/Atom próprio do projeto de destino associado ao conteúdo publicado; canonical permanece independente.';
comment on column public.articles.source_rss_feed_url is 'Feed RSS/Atom do portal de origem em fluxos de repostagem; jamais é tratado como feed do projeto de destino.';
comment on column public.articles.source_canonical_url is 'URL canônica da fonte de origem em repostagem. Não substitui a canonical da publicação de destino.';
comment on column public.monitored_portals.automation_mode is 'manual, assisted ou ai_95. ai_95 delega nicho, ângulo, extensão, keyword, categoria/tags e recomendação de publicação à IA.';
