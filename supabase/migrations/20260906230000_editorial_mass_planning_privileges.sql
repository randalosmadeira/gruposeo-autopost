-- CORE-002b: least privilege and advisor cleanup for the editorial planning tables.
--
-- Supabase default privileges grant ALL (including TRUNCATE, which bypasses RLS)
-- on every new public table and sequence to anon and authenticated. CORE-001 only
-- added `grant select`, so the implicit grants remained. Verified live on
-- 2026-09-06 via information_schema.role_table_grants before writing this file.
-- Mutations must keep flowing exclusively through the SECURITY DEFINER RPCs.
--
-- Also adds covering indexes for the 13 foreign keys flagged by the performance
-- advisor (unindexed_foreign_keys) on the five planning tables.
--
-- Rollback: `grant all on <table> to anon, authenticated` restores the default
-- (not recommended); `drop index if exists <name>` for each index below.

revoke all on table public.editorial_plans from anon, authenticated;
revoke all on table public.editorial_plan_items from anon, authenticated;
revoke all on table public.editorial_rss_sources from anon, authenticated;
revoke all on table public.editorial_plan_assets from anon, authenticated;
revoke all on table public.editorial_plan_audit_events from anon, authenticated;
revoke all on sequence public.editorial_plan_audit_events_id_seq from anon, authenticated;

grant select on table public.editorial_plans, public.editorial_plan_items, public.editorial_rss_sources, public.editorial_plan_assets, public.editorial_plan_audit_events to authenticated;

create index if not exists editorial_plans_project_idx on public.editorial_plans (project_id);
create index if not exists editorial_plans_created_by_idx on public.editorial_plans (created_by);
create index if not exists editorial_plan_items_project_idx on public.editorial_plan_items (project_id);
create index if not exists editorial_rss_sources_plan_idx on public.editorial_rss_sources (plan_id);
create index if not exists editorial_rss_sources_created_by_idx on public.editorial_rss_sources (created_by);
create index if not exists editorial_rss_sources_project_fk_idx on public.editorial_rss_sources (project_id);
create index if not exists editorial_plan_assets_plan_idx on public.editorial_plan_assets (plan_id);
create index if not exists editorial_plan_assets_project_idx on public.editorial_plan_assets (project_id);
create index if not exists editorial_plan_assets_created_by_idx on public.editorial_plan_assets (created_by);
create index if not exists editorial_plan_audit_plan_idx on public.editorial_plan_audit_events (plan_id);
create index if not exists editorial_plan_audit_project_idx on public.editorial_plan_audit_events (project_id);
create index if not exists editorial_plan_audit_item_idx on public.editorial_plan_audit_events (item_id);
create index if not exists editorial_plan_audit_actor_idx on public.editorial_plan_audit_events (actor_user_id);
