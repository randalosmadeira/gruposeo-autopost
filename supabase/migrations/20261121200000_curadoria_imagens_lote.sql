-- Imagens em lote da curadoria (20/11/2026): gera imagem ORIGINAL e única para artigos barrados por imagem repetida/ausente, sem sessão de usuário.
--  1) curadoria_image_budget: teto TOTAL autorizado pelo dono por organização (o lote para quando o gasto registrado chega nele). Fica desligado por padrão: o dono libera com uma linha.
--  2) curadoria_image_jobs: um registro por tentativa (artigo, status, custo medido, URL da imagem, erro). A soma do custo é o gasto do lote.
--  3) chave de automação própria `curadoria-imagens` (segredo no cofre; só o hash na tabela), igual ao radar-run. Sem cron: o lote só roda quando alguém chama com a chave.
-- RLS ligada sem política e sem permissão para anon/authenticated: só a função (service role) lê e grava.
-- Volta: supabase/rollbacks/20261121200000_curadoria_imagens_lote_rollback.sql
begin;

create table if not exists public.curadoria_image_budget (
  organization_id uuid primary key,
  cap_micros bigint not null check (cap_micros >= 0 and cap_micros <= 50000000),
  enabled boolean not null default false,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curadoria_image_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  article_id uuid not null,
  article_status text check (article_status is null or char_length(article_status) <= 30),
  status text not null check (status in ('ok', 'erro')),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  cost_source text not null default 'medido' check (cost_source in ('medido', 'estimado')),
  image_url text check (image_url is null or char_length(image_url) <= 1000),
  error text check (error is null or char_length(error) <= 400),
  created_at timestamptz not null default now()
);
create index if not exists curadoria_image_jobs_org_idx on public.curadoria_image_jobs (organization_id, created_at);
create index if not exists curadoria_image_jobs_article_idx on public.curadoria_image_jobs (article_id, status);

alter table public.curadoria_image_budget enable row level security;
alter table public.curadoria_image_jobs enable row level security;
revoke all on public.curadoria_image_budget from anon, authenticated, public;
revoke all on public.curadoria_image_jobs from anon, authenticated, public;

do $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'zica_curadoria_imagens_key' limit 1;
  if coalesce(v_secret, '') = '' then
    v_secret := encode(gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_secret, 'zica_curadoria_imagens_key', 'Ingress secret for curadoria-imagens (lote de imagens)');
  end if;
  insert into public.automation_ingress_keys(name, secret_hash, enabled, updated_at)
  values ('curadoria-imagens', encode(digest(v_secret, 'sha256'), 'hex'), true, now())
  on conflict (name) do update set secret_hash = excluded.secret_hash, enabled = true, updated_at = now();
end $$;

commit;
