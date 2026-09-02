-- Supporter admin indexes and fixed-photo background editing metadata.
alter table public.module_image_policies
  add column if not exists allow_background_editing boolean not null default false;

alter table public.module_image_assets
  add column if not exists background_mode text not null default 'preserve',
  add column if not exists background_prompt text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'module_image_assets_background_mode_check'
      and conrelid = 'public.module_image_assets'::regclass
  ) then
    alter table public.module_image_assets
      add constraint module_image_assets_background_mode_check
      check (background_mode in ('preserve','chroma_replace'));
  end if;
end $$;

update public.module_image_policies
set allow_background_editing = true,
    updated_at = now()
where module_key in ('article','electoral','electoral_network','landing_page','news','repost');

-- The three fixed Drive presets are green-screen studio assets and must never be published raw.
update public.module_image_assets
set background_mode = case when slot in (4,5,6) then 'chroma_replace' else 'preserve' end,
    background_prompt = case
      when slot in (4,5,6) then 'Remover integralmente o fundo chroma key verde e reconstruir apenas o fundo. Preservar a pessoa, rosto, cabelo, barba, roupa, mãos, taco e proporções sem redesenhar a identidade.'
      else null
    end,
    updated_at = now()
where module_key in ('article','electoral','electoral_network','landing_page','news','repost')
  and is_active = true;

create index if not exists idx_supporter_avatar_requests_created_desc
  on public.supporter_avatar_requests (created_at desc);

create index if not exists idx_supporter_avatar_requests_status_created
  on public.supporter_avatar_requests (status, created_at desc);
