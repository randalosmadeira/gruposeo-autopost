create or replace function public.get_zica_orchestrator_credential(p_ref text)
returns text
language plpgsql
security definer
set search_path = 'public', 'vault', 'pg_temp'
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
  if v_secret is null then
    raise exception 'credential_not_found';
  end if;
  return v_secret;
end;
$$;
revoke all on function public.get_zica_orchestrator_credential(text) from public, anon, authenticated;
grant execute on function public.get_zica_orchestrator_credential(text) to service_role;
