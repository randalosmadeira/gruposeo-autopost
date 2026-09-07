-- Articles created after the multitenant foundation (2026-09-05) never received
-- organization_id: no default, no trigger, and no insert path sets it. The
-- publisher rejects every such article with organization_boundary. Inherit the
-- organization from the project (or from the author's active membership) on
-- insert and whenever project_id changes, and backfill the existing rows.
-- Applied to Autopublic-prod on 2026-09-07 (verified: 0 articles without organization).

create or replace function public.inherit_article_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is null or (tg_op = 'UPDATE' and new.project_id is distinct from old.project_id) then
    if new.project_id is not null then
      select p.organization_id into new.organization_id from public.projects p where p.id = new.project_id;
    end if;
    if new.organization_id is null then
      select m.organization_id into new.organization_id
      from public.organization_members m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = new.user_id and m.status = 'active'
      order by (m.role = 'owner') desc, m.created_at
      limit 1;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.inherit_article_organization() from public, anon, authenticated;

drop trigger if exists trg_05_inherit_article_organization on public.articles;
create trigger trg_05_inherit_article_organization
before insert or update of project_id, organization_id on public.articles
for each row execute function public.inherit_article_organization();

update public.articles a
   set organization_id = p.organization_id
  from public.projects p
 where a.project_id = p.id and a.organization_id is null and p.organization_id is not null;

update public.articles a
   set organization_id = m.organization_id
  from (
    select distinct on (user_id) user_id, organization_id
      from public.organization_members
     where status = 'active'
     order by user_id, (role = 'owner') desc, created_at
  ) m
 where a.organization_id is null and a.user_id = m.user_id;

comment on function public.inherit_article_organization() is 'Keeps articles.organization_id aligned with the project (or the author membership) so publication boundary checks pass.';
