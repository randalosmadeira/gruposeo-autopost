-- Authenticated users need table-level DML grants before RLS can authorize CEO writes.
-- RLS policies remain the authorization boundary; dangerous table-level capabilities stay revoked.

revoke all privileges on table public.electoral_portal_resources from anon;
revoke all privileges on table public.electoral_portal_settings from anon;

revoke all privileges on table public.electoral_portal_resources from authenticated;
revoke all privileges on table public.electoral_portal_settings from authenticated;

grant select, insert, update, delete on table public.electoral_portal_resources to authenticated;
grant select, insert, update, delete on table public.electoral_portal_settings to authenticated;

grant all privileges on table public.electoral_portal_resources to service_role;
grant all privileges on table public.electoral_portal_settings to service_role;
