-- Captação de leads: atalho público (botão no site) -> página /comecar -> cadastro -> continuar dentro do sistema.
-- Aditiva e reversível (supabase/rollbacks/20261116040000_captacao_leads_rollback.sql).
-- Dados pessoais mínimos (nome + e-mail ou telefone), com consentimento versionado. O IP NUNCA é guardado: só um hash com sal diário.
-- Nada daqui é legível pelo navegador: RLS ligada e nenhum grant para anon/authenticated; a única porta é a função `lead-capture` (chave de serviço).

create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 100),
  email text check (email is null or char_length(email) <= 180),
  email_norm text check (email_norm is null or char_length(email_norm) <= 180),
  phone text check (phone is null or phone ~ '^[0-9]{10,15}$'),
  segment text check (segment is null or char_length(segment) <= 60),
  message text check (message is null or char_length(message) <= 500),
  site_url text check (site_url is null or char_length(site_url) <= 200),
  source jsonb not null default '{}'::jsonb check (jsonb_typeof(source) = 'object'),
  consent_at timestamptz not null,
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  ip_hash text check (ip_hash is null or char_length(ip_hash) = 64),
  status text not null default 'new' check (status in ('new', 'contacted', 'signed_up', 'discarded')),
  handoff_hash text check (handoff_hash is null or char_length(handoff_hash) = 64),
  handoff_expires_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 1000),
  constraint marketing_leads_contact_required check (email_norm is not null or phone is not null)
);

-- Um contato "aberto" (novo ou já contatado) existe uma vez só: repetir o envio atualiza o mesmo lead.
create unique index if not exists marketing_leads_email_open_idx on public.marketing_leads (email_norm) where email_norm is not null and status in ('new', 'contacted');
create unique index if not exists marketing_leads_phone_open_idx on public.marketing_leads (phone) where phone is not null and status in ('new', 'contacted');
create unique index if not exists marketing_leads_handoff_idx on public.marketing_leads (handoff_hash) where handoff_hash is not null;
create index if not exists marketing_leads_created_idx on public.marketing_leads (created_at desc);
create index if not exists marketing_leads_status_idx on public.marketing_leads (status, created_at desc);

-- Tentativas (inclusive as recusadas) para o limite de taxa. Só hash do visitante; limpeza feita pela própria função (7 dias).
create table if not exists public.lead_capture_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check (char_length(ip_hash) = 64),
  outcome text not null check (outcome in ('ok', 'invalid', 'blocked', 'bot', 'peek')),
  created_at timestamptz not null default now()
);
create index if not exists lead_capture_attempts_ip_idx on public.lead_capture_attempts (ip_hash, created_at);
create index if not exists lead_capture_attempts_day_idx on public.lead_capture_attempts (created_at, outcome);

alter table public.marketing_leads enable row level security;
alter table public.lead_capture_attempts enable row level security;
revoke all on table public.marketing_leads from public, anon, authenticated;
revoke all on table public.lead_capture_attempts from public, anon, authenticated;
grant all on table public.marketing_leads to service_role;
grant all on table public.lead_capture_attempts to service_role;
grant usage, select on sequence public.lead_capture_attempts_id_seq to service_role;

create or replace function public.marketing_leads_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists marketing_leads_touch on public.marketing_leads;
create trigger marketing_leads_touch before update on public.marketing_leads for each row execute function public.marketing_leads_touch();
