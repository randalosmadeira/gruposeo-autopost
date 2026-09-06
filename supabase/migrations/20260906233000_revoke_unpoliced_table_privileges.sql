-- CORE-002c: remove implicit table privileges that no RLS policy ever allows.
--
-- Supabase default privileges grant ALL on every public table to anon and
-- authenticated. RLS then denies what has no policy, except TRUNCATE (not
-- covered by RLS at all), REFERENCES and TRIGGER (DDL-only, useless for API roles).
--
-- This list was generated on 2026-09-06 from pg_policies + role_table_grants of
-- Autopublic-prod: for each table and role it revokes only (a) commands that have
-- no permissive policy for that role (policies `to public` count for both roles)
-- and (b) truncate/references/trigger. Behaviour under RLS is unchanged; the
-- attack surface without RLS (TRUNCATE) is closed. Tables with policies for the
-- role keep the matching commands. service_role is untouched.
--
-- Rollback: `grant all on table public.<t> to anon, authenticated;` per table.

revoke truncate, references, trigger on table public.agent_news from anon;
revoke truncate, references, trigger on table public.agent_news from authenticated;
revoke truncate, references, trigger on table public.analysis_uploads from anon;
revoke truncate, references, trigger on table public.analysis_uploads from authenticated;
revoke truncate, references, trigger on table public.app_config from anon;
revoke truncate, references, trigger on table public.app_config from authenticated;
revoke delete, truncate, references, trigger on table public.article_reports from anon;
revoke truncate, references, trigger on table public.article_reports from authenticated;
revoke update, truncate, references, trigger on table public.article_versions from anon;
revoke truncate, references, trigger on table public.article_versions from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.articles from anon;
revoke truncate, references, trigger on table public.articles from authenticated;
revoke truncate, references, trigger on table public.automation_ingress_keys from anon;
revoke truncate, references, trigger on table public.automation_ingress_keys from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.commercial_plan_versions from anon;
revoke insert, update, delete, truncate, references, trigger on table public.commercial_plan_versions from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.commercial_plans from anon;
revoke truncate, references, trigger on table public.commercial_plans from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.copilot_tool_registry from anon;
revoke truncate, references, trigger on table public.copilot_tool_registry from authenticated;
revoke truncate, references, trigger on table public.cron_notifications from anon;
revoke truncate, references, trigger on table public.cron_notifications from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.electoral_campaign_optins from anon;
revoke insert, truncate, references, trigger on table public.electoral_campaign_optins from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.electoral_content_sources from anon;
revoke truncate, references, trigger on table public.electoral_content_sources from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.electoral_content_units from anon;
revoke truncate, references, trigger on table public.electoral_content_units from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.electoral_image_jobs from anon;
revoke truncate, references, trigger on table public.electoral_image_jobs from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.electoral_visual_assets from anon;
revoke truncate, references, trigger on table public.electoral_visual_assets from authenticated;
revoke truncate, references, trigger on table public.emotional_trigger_configs from anon;
revoke truncate, references, trigger on table public.emotional_trigger_configs from authenticated;
revoke truncate, references, trigger on table public.gbp_audits from anon;
revoke truncate, references, trigger on table public.gbp_audits from authenticated;
revoke truncate, references, trigger on table public.gbp_competitor_snapshots from anon;
revoke truncate, references, trigger on table public.gbp_competitor_snapshots from authenticated;
revoke truncate, references, trigger on table public.gbp_competitors from anon;
revoke truncate, references, trigger on table public.gbp_competitors from authenticated;
revoke delete, truncate, references, trigger on table public.generation_logs from anon;
revoke truncate, references, trigger on table public.generation_logs from authenticated;
revoke truncate, references, trigger on table public.hyperlocal_generation_history from anon;
revoke truncate, references, trigger on table public.hyperlocal_generation_history from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.hyperlocal_template_overrides from anon;
revoke truncate, references, trigger on table public.hyperlocal_template_overrides from authenticated;
revoke update, truncate, references, trigger on table public.hyperlocal_title_template_versions from anon;
revoke truncate, references, trigger on table public.hyperlocal_title_template_versions from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.hyperlocal_title_templates from anon;
revoke truncate, references, trigger on table public.hyperlocal_title_templates from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.indexnow_config from anon;
revoke truncate, references, trigger on table public.indexnow_config from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.indexnow_logs from anon;
revoke truncate, references, trigger on table public.indexnow_logs from authenticated;
revoke truncate, references, trigger on table public.internal_link_suggestions from anon;
revoke truncate, references, trigger on table public.internal_link_suggestions from authenticated;
revoke truncate, references, trigger on table public.keyword_link_rules from anon;
revoke truncate, references, trigger on table public.keyword_link_rules from authenticated;
revoke select, truncate, references, trigger on table public.module_image_assets from anon;
revoke truncate, references, trigger on table public.module_image_assets from authenticated;
revoke select, truncate, references, trigger on table public.module_image_policies from anon;
revoke truncate, references, trigger on table public.module_image_policies from authenticated;
revoke select, truncate, references, trigger on table public.module_image_selection_logs from anon;
revoke truncate, references, trigger on table public.module_image_selection_logs from authenticated;
revoke truncate, references, trigger on table public.monitored_portals from anon;
revoke truncate, references, trigger on table public.monitored_portals from authenticated;
revoke truncate, references, trigger on table public.news_agents from anon;
revoke truncate, references, trigger on table public.news_agents from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.organization_brand_assets from anon;
revoke truncate, references, trigger on table public.organization_brand_assets from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.organization_brand_kits from anon;
revoke truncate, references, trigger on table public.organization_brand_kits from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.organization_media_derivatives from anon;
revoke insert, update, delete, truncate, references, trigger on table public.organization_media_derivatives from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.organization_members from anon;
revoke truncate, references, trigger on table public.organization_members from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.organization_operating_policies from anon;
revoke delete, truncate, references, trigger on table public.organization_operating_policies from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.organization_policy_versions from anon;
revoke insert, update, delete, truncate, references, trigger on table public.organization_policy_versions from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.organization_provider_credentials from anon;
revoke insert, update, delete, truncate, references, trigger on table public.organization_provider_credentials from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.organization_subscriptions from anon;
revoke truncate, references, trigger on table public.organization_subscriptions from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.organization_usage_ledger from anon;
revoke insert, update, delete, truncate, references, trigger on table public.organization_usage_ledger from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.organizations from anon;
revoke insert, delete, truncate, references, trigger on table public.organizations from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.poi_hyperlocal from anon;
revoke truncate, references, trigger on table public.poi_hyperlocal from authenticated;
revoke insert, delete, truncate, references, trigger on table public.profiles from anon;
revoke truncate, references, trigger on table public.profiles from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.project_circuit_breakers from anon;
revoke insert, update, delete, truncate, references, trigger on table public.project_circuit_breakers from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.projects from anon;
revoke truncate, references, trigger on table public.projects from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.prompt_template_versions from anon;
revoke update, delete, truncate, references, trigger on table public.prompt_template_versions from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.prompt_templates from anon;
revoke truncate, references, trigger on table public.prompt_templates from authenticated;
revoke truncate, references, trigger on table public.rss_schedules from anon;
revoke truncate, references, trigger on table public.rss_schedules from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.seo_agent_runs from anon;
revoke truncate, references, trigger on table public.seo_agent_runs from authenticated;
revoke truncate, references, trigger on table public.supporter_avatar_jobs from anon;
revoke truncate, references, trigger on table public.supporter_avatar_jobs from authenticated;
revoke truncate, references, trigger on table public.supporter_avatar_outputs from anon;
revoke truncate, references, trigger on table public.supporter_avatar_outputs from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.supporter_avatar_prompt_templates from anon;
revoke truncate, references, trigger on table public.supporter_avatar_prompt_templates from authenticated;
revoke truncate, references, trigger on table public.supporter_avatar_requests from anon;
revoke truncate, references, trigger on table public.supporter_avatar_requests from authenticated;
revoke truncate, references, trigger on table public.supporter_avatar_sources from anon;
revoke truncate, references, trigger on table public.supporter_avatar_sources from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.token_usage_logs from anon;
revoke truncate, references, trigger on table public.token_usage_logs from authenticated;
revoke truncate, references, trigger on table public.topic_clusters from anon;
revoke truncate, references, trigger on table public.topic_clusters from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.usage_quota_reservations from anon;
revoke insert, update, delete, truncate, references, trigger on table public.usage_quota_reservations from authenticated;
revoke insert, delete, truncate, references, trigger on table public.user_settings from anon;
revoke truncate, references, trigger on table public.user_settings from authenticated;
revoke truncate, references, trigger on table public.wordpress_article_index from anon;
revoke truncate, references, trigger on table public.wordpress_article_index from authenticated;
revoke select, truncate, references, trigger on table public.wordpress_operations from anon;
revoke truncate, references, trigger on table public.wordpress_operations from authenticated;
revoke truncate, references, trigger on table public.wordpress_stats from anon;
revoke truncate, references, trigger on table public.wordpress_stats from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.zica_brain_jobs from anon;
revoke truncate, references, trigger on table public.zica_brain_jobs from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.zica_brain_state from anon;
revoke truncate, references, trigger on table public.zica_brain_state from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.zica_orchestrator_events from anon;
revoke insert, update, delete, truncate, references, trigger on table public.zica_orchestrator_events from authenticated;
revoke select, insert, update, delete, truncate, references, trigger on table public.zica_orchestrator_targets from anon;
revoke truncate, references, trigger on table public.zica_orchestrator_targets from authenticated;
