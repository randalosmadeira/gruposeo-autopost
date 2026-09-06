import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260906190000_editorial_mass_planning.sql'), 'utf8');
const page = readFileSync(resolve(process.cwd(), 'src/pages/BulkKeywordGenerator.tsx'), 'utf8');

describe('editorial planning migration safeguards', () => {
  it('enforces tenant RLS across every planning table', () => {
    for (const table of ['editorial_plans', 'editorial_plan_items', 'editorial_rss_sources', 'editorial_plan_assets', 'editorial_plan_audit_events']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain('public.is_organization_member(organization_id)');
    expect(migration).toContain("public.has_organization_role(v_org, array['owner','admin','editor','campaign_manager'])");
  });

  it('locks publication and exposes no publishing transition', () => {
    expect(migration).toContain('publication_enabled boolean not null default false check (publication_enabled = false)');
    expect(migration).not.toMatch(/status in \([^)]*published/);
  });

  it('makes plan creation idempotent and auditing append-only', () => {
    expect(migration).toContain('unique (organization_id, idempotency_key)');
    expect(migration).toContain('editorial_audit_append_only before update or delete');
    expect(migration).toContain("'idempotent_replay',true");
  });

  it('exposes only read access to tables and authenticated RPC execution', () => {
    expect(migration).toContain('grant select on public.editorial_plans');
    expect(migration).toContain('from public, anon');
    expect(migration).toContain('to authenticated');
    expect(migration).toContain("if auth.uid() is null then raise exception 'authentication_required'");
  });

  it('allows reprocessing only from the failed current step', () => {
    expect(migration).toContain("v_item.status <> 'failed' or v_item.current_step <> p_expected_step");
    expect(migration).toContain("jsonb_build_object('resume_from_step',p_expected_step");
  });

  it('keeps the planning screen disconnected from generation and publication', () => {
    expect(page).not.toContain('useBulkGeneration');
    expect(page).not.toContain("functions.invoke('generate");
    expect(page).not.toContain('publish-to-wordpress');
    expect(page).toContain('Salvar fila para revisão');
  });
});
