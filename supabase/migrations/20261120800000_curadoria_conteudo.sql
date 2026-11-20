-- Curadoria de conteúdo: o relatório de curadoria de cada artigo que ainda não saiu (em criação, na fila, finalizado) e o resumo por projeto e status.
-- Aditiva e reversível (supabase/rollbacks/20261120800000_curadoria_conteudo_rollback.sql). NÃO foi aplicada: o orquestrador revisa e publica.
--  1) article_curation: UMA linha por artigo (a curadoria vigente): estado geral (aprovado | precisa_correcao | bloqueado), nota, estado da imagem (ok | aviso | repetida | ausente),
--     o relatório completo em `checks` (um item por módulo, com motivo em português e fonte), a impressão digital do que foi avaliado (`content_hash`) e a versão das regras.
--     A curadoria só "vale" se `content_hash` e `version` ainda forem os do artigo/regras de hoje (o portão da publicação confere).
--  2) project_curation_summary(): contagem por projeto e status do artigo x estado da curadoria (inclui "sem_curadoria" e "desatualizada").
-- Regra dura (pedido do dono): imagem repetida (mesma imagem em mais de 1 artigo do projeto) ou ausente = `bloqueado` para publicar. Tamanho e mínimos só avisam.
-- Acesso: RLS ligada e NENHUM grant para anon/authenticated; a única porta é a função de borda `engine` (módulo `curadoria`, chave de serviço, papel conferido no banco).
-- NADA aqui chama serviço pago nem IA. Não altera nenhuma tabela existente (o artigo continua como está; a curadoria só grava o relatório).
-- Reaproveita profile_assert_project_org() do Perfil do Projeto (a linha só pode apontar para projeto da própria organização).

create schema if not exists private;

create table if not exists public.article_curation (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null unique references public.articles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  estado text not null check (estado in ('aprovado', 'precisa_correcao', 'bloqueado')),
  nota smallint check (nota is null or nota between 0 and 100),
  image_state text not null check (image_state in ('ok', 'aviso', 'repetida', 'ausente')),
  -- chave normalizada da imagem (mesma imagem com parâmetros ou versão derivada = mesma chave) e quantos artigos do projeto a usavam na curadoria
  image_key text check (image_key is null or char_length(image_key) <= 600),
  image_uses integer check (image_uses is null or image_uses >= 0),
  checks jsonb not null default '{}'::jsonb check (jsonb_typeof(checks) = 'object'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  article_status text check (article_status is null or char_length(article_status) <= 30),
  version integer not null default 1 check (version >= 1),
  curated_at timestamptz not null default now(),
  curated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists article_curation_project_estado_idx on public.article_curation (project_id, estado);
create index if not exists article_curation_project_image_idx on public.article_curation (project_id, image_state);
create index if not exists article_curation_image_key_idx on public.article_curation (project_id, image_key) where image_key is not null;
create index if not exists article_curation_org_idx on public.article_curation (organization_id);
create index if not exists article_curation_curated_by_idx on public.article_curation (curated_by);

-- o artigo precisa ser do mesmo projeto e da mesma organização da linha
create or replace function public.article_curation_assert_article() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.articles a where a.id = new.article_id and a.project_id = new.project_id and a.organization_id = new.organization_id) then
    raise exception 'article_not_in_project';
  end if;
  return new;
end $$;
revoke all on function public.article_curation_assert_article() from public, anon, authenticated;

drop trigger if exists article_curation_org on public.article_curation;
create trigger article_curation_org before insert or update of project_id, organization_id on public.article_curation
  for each row execute function public.profile_assert_project_org();
drop trigger if exists article_curation_article on public.article_curation;
create trigger article_curation_article before insert or update of article_id, project_id, organization_id on public.article_curation
  for each row execute function public.article_curation_assert_article();

alter table public.article_curation enable row level security;
revoke all on table public.article_curation from public, anon, authenticated;
grant all on table public.article_curation to service_role;

-- 2) Resumo por projeto e status do artigo. Só artigos que ainda não saíram (published fica de fora: a curadoria não os avalia).
--    estado: 'sem_curadoria' (nunca rodou), 'desatualizada' (o artigo mudou depois, ou a versão das regras mudou) ou o estado gravado.
--    Devolve uma lista de { project_id, status, estado, total }.
create or replace function private.project_curation_summary(p_org uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('project_id', x.project_id, 'status', x.status, 'estado', x.estado, 'total', x.n)), '[]'::jsonb)
  from (
    select a.project_id, a.status::text as status,
      case
        when c.id is null then 'sem_curadoria'
        when c.version <> 1 or c.curated_at < a.updated_at then 'desatualizada'
        else c.estado
      end as estado,
      count(*) as n
    from public.articles a
    left join public.article_curation c on c.article_id = a.id
    where a.organization_id = p_org and a.project_id is not null and a.status::text <> 'published'
    group by a.project_id, a.status::text, 3
  ) x
$$;
create or replace function public.project_curation_summary(p_org uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.project_curation_summary(p_org); $$;

revoke all on function private.project_curation_summary(uuid), public.project_curation_summary(uuid) from public, anon, authenticated;
grant execute on function private.project_curation_summary(uuid), public.project_curation_summary(uuid) to service_role;
