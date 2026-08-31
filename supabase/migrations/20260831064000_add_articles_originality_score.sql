alter table public.articles
  add column if not exists originality_score integer not null default 0;

alter table public.articles
  drop constraint if exists articles_originality_score_check;

alter table public.articles
  add constraint articles_originality_score_check
  check (originality_score between 0 and 100);

comment on column public.articles.originality_score is
  'Heuristic originality score from 0 to 100 used as an AutoPost publication gate.';
