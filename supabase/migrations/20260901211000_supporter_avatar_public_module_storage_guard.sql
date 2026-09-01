do $$ begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='idx_supporter_avatar_prompt_global'
  ) then
    create index idx_supporter_avatar_prompt_global
      on public.supporter_avatar_prompt_templates(slug, is_active, version desc)
      where owner_user_id is null;
  end if;
end $$;