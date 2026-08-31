-- Zica.ai Neural Metrics
-- Separates publication, IndexNow submission, confirmed indexing and audited LLM scores.
-- No existing customer data is deleted or rewritten beyond deriving active wave state
-- from articles that are already published.

alter table public.articles
  add column if not exists indexing_status text not null default 'not_submitted',
  add column if not exists indexing_provider text,
  add column if not exists indexing_submitted_at timestamptz,
  add column if not exists indexed_confirmed_at timestamptz,
  add column if not exists llm_visibility_score integer,
  add column if not exists semantic_authority_score integer,
  add column if not exists traffic_wave_status text not null default 'draft',
  add column if not exists last_llm_audit_at timestamptz;

do $$
begin
  alter table public.articles
    add constraint articles_indexing_status_valid
    check (indexing_status in ('not_submitted','submitted','confirmed','failed'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.articles
    add constraint articles_traffic_wave_status_valid
    check (traffic_wave_status in ('draft','scheduled','active','paused','archived','error'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.articles
    add constraint articles_llm_visibility_score_range
    check (llm_visibility_score is null or llm_visibility_score between 0 and 100);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.articles
    add constraint articles_semantic_authority_score_range
    check (semantic_authority_score is null or semantic_authority_score between 0 and 100);
exception when duplicate_object then null;
end $$;

update public.articles
set traffic_wave_status = 'active'
where status::text = 'published'
  and traffic_wave_status = 'draft';

create index if not exists idx_articles_user_indexing_status
  on public.articles(user_id, indexing_status);

create index if not exists idx_articles_user_indexed_confirmed
  on public.articles(user_id, indexed_confirmed_at)
  where indexed_confirmed_at is not null;

create index if not exists idx_articles_user_llm_visibility
  on public.articles(user_id, llm_visibility_score)
  where llm_visibility_score is not null;

comment on column public.articles.indexing_status is
  'Zica.ai indexing lifecycle. submitted is not equivalent to confirmed.';
comment on column public.articles.llm_visibility_score is
  '0-100 only when produced by a real LLM visibility audit; NULL means not audited.';
comment on column public.articles.semantic_authority_score is
  '0-100 only when produced by a real semantic authority audit; NULL means not audited.';
