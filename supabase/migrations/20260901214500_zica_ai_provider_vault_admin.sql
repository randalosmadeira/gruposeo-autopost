create or replace function public.set_zica_ai_provider_secret(p_provider text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_name text;
  v_existing uuid;
begin
  if not public.is_ceo() then raise exception 'forbidden'; end if;
  if p_provider not in ('openai','anthropic') then raise exception 'unsupported_provider'; end if;
  if p_secret is null or length(trim(p_secret)) < 16 then raise exception 'invalid_secret'; end if;
  v_name := case p_provider when 'openai' then 'zica_ai_openai_api_key' else 'zica_ai_anthropic_api_key' end;
  select id into v_existing from vault.secrets where name = v_name limit 1;
  if v_existing is null then
    perform vault.create_secret(trim(p_secret), v_name, 'Zica.ai provider secret managed by CEO settings');
  else
    perform vault.update_secret(v_existing, trim(p_secret), v_name, 'Zica.ai provider secret managed by CEO settings');
  end if;
  return jsonb_build_object('ok', true, 'provider', p_provider, 'configured', true);
end;
$$;

create or replace function public.delete_zica_ai_provider_secret(p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare v_name text;
begin
  if not public.is_ceo() then raise exception 'forbidden'; end if;
  if p_provider not in ('openai','anthropic') then raise exception 'unsupported_provider'; end if;
  v_name := case p_provider when 'openai' then 'zica_ai_openai_api_key' else 'zica_ai_anthropic_api_key' end;
  delete from vault.secrets where name = v_name;
  return jsonb_build_object('ok', true, 'provider', p_provider, 'configured', false);
end;
$$;

create or replace function public.zica_ai_provider_secret_status()
returns jsonb
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare v_openai boolean; v_anthropic boolean;
begin
  if not public.is_ceo() then raise exception 'forbidden'; end if;
  select exists(select 1 from vault.secrets where name='zica_ai_openai_api_key') into v_openai;
  select exists(select 1 from vault.secrets where name='zica_ai_anthropic_api_key') into v_anthropic;
  return jsonb_build_object('openai', v_openai, 'anthropic', v_anthropic);
end;
$$;

create or replace function public.get_zica_ai_provider_secret(p_provider text)
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare v_name text; v_secret text;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  if p_provider not in ('openai','anthropic') then raise exception 'unsupported_provider'; end if;
  v_name := case p_provider when 'openai' then 'zica_ai_openai_api_key' else 'zica_ai_anthropic_api_key' end;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = v_name limit 1;
  return v_secret;
end;
$$;

revoke all on function public.set_zica_ai_provider_secret(text,text) from public, anon;
revoke all on function public.delete_zica_ai_provider_secret(text) from public, anon;
revoke all on function public.zica_ai_provider_secret_status() from public, anon;
revoke all on function public.get_zica_ai_provider_secret(text) from public, anon, authenticated;
grant execute on function public.set_zica_ai_provider_secret(text,text) to authenticated;
grant execute on function public.delete_zica_ai_provider_secret(text) to authenticated;
grant execute on function public.zica_ai_provider_secret_status() to authenticated;
grant execute on function public.get_zica_ai_provider_secret(text) to service_role;