-- Trazida do banco de produção para o Git em 13/11/2026 (aplicada pelo Codex via apply_migration, versão 20261113154220, sem arquivo no repositório).
-- Conteúdo idêntico ao registrado em supabase_migrations.schema_migrations; não reaplicar.
-- Atenção (revisão 13/11/2026): nexus_oauth_project_allowed aceita owner/admin de QUALQUER organização, inclusive cliente. A trava de gerenciamento
-- (oauth_* em TECHNICAL_ACTIONS, nexus-management.ts) bloqueia o cliente na função de borda; o banco, sozinho, ainda não distingue interno de cliente.

-- Internal storage for managed OAuth. Only the authenticated Edge Function
-- can call the RPCs. Each RPC rechecks the actor and the project boundary.
create table public.nexus_oauth_attempts (
  state_hash text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gsc','ga4','bing')),
  verifier text not null,
  expires_at timestamptz not null
);

create table public.nexus_oauth_connections (
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('gsc','ga4','bing')),
  connected_by uuid not null references auth.users(id),
  vault_secret_id uuid not null,
  property_id text,
  connected_at timestamptz not null default now(),
  primary key (project_id,provider)
);

alter table public.nexus_oauth_attempts enable row level security;
alter table public.nexus_oauth_connections enable row level security;
revoke all on public.nexus_oauth_attempts,public.nexus_oauth_connections from public,anon,authenticated;
grant select,insert,update,delete on public.nexus_oauth_attempts,public.nexus_oauth_connections to service_role;

create function private.nexus_oauth_project_allowed(p_project uuid,p_org uuid,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.projects p
    join public.organization_members m on m.organization_id=p.organization_id
    where p.id=p_project and p.organization_id=p_org
      and m.user_id=p_actor and m.status='active' and m.role in ('owner','admin')
  );
$$;

create function public.nexus_oauth_token(p_project uuid,p_org uuid,p_actor uuid,p_provider text,p_refresh text default null)
returns text language plpgsql security definer set search_path='' as $$
declare
  current_secret uuid;
  result text;
begin
  if not private.nexus_oauth_project_allowed(p_project,p_org,p_actor) then
    raise exception 'oauth_project_forbidden';
  end if;
  if p_provider not in ('gsc','ga4','bing') or p_provider is null then
    raise exception 'oauth_provider_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_project::text || ':' || p_provider,0));
  select vault_secret_id into current_secret from public.nexus_oauth_connections
    where project_id=p_project and organization_id=p_org and provider=p_provider;
  if p_refresh is null then
    select decrypted_secret into result from vault.decrypted_secrets where id=current_secret;
    return result;
  end if;
  if length(p_refresh) not between 8 and 8192 then raise exception 'oauth_refresh_invalid'; end if;
  if current_secret is null then
    current_secret:=vault.create_secret(p_refresh);
    insert into public.nexus_oauth_connections(project_id,organization_id,provider,connected_by,vault_secret_id)
      values(p_project,p_org,p_provider,p_actor,current_secret);
  else
    perform vault.update_secret(current_secret,p_refresh);
    update public.nexus_oauth_connections set property_id=null,connected_by=p_actor,connected_at=now()
      where project_id=p_project and organization_id=p_org and provider=p_provider;
  end if;
  return null;
end;
$$;

revoke all on function private.nexus_oauth_project_allowed(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.nexus_oauth_token(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.nexus_oauth_token(uuid,uuid,uuid,text,text) to service_role;
