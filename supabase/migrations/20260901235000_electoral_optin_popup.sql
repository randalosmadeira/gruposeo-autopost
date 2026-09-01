create table if not exists public.electoral_campaign_optins (
  id uuid primary key default gen_random_uuid(),
  campaign_preset_id text not null default 'madeira-1470-sp-2026',
  full_name text not null,
  email text,
  whatsapp text,
  city text,
  state text,
  email_updates boolean not null default false,
  whatsapp_updates boolean not null default false,
  volunteer boolean not null default false,
  consent_contact boolean not null default false,
  consent_at timestamptz not null default now(),
  privacy_notice_version text not null default '2026-09-01',
  source_portal text not null,
  contact_hash text not null,
  fingerprint_hash text,
  status text not null default 'active' check (status in ('active','withdrawn','blocked')),
  purpose text not null default 'campaign_contact_and_volunteer_management',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  constraint electoral_campaign_optins_contact_required check (email is not null or whatsapp is not null),
  constraint electoral_campaign_optins_purpose_required check (email_updates or whatsapp_updates or volunteer),
  constraint electoral_campaign_optins_state_format check (state is null or state ~ '^[A-Z]{2}$'),
  constraint electoral_campaign_optins_unique_contact unique (campaign_preset_id, contact_hash)
);

alter table public.electoral_campaign_optins enable row level security;

create policy "CEO can read electoral optins"
on public.electoral_campaign_optins
for select
to authenticated
using (public.is_ceo());

create policy "CEO can update electoral optins"
on public.electoral_campaign_optins
for update
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

create policy "CEO can delete electoral optins"
on public.electoral_campaign_optins
for delete
to authenticated
using (public.is_ceo());

create index if not exists electoral_campaign_optins_created_idx
  on public.electoral_campaign_optins (campaign_preset_id, created_at desc);

create index if not exists electoral_campaign_optins_source_idx
  on public.electoral_campaign_optins (campaign_preset_id, source_portal, created_at desc);

alter table public.electoral_portal_settings
  add column if not exists optin_popup_enabled boolean not null default true,
  add column if not exists optin_scroll_trigger_percent integer not null default 10,
  add column if not exists optin_exit_intent_enabled boolean not null default true,
  add column if not exists optin_dismiss_hours integer not null default 24,
  add column if not exists optin_success_suppress_days integer not null default 90,
  add column if not exists optin_privacy_url text;

alter table public.electoral_portal_settings
  drop constraint if exists electoral_portal_settings_optin_scroll_trigger_percent_check;

alter table public.electoral_portal_settings
  add constraint electoral_portal_settings_optin_scroll_trigger_percent_check
  check (optin_scroll_trigger_percent between 1 and 90);

comment on table public.electoral_campaign_optins is
  'Cadastros voluntarios e consentidos para contato e coordenacao de voluntariado. Nao vincular a historico individual de navegacao nem usar para inferencia de preferencia politica.';

comment on column public.electoral_campaign_optins.source_portal is
  'Portal onde o formulario foi enviado. Nao armazena historico de paginas visitadas.';
