/**
 * Cliente da captação de leads (função `lead-capture`). As ações públicas não exigem login; `claim`, `list` e `update` usam a sessão.
 * O token de passagem ao cadastro fica no armazenamento local só até ser usado (24 h no máximo, e o servidor também confere a validade).
 */
import { supabase } from '@/integrations/supabase/client';

export const LEAD_CONSENT_VERSION = 'leads-v1';
export const SEGMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'advocacia', label: 'Advocacia' }, { value: 'saude', label: 'Saúde' }, { value: 'imobiliario', label: 'Imobiliário' },
  { value: 'comercio', label: 'Comércio' }, { value: 'servicos', label: 'Serviços' }, { value: 'educacao', label: 'Educação' },
  { value: 'tecnologia', label: 'Tecnologia' }, { value: 'agencia', label: 'Agência de marketing' }, { value: 'outro', label: 'Outro' },
];

export class LeadError extends Error {
  constructor(public code: string, public fields: Record<string, string> = {}) { super(code); }
}

const MESSAGES: Record<string, string> = {
  rate_limited: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.',
  temporarily_unavailable: 'O cadastro está temporariamente indisponível. Tente de novo mais tarde.',
  challenge_invalid: 'A página ficou aberta por muito tempo ou foi recarregada. Reenvie o formulário.',
  expired: 'A página ficou aberta por muito tempo. Reenvie o formulário.',
  too_fast: 'Só um instante: reenvie o formulário.',
  origin_not_allowed: 'Este formulário só funciona pelo endereço oficial do sistema.',
  manager_only: 'Só a gestão da plataforma vê os leads.',
  authorization_required: 'Entre na sua conta para continuar.',
  lead_not_found: 'Lead não encontrado.',
  password_invalid: 'A senha precisa ter de 6 a 72 caracteres.',
  email_required: 'Este cadastro não tem e-mail. Volte ao formulário e informe o e-mail.',
  account_exists: 'Este e-mail já tem conta. Entre com a sua senha.',
  email_mismatch: 'Este cadastro pertence a outro e-mail.',
  invalid: 'Confira os campos destacados.',
  plan_not_releasable: 'Esse plano não pode ser usado na liberação.',
  not_a_trial_space: 'Este espaço já não está em teste (talvez já tenha sido liberado).',
  space_not_found: 'Espaço não encontrado.',
  plan_invalid: 'Escolha um plano.',
  organization_invalid: 'Espaço inválido.',
};
export const leadErrorMessage = (e: unknown): string => (e instanceof LeadError ? MESSAGES[e.code] || 'Não foi possível concluir agora. Tente de novo.' : 'Não foi possível concluir agora. Tente de novo.');

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('lead-capture', { body: { action, ...body } });
  if (error) {
    let payload: { error?: string; fields?: Record<string, string> } | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new LeadError(payload?.error || 'request_failed', payload?.fields || {});
  }
  return data as T;
}

export interface LeadFormPayload {
  name: string; email: string; phone: string; segment: string; site: string; message: string;
  consent: boolean; website: string; challenge: string; utm: Record<string, string>; ref: string;
}
export const leadChallenge = () => call<{ challenge: string; consent_version: string }>('challenge');
export const leadSubmit = (p: LeadFormPayload) => call<{ ok: boolean; redirect: string }>('submit', { ...p, consentVersion: LEAD_CONSENT_VERSION });
export const leadPeek = (token: string) => call<{ valid: boolean; name?: string; email?: string | null }>('peek', { token });
export type SpaceResult = 'created' | 'existing' | 'unavailable';
/** Fase de teste: cria a conta (já confirmada, sem e-mail) a partir do lead + senha. O e-mail vem do lead, guardado no servidor. */
export const leadActivate = (token: string, password: string) => call<{ activated: boolean; email: string; space?: SpaceResult }>('activate', { token, password });
export const leadClaim = (token: string) => call<{ claimed: boolean; space?: SpaceResult }>('claim', { token });

export type LeadStatus = 'new' | 'contacted' | 'signed_up' | 'discarded';
export interface LeadSpace { organization_id: string; plan_id: string; status: string }
export interface LeadRow { space?: LeadSpace | null; id: string; created_at: string; name: string; email: string | null; phone: string | null; segment: string | null; message: string | null; site_url: string | null; source: Record<string, unknown>; status: LeadStatus; notes: string | null; consent_at: string; claimed_at: string | null }
export const leadsList = (p: { status?: LeadStatus | ''; limit?: number; offset?: number } = {}) => call<{ leads: LeadRow[]; counts: Record<LeadStatus, number> }>('list', { ...(p.status ? { status: p.status } : {}), limit: p.limit ?? 50, offset: p.offset ?? 0 });
export const leadRelease = (p: { organization_id: string; plan: string }) => call<{ released: boolean; organization_id: string; plan_id: string }>('release', p);
export const leadUpdate = (p: { id: string; status?: LeadStatus; notes?: string | null }) => call<{ id: string }>('update', p);

// ------------------------------------------------------------------------------------------------------------ token de passagem (local, 24 h)
const KEY = 'zica:lead-handoff:v1';
const TTL_MS = 24 * 3_600_000;
export const HANDOFF_EVENT = 'zica:lead-handoff-stored';
export const isHandoffToken = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{32}$/.test(v);
export function storeHandoff(token: string, now = Date.now()): void {
  try {
    if (!isHandoffToken(token)) return;
    localStorage.setItem(KEY, JSON.stringify({ token, at: now }));
    // quem já está logado não troca de usuário: avisa o vínculo para tentar agora
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(HANDOFF_EVENT));
  } catch { /* sem armazenamento: o cadastro continua, só não liga ao lead */ }
}
export function readHandoff(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { token?: unknown; at?: unknown };
    if (!isHandoffToken(v.token) || typeof v.at !== 'number' || now - v.at > TTL_MS) { localStorage.removeItem(KEY); return null; }
    return v.token;
  } catch { return null; }
}
export function clearHandoff(): void { try { localStorage.removeItem(KEY); } catch { /* nada a limpar */ } }
