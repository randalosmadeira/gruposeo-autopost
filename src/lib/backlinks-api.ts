/** Cliente dos Backlinks (F2): chama a função de borda `backlinks` e traduz os erros para português. */
import { supabase } from '@/integrations/supabase/client';
import type { Flag, Summary } from '../../supabase/functions/_shared/backlinks-core';
import type { AnchorKind, LinkAttr, LinkStatus } from '../../supabase/functions/_shared/backlinks-labels';
import type { AlertRow } from '@/lib/speed-api';

export interface BacklinkRow {
  id: string; target_host: string; kind: 'own' | 'competitor'; source_url: string; source_host: string; source_domain: string; target_url: string | null; anchor: string | null;
  link_attr: LinkAttr | null; origin: string; status: LinkStatus; http_status: number | null; source_noindex: boolean | null; links_found: number | null; check_error: string | null;
  first_seen_at: string; last_checked_at: string | null; status_changed_at: string | null; last_live_at: string | null;
}
export interface BacklinkTarget { host: string; kind: 'own' | 'competitor'; count: number }
export interface BacklinkData {
  project: { id: string; name: string; domain: string | null };
  can_edit: boolean;
  target: { host: string; kind: 'own' | 'competitor' };
  targets: BacklinkTarget[];
  summary: Summary;
  links: BacklinkRow[];
  page: number; page_size: number; filtered_total: number;
  settings: { enabled: boolean; recheck_days: number; last_run_at: string | null } | null;
  alerts: AlertRow[];
  limits: { max_links: number; total_links: number; max_competitors: number };
}
export interface ImportReport { added: number; already_there: number; invalid: number; self_links: number; duplicates_in_file: number; over_limit: number; file_truncated: boolean }
export interface VerifyReport { checked: number; failed: number; changes: number; remaining_pending: number }
export type { AnchorKind, Flag, LinkAttr, LinkStatus, Summary };

export class BacklinkError extends Error {
  constructor(public code: string, public detail?: string) { super(code); }
}
const MESSAGES: Record<string, string> = {
  project_domain_required: 'Este projeto ainda não tem um site cadastrado. Cadastre o endereço do site para acompanhar os backlinks dele.',
  target_invalid: 'Esse endereço de site não parece válido. Use algo como concorrente.com.br.',
  list_required: 'Cole a lista de páginas (uma por linha) ou o conteúdo exportado.',
  list_too_large: 'A lista é grande demais para uma vez só. Envie em partes de até 2.000 linhas.',
  origin_invalid: 'Escolha de onde veio a lista.',
  competitor_limit: 'Este projeto já acompanha 5 concorrentes. Remova os links de um deles antes de adicionar outro.',
  ids_invalid: 'Seleção inválida.',
  daily_limit: 'Este projeto já fez o máximo de verificações de hoje. Continue amanhã.',
  settings_enabled_invalid: 'Escolha se a reverificação fica ligada ou desligada.',
  settings_days_invalid: 'Escolha um intervalo de 7 a 90 dias.',
  role_not_allowed: 'Seu papel nesta organização permite ver os backlinks, mas não alterar.',
  organization_membership_required: 'Você não faz parte da organização deste projeto.',
  project_not_found: 'Projeto não encontrado.',
  alert_id_invalid: 'Aviso não encontrado.',
  alert_id_required: 'Aviso não encontrado.',
};
export function backlinkErrorMessage(e: unknown): string {
  if (!(e instanceof BacklinkError)) return 'Não foi possível concluir agora. Tente de novo.';
  return MESSAGES[e.code] || 'Não foi possível concluir agora. Tente de novo.';
}

export async function callBacklinks<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('backlinks', { body: { action, ...body } });
  if (error) {
    let payload: { error?: string; detail?: string } | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new BacklinkError(payload?.error || 'request_failed', payload?.detail);
  }
  return data as T;
}
