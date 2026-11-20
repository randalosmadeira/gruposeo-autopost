/** Cliente do Piloto Automático de Otimização: chama a função de borda `auto-optimize` e traduz os erros para português. */
import { supabase } from '@/integrations/supabase/client';

export type RuleLevel = 'exigir' | 'recomendar' | 'desligado';
export interface RuleRow { id: string; label: string; level: RuleLevel; value: number | null; max: number | null; source: 'padrao_editavel' | 'projeto' | 'artigo' | 'prompt' }
export interface AppliedItem { id: string; kind: 'deterministico' | 'ia'; label: string; detail?: string; count?: number; costMicros?: number }
export interface PendingItem { id: string; label: string; reason: string; kind: 'humano' | 'teto' | 'rejeitado' | 'limite' | 'conformidade' | 'plugin' }
export interface StepLog { id: string; kind: 'deterministico' | 'ia'; status: 'aplicado' | 'rejeitado' | 'teto' | 'pulado' | 'erro'; detail?: string; costMicros: number }
export interface Stopped { reason: 'teto' | 'erro' | 'limite'; message: string }

export interface PilotJob {
  v: 1;
  working: { title: string; content: string; excerpt: string };
  originalHash: string;
  applied: AppliedItem[]; pending: PendingItem[]; steps: StepLog[]; attempted: string[]; touchedUnits: string[];
  aiUsed: number; costMicros: number; deterministicDone: boolean; stopped: Stopped | null; done: boolean;
  compliance: Array<{ code: string; label: string; sample?: string }>;
  schema: unknown;
}
export interface Progress { done: boolean; ai_used: number; ai_max: number; cost_usd_micros: number; next: string[]; stopped: Stopped | null; step_max_tokens: number }
export interface PilotReport {
  article_id: string; unchanged: boolean; partial: boolean;
  language: { tag: string; source: string; formula: string | null };
  before: { score: number; failing: string[] }; after: { score: number; failing: string[] };
  applied: AppliedItem[]; pending: PendingItem[]; steps: StepLog[]; cost_usd_micros: number; cost_is_estimate: true; stopped: Stopped | null;
  compliance: { pack: string | null; mode: string; warnings: Array<{ code: string; label: string }> };
  generated_at: string;
}
export interface AutoOptimizeState {
  article: { id: string; project_id: string | null; status: string | null; hash: string };
  role: string; can_write: boolean; can_admin: boolean;
  auto: boolean; apply_without_review: boolean; plugin_gate: 'avisar' | 'exigir';
  rules: RuleRow[]; rules_layers: string[];
  language: { tag: string; source: string; formula: { id: string; label: string; status: string } | null };
  last_run: { at: string; trigger: string; cost_usd_micros: number; score_before: number; score_after: number; partial: boolean } | null;
  last_report: PilotReport | null;
  proposal: { status: 'pending_review' | 'applied' | 'discarded'; at: string | null; stale: boolean } | null;
  spend: { cap_usd_micros: number; used_usd_micros: number; pct: number | null; state: string | null; remaining_usd_micros: number } | null;
  pilot_today_usd_micros: number; pilot_cost_is_estimate: true;
}

export class AutoOptimizeError extends Error {
  constructor(public code: string, public detail?: Record<string, unknown>) { super(code); }
}

const MESSAGES: Record<string, string> = {
  organization_membership_required: 'Você não faz parte da organização deste artigo.',
  role_not_allowed: 'Seu papel nesta organização permite ver, mas não fazer isso.',
  article_not_found: 'Artigo não encontrado.',
  article_changed_reload: 'O artigo foi editado enquanto o piloto trabalhava. Recarregue e rode de novo.',
  article_changed_since_proposal: 'O artigo foi editado depois da análise do piloto. Rode o piloto de novo.',
  no_pending_proposal: 'Não há rascunho do piloto esperando revisão.',
  content_too_large: 'Este artigo é grande demais para o piloto.',
  ai_unavailable: 'A IA não está disponível agora (chave ou provedor). As correções que não usam IA continuam funcionando.',
  daily_cap_reached: 'O teto diário de gasto com IA foi atingido. O piloto parou e nada foi gasto além do teto.',
  spend_paused: 'As operações pagas desta organização estão pausadas.',
  spend_status_unavailable: 'Não consegui confirmar o gasto de hoje. Por segurança, nenhuma chamada paga foi feita.',
  auto_optimize_failed: 'Não foi possível concluir agora. Tente de novo em instantes.',
};
export const autoOptimizeMessage = (e: unknown): string => (e instanceof AutoOptimizeError ? (MESSAGES[e.code] || MESSAGES.auto_optimize_failed) : MESSAGES.auto_optimize_failed);

export async function callAutoOptimize<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('auto-optimize', { body: { action, ...body } });
  if (error) {
    let payload: { error?: string; code?: string } | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new AutoOptimizeError(payload?.code || payload?.error || 'request_failed');
  }
  return data as T;
}

export const fmtUsd = (micros: number) => `US$ ${(micros / 1_000_000).toFixed(micros > 0 && micros < 10_000 ? 4 : 2).replace('.', ',')}`;

export const SOURCE_LABEL: Record<RuleRow['source'], string> = { padrao_editavel: 'padrão editável', projeto: 'definido no projeto', artigo: 'definido no artigo', prompt: 'definido no prompt do agente' };
export const STEP_STATUS_LABEL: Record<StepLog['status'], string> = { aplicado: 'aplicado', rejeitado: 'recusado pela guarda', teto: 'parou no teto de gasto', pulado: 'nada a fazer', erro: 'falhou' };
export const PENDING_KIND_LABEL: Record<PendingItem['kind'], string> = { humano: 'precisa de uma pessoa', teto: 'parou no teto diário', rejeitado: 'revisão humana', limite: 'fica para outra rodada', conformidade: 'revisar conformidade', plugin: 'plugin do WordPress' };
