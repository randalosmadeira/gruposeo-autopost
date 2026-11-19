/** Cliente da Velocidade e Core Web Vitals (F1): chama a função de borda `site-speed` e traduz os erros para português. */
import { supabase } from '@/integrations/supabase/client';
import type { SpeedRunRow, Strategy } from '../../supabase/functions/_shared/speed-core';
import type { Devices, Frequency } from '../../supabase/functions/_shared/monitor-labels';

export interface SpeedSchedule {
  enabled: boolean; frequency: Frequency; devices: Devices; extra_urls: string[]; include_competitors: boolean; alert_drop_points: number;
  next_run_at: string; last_run_at: string | null; consecutive_failures: number;
}
export interface AlertRow { id: string; source: 'speed' | 'backlinks'; kind: string; title: string; detail: Record<string, unknown>; ref_url: string | null; created_at: string }
export interface SpeedHistory {
  project: { id: string; name: string; domain: string | null };
  can_run: boolean;
  runs: SpeedRunRow[];
  competitors: string[];
  schedule: SpeedSchedule | null;
  alerts: AlertRow[];
}
export interface SpeedRunResult {
  run: SpeedRunRow;
  previous: SpeedRunRow | null;
  delta: Partial<Record<'score' | 'lcp' | 'cls' | 'tbt' | 'fcp' | 'ttfb' | 'speedIndex', number>> | null;
  field_note: 'no_field_data' | 'crux_unavailable' | null;
  lab_fetched_at: string | null;
}

export class SpeedError extends Error {
  constructor(public code: string, public detail?: string) { super(code); }
}
const MESSAGES: Record<string, string> = {
  speed_not_configured: 'A medição de velocidade ainda não foi ativada na plataforma. Avise o gestor.',
  daily_limit: 'Este projeto já fez o máximo de medições de hoje. Tente amanhã.',
  competitor_limit: 'Este projeto já acompanha 10 concorrentes. Remova um antes de adicionar outro (as medições antigas continuam no histórico).',
  google_quota: 'O Google limitou as medições por um instante. Tente de novo em alguns minutos.',
  google_timeout: 'O Google demorou demais para medir esta página. Tente de novo.',
  google_error: 'O Google não conseguiu medir agora. Tente de novo em instantes.',
  google_no_report: 'O Google respondeu, mas sem o relatório de velocidade. Tente de novo.',
  url_not_measurable: 'O Google não conseguiu abrir esta página (ela pode estar bloqueando robôs, fora do ar ou exigir login).',
  url_invalid: 'Esse endereço não parece uma página pública. Use algo como https://meusite.com.br/pagina.',
  url_required: 'Informe o endereço da página.',
  url_outside_project_domain: 'Esse endereço é de outro site. Para comparar com um concorrente, use a seção "Comparar com concorrentes".',
  project_domain_required: 'Este projeto ainda não tem um site cadastrado.',
  role_not_allowed: 'Seu papel nesta organização permite ver as medições, mas não fazer novas.',
  organization_membership_required: 'Você não faz parte da organização deste projeto.',
  project_not_found: 'Projeto não encontrado.',
  schedule_enabled_invalid: 'Escolha se o acompanhamento fica ligado ou desligado.',
  schedule_frequency_invalid: 'Escolha a frequência: todo dia, toda semana ou todo mês.',
  schedule_devices_invalid: 'Escolha o aparelho: celular, computador ou os dois.',
  schedule_threshold_invalid: 'O alerta de queda precisa ser um número inteiro de 3 a 50 pontos.',
  schedule_urls_invalid: 'Uma das páginas extras não parece um endereço público. Use algo como https://meusite.com.br/contato.',
  schedule_url_outside_project_domain: 'As páginas extras precisam ser do mesmo site do projeto. Para outros sites, use "Comparar com concorrentes".',
  schedule_too_many_urls: 'Dá para acompanhar no máximo 2 páginas além da página inicial.',
  alert_id_invalid: 'Aviso não encontrado.',
  alert_id_required: 'Aviso não encontrado.',
};
export function speedErrorMessage(e: unknown): string {
  if (!(e instanceof SpeedError)) return 'Não foi possível medir agora. Tente de novo.';
  return MESSAGES[e.code] || 'Não foi possível medir agora. Tente de novo.';
}

export async function callSpeed<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('site-speed', { body: { action, ...body } });
  if (error) {
    let payload: { error?: string; detail?: string } | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new SpeedError(payload?.error || 'request_failed', payload?.detail);
  }
  return data as T;
}
export const STRATEGY_LABEL: Record<Strategy, string> = { mobile: 'Celular', desktop: 'Computador' };
