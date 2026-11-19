-- Zica drafts use articles; legacy suggestions reference wordpress_article_index.
create table public.nexus_link_suggestions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id),
 source_article_id uuid not null references public.articles(id),
 target_article_id uuid not null references public.articles(id),
 target_url text not null, anchor_text text not null,
 relevance_score integer, position_suggestion text, anchor_context text,
 status text not null default 'pending' check(status in ('pending','applied')),
 destination_checked_at timestamptz,destination_status integer,applied_at timestamptz,
 created_at timestamptz not null default now(),
 unique(source_article_id,target_url)
);
alter table public.nexus_link_suggestions enable row level security;
revoke all on public.nexus_link_suggestions from anon,authenticated;
grant select on public.nexus_link_suggestions to authenticated;
grant all on public.nexus_link_suggestions to service_role;
create policy nexus_link_read on public.nexus_link_suggestions for select to authenticated
 using(public.is_organization_member(organization_id));
alter table public.nexus_cluster_members add column is_pillar boolean not null default false;
