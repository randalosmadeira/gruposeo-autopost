-- Restore RLS policies on prompt_templates dropped without replacement.
--
-- Root cause: 20260905195700_enforce_admin_only_technical_controls.sql
-- (lines 3-6) dropped all 4 owner-scoped policies on this table
-- ("Users can view/create/update/delete their own templates") as part of a
-- blanket cleanup, but unlike token_usage_logs and the other tables touched
-- in that same migration, no later migration recreated them here. RLS has
-- been enabled on prompt_templates since its creation
-- (20260205150122_1f17abec-221f-4a4d-b3e5-45c9b67c4919.sql) and was never
-- disabled, so with zero permissive policies left, every authenticated user
-- has been fully locked out of their own prompt templates (no select,
-- insert, update or delete) since that migration ran.
--
-- This is the same bug pattern already fixed for the sibling table
-- token_usage_logs in 20260917094128_token_cost_governance.sql (see its
-- comment block, point 1). This migration follows that precedent: recreate
-- policies scoped to real row ownership, `to authenticated`, using the
-- table's actual ownership column (`user_id`, confirmed in the base
-- creation migration above). Unlike token_usage_logs, prompt_templates has
-- no organization_id column and no org-membership concept yet, so the
-- restored policies are plain per-user ownership, matching what was
-- originally shipped.

alter table public.prompt_templates enable row level security;

drop policy if exists "Users can view their own templates" on public.prompt_templates;
drop policy if exists "Users can create their own templates" on public.prompt_templates;
drop policy if exists "Users can update their own templates" on public.prompt_templates;
drop policy if exists "Users can delete their own templates" on public.prompt_templates;

create policy "Users can view their own templates"
on public.prompt_templates
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create their own templates"
on public.prompt_templates
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own templates"
on public.prompt_templates
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own templates"
on public.prompt_templates
for delete
to authenticated
using (auth.uid() = user_id);
