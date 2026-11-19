import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  ALLOWED_ORIGINS, CHALLENGE_MAX_AGE_MS, CHALLENGE_MIN_AGE_MS, LEAD_CONSENT_VERSION, LIMITS, checkChallenge, handoffHash, isAllowedOrigin, isHandoffShape,
  makeChallenge, newHandoff, normalizePhone, rateDecision, sha256Hex, signupRedirect, validateLead, visitorHash, type Crypto2,
} from '../../supabase/functions/_shared/lead-capture-core';

const c: Crypto2 = { subtle: webcrypto.subtle as SubtleCrypto, getRandomValues: (a) => webcrypto.getRandomValues(a) };
const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);
const base = { name: 'Maria Souza', email: 'maria@exemplo.com.br', consent: true, consentVersion: LEAD_CONSENT_VERSION };

describe('captação: validação do formulário', () => {
  it('aceita o mínimo (nome + e-mail) e normaliza', () => {
    const r = validateLead({ ...base, email: '  Maria@Exemplo.com.br ' });
    expect(r).toMatchObject({ ok: true, value: { name: 'Maria Souza', email: 'maria@exemplo.com.br', emailNorm: 'maria@exemplo.com.br', phone: null } });
  });
  it('aceita só WhatsApp (com ou sem DDI) e guarda só dígitos com 55', () => {
    for (const phone of ['(11) 98888-7777', '11988887777', '+55 11 98888-7777', '5511988887777']) {
      const r = validateLead({ name: 'Ana', phone, consent: true, consentVersion: LEAD_CONSENT_VERSION });
      expect(r, phone).toMatchObject({ ok: true, value: { phone: '5511988887777', email: null } });
    }
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
  });
  it('exige um contato, um nome e o consentimento na versão atual', () => {
    expect((validateLead({ name: 'Ana', consent: true, consentVersion: LEAD_CONSENT_VERSION }) as { fields: Record<string, string> }).fields.contact).toBeTruthy();
    expect((validateLead({ ...base, name: 'A' }) as { fields: Record<string, string> }).fields.name).toBeTruthy();
    expect((validateLead({ ...base, consent: false }) as { fields: Record<string, string> }).fields.consent).toBeTruthy();
    expect((validateLead({ ...base, consent: 'true' }) as { fields: Record<string, string> }).fields.consent).toBeTruthy();
    expect((validateLead({ ...base, consentVersion: 'leads-v0' }) as { fields: Record<string, string> }).fields.consent).toMatch(/atualizado/);
  });
  it('recusa e-mail e telefone malformados, nome com link e mensagem com vários links', () => {
    const f = (b: Record<string, unknown>) => (validateLead({ ...base, ...b }) as { fields: Record<string, string> }).fields;
    expect(f({ email: 'sem-arroba' }).email).toBeTruthy();
    expect(f({ email: 'a@b' }).email).toBeTruthy();
    expect(f({ email: 'a b@c.com' }).email).toBeTruthy();
    expect(f({ phone: '123' }).phone).toBeTruthy();
    expect(f({ name: 'Veja https://spam.com' }).name).toBeTruthy();
    expect(f({ name: 'Maria <script>' }).name).toBeTruthy();
    expect(f({ message: 'veja http://a.com e também http://b.com' }).message).toBeTruthy();
  });
  it('limpa caracteres de controle, limita tamanhos e normaliza o site', () => {
    const r = validateLead({ ...base, name: 'Maria\u0000\nSouza', message: 'x'.repeat(900), site: 'WWW.Exemplo.com.br/blog?x=1' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('Maria Souza');
      expect(r.value.message).toHaveLength(500);
      expect(r.value.siteUrl).toBe('https://www.exemplo.com.br');
    }
    expect((validateLead({ ...base, site: 'isto não é site' }) as { fields: Record<string, string> }).fields.site).toBeTruthy();
    expect((validateLead({ ...base, site: 'https://user:pass@x.com' }) as { fields: Record<string, string> }).fields.site).toBeTruthy();
    expect((validateLead({ ...base, site: 'ftp://x.com' }) as { fields: Record<string, string> }).fields.site).toBeTruthy();
  });
  it('segmento: lista conhecida passa; texto livre é limpo e limitado', () => {
    expect(validateLead({ ...base, segment: 'advocacia' })).toMatchObject({ ok: true, value: { segment: 'advocacia' } });
    const r = validateLead({ ...base, segment: 'Clínica <b>odonto</b> & estética' });
    expect(r.ok && r.value.segment).toBe('clínica bodonto/b & estética');
    expect(validateLead({ ...base, segment: 'z'.repeat(200) }).ok && (validateLead({ ...base, segment: 'z'.repeat(200) }) as { value: { segment: string } }).value.segment.length).toBeLessThanOrEqual(60);
  });
  it('guarda só as marcas de campanha conhecidas (cada uma ≤ 80) e a página de origem', () => {
    const r = validateLead({ ...base, utm: { utm_source: 'site', utm_medium: 'botao', utm_campaign: 'c', evil: 'x', utm_term: 'y'.repeat(200) }, ref: '/contato' });
    expect(r.ok && r.value.source).toEqual({ utm_source: 'site', utm_medium: 'botao', utm_campaign: 'c', utm_term: 'y'.repeat(80), ref: '/contato' });
  });
  it('entrada absurda não derruba nada', () => {
    for (const body of [{}, { name: null }, { name: {}, email: [] }, { name: 5, email: 5, phone: {}, consent: true }, { utm: 'x', ref: {} }]) expect(() => validateLead(body as Record<string, unknown>)).not.toThrow();
  });
});

describe('captação: desafio assinado antirrobô', () => {
  it('vale entre 3 segundos e 2 horas', async () => {
    const t = await makeChallenge(c, 'segredo', T0);
    expect(await checkChallenge(c, 'segredo', t, T0 + CHALLENGE_MIN_AGE_MS - 1)).toBe('too_fast');
    expect(await checkChallenge(c, 'segredo', t, T0 + CHALLENGE_MIN_AGE_MS)).toBe('ok');
    expect(await checkChallenge(c, 'segredo', t, T0 + CHALLENGE_MAX_AGE_MS)).toBe('ok');
    expect(await checkChallenge(c, 'segredo', t, T0 + CHALLENGE_MAX_AGE_MS + 1)).toBe('expired');
  });
  it('assinatura adulterada, segredo errado e formato errado são recusados', async () => {
    const t = await makeChallenge(c, 'segredo', T0);
    const [issued, nonce, sig] = t.split('.');
    expect(await checkChallenge(c, 'outro-segredo', t, T0 + 5000)).toBe('invalid');
    expect(await checkChallenge(c, 'segredo', `${issued}.${nonce}.${sig.replace(/.$/, sig.endsWith('0') ? '1' : '0')}`, T0 + 5000)).toBe('invalid');
    expect(await checkChallenge(c, 'segredo', `${Number(issued) - 60000}.${nonce}.${sig}`, T0 + 5000)).toBe('invalid'); // data alterada
    for (const bad of [undefined, null, 5, '', 'a.b', 'a.b.c.d', 'x'.repeat(300), `${issued}.${nonce}`]) expect(await checkChallenge(c, 'segredo', bad, T0 + 5000)).toBe('invalid');
  });
  it('cada desafio é diferente', async () => {
    expect(await makeChallenge(c, 's', T0)).not.toBe(await makeChallenge(c, 's', T0));
  });
});

describe('captação: impressão do visitante, token de passagem e limites', () => {
  it('o hash do visitante não é o IP, é estável no dia e muda no dia seguinte e por IP', async () => {
    const a = await visitorHash(c, 's', '203.0.113.7', T0);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('203');
    expect(await visitorHash(c, 's', '203.0.113.7', T0 + 3_600_000)).toBe(a);
    expect(await visitorHash(c, 's', '203.0.113.7', T0 + 86_400_000)).not.toBe(a);
    expect(await visitorHash(c, 's', '203.0.113.8', T0)).not.toBe(a);
    expect(await visitorHash(c, 'outro', '203.0.113.7', T0)).not.toBe(a);
  });
  it('o token de passagem é aleatório, tem 32 caracteres e só o hash serve de busca', async () => {
    const a = await newHandoff(c);
    const b = await newHandoff(c);
    expect(a.token).not.toBe(b.token);
    expect(isHandoffShape(a.token)).toBe(true);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(await handoffHash(c, a.token));
    expect(a.hash).not.toContain(a.token);
    for (const bad of ['', 'curto', 'x'.repeat(33), 'a'.repeat(31) + '!', null, 5]) expect(isHandoffShape(bad)).toBe(false);
    expect(await sha256Hex(c, 'a')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('limites: por hora, por dia e disjuntor global', () => {
    expect(rateDecision({ hour: 0, day: 0, globalOkDay: 0 })).toBe('allow');
    expect(rateDecision({ hour: LIMITS.perHour - 1, day: 0, globalOkDay: 0 })).toBe('allow');
    expect(rateDecision({ hour: LIMITS.perHour, day: 0, globalOkDay: 0 })).toBe('rate_limited');
    expect(rateDecision({ hour: 0, day: LIMITS.perDay, globalOkDay: 0 })).toBe('rate_limited');
    expect(rateDecision({ hour: 0, day: 0, globalOkDay: LIMITS.globalOkPerDay })).toBe('unavailable');
    expect(rateDecision({ hour: 99, day: 99, globalOkDay: LIMITS.globalOkPerDay })).toBe('unavailable');
  });
  it('só a origem do app é aceita; o redirecionamento é relativo e só leva o token', () => {
    expect(isAllowedOrigin(ALLOWED_ORIGINS[0])).toBe(true);
    for (const o of [null, undefined, '', 'https://evil.com', 'http://app.zica.posts.zicajuris.com.br', 'https://app.zica.posts.zicajuris.com.br.evil.com']) expect(isAllowedOrigin(o)).toBe(false);
    expect(signupRedirect('abc_-123')).toBe('/auth?view=signup&lead=abc_-123');
    expect(signupRedirect('a&b=c')).toBe('/auth?view=signup&lead=a%26b%3Dc');
    expect(signupRedirect('x').startsWith('/')).toBe(true);
  });
});
