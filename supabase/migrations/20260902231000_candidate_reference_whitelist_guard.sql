create table if not exists public.candidate_reference_whitelist (
  drive_file_id text primary key,
  drive_folder_id text not null,
  label text not null,
  allowed_modules text[] not null default array['electoral','electoral_network','supporter_collab']::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidate_reference_whitelist enable row level security;
revoke all on public.candidate_reference_whitelist from anon, authenticated;

insert into public.candidate_reference_whitelist (drive_file_id,drive_folder_id,label,allowed_modules,is_active,updated_at) values
('1ADkM3c8naAaT8HJ19FT4dL2-PGeaXt-O','1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6','Terno frontal limpo',array['electoral','electoral_network','supporter_collab'],true,now()),
('1pvYTMCPtyjBC3-MuJoMBQiJskRvGNKl-','1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6','Terno três-quartos A',array['supporter_collab'],true,now()),
('1Riy0xkYsjctHCtT45FQ-VAi8-keHmInH','1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6','Terno três-quartos B',array['supporter_collab'],true,now()),
('1kSvcHueCmhJ6lKPt6Pbcry4aSSZZ_Uqc','1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6','Terno autoridade braços cruzados',array['electoral','electoral_network'],true,now()),
('16VS4SUWhS6QpW8175JzZuLi_VIQZl7-T','1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6','Terno assinatura taco nos ombros',array['electoral','electoral_network'],true,now()),
('1AwIDGy-7yLQwUXIgVOhqZec5-Jchy46i','1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6','Camisa 1470 frontal limpo',array['electoral','electoral_network','supporter_collab'],true,now()),
('1KeyBhHjsGRplSARzIzlbGzSnItS4GHN-','1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6','Camisa 1470 três-quartos limpo',array['electoral','electoral_network','supporter_collab'],true,now()),
('1h_XMi_Rg8C7nEEWnk9ANjkJMIRMZC1VC','1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6','Camisa 1470 três-quartos taco baixo',array['electoral','electoral_network','supporter_collab'],true,now())
on conflict (drive_file_id) do update set
  drive_folder_id=excluded.drive_folder_id,
  label=excluded.label,
  allowed_modules=excluded.allowed_modules,
  is_active=excluded.is_active,
  updated_at=now();

create or replace function public.guard_supporter_candidate_whitelist()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_active and not exists (
    select 1 from public.candidate_reference_whitelist w
    where w.drive_file_id = new.drive_file_id
      and w.is_active
      and 'supporter_collab' = any(w.allowed_modules)
  ) then
    raise exception 'candidate_reference_not_whitelisted';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_supporter_candidate_whitelist on public.supporter_avatar_candidate_presets;
create trigger trg_guard_supporter_candidate_whitelist
before insert or update of is_active, drive_file_id on public.supporter_avatar_candidate_presets
for each row execute function public.guard_supporter_candidate_whitelist();

create or replace function public.guard_electoral_module_candidate_whitelist()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_drive_file_id text;
begin
  if new.is_active and new.module_key in ('electoral','electoral_network') then
    v_drive_file_id := substring(coalesce(new.external_url,'') from 'id=([^&]+)');
    if v_drive_file_id is null or not exists (
      select 1 from public.candidate_reference_whitelist w
      where w.drive_file_id = v_drive_file_id
        and w.is_active
        and new.module_key = any(w.allowed_modules)
    ) then
      raise exception 'electoral_candidate_reference_not_whitelisted';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_electoral_module_candidate_whitelist on public.module_image_assets;
create trigger trg_guard_electoral_module_candidate_whitelist
before insert or update of is_active, module_key, external_url on public.module_image_assets
for each row execute function public.guard_electoral_module_candidate_whitelist();
