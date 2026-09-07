create or replace function public.persist_validated_user_ai_key(
  p_user_id uuid,
  p_provider text,
  p_secret text
) returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated_at timestamptz;
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if v_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_provider not in ('openai','gemini','anthropic','serper') or nullif(trim(p_secret),'') is null then
    raise exception using errcode = '22023', message = 'invalid_provider_or_secret';
  end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  update public.user_settings
  set openai_api_key = case when p_provider='openai' then trim(p_secret) else openai_api_key end,
      gemini_api_key = case when p_provider='gemini' then trim(p_secret) else gemini_api_key end,
      anthropic_api_key = case when p_provider='anthropic' then trim(p_secret) else anthropic_api_key end,
      serper_api_key = case when p_provider='serper' then trim(p_secret) else serper_api_key end,
      updated_at = now()
  where user_id = p_user_id
  returning updated_at into v_updated_at;
  if v_updated_at is null then
    raise exception using errcode='P0002', message='user_settings_not_found';
  end if;
  return v_updated_at;
end;
$$;

revoke all on function public.persist_validated_user_ai_key(uuid,text,text) from public,anon,authenticated;
grant execute on function public.persist_validated_user_ai_key(uuid,text,text) to service_role;

comment on function public.persist_validated_user_ai_key(uuid,text,text) is
  'Persists a provider key only after server-side functional validation; service role only.';
