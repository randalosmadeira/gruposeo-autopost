alter policy nexus_business_owner_read on public.nexus_businesses
 using(user_id=(select auth.uid()) and public.is_organization_member(organization_id));
alter policy nexus_history_owner_read on public.nexus_strategy_history
 using(user_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and public.is_organization_member(p.organization_id)));
alter policy nexus_plan_owner_read on public.nexus_content_plans
 using(user_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and public.is_organization_member(p.organization_id)));
