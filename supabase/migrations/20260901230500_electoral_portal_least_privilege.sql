-- Harden Data API grants for the electoral portal network.
-- RLS remains the row-level authorization layer; these grants reduce exposed capabilities.

revoke all privileges on table public.electoral_portal_resources from anon;
revoke all privileges on table public.electoral_portal_settings from anon;

revoke all privileges on table public.electoral_portal_resources from authenticated;
revoke all privileges on table public.electoral_portal_settings from authenticated;

grant select on table public.electoral_portal_resources to authenticated;
grant select on table public.electoral_portal_settings to authenticated;

grant all privileges on table public.electoral_portal_resources to service_role;
grant all privileges on table public.electoral_portal_settings to service_role;
