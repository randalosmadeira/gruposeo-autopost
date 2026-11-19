-- Rollback da captação de leads. ATENÇÃO: apaga os leads coletados (dados pessoais). Exporte antes se quiser guardá-los.
drop trigger if exists marketing_leads_touch on public.marketing_leads;
drop function if exists public.marketing_leads_touch();
drop table if exists public.lead_capture_attempts;
drop table if exists public.marketing_leads;
