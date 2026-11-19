/**
 * Núcleo da captação de leads (atalho público -> cadastro). Código puro: sem rede, sem banco, com o relógio e a criptografia injetados.
 *
 * Princípios:
 *  - Coleta o MÍNIMO (nome + um contato) com consentimento explícito e versionado (LGPD); nada de cookies nem rastreio.
 *  - Antirrobô sem terceiros: campo-isca vazio, desafio assinado (HMAC) com tempo mínimo e máximo, limite por impressão digital do visitante
 *    e disjuntor global. O IP NUNCA é guardado: só um hash que muda a cada dia.
 *  - A resposta não revela se o contato já existia (sem enumeração).
 *  - O token de passagem ao cadastro é aleatório, de uso único, expira, e só o hash dele fica no banco.
 */

export const LEAD_CONSENT_VERSION = 'leads-v1';
export const CHALLENGE_MIN_AGE_MS = 3_000;
export const CHALLENGE_MAX_AGE_MS = 2 * 3_600_000;
export const HANDOFF_TTL_MS = 24 * 3_600_000;
export const LIMITS = { perHour: 6, perDay: 15, globalOkPerDay: 400, peekPerHour: 40 } as const;
export const SEGMENTS = ['advocacia', 'saude', 'imobiliario', 'comercio', 'servicos', 'educacao', 'tecnologia', 'agencia', 'outro'] as const;

export interface Crypto2 { subtle: SubtleCrypto; getRandomValues: (a: Uint8Array) => Uint8Array }

// ------------------------------------------------------------------------------------------------------------ bytes e hashes
const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function sha256Hex(c: Crypto2, text: string): Promise<string> {
  return toHex(await c.subtle.digest('SHA-256', enc.encode(text)));
}
async function hmacKey(c: Crypto2, secret: string) {
  return c.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
export async function hmacHex(c: Crypto2, secret: string, data: string): Promise<string> {
  return toHex(await c.subtle.sign('HMAC', await hmacKey(c, secret), enc.encode(data)));
}
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** Impressão digital do visitante: hash do IP com sal diário. O IP em si nunca é guardado nem registrado. */
export async function visitorHash(c: Crypto2, secret: string, ip: string, nowMs: number): Promise<string> {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return hmacHex(c, secret, `ip|${ip || 'unknown'}|${day}`);
}

// ------------------------------------------------------------------------------------------------------------ desafio assinado
export async function makeChallenge(c: Crypto2, secret: string, nowMs: number): Promise<string> {
  const nonce = b64url(c.getRandomValues(new Uint8Array(9)));
  const payload = `${nowMs}.${nonce}`;
  return `${payload}.${await hmacHex(c, secret, `challenge|${payload}`)}`;
}
export type ChallengeResult = 'ok' | 'invalid' | 'too_fast' | 'expired';
export async function checkChallenge(c: Crypto2, secret: string, token: unknown, nowMs: number): Promise<ChallengeResult> {
  if (typeof token !== 'string' || token.length > 200) return 'invalid';
  const parts = token.split('.');
  if (parts.length !== 3) return 'invalid';
  const [issued, nonce, sig] = parts;
  if (!/^\d{10,16}$/.test(issued) || !/^[A-Za-z0-9_-]{6,20}$/.test(nonce)) return 'invalid';
  const expected = await hmacHex(c, secret, `challenge|${issued}.${nonce}`);
  if (!safeEqual(expected, sig)) return 'invalid';
  const age = nowMs - Number(issued);
  if (age < CHALLENGE_MIN_AGE_MS) return 'too_fast';
  if (age > CHALLENGE_MAX_AGE_MS) return 'expired';
  return 'ok';
}

// ------------------------------------------------------------------------------------------------------------ token de passagem ao cadastro
export async function newHandoff(c: Crypto2): Promise<{ token: string; hash: string }> {
  const token = b64url(c.getRandomValues(new Uint8Array(24)));
  return { token, hash: await sha256Hex(c, `handoff|${token}`) };
}
export const handoffHash = (c: Crypto2, token: string) => sha256Hex(c, `handoff|${token}`);
export const isHandoffShape = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{32}$/.test(v);

// ------------------------------------------------------------------------------------------------------------ validação
export interface LeadInput { name: string; email: string | null; emailNorm: string | null; phone: string | null; segment: string | null; message: string | null; siteUrl: string | null; source: Record<string, unknown> }
export type Validation = { ok: true; value: LeadInput } | { ok: false; fields: Record<string, string> };

// Troca caracteres de controle (inclui tabulação e quebra de linha) por espaço; o aviso do lint é intencional aqui.
// eslint-disable-next-line no-control-regex
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

export function normalizePhone(v: unknown): string | null {
  const digits = String(v ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const national = digits.startsWith('55') && digits.length >= 12 ? digits : digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^\d{10,15}$/.test(national) ? national : null;
}

function normalizeSite(v: unknown): string | null | 'invalid' {
  const raw = clean(v, 200);
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || u.username || u.password) return 'invalid';
    return `${u.protocol}//${u.hostname.toLowerCase()}`.slice(0, 200);
  } catch { return 'invalid'; }
}

