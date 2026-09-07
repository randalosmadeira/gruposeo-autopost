create table if not exists public.wordpress_pairing_registry (
  key_hash text primary key,
  site_url text not null,
  site_name text not null default '',
  plugin_version text,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wordpress_pairing_registry_key_hash_check check (key_hash ~ '^[a-f0-9]{64}$'),
  constraint wordpress_pairing_registry_site_url_check check (site_url ~ '^https://')
);

alter table public.wordpress_pairing_registry enable row level security;
revoke all on public.wordpress_pairing_registry from public, anon, authenticated;
grant all on public.wordpress_pairing_registry to service_role;

comment on table public.wordpress_pairing_registry is
  'Registro privado para descoberta de WordPress por chave de pareamento. Chaves brutas nunca são armazenadas.';

create or replace function public.upsert_zica_secret(p_name text, p_secret text, p_description text default '')
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  if btrim(coalesce(p_name,'')) = '' or btrim(coalesce(p_secret,'')) = '' then raise exception 'invalid_secret'; end if;
  select id into v_id from vault.secrets where name=p_name limit 1;
  if v_id is null then
    perform vault.create_secret(p_secret,p_name,p_description);
  else
    perform vault.update_secret(v_id,p_secret,p_name,p_description);
  end if;
end;
$$;

revoke all on function public.upsert_zica_secret(text,text,text) from public, anon, authenticated;
grant execute on function public.upsert_zica_secret(text,text,text) to service_role;
