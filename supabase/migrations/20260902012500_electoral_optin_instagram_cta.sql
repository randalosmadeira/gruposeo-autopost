alter table public.electoral_portal_settings
  add column if not exists optin_instagram_enabled boolean not null default true,
  add column if not exists optin_instagram_url text,
  add column if not exists optin_instagram_label text not null default 'Seguir @rdmadvogados no Instagram';

update public.electoral_portal_settings
set optin_instagram_enabled = true,
    optin_instagram_url = 'https://www.instagram.com/rdmadvogados/',
    optin_instagram_label = 'Seguir @rdmadvogados no Instagram',
    updated_at = now()
where campaign_preset_id = 'madeira-1470-sp-2026';
