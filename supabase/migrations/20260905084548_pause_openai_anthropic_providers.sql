-- Reversible emergency pause for the paid OpenAI and Anthropic/Claude APIs.
-- Credentials are retained in Supabase Vault under paused names and are not
-- exposed by the active provider resolver while the pause is in effect.

do $pause$
declare
  v_secret record;
  v_user record;
  v_backup_name text;
  v_backup_id uuid;
begin
  for v_secret in
    select id, name, decrypted_secret
    from vault.decrypted_secrets
    where name in ('zica_ai_openai_api_key', 'zica_ai_anthropic_api_key')
  loop
    v_backup_name := 'paused_' || v_secret.name;
    select id into v_backup_id from vault.secrets where name = v_backup_name limit 1;
    if v_backup_id is not null then
      delete from vault.secrets where id = v_backup_id;
    end if;
    perform vault.update_secret(
      v_secret.id,
      v_secret.decrypted_secret,
      v_backup_name,
      'Paused by CEO command on 2026-09-05; retain for reversible reactivation'
    );
  end loop;

  for v_user in
    select user_id, openai_api_key, anthropic_api_key
    from public.user_settings
    where nullif(trim(openai_api_key), '') is not null
       or nullif(trim(anthropic_api_key), '') is not null
  loop
    if nullif(trim(v_user.openai_api_key), '') is not null then
      v_backup_name := 'paused_user_openai_' || v_user.user_id::text;
      select id into v_backup_id from vault.secrets where name = v_backup_name limit 1;
      if v_backup_id is null then
        perform vault.create_secret(trim(v_user.openai_api_key), v_backup_name, 'Paused Zica.ai user OpenAI credential');
      else
        perform vault.update_secret(v_backup_id, trim(v_user.openai_api_key), v_backup_name, 'Paused Zica.ai user OpenAI credential');
      end if;
    end if;

    if nullif(trim(v_user.anthropic_api_key), '') is not null then
      v_backup_name := 'paused_user_anthropic_' || v_user.user_id::text;
      select id into v_backup_id from vault.secrets where name = v_backup_name limit 1;
      if v_backup_id is null then
        perform vault.create_secret(trim(v_user.anthropic_api_key), v_backup_name, 'Paused Zica.ai user Anthropic credential');
      else
        perform vault.update_secret(v_backup_id, trim(v_user.anthropic_api_key), v_backup_name, 'Paused Zica.ai user Anthropic credential');
      end if;
    end if;
  end loop;

  update public.user_settings
  set openai_api_key = null,
      anthropic_api_key = null,
      byok_enabled = false,
      updated_at = now()
  where nullif(trim(openai_api_key), '') is not null
     or nullif(trim(anthropic_api_key), '') is not null;

  update public.app_config
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'ai_provider_pause', jsonb_build_object(
          'openai', true,
          'anthropic', true,
          'requested_by', 'CEO',
          'paused_at', now(),
          'mode', 'credentials_retained_in_vault'
        )
      ),
      updated_at = now()
  where id = 1;
end
$pause$;
