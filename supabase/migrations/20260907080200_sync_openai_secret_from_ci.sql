create or replace function public.sync_zica_ai_provider_secret_from_ci(
  p_provider text,
  p_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_name text;
  v_existing uuid;
begin
  if v_role <> 'service_role' then
    raise exception 'forbidden';
  end if;
  if p_provider not in ('openai', 'anthropic') then
    raise exception 'unsupported_provider';
  end if;
  if nullif(trim(p_secret), '') is null or length(trim(p_secret)) < 16 then
    raise exception 'invalid_secret';
  end if;

  v_name := case p_provider
    when 'openai' then 'zica_ai_openai_api_key'
    else 'zica_ai_anthropic_api_key'
  end;

  select id into v_existing
  from vault.secrets
  where name = v_name
  limit 1;

  if v_existing is null then
    perform vault.create_secret(trim(p_secret), v_name, 'Zica.ai provider secret synchronized from GitHub Actions');
  else
    perform vault.update_secret(v_existing, trim(p_secret), v_name, 'Zica.ai provider secret synchronized from GitHub Actions');
  end if;

  return jsonb_build_object('ok', true, 'provider', p_provider, 'configured', true);
end;
$$;

revoke all on function public.sync_zica_ai_provider_secret_from_ci(text, text) from public, anon, authenticated;
grant execute on function public.sync_zica_ai_provider_secret_from_ci(text, text) to service_role;
