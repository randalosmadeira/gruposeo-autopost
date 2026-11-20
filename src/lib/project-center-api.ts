/** Cliente da Central de Projetos: chama a função de borda `project-lifecycle`, monta o pacote de exportação no navegador e traduz os erros. */
import { supabase } from '@/integrations/supabase/client';
import type { ProjectHealth, HealthState } from '../../supabase/functions/_shared/project-health-core';
import type { ConnectionMap, IntegrityIssue } from '../../supabase/functions/_shared/project-integrity-core';

export type { ProjectHealth, HealthState, ConnectionMap, IntegrityIssue };

export interface HealthOverview {
  organization_id: string; can_manage: boolean; can_delete: boolean; plugin_version: string;
  projects: ProjectHealth[]; totals: Record<HealthState, number>; generated_at: string;
}
export interface TimelineEntry { at: string; kind: 'evento' | 'atividade'; text: string; source: string }
export interface HealthDetail { health: ProjectHealth; map: ConnectionMap; events: Array<{ id: string; event: string; created_at: string }>; timeline: TimelineEntry[]; plugin_version: string }
export interface IntegrityResponse { project_id: string; issues: IntegrityIssue[]; totals: { critico: number; atencao: number; info: number }; map: ConnectionMap; intact: boolean; orphan_scan: 'ok' | 'indisponivel'; unverifiable_tables: string[] }
export interface DeletePlan {
  project: { id: string; name: string; lifecycle_status: string };
  empty: boolean; requires_archive: boolean; can_purge_now: boolean; total_rows: number;
  groups: Array<{ module: string; label: string; rows: number; tables: Array<{ table: string; rows: number; on_delete: string }> }>;
  without_fk: Array<{ table: string; rows: number | null }>; would_orphan: Array<{ table: string; rows: number }>; note: string;
}
export interface ExportIndex { project: { id: string; name: string }; row_cap: number; modules: Array<{ key: string; label: string; tables: Array<{ table: string; rows: number; page_size: number; reobtainable: boolean }> }>; notes: string[] }
export interface ExportPage { module: string; table: string; page: number; page_size: number; rows: Array<Record<string, unknown>>; has_more: boolean; truncated: boolean; warning?: string }
export interface PurgeResult { purged: boolean; project_id: string; name: string; was_empty: boolean; deleted: Record<string, number>; total_rows: number; vault: string; left_behind: Array<{ table: string; rows: number | null }> }

export class LifecycleError extends Error {
  constructor(public code: string, public detail?: unknown) { super(code); }
}
const MESSAGES: Record<string, string> = {
  organization_membership_required: 'Você não faz parte da organização deste projeto.',
  role_not_allowed: 'Seu papel nesta organização não permite esta ação.',
  project_not_found: 'Projeto não encontrado (talvez já tenha sido excluído).',
  invalid_transition: 'O estado do projeto mudou enquanto você olhava. Atualize a tela e tente de novo.',
  project_not_archived: 'Só dá para excluir definitivamente um projeto arquivado (ou totalmente vazio). Arquive primeiro.',
  confirmation_mismatch: 'O nome digitado não é igual ao nome do projeto.',
  export_required: 'Confirme que você exportou os dados antes de excluir.',
  purge_blocked: 'Alguns dados estão presos a outros e não puderam ser apagados. Nada foi excluído.',
  export_module_invalid: 'Módulo de exportação desconhecido.',
};
export const lifecycleErrorMessage = (e: unknown): string => (e instanceof LifecycleError ? MESSAGES[e.code] : undefined) || 'Não foi possível concluir agora. Tente de novo.';

export async function callLifecycle<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('project-lifecycle', { body: { action, ...body } });
  if (error) {
    let payload: ({ error?: string } & Record<string, unknown>) | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new LifecycleError(payload?.error || 'request_failed', payload);
  }
  return data as T;
}

export interface ExportPackage {
  exported_at: string; project: { id: string; name: string };
  modules: Record<string, Record<string, Array<Record<string, unknown>>>>;
  totals: { rows: number; tables: number }; warnings: string[];
}

/** Monta o pacote de exportação no navegador, módulo por módulo e página por página. Nada sai do Zica: o resultado só é guardado em memória. */
export async function buildExportPackage(projectId: string, onProgress?: (text: string) => void): Promise<ExportPackage> {
  const index = await callLifecycle<ExportIndex>('export', { projectId });
  const pkg: ExportPackage = { exported_at: new Date().toISOString(), project: index.project, modules: {}, totals: { rows: 0, tables: 0 }, warnings: [] };
  for (const mod of index.modules) {
    for (const t of mod.tables) {
      onProgress?.(`${mod.label}: ${t.table}`);
      const rows: Array<Record<string, unknown>> = [];
      for (let page = 0; page < 10_000; page++) {
        const r = await callLifecycle<ExportPage>('export', { projectId, module: mod.key, table: t.table, page });
        rows.push(...r.rows);
        if (r.warning) pkg.warnings.push(`${t.table}: ${r.warning}`);
        if (!r.has_more) break;
      }
      if (rows.length) {
        (pkg.modules[mod.key] ||= {})[t.table] = rows;
        pkg.totals.rows += rows.length;
        pkg.totals.tables += 1;
      }
    }
  }
  return pkg;
}

/** Registra no histórico que o pacote foi montado (os números vêm do navegador e são só informativos). */
export const recordExportDone = (projectId: string, pkg: ExportPackage) =>
  callLifecycle<{ recorded: boolean }>('export', { projectId, finish: true, rows: pkg.totals.rows, modules: Object.keys(pkg.modules) });

/** Entrega o pacote como arquivo .json no próprio navegador (download local, sem enviar a ninguém). */
export function downloadPackage(pkg: ExportPackage): string {
  const slug = pkg.project.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projeto';
  const name = `zica-exportacao-${slug}-${pkg.exported_at.slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
