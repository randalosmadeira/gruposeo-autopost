alter table public.projects
  add column if not exists wordpress_connector_mode text not null default 'application_password',
  add column if not exists wordpress_credential_ref text,
  add column if not exists wordpress_plugin_namespace text,
  add column if not exists wordpress_plugin_version text,
  add column if not exists wordpress_connected_at timestamptz,
  add column if not exists wordpress_last_verified_at timestamptz;

alter table public.projects drop constraint if exists projects_wordpress_connector_mode_check;
alter table public.projects add constraint projects_wordpress_connector_mode_check
  check (wordpress_connector_mode in ('application_password','zica_posts'));

alter table public.electoral_portal_resources
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists projects_user_domain_idx on public.projects(user_id, domain);
create index if not exists electoral_portal_resources_project_idx
  on public.electoral_portal_resources(project_id)
  where project_id is not null;

create or replace function public.get_zica_wordpress_credential(p_ref text)
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;
  if p_ref is null or btrim(p_ref) = '' then
    raise exception 'invalid_credential_ref';
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = p_ref
  limit 1;
  return v_secret;
end;
$$;

revoke all on function public.get_zica_wordpress_credential(text) from public, anon, authenticated;
grant execute on function public.get_zica_wordpress_credential(text) to service_role;
