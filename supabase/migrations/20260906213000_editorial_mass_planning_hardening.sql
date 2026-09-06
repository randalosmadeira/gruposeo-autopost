-- CORE-002: hardening of the mass editorial planning flow introduced in
-- 20260906190000_editorial_mass_planning.sql. Still no publication transition.
--
-- 1. create_editorial_plan becomes safe under concurrent replays: a race that
--    hits the (organization_id, idempotency_key) unique constraint now returns
--    the existing plan instead of surfacing unique_violation to the client.
-- 2. Idempotent replays return the same counters as the original call so the
--    UI never shows zeroed totals after a retry.
-- 3. A keyword repeated inside the same batch is labelled 'within_import'
--    (before it was mislabelled 'existing_plan').
-- 4. Storage gains a DELETE policy for the planning bucket, scoped to the
--    organization prefix and editor roles, so the client-side compensation
--    (remove the object when register_editorial_plan_asset fails) actually
--    executes under RLS instead of leaving orphaned objects.
--
-- Rollback: re-run the create_editorial_plan body from CORE-001 and
-- `drop policy if exists editorial_plan_assets_storage_delete on storage.objects;`.

create or replace function public.create_editorial_plan(
  p_project_id uuid,
  p_name text,
  p_portal text,
  p_category text,
  p_audience text,
  p_city text,
  p_frequency text,
  p_requested_quantity integer,
  p_idempotency_key text,
  p_items jsonb,
  p_rss_sources jsonb default '[]'::jsonb,
  p_source_file_name text default null,
  p_estimated_input_tokens bigint default 0,
  p_estimated_output_tokens bigint default 0,
  p_estimated_credits integer default 0
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_org uuid;
  v_plan public.editorial_plans;
  v_replay boolean := false;
  v_item jsonb;
  v_rss jsonb;
  v_normalized text;
  v_hash text;
  v_duplicate_reason text;
  v_sequence integer := 0;
  v_inserted integer := 0;
  v_duplicates integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select organization_id into v_org from public.projects where id = p_project_id;
  if v_org is null then raise exception 'project_not_found'; end if;
  if not public.has_organization_role(v_org, array['owner','admin','editor','campaign_manager']) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 5000 then raise exception 'invalid_items'; end if;
  if jsonb_typeof(p_rss_sources) <> 'array' or jsonb_array_length(p_rss_sources) > 100 then raise exception 'invalid_rss_sources'; end if;

  select * into v_plan from public.editorial_plans where organization_id = v_org and idempotency_key = p_idempotency_key;
  v_replay := found;

  if not v_replay then
    begin
      insert into public.editorial_plans (
        organization_id,project_id,created_by,name,portal,category,audience,city,frequency,
        requested_quantity,idempotency_key,source_file_name,estimated_input_tokens,
        estimated_output_tokens,estimated_credits,metadata
      ) values (
        v_org,p_project_id,auth.uid(),trim(p_name),trim(p_portal),trim(p_category),trim(p_audience),trim(p_city),p_frequency,
        p_requested_quantity,p_idempotency_key,nullif(trim(p_source_file_name),''),p_estimated_input_tokens,
        p_estimated_output_tokens,p_estimated_credits,jsonb_build_object('publication_locked',true,'schema_version',2)
      ) returning * into v_plan;
    exception when unique_violation then
      -- Concurrent replay: another transaction committed the same idempotency key first.
      select * into v_plan from public.editorial_plans where organization_id = v_org and idempotency_key = p_idempotency_key;
      if not found then raise; end if;
      v_replay := true;
    end;
  end if;

  if v_replay then
    select count(*), count(*) filter (where not i.duplicate), count(*) filter (where i.duplicate)
      into v_sequence, v_inserted, v_duplicates
      from public.editorial_plan_items i where i.plan_id = v_plan.id;
    return jsonb_build_object('plan_id',v_plan.id,'status',v_plan.status,'items',v_sequence,'ready',v_inserted,'duplicates',v_duplicates,'idempotent_replay',true);
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_sequence := v_sequence + 1;
    v_normalized := lower(regexp_replace(extensions.unaccent(trim(coalesce(v_item->>'keyword',''))), '[^a-zA-Z0-9]+', ' ', 'g'));
    v_normalized := regexp_replace(trim(v_normalized), '\s+', ' ', 'g');
    if length(v_normalized) < 2 then raise exception 'invalid_keyword_at_%', v_sequence; end if;
    v_hash := encode(digest(v_normalized, 'sha256'), 'hex');
    v_duplicate_reason := null;
    if exists(select 1 from public.editorial_plan_items i where i.plan_id=v_plan.id and i.keyword_sha256=v_hash) then
      v_duplicate_reason := 'within_import';
    elsif exists(select 1 from public.editorial_plan_items i where i.organization_id=v_org and i.project_id=p_project_id and i.keyword_sha256=v_hash) then
      v_duplicate_reason := 'existing_plan';
    elsif exists(select 1 from public.articles a where a.organization_id=v_org and a.project_id=p_project_id and lower(regexp_replace(extensions.unaccent(trim(coalesce(a.keyword,''))), '[^a-zA-Z0-9]+', ' ', 'g'))=v_normalized) then
      v_duplicate_reason := 'existing_article';
    end if;
    if v_duplicate_reason is not null then v_duplicates := v_duplicates + 1; else v_inserted := v_inserted + 1; end if;
    insert into public.editorial_plan_items (
      organization_id,project_id,plan_id,sequence_no,keyword,normalized_keyword,keyword_sha256,
      category,intent,volume,difficulty,priority,duplicate,duplicate_reason,status
    ) values (
      v_org,p_project_id,v_plan.id,v_sequence,trim(v_item->>'keyword'),v_normalized,v_hash,
      nullif(trim(v_item->>'category'),''),nullif(trim(v_item->>'intent'),''),
      case when coalesce(v_item->>'volume','') ~ '^[0-9]+([.,][0-9]+)?$' then replace(v_item->>'volume',',','.')::numeric end,
      case when coalesce(v_item->>'difficulty','') ~ '^[0-9]+([.,][0-9]+)?$' then replace(v_item->>'difficulty',',','.')::numeric end,
      case when coalesce(v_item->>'priority','') ~ '^[0-9]+$' then (v_item->>'priority')::integer end,
      v_duplicate_reason is not null,v_duplicate_reason,case when v_duplicate_reason is null then 'queued' else 'duplicate' end
    );
  end loop;

  for v_rss in select value from jsonb_array_elements(p_rss_sources) loop
    if coalesce(v_rss->>'url','') !~* '^https?://[^[:space:]]+$' then raise exception 'invalid_rss_url'; end if;
    insert into public.editorial_rss_sources (organization_id,project_id,plan_id,label,url,created_by)
    values (v_org,p_project_id,v_plan.id,trim(coalesce(v_rss->>'label','Fonte RSS')),trim(v_rss->>'url'),auth.uid())
    on conflict (organization_id,project_id,url) do update set plan_id=excluded.plan_id,label=excluded.label,updated_at=now();
  end loop;

  insert into public.editorial_plan_audit_events (organization_id,project_id,plan_id,actor_user_id,event_type,to_status,details)
  values (v_org,p_project_id,v_plan.id,auth.uid(),'plan.created','review',jsonb_build_object('items',v_sequence,'ready',v_inserted,'duplicates',v_duplicates,'publication_locked',true));
  return jsonb_build_object('plan_id',v_plan.id,'status','review','items',v_sequence,'ready',v_inserted,'duplicates',v_duplicates,'idempotent_replay',false);
end;
$$;

comment on function public.create_editorial_plan is 'Idempotently creates a tenant-scoped review plan and durable queue without publishing. Concurrent replays return the existing plan with its counters.';

-- Compensation path: the client removes a freshly uploaded object when the
-- asset registration RPC fails. Without this policy the removal is denied by
-- RLS and the object is orphaned. Scope mirrors the insert/update policies.
drop policy if exists editorial_plan_assets_storage_delete on storage.objects;
create policy editorial_plan_assets_storage_delete on storage.objects for delete to authenticated using (
  bucket_id='editorial-plan-assets' and exists(select 1 from public.organization_members m where m.organization_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','editor','campaign_manager'))
);
