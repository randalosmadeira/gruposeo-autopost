alter table public.supporter_avatar_requests
  add column if not exists supporter_approved_at timestamptz null,
  add column if not exists delivery_mode text not null default 'single-final-download';

create index if not exists supporter_avatar_requests_approved_idx
  on public.supporter_avatar_requests (supporter_approved_at)
  where supporter_approved_at is not null;
