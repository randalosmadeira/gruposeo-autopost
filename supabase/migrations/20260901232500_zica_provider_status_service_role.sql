-- Allow trusted server-side Edge Functions to verify only whether provider secrets exist.
-- Secret values remain accessible only through get_zica_ai_provider_secret() to service_role.

create or replace function public.zica_ai_provider_secret_status()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'vault', 'pg_temp'
as $function$
declare
  v_openai boolean;
  v_anthropic boolean;
begin
  if auth.role() <> 'service_role' and not public.is_ceo() then
    raise exception 'forbidden';
  end if;

  select exists(select 1 from vault.secrets where name = 'zica_ai_openai_api_key') into v_openai;
  select exists(select 1 from vault.secrets where name = 'zica_ai_anthropic_api_key') into v_anthropic;

  return jsonb_build_object('openai', v_openai, 'anthropic', v_anthropic);
end;
$function$;

revoke all on function public.zica_ai_provider_secret_status() from public;
grant execute on function public.zica_ai_provider_secret_status() to authenticated, service_role;
