-- The production schema already had equivalent hot-path indexes under older
-- names. Keep one copy so writes do not pay duplicate index maintenance.
drop index if exists public.idx_zica_brain_jobs_claim;
drop index if exists public.idx_module_image_assets_scope_active_slot;
