create extension if not exists pgcrypto;

create table if not exists public.electoral_content_sources (
  id uuid primary key default gen_random_uuid(),
  campaign_preset_id text not null,
  slug text not null,
  title text not null,
  source_type text not null,
  source_filename text,
  authority_level text not null default 'mixed',
  factual_use_status text not null default 'requires_verification',
  raw_text text not null default '',
  source_sha256 text not null,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_preset_id, slug)
);

create table if not exists public.electoral_content_units (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.electoral_content_sources(id) on delete cascade,
  campaign_preset_id text not null,
  unit_key text not null,
  unit_type text not null,
  title text not null,
  body text not null,
  topic text not null default '',
  tags text[] not null default '{}',
  verification_status text not null default 'needs_primary_source',
  usage_scope text not null default 'editorial_inspiration',
  risk_flags text[] not null default '{}',
  priority integer not null default 50 check (priority between 0 and 100),
  source_locator jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_preset_id, unit_key)
);

create index if not exists electoral_content_sources_preset_idx on public.electoral_content_sources(campaign_preset_id, active);
create index if not exists electoral_content_units_preset_idx on public.electoral_content_units(campaign_preset_id, active, priority desc);
create index if not exists electoral_content_units_tags_gin on public.electoral_content_units using gin(tags);
create index if not exists electoral_content_units_search_gin on public.electoral_content_units using gin(to_tsvector('portuguese', coalesce(title,'') || ' ' || coalesce(topic,'') || ' ' || coalesce(body,'')));

alter table public.electoral_content_sources enable row level security;
alter table public.electoral_content_units enable row level security;

drop policy if exists "electoral content sources authenticated read" on public.electoral_content_sources;
create policy "electoral content sources authenticated read" on public.electoral_content_sources for select to authenticated using (true);
drop policy if exists "electoral content sources ceo manage" on public.electoral_content_sources;
create policy "electoral content sources ceo manage" on public.electoral_content_sources for all to authenticated using (public.is_ceo()) with check (public.is_ceo());

drop policy if exists "electoral content units authenticated read" on public.electoral_content_units;
create policy "electoral content units authenticated read" on public.electoral_content_units for select to authenticated using (true);
drop policy if exists "electoral content units ceo manage" on public.electoral_content_units;
create policy "electoral content units ceo manage" on public.electoral_content_units for all to authenticated using (public.is_ceo()) with check (public.is_ceo());

create or replace view public.electoral_agent_content_context with (security_invoker = true) as
select u.id,u.campaign_preset_id,u.unit_key,u.unit_type,u.title,u.body,u.topic,u.tags,u.verification_status,u.usage_scope,u.risk_flags,u.priority,u.source_locator,u.metadata,s.slug as source_slug,s.title as source_title,s.source_type,s.source_filename,s.authority_level,s.factual_use_status,s.source_sha256
from public.electoral_content_units u
join public.electoral_content_sources s on s.id=u.source_id
where u.active=true and s.active=true and u.verification_status <> 'prohibited_as_fact' and u.usage_scope <> 'archive_only';

comment on view public.electoral_agent_content_context is 'Corpus eleitoral permitido para agentes. Conteúdo archive_only e prohibited_as_fact é excluído do contexto automático.';
