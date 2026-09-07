-- AI provider credentials for OpenAI and Anthropic are managed exclusively by
-- GitHub (environment zica-ai-production) and synchronized into Supabase Vault by
-- the deploy workflow. Every competing route is closed here:
--   1. per-user BYOK keys in user_settings are cleared and kept empty by trigger;
--   2. persist_validated_user_ai_key refuses openai/anthropic;
--   3. manual Vault writes from the app (set/delete_zica_ai_provider_secret) are
--      no longer executable by signed-in users, only by the CI service role;
--   4. stale "paused_*" Vault backups from 2026-09-05 are removed.
-- Applied to Autopublic-prod on 2026-09-07.
-- Rollback: drop the trigger, grant execute back to authenticated, restore the
-- previous persist function body.

select set_config('request.jwt.claim.role', 'service_role', true);
update public.user_settings
   set openai_api_key = null, anthropic_api_key = null, byok_enabled = false, updated_at = now()
 where nullif(trim(openai_api_key), '') is not null
    or nullif(trim(anthropic_api_key), '') is not null
    or byok_enabled = true;

create or replace function public.enforce_platform_managed_provider_keys()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- OpenAI and Anthropic credentials come only from GitHub -> Vault.
  new.openai_api_key := null;
  new.anthropic_api_key := null;
  new.byok_enabled := false;
  return new;
end;
$$;
revoke all on function public.enforce_platform_managed_provider_keys() from public, anon, authenticated;

drop trigger if exists trg_00_enforce_platform_managed_provider_keys on public.user_settings;
create trigger trg_00_enforce_platform_managed_provider_keys
before insert or update on public.user_settings
for each row execute function public.enforce_platform_managed_provider_keys();

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
  if p_provider in ('openai', 'anthropic') then
    raise exception using errcode = '42501', message = 'provider_managed_by_github';
  end if;
  if p_provider not in ('gemini', 'serper') or nullif(trim(p_secret), '') is null then
    raise exception using errcode = '22023', message = 'invalid_provider_or_secret';
  end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  update public.user_settings
     set gemini_api_key = case when p_provider = 'gemini' then trim(p_secret) else gemini_api_key end,
         serper_api_key = case when p_provider = 'serper' then trim(p_secret) else serper_api_key end,
         updated_at = now()
   where user_id = p_user_id
  returning updated_at into v_updated_at;
  if v_updated_at is null then
    raise exception using errcode = 'P0002', message = 'user_settings_not_found';
  end if;
  return v_updated_at;
end;
$$;
revoke all on function public.persist_validated_user_ai_key(uuid, text, text) from public, anon, authenticated;
grant execute on function public.persist_validated_user_ai_key(uuid, text, text) to service_role;

revoke execute on function public.set_zica_ai_provider_secret(text, text) from authenticated;
revoke execute on function public.delete_zica_ai_provider_secret(text) from authenticated;

delete from vault.secrets where name like 'paused_%';

comment on function public.persist_validated_user_ai_key(uuid, text, text) is
  'Persists gemini/serper keys after functional validation. OpenAI and Anthropic are managed by GitHub -> Vault and are refused here.';
