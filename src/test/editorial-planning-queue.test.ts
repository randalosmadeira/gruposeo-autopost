import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: unknown };

const { rpc, from, calls, results } = vi.hoisted(() => {
  const calls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
  const results = new Map<string, Result>();
  const from = vi.fn((table: string) => {
    const record = { table, ops: [] as Array<[string, unknown[]]> };
    calls.push(record);
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'eq', 'order', 'limit', 'in']) {
      builder[op] = (...args: unknown[]) => { record.ops.push([op, args]); return builder; };
    }
    builder.then = (resolve: (value: Result) => unknown) => resolve(results.get(table) ?? { data: [], error: null });
    return builder;
  });
  return { rpc: vi.fn(), from, calls, results };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from } }));

import { getEditorialPlanDetail, listEditorialPlans, reprocessEditorialPlanItem } from '@/services/editorialPlanningQueue';
import { canReprocessEditorialItem, summarizeEditorialItems } from '@/lib/editorial-planning';

beforeEach(() => { rpc.mockReset(); from.mockClear(); calls.length = 0; results.clear(); });

describe('editorial planning queue: reads', () => {
  it('lists plans newest first and filters by project only when one is given', async () => {
    results.set('editorial_plans', { data: [{ id: 'p1' }], error: null });
    await listEditorialPlans();
    expect(calls[0].table).toBe('editorial_plans');
    expect(calls[0].ops.map(([op]) => op)).toEqual(['select', 'order', 'limit']);
    expect(calls[0].ops[1]).toEqual(['order', ['created_at', { ascending: false }]]);

    const plans = await listEditorialPlans('project-9', 10);
    expect(plans).toEqual([{ id: 'p1' }]);
    expect(calls[1].ops).toContainEqual(['eq', ['project_id', 'project-9']]);
    expect(calls[1].ops).toContainEqual(['limit', [10]]);
  });

  it('propagates read errors instead of returning partial data', async () => {
    results.set('editorial_plans', { data: null, error: new Error('permission denied') });
    await expect(listEditorialPlans()).rejects.toThrow('permission denied');
  });

  it('loads items, rss, assets and audit for one plan, all scoped by plan_id', async () => {
    results.set('editorial_plan_items', { data: [{ id: 'i1', status: 'failed' }], error: null });
    results.set('editorial_plan_audit_events', { data: [{ id: 1 }], error: null });
    const detail = await getEditorialPlanDetail('plan-1');
    expect(calls.map((call) => call.table).sort()).toEqual(['editorial_plan_assets', 'editorial_plan_audit_events', 'editorial_plan_items', 'editorial_rss_sources']);
    for (const call of calls) expect(call.ops).toContainEqual(['eq', ['plan_id', 'plan-1']]);
    expect(detail.items).toEqual([{ id: 'i1', status: 'failed' }]);
    expect(detail.audit).toEqual([{ id: 1 }]);
    expect(detail.rssSources).toEqual([]);
    expect(detail.assets).toEqual([]);
  });

  it('fails the whole detail load when any sub-query fails', async () => {
    results.set('editorial_plan_assets', { data: null, error: new Error('assets unavailable') });
    await expect(getEditorialPlanDetail('plan-1')).rejects.toThrow('assets unavailable');
  });
});

describe('editorial planning queue: reprocess', () => {
  it('calls the role-checked RPC with the expected step and parses the result', async () => {
    rpc.mockResolvedValueOnce({ data: { item_id: 'i1', status: 'queued', resume_from_step: 'draft', retry_count: 2 }, error: null });
    const result = await reprocessEditorialPlanItem('i1', 'draft');
    expect(rpc).toHaveBeenCalledWith('reprocess_editorial_plan_item', { p_item_id: 'i1', p_expected_step: 'draft' });
    expect(result).toEqual({ itemId: 'i1', status: 'queued', resumeFromStep: 'draft', retryCount: 2 });
  });

  it('surfaces database refusals such as item_not_reprocessable', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('item_not_reprocessable') });
    await expect(reprocessEditorialPlanItem('i1', 'draft')).rejects.toThrow('item_not_reprocessable');
  });

  it('rejects malformed RPC payloads', async () => {
    rpc.mockResolvedValueOnce({ data: 'ok', error: null });
    await expect(reprocessEditorialPlanItem('i1', 'draft')).rejects.toThrow(/inválida/);
  });
});

describe('editorial planning queue: domain helpers', () => {
  it('summarises items by status and ignores unknown states', () => {
    const summary = summarizeEditorialItems([
      { status: 'queued' }, { status: 'queued' }, { status: 'failed' }, { status: 'duplicate' }, { status: 'published' },
    ]);
    expect(summary).toEqual({ total: 5, queued: 2, processing: 0, draft_ready: 0, failed: 1, duplicate: 1, cancelled: 0 });
  });

  it('allows reprocessing only for failed items below the retry ceiling', () => {
    expect(canReprocessEditorialItem({ status: 'failed', retry_count: 0 })).toBe(true);
    expect(canReprocessEditorialItem({ status: 'failed', retry_count: 10 })).toBe(false);
    expect(canReprocessEditorialItem({ status: 'queued', retry_count: 0 })).toBe(false);
    expect(canReprocessEditorialItem({ status: 'draft_ready', retry_count: 0 })).toBe(false);
  });
});
