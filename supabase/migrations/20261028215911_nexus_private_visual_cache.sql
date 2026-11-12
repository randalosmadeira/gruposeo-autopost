-- Reuse approved, private brand photographs. No HTTP, queues or provider calls.
create table public.nexus_visual_asset_cache (
 project_id uuid not null references public.projects(id) on delete cascade,
 asset_id uuid not null references public.organization_brand_assets(id) on delete cascade,
 source_sha256 text not null,
 image_data text not null check (image_data ~ '^data:image/webp;base64,[A-Za-z0-9+/]+=*$' and octet_length(image_data)<=204823),
 alt_text text not null,
 width integer not null check(width=1200),
 height integer not null check(height=675),
 primary key(project_id,asset_id)
);
alter table public.nexus_visual_asset_cache enable row level security;
revoke all on public.nexus_visual_asset_cache from anon,authenticated;
grant select on public.nexus_visual_asset_cache to authenticated;
grant all on public.nexus_visual_asset_cache to service_role;
create policy visual_cache_project_read on public.nexus_visual_asset_cache for select to authenticated using (
 exists(select 1 from public.projects p where p.id=project_id and
 (p.user_id=(select auth.uid()) or exists(select 1 from public.organization_members m where m.organization_id=p.organization_id and m.user_id=(select auth.uid()) and m.status='active')))
);
create or replace function private.nexus_assign_visual_cover() returns trigger
language plpgsql security invoker set search_path='' as $$
declare p public.projects; picked record; total integer; position integer;
begin
 if new.status<>'draft' or nullif(btrim(new.featured_image_url),'') is not null or new.project_id is null then return new; end if;
 select * into p from public.projects where id=new.project_id and user_id=new.user_id;
 if p.id is null or p.editorial_identity#>>'{nexus_visual_policy,runtime_enabled}' is distinct from 'true'
 or p.editorial_identity#>>'{nexus_visual_policy,mode}' is distinct from 'approved_assets_only' then return new; end if;
 select count(*) into total from public.nexus_visual_asset_cache c
 join public.organization_brand_assets a on a.id=c.asset_id and a.organization_id=p.organization_id
 where c.project_id=p.id and a.status='ready' and a.metadata->>'approved'='true'
 and c.source_sha256=a.sha256;
 if total=0 then return new; end if;
 select coalesce(sum(ascii(ch)),0)::integer % total into position from regexp_split_to_table(new.id::text,'') ch;
 select c.* into picked from public.nexus_visual_asset_cache c
 join public.organization_brand_assets a on a.id=c.asset_id and a.organization_id=p.organization_id
 where c.project_id=p.id and a.status='ready' and a.metadata->>'approved'='true' and c.source_sha256=a.sha256
 order by c.asset_id offset position limit 1;
 if picked.asset_id is null then return new; end if;
 new.featured_image_url:=picked.image_data;
 new.image_source:='nexus_approved_brand_cache';
 new.config:=coalesce(new.config,'{}'::jsonb)||jsonb_build_object('nexus_visual',jsonb_build_object(
 'version','1.1','asset_id',picked.asset_id,'sha256',picked.source_sha256,'width',1200,'height',675,
 'format','webp','alt',picked.alt_text,'private',true,'generated',false,'llm_tokens',0));
 return new;
end $$;
revoke all on function private.nexus_assign_visual_cover() from public,anon,authenticated;
create trigger a_nexus_visual_cover before insert or update on public.articles
for each row execute function private.nexus_assign_visual_cover();
