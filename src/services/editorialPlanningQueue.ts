import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';

// CORE-004: read model of the mass planning queue plus the single allowed
// mutation (re-queue a failed item from its current step). Every read goes
// through RLS (organization membership); the mutation goes through the
// role-checked RPC. Nothing here publishes or generates content.

type Tables = Database['public']['Tables'];
export type EditorialPlanRow = Tables['editorial_plans']['Row'];
export type EditorialPlanItemRow = Tables['editorial_plan_items']['Row'];
export type EditorialRssSourceRow = Tables['editorial_rss_sources']['Row'];
export type EditorialPlanAssetRow = Tables['editorial_plan_assets']['Row'];
export type EditorialPlanAuditRow = Tables['editorial_plan_audit_events']['Row'];

export interface EditorialPlanDetail {
  items: EditorialPlanItemRow[];
  rssSources: EditorialRssSourceRow[];
  assets: EditorialPlanAssetRow[];
  audit: EditorialPlanAuditRow[];
}

export interface ReprocessResult {
  itemId: string;
  status: string;
  resumeFromStep: string;
  retryCount: number;
}

export const PLAN_LIST_LIMIT = 50;
export const AUDIT_LIST_LIMIT = 200;

export async function listEditorialPlans(projectId?: string, limit = PLAN_LIST_LIMIT): Promise<EditorialPlanRow[]> {
  let query = supabase.from('editorial_plans').select('*').order('created_at', { ascending: false }).limit(limit);
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getEditorialPlanDetail(planId: string): Promise<EditorialPlanDetail> {
  const [items, rssSources, assets, audit] = await Promise.all([
    supabase.from('editorial_plan_items').select('*').eq('plan_id', planId).order('sequence_no', { ascending: true }),
    supabase.from('editorial_rss_sources').select('*').eq('plan_id', planId).order('created_at', { ascending: true }),
    supabase.from('editorial_plan_assets').select('*').eq('plan_id', planId).order('created_at', { ascending: true }),
    supabase.from('editorial_plan_audit_events').select('*').eq('plan_id', planId).order('occurred_at', { ascending: false }).limit(AUDIT_LIST_LIMIT),
  ]);
  const failed = [items, rssSources, assets, audit].find((result) => result.error);
  if (failed?.error) throw failed.error;
  return {
    items: items.data ?? [],
    rssSources: rssSources.data ?? [],
    assets: assets.data ?? [],
    audit: audit.data ?? [],
  };
}

function asRecord(value: Json): Record<string, Json | undefined> {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Resposta inválida ao reprocessar item.');
  return value;
}

/**
 * Re-queues one failed item from the step it failed at. The database rejects
 * any other state (`item_not_reprocessable`) and records an audit event.
 */
export async function reprocessEditorialPlanItem(itemId: string, expectedStep: string): Promise<ReprocessResult> {
  const { data, error } = await supabase.rpc('reprocess_editorial_plan_item', { p_item_id: itemId, p_expected_step: expectedStep });
  if (error) throw error;
  const response = asRecord(data);
  return {
    itemId: String(response.item_id ?? itemId),
    status: String(response.status ?? 'queued'),
    resumeFromStep: String(response.resume_from_step ?? expectedStep),
    retryCount: Number(response.retry_count ?? 0),
  };
}
