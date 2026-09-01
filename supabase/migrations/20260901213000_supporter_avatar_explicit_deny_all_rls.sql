create policy "supporter_requests_deny_direct_select" on public.supporter_avatar_requests for select to anon, authenticated using (false);
create policy "supporter_requests_deny_direct_insert" on public.supporter_avatar_requests for insert to anon, authenticated with check (false);
create policy "supporter_requests_deny_direct_update" on public.supporter_avatar_requests for update to anon, authenticated using (false) with check (false);
create policy "supporter_requests_deny_direct_delete" on public.supporter_avatar_requests for delete to anon, authenticated using (false);

create policy "supporter_sources_deny_direct_select" on public.supporter_avatar_sources for select to anon, authenticated using (false);
create policy "supporter_sources_deny_direct_insert" on public.supporter_avatar_sources for insert to anon, authenticated with check (false);
create policy "supporter_sources_deny_direct_update" on public.supporter_avatar_sources for update to anon, authenticated using (false) with check (false);
create policy "supporter_sources_deny_direct_delete" on public.supporter_avatar_sources for delete to anon, authenticated using (false);

create policy "supporter_outputs_deny_direct_select" on public.supporter_avatar_outputs for select to anon, authenticated using (false);
create policy "supporter_outputs_deny_direct_insert" on public.supporter_avatar_outputs for insert to anon, authenticated with check (false);
create policy "supporter_outputs_deny_direct_update" on public.supporter_avatar_outputs for update to anon, authenticated using (false) with check (false);
create policy "supporter_outputs_deny_direct_delete" on public.supporter_avatar_outputs for delete to anon, authenticated using (false);

create policy "supporter_jobs_deny_direct_select" on public.supporter_avatar_jobs for select to anon, authenticated using (false);
create policy "supporter_jobs_deny_direct_insert" on public.supporter_avatar_jobs for insert to anon, authenticated with check (false);
create policy "supporter_jobs_deny_direct_update" on public.supporter_avatar_jobs for update to anon, authenticated using (false) with check (false);
create policy "supporter_jobs_deny_direct_delete" on public.supporter_avatar_jobs for delete to anon, authenticated using (false);