create index if not exists organization_operating_policies_updated_by_idx
on public.organization_operating_policies (updated_by)
where updated_by is not null;
