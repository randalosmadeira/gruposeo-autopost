create table if not exists public.supporter_avatar_candidate_presets (
  slug text primary key,
  label text not null,
  wardrobe text not null check (wardrobe in ('terno','camisa-1470')),
  prop text not null check (prop in ('sem-taco','com-taco')),
  drive_folder_id text not null,
  drive_file_id text not null unique,
  drive_file_name text not null,
  drive_view_url text not null,
  drive_download_url text not null,
  prompt_hint text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supporter_avatar_candidate_presets enable row level security;
revoke all on public.supporter_avatar_candidate_presets from anon, authenticated;
grant select on public.supporter_avatar_candidate_presets to service_role;

insert into public.supporter_avatar_candidate_presets
(slug,label,wardrobe,prop,drive_folder_id,drive_file_id,drive_file_name,drive_view_url,drive_download_url,prompt_hint,sort_order,is_active)
values
('terno-sem-taco','Terno · sem taco','terno','sem-taco','1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6','1ADkM3c8naAaT8HJ19FT4dL2-PGeaXt-O','20260810_203724.jpg','https://drive.google.com/file/d/1ADkM3c8naAaT8HJ19FT4dL2-PGeaXt-O/view','https://drive.google.com/uc?export=download&id=1ADkM3c8naAaT8HJ19FT4dL2-PGeaXt-O','Referência oficial: terno preto, pose frontal, sem objeto nas mãos. Preserve roupa, silhueta, proporções e aparência fotográfica.',10,true),
('terno-com-taco','Terno · com taco','terno','com-taco','1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6','1mQctgDDYCnj6IYyng1TJL7bsvVBpFTl1','20260810_203927.jpg','https://drive.google.com/file/d/1mQctgDDYCnj6IYyng1TJL7bsvVBpFTl1/view','https://drive.google.com/uc?export=download&id=1mQctgDDYCnj6IYyng1TJL7bsvVBpFTl1','Referência oficial: terno preto com taco preto apoiado na frente do corpo. Preserve roupa, taco, postura e aparência fotográfica.',20,true),
('camisa-1470-sem-taco','Camisa 1470 · sem taco','camisa-1470','sem-taco','1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6','1GwZHaeEFSczO7fcpOkM8rAbvCs5_GvGk','20260809_141352.jpg','https://drive.google.com/file/d/1GwZHaeEFSczO7fcpOkM8rAbvCs5_GvGk/view','https://drive.google.com/uc?export=download&id=1GwZHaeEFSczO7fcpOkM8rAbvCs5_GvGk','Referência oficial: camiseta preta 1470, pose frontal, sem taco. Preserve estampa, cores, roupa e aparência fotográfica.',30,true),
('camisa-1470-com-taco','Camisa 1470 · com taco','camisa-1470','com-taco','1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6','1mf36fupkDGyV1QP3fLCNHi3FnQRCmKuP','20260809_141630.jpg','https://drive.google.com/file/d/1mf36fupkDGyV1QP3fLCNHi3FnQRCmKuP/view','https://drive.google.com/uc?export=download&id=1mf36fupkDGyV1QP3fLCNHi3FnQRCmKuP','Referência oficial: camiseta preta 1470 com taco preto em primeiro plano. Preserve estampa, taco, roupa, proporções e aparência fotográfica.',40,true)
on conflict (slug) do update set
  label=excluded.label, wardrobe=excluded.wardrobe, prop=excluded.prop,
  drive_folder_id=excluded.drive_folder_id, drive_file_id=excluded.drive_file_id,
  drive_file_name=excluded.drive_file_name, drive_view_url=excluded.drive_view_url,
  drive_download_url=excluded.drive_download_url, prompt_hint=excluded.prompt_hint,
  sort_order=excluded.sort_order, is_active=excluded.is_active, updated_at=now();

alter table public.supporter_avatar_requests
  add column if not exists candidate_preset_slug text null references public.supporter_avatar_candidate_presets(slug),
  add column if not exists output_format text not null default 'feed-square';

do $$ begin
  alter table public.supporter_avatar_requests add constraint supporter_avatar_output_format_check check (
    output_format in ('instagram-profile','whatsapp-profile','feed-square','feed-portrait','feed-landscape','stories-reels-status')
  );
exception when duplicate_object then null; end $$;

create index if not exists idx_supporter_avatar_candidate_presets_active_sort
  on public.supporter_avatar_candidate_presets(is_active,sort_order);
create index if not exists idx_supporter_avatar_requests_candidate_preset
  on public.supporter_avatar_requests(candidate_preset_slug);
