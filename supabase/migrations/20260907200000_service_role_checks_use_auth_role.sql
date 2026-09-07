-- Service-role checks read the legacy PostgREST GUC request.jwt.claim.role.
-- Current PostgREST only guarantees request.jwt.claims (JSON), so those checks
-- raise service_role_required for calls made with the service key from Edge
-- Functions. publish-to-wordpress surfaced this as "Falha ao publicar no
-- WordPress" on 2026-09-07 (check_organization_publication_permission).
-- auth.role() reads both the legacy GUC and the JSON claims, so every function
-- that reads the legacy GUC is rewritten to use it. set_config(...) writes are
-- left untouched. Applied to Autopublic-prod on 2026-09-07.
--
-- Functions rewritten in production: check_organization_publication_permission,
-- commit_article_quota, guard_project_plan_limit, guard_user_settings_technical_fields,
-- persist_validated_user_ai_key, reserve_article_quota, update_commercial_plan_terms,
-- update_organization_business_policy.

do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ~ 'current_setting\(''request\.jwt\.claim\.role'',\s*true\)'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, 'coalesce\(current_setting\(''request\.jwt\.claim\.role'',\s*true\),\s*''''\)', 'coalesce(auth.role(), '''')', 'g');
    v_new := regexp_replace(v_new, 'current_setting\(''request\.jwt\.claim\.role'',\s*true\)', 'auth.role()', 'g');
    if v_new <> v_def then
      execute v_new;
      raise notice 'rewritten: %', r.proname;
    end if;
  end loop;
end $$;

comment on function public.check_organization_publication_permission(uuid, uuid, boolean) is
  'Service-role only (checked via auth.role()). Returns {allowed, code, role, automated, approval_required}.';
