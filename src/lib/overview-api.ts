/** Cliente da Visão Geral e Estrutura do negócio: chama a função de borda `site-overview` e traduz os erros para português. */
import { supabase } from '@/integrations/supabase/client';
import type { Connections, Diagnostic, Kpis, TreeHost } from '../../supabase/functions/_shared/overview-core';

export interface OverviewData {
  project: { id: string; name: string; domain: string | null };
  can_refresh: boolean;
  days: 7 | 28 | 90;
  windows: { gsc: Record<string, string> | null; ga4: Record<string, string> | null };
  connections: Connections;
  kpis: Kpis;
  diagnostics: Diagnostic[];
  channels: Array<{ channel: string; sessions: number }>;
  top_pages: Array<{ page: string; clicks: number; impressions: number; position: number | null }>;
  top_queries: Array<{ query: string; clicks: number; impressions: number; position: number | null }>;
  ga4_pages: Array<{ page: string; views: number; sessions: number }>;
  tree: TreeHost[];
  map_updated_at: string | null;
}
export interface RefreshResult { refreshed: number; hosts: Array<{ host: string; ok: boolean; sitemap_urls: number | null }>; fetched_at: string }

export class OverviewError extends Error {
  constructor(public code: string, public detail?: unknown) { super(code); }
}
const MESSAGES: Record<string, string> = {
  project_domain_required: 'Este projeto ainda não tem um site cadastrado. Cadastre o endereço para ler os sitemaps.',
  refresh_too_soon: 'O mapa foi atualizado há pouco. Tente de novo em alguns minutos.',
  role_not_allowed: 'Seu papel nesta organização permite ver os resultados, mas não atualizar o mapa.',
  organization_membership_required: 'Você não faz parte da organização deste projeto.',
  project_not_found: 'Projeto não encontrado.',
};
export const overviewErrorMessage = (e: unknown): string => (e instanceof OverviewError ? MESSAGES[e.code] : undefined) || 'Não foi possível carregar agora. Tente de novo.';

export async function callOverview<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('site-overview', { body: { action, ...body } });
  if (error) {
    let payload: { error?: string } & Record<string, unknown> | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new OverviewError(payload?.error || 'request_failed', payload);
  }
  return data as T;
}
