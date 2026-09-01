create table if not exists public.supporter_avatar_requests (
  id uuid primary key default gen_random_uuid(),
  public_token_hash text not null unique,
  fingerprint_hash text,
  status text not null default 'draft' check (status in ('draft','uploading','queued','processing','qa','completed','failed','blocked','provider_not_configured','expired')),
  supporter_name text not null,
  city text,
  state text default 'SP',
  email text,
  whatsapp text,
  social_handles jsonb not null default '{}'::jsonb,
  style text not null default 'premium',
  support_text text not null default 'DR. MADEIRA 1470',
  provider_preference text not null default 'openai',
  consent_image_use boolean not null default false,
  consent_social_linking boolean not null default false,
  consent_terms boolean not null default false,
  consent_public_gallery boolean not null default false,
  consent_at timestamptz,
  source_count integer not null default 0 check (source_count between 0 and 4),
  generation_count integer not null default 0 check (generation_count >= 0),
  max_generations integer not null default 3 check (max_generations between 1 and 10),
  prompt_template_slug text not null default 'supporter-avatar-human-v1',
  expires_at timestamptz not null default (now() + interval '30 days'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supporter_avatar_sources (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.supporter_avatar_requests(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint,
  sha256 text,
  created_at timestamptz not null default now()
);

create table if not exists public.supporter_avatar_outputs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.supporter_avatar_requests(id) on delete cascade,
  platform text not null check (platform in ('master','whatsapp','instagram','facebook','tiktok')),
  width integer not null,
  height integer not null,
  storage_path text not null unique,
  mime_type text not null default 'image/png',
  model text,
  prompt_version text,
  qa_score numeric(5,2),
  qa_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.supporter_avatar_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.supporter_avatar_requests(id) on delete cascade,
  stage text not null,
  provider text,
  model text,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','blocked','provider_not_configured')),
  attempts integer not null default 0,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.supporter_avatar_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  slug text not null,
  version integer not null default 1,
  name text not null,
  is_active boolean not null default true,
  system_prompt text not null,
  negative_prompt text not null default '',
  fidelity_target numeric(4,3) not null default 0.990 check (fidelity_target between 0.800 and 1.000),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, slug, version)
);

alter table public.supporter_avatar_requests enable row level security;
alter table public.supporter_avatar_sources enable row level security;
alter table public.supporter_avatar_outputs enable row level security;
alter table public.supporter_avatar_jobs enable row level security;
alter table public.supporter_avatar_prompt_templates enable row level security;

create policy "prompt_templates_authenticated_select" on public.supporter_avatar_prompt_templates
  for select to authenticated using (owner_user_id is null or owner_user_id = auth.uid());
create policy "prompt_templates_owner_insert" on public.supporter_avatar_prompt_templates
  for insert to authenticated with check (owner_user_id = auth.uid());
create policy "prompt_templates_owner_update" on public.supporter_avatar_prompt_templates
  for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "prompt_templates_owner_delete" on public.supporter_avatar_prompt_templates
  for delete to authenticated using (owner_user_id = auth.uid());

create index if not exists idx_supporter_avatar_requests_status_created on public.supporter_avatar_requests(status, created_at desc);
create index if not exists idx_supporter_avatar_requests_fingerprint on public.supporter_avatar_requests(fingerprint_hash, created_at desc);
create index if not exists idx_supporter_avatar_sources_request on public.supporter_avatar_sources(request_id);
create index if not exists idx_supporter_avatar_outputs_request_platform on public.supporter_avatar_outputs(request_id, platform);
create index if not exists idx_supporter_avatar_jobs_request_status on public.supporter_avatar_jobs(request_id, status);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('supporter-avatar-uploads','supporter-avatar-uploads',false,10485760,array['image/jpeg','image/png','image/webp']),
  ('supporter-avatar-generated','supporter-avatar-generated',false,15728640,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into public.supporter_avatar_prompt_templates (owner_user_id, slug, version, name, is_active, system_prompt, negative_prompt, fidelity_target, config)
select null, 'supporter-avatar-human-v1', 1, 'Apoiador 1470 — Humanização Máxima', true,
'Preserve a identidade facial da pessoa da foto de referência com prioridade máxima. Trate a imagem como edição fotográfica realista, não como recriação de uma pessoa nova. Preserve formato do rosto, distância entre olhos, nariz, boca, mandíbula, orelhas, linha capilar, cabelo, barba, idade aparente, textura natural de pele, assimetrias humanas e marcas não sensíveis visíveis. Corrija apenas luz, enquadramento, fundo e acabamento editorial. Mantenha poros e microtextura naturais; não suavize excessivamente a pele. Não afine rosto, não aumente olhos, não altere nariz ou boca, não rejuvenesça, não troque tom de pele, não mude corpo ou gênero, não crie dentes ou sorriso diferentes. Remova o fundo apenas quando necessário e componha um fundo limpo com verde, amarelo, azul profundo e preto em identidade de apoio. A composição deve funcionar em recorte circular. Inserir branding compacto DR. MADEIRA 1470 e texto de apoio selecionado sem cobrir o rosto. Prioridade: 1) identidade humana; 2) naturalidade fotográfica; 3) legibilidade; 4) acabamento. A meta 0,99 é uma preferência operacional de fidelidade e não uma garantia biométrica. Produzir imagem quadrada master adequada para derivações de redes sociais.',
'Evitar pele plástica, filtro de beleza, face swap aparente, olhos artificiais, dentes artificiais, assimetria corrigida demais, anatomia alterada, rosto genérico, mudança de idade, mudança de etnia, mudança de sexo/gênero, cabelo inventado, barba redesenhada, maquiagem excessiva, iluminação impossível, HDR exagerado, bordas de recorte visíveis, mãos extras, dedos deformados, texto sobre o rosto, watermark, assinatura de IA, artefatos, glitches, duplicação de elementos, fundo eleitoral poluído.',
0.990,
'{"master":{"width":1024,"height":1024},"exports":{"whatsapp":[1080,1080],"instagram":[1080,1080],"facebook":[1080,1080],"tiktok":[1080,1080]},"circular_safe_zone":0.78,"max_source_images":4,"max_generations":3,"qa_min_score":92}'::jsonb
where not exists (select 1 from public.supporter_avatar_prompt_templates where owner_user_id is null and slug='supporter-avatar-human-v1' and version=1);