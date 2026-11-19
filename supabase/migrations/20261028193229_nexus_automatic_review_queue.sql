-- Preparation only: no HTTP, model invocation, reservation or publication.
create function private.nexus_prepare_article_review(p_article uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.articles;p public.projects;fingerprint text;operation_id uuid;operation_key text;
begin
 select * into a from public.articles where id=p_article;
 if a.id is null or a.project_id is null or length(trim(coalesce(a.content,'')))=0 then return null;end if;
 select * into p from public.projects where id=a.project_id;
 if p.id is null or p.organization_id is null or p.user_id<>a.user_id then return null;end if;
 fingerprint:=md5(jsonb_build_array(a.title,a.content,a.excerpt,a.featured_image_url,a.keyword,
  a.config->'sourcesContext',a.config->'primary_sources',a.config->'secondary_sources',a.config->'legal_authorities',a.config->'conversionBrief',p.nexus_strategy_version,p.nexus_business_id)::text);
 operation_key:='auto-review-v1:'||a.id::text||':'||fingerprint;
 update public.nexus_operations set status='failed',output='{"reason":"superseded_before_execution"}'::jsonb,updated_at=now()
 where organization_id=p.organization_id and project_id=p.id and kind='editorial_review' and input->>'articleId'=a.id::text and status='prepared' and request_key<>operation_key;
 insert into public.nexus_operations(organization_id,project_id,user_id,kind,request_key,input)
 values(p.organization_id,p.id,a.user_id,'editorial_review',operation_key,
  jsonb_build_object('articleId',a.id,'strategy_version',p.nexus_strategy_version,'review_mode','autonomous','origin','database_material_change','execution','globally_blocked'))
 on conflict(organization_id,request_key) do nothing returning id into operation_id;
 if operation_id is null then select id into operation_id from public.nexus_operations where organization_id=p.organization_id and request_key=operation_key;end if;
 return operation_id;
end $$;
revoke all on function private.nexus_prepare_article_review(uuid) from public,anon,authenticated;
grant execute on function private.nexus_prepare_article_review(uuid) to service_role;
create function public.nexus_prepare_article_review(p_article uuid) returns uuid language sql security invoker set search_path='' as $$select private.nexus_prepare_article_review(p_article);$$;
revoke all on function public.nexus_prepare_article_review(uuid) from public,anon,authenticated;
grant execute on function public.nexus_prepare_article_review(uuid) to service_role;
create function private.nexus_enqueue_material_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then perform private.nexus_prepare_article_review(new.id);
 elsif jsonb_build_array(new.title,new.content,new.excerpt,new.featured_image_url,new.keyword,new.project_id,
  new.config->'sourcesContext',new.config->'primary_sources',new.config->'secondary_sources',new.config->'legal_authorities',new.config->'conversionBrief',new.config->'nexus_strategy_version')
 is distinct from jsonb_build_array(old.title,old.content,old.excerpt,old.featured_image_url,old.keyword,old.project_id,
  old.config->'sourcesContext',old.config->'primary_sources',old.config->'secondary_sources',old.config->'legal_authorities',old.config->'conversionBrief',old.config->'nexus_strategy_version') then
  perform private.nexus_prepare_article_review(new.id);
 end if;return new;
end $$;
revoke all on function private.nexus_enqueue_material_review() from public,anon,authenticated;
create trigger nexus_material_review after insert or update on public.articles for each row execute function private.nexus_enqueue_material_review();
create function private.nexus_enqueue_strategy_reviews() returns trigger
language plpgsql security definer set search_path='' as $$
declare item record;
begin
 if new.nexus_strategy is distinct from old.nexus_strategy or new.nexus_business_id is distinct from old.nexus_business_id then
  for item in select id from public.articles where project_id=new.id and user_id=new.user_id and status in ('draft','ready') and length(trim(coalesce(content,'')))>0 loop
   perform private.nexus_prepare_article_review(item.id);
  end loop;
 end if;return new;
end $$;
revoke all on function private.nexus_enqueue_strategy_reviews() from public,anon,authenticated;
create trigger nexus_strategy_reviews after update on public.projects for each row execute function private.nexus_enqueue_strategy_reviews();
