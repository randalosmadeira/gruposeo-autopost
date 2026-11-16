/**
 * Cliente do Perfil do Projeto: chama a função de borda `nexus-business` (única que grava) e traduz os erros.
 * Rascunho local: guarda o que foi digitado e ainda não foi salvo, para não perder nada se a página fechar ou a gravação falhar.
 */
import { supabase } from '@/integrations/supabase/client';
import type { FieldValue } from '../../supabase/functions/_shared/profile-registry';

export interface ProfilePayload {
  project: { id: string; name: string; domain: string | null; organization_id: string };
  role: string;
  can_write: boolean;
  can_private: boolean;
  can_modules: boolean;
  strategy: { data: Record<string, string>; version: number; status: string };
  legacy_strategy: Record<string, string>;
  extended: { version: number; sections: Record<string, Record<string, unknown>>; status: string; completeness: number; updated_at: string | null; confirmed_at: string | null };
  private: { version: number; finance: Record<string, unknown>; goals: Record<string, unknown> } | null;
  snapshots: Array<{ version: number; created_at: string; reason: string | null }>;
  modules: {
    catalog: Array<{ code: string; name: string; description: string | null; route: string | null; core: boolean; default_enabled: boolean; sort: number }>;
    decisions: Array<{ module_code: string; enabled: boolean; reason: string | null; recommendation: string | null; recommendation_reason: string | null; decided_at: string | null }>;
  };
}

export class ProfileError extends Error {
  constructor(public code: string, public fields: Record<string, string> = {}, public stores: string[] = []) {
    super(code);
  }
}

const MESSAGES: Record<string, string> = {
  profile_changed_reload: 'O perfil mudou em outra tela. Recarregue; o que você digitou continua guardado neste navegador.',
  validation_failed: 'Alguns campos precisam de ajuste. Confira os avisos em vermelho.',
  role_not_allowed: 'Seu papel nesta organização não permite esta ação.',
  organization_membership_required: 'Você não faz parte da organização deste projeto.',
  project_not_found: 'Projeto não encontrado.',
  core_module_cannot_be_disabled: 'Módulos nucleares não podem ser desligados.',
};
export const profileErrorMessage = (e: unknown): string =>
  e instanceof ProfileError ? MESSAGES[e.code] || 'Não foi possível concluir. O que você digitou continua nesta tela.' : 'Não foi possível concluir. O que você digitou continua nesta tela.';

export async function callProfile<T = ProfilePayload>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('nexus-business', { body: { action, ...body } });
  if (error) {
    let payload: { error?: string; fields?: Record<string, string>; stores?: string[] } | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new ProfileError(payload?.error || 'request_failed', payload?.fields || {}, payload?.stores || []);
  }
  return data as T;
}

// ------------------------------------------------------------------------------------------------------------ conversa com a Zica (agente)
export interface AgentMessage { id?: string; role: 'user' | 'agent' | 'system'; content: string; created_at?: string }
export interface AgentFact { fact_id: string | null; key: string; label: string; value: unknown; quote?: string; private?: boolean; confidence?: number }
export interface AgentHistory { conversation_id: string | null; messages: AgentMessage[]; facts: AgentFact[]; turns_left: number }
export interface AgentTurn { conversation_id: string; reply: string; items: AgentFact[]; rejected: Array<{ key: string; reason: string }>; turns_left: number }

const AGENT_MESSAGES: Record<string, string> = {
  budget_paused: 'A conversa com a Zica está desligada: a execução paga está pausada para esta organização. Peça ao gestor para ativar em Motores.',
  provider_not_enabled: 'A conversa com a Zica ainda não foi liberada para esta organização (provedor de IA não habilitado em Motores).',
  pricing_not_configured: 'O custo da conversa com a Zica ainda não foi configurado. Fale com o gestor.',
  budget_exceeded: 'O orçamento mensal de IA desta organização acabou. A conversa volta quando o gestor liberar mais.',
  organization_credential_required: 'Falta a chave do provedor de IA desta organização. Fale com o gestor.',
  turn_limit_reached: 'Esta conversa chegou ao limite de mensagens. Apague-a e comece outra, ou continue preenchendo as etapas.',
  daily_limit_reached: 'Este projeto atingiu o limite diário de mensagens com a Zica. Tente amanhã.',
  agent_turn_failed: 'A Zica não conseguiu responder agora. O que você escreveu continua na caixa; tente de novo.',
  role_not_allowed: 'Seu papel nesta organização não permite conversar com a Zica.',
};
export const agentErrorMessage = (e: unknown): string =>
  e instanceof ProfileError ? AGENT_MESSAGES[e.code] || profileErrorMessage(e) : 'Não foi possível concluir. Tente de novo.';

export async function callAgent<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('profile-agent', { body: { action, ...body } });
  if (error) {
    let payload: { error?: string } | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new ProfileError(payload?.error || 'request_failed');
  }
  return data as T;
}

// ------------------------------------------------------------------------------------------------------------ rascunho local
export interface DraftBase { strategy: number; extended: number; private: number }
export interface StoredDraft { values: Record<string, FieldValue | null>; base: DraftBase; savedAt: string }

const draftKey = (projectId: string) => `zica:perfil-rascunho:v1:${projectId}`;

export function loadDraft(projectId: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.values !== 'object' || parsed.values === null) return null;
    return Object.keys(parsed.values).length ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDraft(projectId: string, values: Record<string, FieldValue | null>, base: DraftBase): void {
  try {
    if (!Object.keys(values).length) localStorage.removeItem(draftKey(projectId));
    else localStorage.setItem(draftKey(projectId), JSON.stringify({ values, base, savedAt: new Date().toISOString() } satisfies StoredDraft));
  } catch {
    /* armazenamento indisponível: a tela continua funcionando sem rascunho */
  }
}

export function clearDraft(projectId: string): void {
  try { localStorage.removeItem(draftKey(projectId)); } catch { /* ignorado */ }
}
