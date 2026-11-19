/** Cliente do funil de captação (M1): chama a função de borda `funnel` e traduz os erros para português. */
import { supabase } from '@/integrations/supabase/client';
import type { FunnelConfig, FunnelEntries } from '../../supabase/functions/_shared/funnel-core';

export interface FunnelPayload {
  project: { id: string; name: string };
  role: string;
  can_write: boolean;
  segment: string | null;
  council: string | null;
  configured: boolean;
  version: number;
  config: FunnelConfig | null;
  suggested: { template: string; config: FunnelConfig };
  current_month: string;
  months: string[];
  entries: FunnelEntries;
}

export class FunnelError extends Error {
  constructor(public code: string, public reason?: string, public where?: string) { super(code); }
}

const REASONS: Record<string, string> = {
  month_invalid: 'Mês inválido.',
  value_invalid: 'Use só números, sem texto e sem valores negativos.',
  count_must_be_integer: 'Contagens precisam ser números inteiros (sem vírgula).',
  metric_unknown: 'Esse indicador não existe mais neste funil. Recarregue a página.',
  values_invalid: 'Não consegui ler os números enviados.',
  counts_invalid: 'O funil precisa de 2 a 10 colunas.',
  stage_invalid: 'Há uma etapa com nome ou descrição fora do limite (2 a 80 letras; descrição até 280).',
  indicator_reference_invalid: 'Um indicador aponta para um número que não existe ou não é uma contagem.',
  metric_key_duplicated: 'Há dois indicadores com o mesmo código.',
};
const MESSAGES: Record<string, string> = {
  funnel_changed_reload: 'O funil mudou em outra tela. Recarregue a página; o que você digitou continua aqui.',
  funnel_not_configured: 'Este projeto ainda não tem funil. Escolha um modelo primeiro.',
  month_in_future: 'Não dá para lançar números de um mês que ainda não começou.',
  role_not_allowed: 'Seu papel nesta organização permite ver o funil, mas não alterar.',
  organization_membership_required: 'Você não faz parte da organização deste projeto.',
  project_not_found: 'Projeto não encontrado.',
};
export function funnelErrorMessage(e: unknown): string {
  if (!(e instanceof FunnelError)) return 'Não foi possível concluir agora. O que você digitou continua na tela.';
  if (e.code === 'month_values_invalid' || e.code === 'config_invalid') {
    const why = (e.reason && REASONS[e.reason]) || 'Confira os campos.';
    return e.where ? `${why} (campo: ${e.where})` : why;
  }
  return MESSAGES[e.code] || 'Não foi possível concluir agora. O que você digitou continua na tela.';
}

export async function callFunnel<T = FunnelPayload>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('funnel', { body: { action, ...body } });
  if (error) {
    let payload: { error?: string; reason?: string; where?: string } | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new FunnelError(payload?.error || 'request_failed', payload?.reason, payload?.where);
  }
  return data as T;
}
