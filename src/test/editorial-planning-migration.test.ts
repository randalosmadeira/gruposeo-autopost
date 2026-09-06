import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260906190000_editorial_mass_planning.sql'), 'utf8');
const hardening = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260906213000_editorial_mass_planning_hardening.sql'), 'utf8');
const privileges = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260906230000_editorial_mass_planning_privileges.sql'), 'utf8');
const unpoliced = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260906233000_revoke_unpoliced_table_privileges.sql'), 'utf8');
const page = readFileSync(resolve(process.cwd(), 'src/pages/BulkKeywordGenerator.tsx'), 'utf8');
const PLANNING_TABLES = ['editorial_plans', 'editorial_plan_items', 'editorial_rss_sources', 'editorial_plan_assets', 'editorial_plan_audit_events'];

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

describe('editorial planning hardening (CORE-002)', () => {
  it('keeps the same security preconditions as the original RPC', () => {
    expect(hardening).toContain("if auth.uid() is null then raise exception 'authentication_required'");
    expect(hardening).toContain("public.has_organization_role(v_org, array['owner','admin','editor','campaign_manager'])");
    expect(hardening).toContain('security definer set search_path = public, extensions');
    expect(hardening).not.toMatch(/status in \([^)]*published/);
    expect(hardening).not.toMatch(/publication_enabled\s*=\s*true/);
  });

  it('turns a concurrent unique_violation on the idempotency key into a replay', () => {
    expect(hardening).toContain('exception when unique_violation then');
    expect(hardening).toContain('if not found then raise; end if;');
    expect(hardening).toContain('v_replay := true;');
  });

  it('returns the persisted counters on idempotent replays', () => {
    expect(hardening).toMatch(/count\(\*\) filter \(where not i\.duplicate\), count\(\*\) filter \(where i\.duplicate\)/);
    expect(hardening).toContain("'idempotent_replay',true");
    expect(hardening).toContain("'idempotent_replay',false");
  });

  it('labels repeats inside the same batch as within_import before checking other plans', () => {
    const within = hardening.indexOf("v_duplicate_reason := 'within_import'");
    const existing = hardening.indexOf("v_duplicate_reason := 'existing_plan'");
    expect(within).toBeGreaterThan(-1);
    expect(existing).toBeGreaterThan(within);
    expect(hardening).toContain('i.plan_id=v_plan.id and i.keyword_sha256=v_hash');
  });

  it('adds a tenant-scoped delete policy so the upload compensation works under RLS', () => {
    expect(migration).not.toMatch(/on storage\.objects for delete/);
    expect(hardening).toContain('drop policy if exists editorial_plan_assets_storage_delete on storage.objects');
    expect(hardening).toMatch(/editorial_plan_assets_storage_delete on storage\.objects for delete to authenticated using \(\s*bucket_id='editorial-plan-assets'/);
    expect(hardening).toContain("(storage.foldername(name))[1] and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','editor','campaign_manager')");
  });

  it('does not touch tables, grants or buckets beyond the function and the delete policy', () => {
    expect(hardening).not.toMatch(/create table|alter table|drop table|grant |revoke |storage\.buckets/i);
  });
});

describe('editorial planning least privilege (CORE-002b)', () => {
  it('revokes the implicit default privileges from anon and authenticated on every planning table', () => {
    for (const table of PLANNING_TABLES) {
      expect(privileges).toContain(`revoke all on table public.${table} from anon, authenticated;`);
    }
    expect(privileges).toContain('revoke all on sequence public.editorial_plan_audit_events_id_seq from anon, authenticated;');
  });

  it('grants back only SELECT, only to authenticated', () => {
    const grants = privileges.match(/^grant .*$/gim) ?? [];
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatch(/^grant select on table /);
    expect(grants[0]).toMatch(/ to authenticated;$/);
    expect(grants[0]).not.toContain('anon');
    for (const table of PLANNING_TABLES) expect(grants[0]).toContain(`public.${table}`);
  });

  it('CORE-002c only revokes API-role privileges and never grants, alters or drops', () => {
    const statements = unpoliced.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('--'));
    expect(statements.length).toBeGreaterThanOrEqual(130);
    for (const statement of statements) {
      expect(statement).toMatch(/^revoke [a-z, ]+ on table public\.[a-z_]+ from (anon|authenticated);$/);
      expect(statement).toContain('truncate');
      expect(statement).not.toContain('service_role');
    }
    expect(unpoliced).not.toMatch(/^\s*(grant|alter|drop|create)\b/im);
  });

  it('adds covering indexes for the foreign keys flagged by the advisor without other DDL', () => {
    const statements = privileges.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
    const indexes = statements.match(/^create index if not exists /gim) ?? [];
    expect(indexes).toHaveLength(13);
    expect(statements).not.toMatch(/create table|alter table|drop |create policy|create or replace function/i);
  });
});
