-- Internal configuration tables intentionally expose no rows through Data API.
-- Explicit deny policies document that contract and silence ambiguous no-policy alerts.
do $policies$
declare
  table_name text;
  action_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'automation_ingress_keys',
    'candidate_reference_whitelist',
    'supporter_avatar_candidate_presets',
    'zica_ai_provider_health_cache'
  ] loop
    foreach action_name in array array['select','insert','update','delete'] loop
      policy_name := table_name || '_deny_direct_' || action_name;
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      if action_name = 'insert' then
        execute format('create policy %I on public.%I for insert to anon, authenticated with check (false)', policy_name, table_name);
      elsif action_name = 'update' then
        execute format('create policy %I on public.%I for update to anon, authenticated using (false) with check (false)', policy_name, table_name);
      else
        execute format('create policy %I on public.%I for %s to anon, authenticated using (false)', policy_name, table_name, action_name);
      end if;
    end loop;
  end loop;
end
$policies$;

-- Trigger functions are invoked by PostgreSQL and must never be callable via RPC.
revoke all on function public.guard_article_ready_preflight() from public, anon, authenticated;
revoke all on function public.guard_supporter_avatar_generation_count() from public, anon, authenticated;
revoke all on function public.inherit_project_rss_for_article() from public, anon, authenticated;

-- These indexes cover the high-frequency tenant and queue predicates used by
-- article lists, image recovery and the background worker.
create index if not exists idx_articles_project_status_created_at
  on public.articles(project_id, status, created_at desc);
create index if not exists idx_articles_project_image_source
  on public.articles(project_id, image_source)
  where featured_image_url is not null;
