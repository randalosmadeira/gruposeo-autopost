/**
 * Porteira da IA paga da PLATAFORMA (sem dependências externas: testável fora do Deno).
 * Regra: a chave do próprio usuário (BYOK) sempre vale. A chave da plataforma (Vault ou variável de ambiente) só vale para quem a
 * função do banco `platform_ai_allowed` autoriza (gestor ou membro de organização viva com plano que não é de teste).
 * Falha FECHADA: se o banco não responder, a chave da plataforma não é usada (gasto indevido é pior que indisponibilidade breve).
 */
export interface ProviderKeys { gemini: string; openai: string; anthropic: string; serper: string }

export const PLATFORM_AI_BLOCKED_MESSAGE = 'Seu espaço de teste não inclui a IA da plataforma. Peça a liberação à gestão ou cadastre a sua própria chave.';

/** Pergunta ao banco. Qualquer erro, exceção ou resposta diferente de `true` conta como NÃO. */
export async function isPlatformAiAllowed(admin: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }, userId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('platform_ai_allowed', { p_user: userId });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Junta as chaves do usuário com as da plataforma, respeitando a porteira. */
export function mergeProviderKeys(input: { user: Partial<ProviderKeys>; platformAllowed: boolean; vault: { openai: string; anthropic: string }; env: ProviderKeys }): ProviderKeys & { platformAi: boolean } {
  const t = (v: unknown) => String(v ?? '').trim();
  const u = { gemini: t(input.user.gemini), openai: t(input.user.openai), anthropic: t(input.user.anthropic), serper: t(input.user.serper) };
  const ok = input.platformAllowed === true;
  return {
    gemini: u.gemini || (ok ? t(input.env.gemini) : ''),
    openai: u.openai || (ok ? t(input.vault.openai) || t(input.env.openai) : ''),
    anthropic: u.anthropic || (ok ? t(input.vault.anthropic) || t(input.env.anthropic) : ''),
    serper: u.serper || (ok ? t(input.env.serper) : ''),
    platformAi: ok,
  };
}
