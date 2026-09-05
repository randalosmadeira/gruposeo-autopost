-- Enforce the client/admin boundary in PostgreSQL, independently of the UI.

drop policy if exists "Users can create their own templates" on public.prompt_templates;
drop policy if exists "Users can delete their own templates" on public.prompt_templates;
drop policy if exists "Users can update their own templates" on public.prompt_templates;
drop policy if exists "Users can view their own templates" on public.prompt_templates;

drop policy if exists "Users can manage their own indexnow config" on public.indexnow_config;

drop policy if exists "Users can insert their own usage logs" on public.token_usage_logs;
drop policy if exists "Users can view their own usage logs" on public.token_usage_logs;

drop policy if exists "Users cancel own brain jobs" on public.zica_brain_jobs;
drop policy if exists "Users view own brain jobs" on public.zica_brain_jobs;

drop policy if exists "wordpress operations select own" on public.wordpress_operations;
create policy "CEO reads wordpress operations"
on public.wordpress_operations
for select
to authenticated
using ((select public.is_ceo()));

drop policy if exists "Users can insert their own settings" on public.user_settings;
drop policy if exists "Users can delete their own settings" on public.user_settings;

create or replace function public.guard_user_settings_technical_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and not coalesce((select public.is_ceo()), false)
     and (
       new.openai_api_key is distinct from old.openai_api_key
    or new.anthropic_api_key is distinct from old.anthropic_api_key
    or new.gemini_api_key is distinct from old.gemini_api_key
    or new.serper_api_key is distinct from old.serper_api_key
    or new.byok_enabled is distinct from old.byok_enabled
    or new.ai_provider is distinct from old.ai_provider
    or new.default_ai_model is distinct from old.default_ai_model
    or new.title_model is distinct from old.title_model
    or new.content_model is distinct from old.content_model
    or new.image_model is distinct from old.image_model
  ) then
    raise exception using errcode = '42501', message = 'admin_required_for_technical_settings';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_user_settings_technical_fields() from public, anon, authenticated;

drop trigger if exists guard_user_settings_technical_fields on public.user_settings;
create trigger guard_user_settings_technical_fields
before update on public.user_settings
for each row execute function public.guard_user_settings_technical_fields();

comment on function public.guard_user_settings_technical_fields() is
  'Prevents non-CEO users from changing provider keys, BYOK, routing or model settings while preserving service-role automation.';
