-- Aggregate geographic content/reporting only. Individual voter profiles remain forbidden.
alter table public.electoral_portal_settings drop constraint if exists electoral_portal_settings_geo_reporting_level_check;
alter table public.electoral_portal_settings add constraint electoral_portal_settings_geo_reporting_level_check
  check (geo_reporting_level in ('state','city','city_neighborhood'));
