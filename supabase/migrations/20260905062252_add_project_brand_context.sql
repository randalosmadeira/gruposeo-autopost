-- Contexto permanente do projeto para agentes editoriais.
-- Migração aditiva: preserva todos os projetos e conteúdos existentes.

alter table public.projects
  add column if not exists commercial_info jsonb not null default '{
    "phone": "",
    "whatsapp": "",
    "email": "",
    "address": "",
    "google_maps_url": "",
    "default_cta_text": "Fale com nossa equipe pelo WhatsApp",
    "default_cta_url": ""
  }'::jsonb,
  add column if not exists social_links jsonb not null default '{
    "instagram": "",
    "linkedin": "",
    "youtube": "",
    "facebook": "",
    "twitter": ""
  }'::jsonb,
  add column if not exists editorial_identity jsonb not null default '{
    "target_audience": "Geral / Nicho do Projeto",
    "primary_geo": "Brasil / Regional",
    "author_name": "Redação",
    "author_bio": ""
  }'::jsonb;

comment on column public.projects.commercial_info is
  'Contato e CTA canônicos usados pelos agentes e schemas do projeto.';
comment on column public.projects.social_links is
  'Perfis sociais oficiais do projeto. Não contém credenciais.';
comment on column public.projects.editorial_identity is
  'Público, geografia, autoria e identidade editorial canônica.';

alter table public.projects
  drop constraint if exists projects_commercial_info_object,
  drop constraint if exists projects_social_links_object,
  drop constraint if exists projects_editorial_identity_object;

alter table public.projects
  add constraint projects_commercial_info_object check (jsonb_typeof(commercial_info) = 'object'),
  add constraint projects_social_links_object check (jsonb_typeof(social_links) = 'object'),
  add constraint projects_editorial_identity_object check (jsonb_typeof(editorial_identity) = 'object');