export function validateLead(body: Record<string, unknown>): Validation {
  const fields: Record<string, string> = {};
  const name = clean(body.name, 100);
  if (name.length < 2) fields.name = 'Informe seu nome.';
  else if (/https?:\/\/|www\.|[<>]/i.test(name)) fields.name = 'Informe só o seu nome.';

  const emailRaw = clean(body.email, 180).toLowerCase();
  const email = emailRaw && EMAIL.test(emailRaw) ? emailRaw : null;
  if (emailRaw && !email) fields.email = 'Esse e-mail não parece válido.';
  const phoneRaw = String(body.phone ?? '').trim();
  const phone = normalizePhone(phoneRaw);
  if (phoneRaw && !phone) fields.phone = 'Esse telefone não parece válido (com DDD).';
  if (!email && !phone && !fields.email && !fields.phone) fields.contact = 'Informe um e-mail ou um WhatsApp para a gente falar com você.';

  const segmentRaw = clean(body.segment, 60);
  const segment = segmentRaw ? (SEGMENTS as readonly string[]).includes(segmentRaw) ? segmentRaw : segmentRaw.toLowerCase().replace(/[^\p{L}\p{N} .,&/-]/gu, '').slice(0, 60) || null : null;
  const message = clean(body.message, 500) || null;
  if (message && /https?:\/\/\S+.*https?:\/\/\S+/i.test(message)) fields.message = 'Escreva sem links, por favor.';
  const site = normalizeSite(body.site);
  if (site === 'invalid') fields.site = 'Esse endereço de site não parece válido.';
  if (body.consent !== true) fields.consent = 'Para continuar, é preciso concordar com o uso dos seus dados.';
  if (body.consentVersion !== LEAD_CONSENT_VERSION) fields.consent = 'O aviso de privacidade foi atualizado. Recarregue a página e confirme de novo.';

  if (Object.keys(fields).length) return { ok: false, fields };
  const utm = asRec(body.utm);
  const source: Record<string, unknown> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) { const v = clean(utm[k], 80); if (v) source[k] = v; }
  const ref = clean(body.ref, 200);
  if (ref) source.ref = ref;
  return { ok: true, value: { name, email: email, emailNorm: email, phone, segment, message, siteUrl: site as string | null, source } };
}
const asRec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

// ------------------------------------------------------------------------------------------------------------ limites
export interface AttemptCounts { hour: number; day: number; globalOkDay: number }
export type RateDecision = 'allow' | 'rate_limited' | 'unavailable';
export function rateDecision(c: AttemptCounts): RateDecision {
  if (c.globalOkDay >= LIMITS.globalOkPerDay) return 'unavailable';
  if (c.hour >= LIMITS.perHour || c.day >= LIMITS.perDay) return 'rate_limited';
  return 'allow';
}

// ------------------------------------------------------------------------------------------------------------ origem permitida
export const ALLOWED_ORIGINS = ['https://app.zica.posts.zicajuris.com.br'];
export const isAllowedOrigin = (origin: string | null | undefined) => !!origin && ALLOWED_ORIGINS.includes(origin);

/** Destino do redirecionamento depois do envio. Caminho relativo e fixo: nada vindo do visitante entra aqui, só o token. */
export const signupRedirect = (token: string) => `/auth?view=signup&lead=${encodeURIComponent(token)}`;
