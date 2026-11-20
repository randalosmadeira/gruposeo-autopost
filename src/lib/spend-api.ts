/** Cliente do Teto Diário de Gasto: chama a função de borda `spend-policy` e traduz os erros para português. Valores em micros de dólar. */
import { supabase } from '@/integrations/supabase/client';

export type SpendState = 'livre' | 'aviso' | 'teto_atingido' | 'adicional_liberado' | 'esgotado';

export interface SpendEstimateItem { n: number; avg_usd_micros: number; fits: number }
export interface SpendStatus {
  organization_id: string;
  role: string;
  can_unlock: boolean;
  can_edit_policy: boolean;
  /** a constante PAID_SERVICES_BLOCKED do servidor: true = bloqueio total ainda vale */
  paid_blocked: boolean;
  /** o servidor informa que o teto diário é quem decide (constante virada) */
  cap_active: boolean;
  day: string;
  timezone: string;
  spent_usd_micros: number;
  reserved_usd_micros: number;
  estimated_usd_micros: number;
  used_usd_micros: number;
  cap_usd_micros: number;
  extra_usd_micros: number;
  absolute_usd_micros: number;
  extra_unlocked: boolean;
  remaining_to_cap_usd_micros: number;
  remaining_absolute_usd_micros: number;
  state: SpendState;
  alert_pct: number;
  enabled: boolean;
  fx_brl_per_usd: number | null;
  brl: { fx_brl_per_usd: number; spent: number; cap: number; absolute: number } | null;
  top_projects: Array<{ project_id: string; name: string | null; usd_micros: number }>;
  top_modules: Array<{ module: string; usd_micros: number }>;
  top_providers: Array<{ provider: string; usd_micros: number }>;
  estimate: { room_usd_micros: number; basis: string; calls?: SpendEstimateItem | null; articles?: SpendEstimateItem | null; landing_pages?: SpendEstimateItem | null; summary: { calls: string; articles: string; landing_pages: string } };
  unverified_prices: number;
}

export interface SpendHistoryDay {
  day: string;
  total_usd_micros: number;
  estimated_usd_micros: number;
  by_provider: Record<string, number>;
  by_module: Record<string, number>;
  by_project: Record<string, number>;
}
export interface SpendHistory { organization_id: string; days: SpendHistoryDay[]; project_names: Record<string, string>; timezone: string; window_days: number }

export class SpendError extends Error {
  constructor(public code: string) { super(code); }
}

const MESSAGES: Record<string, string> = {
  role_not_allowed: 'Só o dono ou um administrador da organização pode liberar o crédito adicional.',
  organization_membership_required: 'Você não faz parte desta organização.',
  organization_required: 'Escolha a organização para ver o gasto.',
  spend_status_unavailable: 'Não consegui ler o gasto de hoje agora. Por segurança, as chamadas pagas ficam negadas até a leitura voltar.',
  spend_history_unavailable: 'Não consegui carregar o histórico de gasto agora.',
  spend_unlock_failed: 'Não consegui liberar o crédito adicional agora. Tente de novo.',
};
export const spendErrorMessage = (e: unknown) => (e instanceof SpendError ? MESSAGES[e.code] : undefined) || 'Não foi possível concluir agora. Tente de novo em instantes.';

export async function callSpend<T = SpendStatus>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('spend-policy', { body: { action, ...body } });
  if (error) {
    let payload: { error?: string } | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new SpendError(payload?.error || 'request_failed');
  }
  return data as T;
}

export const usdOf = (micros: number) => micros / 1_000_000;
/** "US$ 3,20" (duas casas; 4 casas só para valores abaixo de 1 centavo). Sem Intl para o texto não variar entre máquinas. */
export function fmtUsd(micros: number): string {
  const digits = micros > 0 && micros < 10_000 ? 4 : 2;
  return `US$ ${usdOf(micros).toFixed(digits).replace('.', ',')}`;
}
/** "7,00" sem o prefixo, para a frase "US$ 3,20 de 7,00". */
export const fmtUsdBare = (micros: number) => usdOf(micros).toFixed(2).replace('.', ',');
export const fmtBrl = (reais: number) => `R$ ${reais.toFixed(2).replace('.', ',')}`;
