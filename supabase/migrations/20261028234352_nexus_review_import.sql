-- Trusted conversation reviews enter through a short-lived, job-scoped capability.
-- Client-editable article metadata is not an authority to mint approval receipts.
create table public.nexus_review_imports (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id),
 user_id uuid not null references auth.users(id),
 expected_project_updated_at text not null,
 token_sha256 text not null check (token_sha256 ~ '^[a-f0-9]{64}$'),
 manifest jsonb not null check (jsonb_typeof(manifest)='array' and jsonb_array_length(manifest) between 1 and 25),
 status text not null default 'pending' check(status in ('pending','processing','complete','failed')),
 results jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '1 hour'),
 completed_at timestamptz,
 check (expires_at > created_at and expires_at <= created_at+interval '24 hours')
);
alter table public.nexus_review_imports enable row level security;
revoke all on public.nexus_review_imports from public,anon,authenticated;
grant select,insert,update on public.nexus_review_imports to service_role;
comment on table public.nexus_review_imports is 'Service-only attestation inbox. No publication or scheduling; no provider execution. Plaintext capabilities are never stored here.';
