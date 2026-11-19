import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { LEAD_ACTIONS, handleLeadAction } from '../../supabase/functions/_shared/lead-capture-handler';
import { ALLOWED_ORIGINS, LEAD_CONSENT_VERSION, LIMITS, handoffHash, makeChallenge, newHandoff, type Crypto2 } from '../../supabase/functions/_shared/lead-capture-core';

const c: Crypto2 = { subtle: webcrypto.subtle as SubtleCrypto, getRandomValues: (a) => webcrypto.getRandomValues(a) };
const SECRET = 'segredo-de-teste';
const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);
const ORIGIN = ALLOWED_ORIGINS[0];
const IP = '203.0.113.7';
const USER = '00000000-0000-4000-8000-0000000000e1';
const iso = (ms: number) => new Date(ms).toISOString();

const mundo = (over: Partial<Record<string, Row[]>> = {}, users: Record<string, string> = { [USER]: 'maria@exemplo.com.br' }) => fakeAdmin({ marketing_leads: [], lead_capture_attempts: [], ...over } as Record<string, Row[]>, {}, { users });
type World = ReturnType<typeof mundo>;

async function form(over: Record<string, unknown> = {}, ageMs = 10_000) {
  return { name: 'Maria Souza', email: 'maria@exemplo.com.br', phone: '', segment: 'advocacia', message: 'Quero organizar meu marketing', consent: true, consentVersion: LEAD_CONSENT_VERSION, website: '', challenge: await makeChallenge(c, SECRET, T0 - ageMs), ...over };
}
function ctx(action: string, body: Record<string, unknown>, o: { ip?: string; origin?: string | null; userId?: string | null; manager?: boolean; now?: number } = {}) {
  return { action, body, ip: o.ip ?? IP, origin: o.origin === undefined ? ORIGIN : o.origin, crypto: c, secret: SECRET, now: () => o.now ?? T0, userId: o.userId ?? null, isManager: async () => o.manager === true };
}
const call = (w: World, action: string, body: Record<string, unknown>, o: Parameters<typeof ctx>[2] = {}) => handleLeadAction(w.admin, ctx(action, body, o));
const body = (r: { body: Record<string, unknown> }) => r.body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const tokenOf = (r: { body: Record<string, unknown> }) => decodeURIComponent(String(r.body.redirect).split('lead=')[1]);

describe('captação: ações e desafio', () => {
  it('as 8 ações existem; ação desconhecida é recusada', async () => {
    expect(LEAD_ACTIONS).toEqual(['challenge', 'submit', 'peek', 'activate', 'claim', 'list', 'update', 'release']);
    expect((await call(mundo(), 'apagar', {})).status).toBe(400);
  });
  it('challenge devolve um desafio e a versão do consentimento', async () => {
    const r = await call(mundo(), 'challenge', {});
    expect(r.status).toBe(200);
    expect(body(r).challenge).toMatch(/^\d+\.[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
    expect(body(r).consent_version).toBe(LEAD_CONSENT_VERSION);
  });
});

describe('captação: envio do formulário', () => {
  it('grava o lead com o mínimo, o aceite versionado e o hash do visitante; NUNCA o IP; devolve o caminho do cadastro com o token', async () => {
    const w = mundo();
    const r = await call(w, 'submit', await form());
    expect(r.status).toBe(200);
    expect(body(r).ok).toBe(true);
    expect(String(body(r).redirect)).toMatch(/^\/auth\?view=signup&lead=[A-Za-z0-9_-]{32}$/);
    expect(w.tables.marketing_leads).toHaveLength(1);
    const lead = w.tables.marketing_leads[0];
    expect(lead).toMatchObject({ name: 'Maria Souza', email: 'maria@exemplo.com.br', email_norm: 'maria@exemplo.com.br', segment: 'advocacia', status: 'new', consent_version: LEAD_CONSENT_VERSION, consent_at: iso(T0) });
    expect(String(lead.ip_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify([w.tables.marketing_leads, w.tables.lead_capture_attempts])).not.toContain(IP);
    // só o hash do token fica no banco, e ele confere com o token entregue
    expect(JSON.stringify(w.tables.marketing_leads)).not.toContain(tokenOf(r));
    expect(lead.handoff_hash).toBe(await handoffHash(c, tokenOf(r)));
    expect(lead.handoff_expires_at).toBe(iso(T0 + 24 * 3_600_000));
    expect(w.tables.lead_capture_attempts).toMatchObject([{ outcome: 'ok' }]);
  });

  it('só a origem do app envia (cabeçalho ausente ou de outro site é recusado, sem guardar nada)', async () => {
    for (const origin of [null, 'https://evil.com', 'http://app.zica.posts.zicajuris.com.br']) {
      const w = mundo();
      expect((await call(w, 'submit', await form(), { origin })).status, String(origin)).toBe(403);
      expect(w.tables.marketing_leads).toHaveLength(0);
    }
  });

  it('campo-isca preenchido: resposta de sucesso falsa, nada é guardado e a tentativa fica registrada como robô', async () => {
    const w = mundo();
    const r = await call(w, 'submit', await form({ website: 'http://spam.com' }));
    expect(r.status).toBe(200);
    expect(body(r).ok).toBe(true);
    expect(w.tables.marketing_leads).toHaveLength(0);
    expect(w.tables.lead_capture_attempts).toMatchObject([{ outcome: 'bot' }]);
  });

  it('desafio inválido, rápido demais ou vencido: 400 e nada é guardado', async () => {
    const bad = async (over: Record<string, unknown>, ageMs?: number) => { const w = mundo(); const r = await call(w, 'submit', await form(over, ageMs)); return { r, n: w.tables.marketing_leads.length }; };
    expect((await bad({ challenge: 'x.y.z' })).r.body.error).toBe('challenge_invalid');
    expect((await bad({ challenge: undefined })).r.body.error).toBe('challenge_invalid');
    expect((await bad({}, 1000)).r.body.error).toBe('too_fast');
    expect((await bad({}, 3 * 3_600_000)).r.body.error).toBe('expired');
    for (const x of [await bad({ challenge: 'x.y.z' }), await bad({}, 1000)]) { expect(x.r.status).toBe(400); expect(x.n).toBe(0); }
  });

  it('formulário inválido: 422 com os campos, sem guardar', async () => {
    const w = mundo();
    const r = await call(w, 'submit', await form({ email: 'xx', consent: false, name: '' }));
    expect(r.status).toBe(422);
    expect(Object.keys(body(r).fields).sort()).toEqual(['consent', 'email', 'name']);
    expect(w.tables.marketing_leads).toHaveLength(0);
  });

  it('o mesmo e-mail enviado de novo atualiza o MESMO lead, renova o token e a resposta tem o mesmo formato (não revela que já existia)', async () => {
    const w = mundo();
    const first = await call(w, 'submit', await form());
    w.tables.marketing_leads[0].status = 'contacted';
    const second = await call(w, 'submit', await form({ name: 'Maria S. Souza', message: 'Mudei de ideia: quero também o site' }), { now: T0 + 60_000 });
    expect(w.tables.marketing_leads).toHaveLength(1);
    expect(w.tables.marketing_leads[0]).toMatchObject({ name: 'Maria S. Souza', message: 'Mudei de ideia: quero também o site', status: 'contacted' });
    expect(Object.keys(first.body).sort()).toEqual(Object.keys(second.body).sort());
    expect(second.status).toBe(first.status);
    expect(tokenOf(second)).not.toBe(tokenOf(first));
    expect(w.tables.marketing_leads[0].handoff_hash).toBe(await handoffHash(c, tokenOf(second)));
  });

  it('mesmo telefone sem e-mail também é o mesmo lead; e-mail e telefone de leads DIFERENTES não se misturam', async () => {
    const w = mundo();
    await call(w, 'submit', await form({ email: '', phone: '(11) 98888-7777' }));
    await call(w, 'submit', await form({ email: '', phone: '11988887777', name: 'Mesma Pessoa' }), { now: T0 + 1000, ip: '198.51.100.1' });
    expect(w.tables.marketing_leads).toHaveLength(1);
    expect(w.tables.marketing_leads[0]).toMatchObject({ name: 'Mesma Pessoa', phone: '5511988887777' });
    // lead A só com e-mail; lead B só com telefone; novo envio com os dois contatos de uma vez
    const x = mundo({ marketing_leads: [
      { id: 'A', email: 'a@x.com', email_norm: 'a@x.com', phone: null, status: 'new' },
      { id: 'B', email: null, email_norm: null, phone: '5511977776666', status: 'new' },
    ] });
    await call(x, 'submit', await form({ email: 'a@x.com', phone: '11977776666', name: 'Dois Contatos' }));
    expect(x.tables.marketing_leads).toHaveLength(2);
    expect(x.tables.marketing_leads.find((l) => l.id === 'A')).toMatchObject({ name: 'Dois Contatos', phone: null }); // o telefone é do lead B: não foi copiado
    expect(x.tables.marketing_leads.find((l) => l.id === 'B')?.name).toBeUndefined();
  });

  it('contato de um lead JÁ cadastrado (signed_up) ou descartado gera um lead novo, sem mexer no antigo', async () => {
    const w = mundo({ marketing_leads: [{ id: 'old', email: 'maria@exemplo.com.br', email_norm: 'maria@exemplo.com.br', status: 'signed_up', name: 'Antigo' }] });
    await call(w, 'submit', await form());
    expect(w.tables.marketing_leads).toHaveLength(2);
    expect(w.tables.marketing_leads.find((l) => l.id === 'old')?.name).toBe('Antigo');
  });

  it('corrida entre dois envios do mesmo contato (violação de unicidade): tenta de novo como atualização e termina com um lead só', async () => {
    const w = mundo();
    const realFrom = w.admin.from;
    let first = true;
    const admin = { ...w.admin, from: (n: string) => {
      const q = realFrom(n);
      if (n !== 'marketing_leads') return q;
      const real = q as unknown as { insert: (r: Row) => unknown };
      return { ...q, insert: (row: Row) => {
        if (first) { first = false; w.tables.marketing_leads.push({ id: 'concorrente', email: 'maria@exemplo.com.br', email_norm: 'maria@exemplo.com.br', status: 'new' }); return Promise.resolve({ data: null, error: { code: '23505' } }); }
        return real.insert(row);
      } };
    } };
    const r = await handleLeadAction(admin, ctx('submit', await form()));
    expect(r.status).toBe(200);
    expect(w.tables.marketing_leads).toHaveLength(1);
    expect(w.tables.marketing_leads[0].id).toBe('concorrente');
    expect(w.tables.marketing_leads[0].name).toBe('Maria Souza');
  });

  it('erro do banco vira erro genérico, sem vazar detalhe', async () => {
    const w = mundo();
    const admin = { ...w.admin, from: () => { throw new Error('detalhe interno: tabela x'); } };
    const r = await handleLeadAction(admin, ctx('submit', await form()));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('detalhe interno');
  });
});

describe('captação: limites de taxa', () => {
  const attempts = (n: number, outcome = 'invalid', ageMs = 60_000) => Array.from({ length: n }, (_, i) => ({ id: i + 1, ip_hash: 'x', outcome, created_at: iso(T0 - ageMs - i) }));
  async function withAttempts(n: number, outcome: string, ageMs: number) {
    const w = mundo();
    const hash = await (await import('../../supabase/functions/_shared/lead-capture-core')).visitorHash(c, SECRET, IP, T0);
    w.tables.lead_capture_attempts.push(...attempts(n, outcome, ageMs).map((a) => ({ ...a, ip_hash: hash })));
    return w;
  }
  it(`depois de ${LIMITS.perHour} tentativas na hora, a próxima é recusada (429) e nada é guardado`, async () => {
    const w = await withAttempts(LIMITS.perHour, 'invalid', 60_000);
    const r = await call(w, 'submit', await form());
    expect(r.status).toBe(429);
    expect(w.tables.marketing_leads).toHaveLength(0);
  });
  it('tentativas de mais de 1 hora não entram no limite da hora; as de mais de 1 dia não entram no do dia', async () => {
    expect((await call(await withAttempts(LIMITS.perHour, 'invalid', 2 * 3_600_000), 'submit', await form())).status).toBe(200);
    expect((await call(await withAttempts(LIMITS.perDay, 'invalid', 3_600_000 * 5), 'submit', await form())).status).toBe(429);
    expect((await call(await withAttempts(LIMITS.perDay, 'invalid', 2 * 86_400_000), 'submit', await form())).status).toBe(200);
  });
  it('visitantes diferentes não dividem o limite', async () => {
    const w = await withAttempts(LIMITS.perHour, 'invalid', 60_000);
    expect((await call(w, 'submit', await form(), { ip: '198.51.100.9' })).status).toBe(200);
  });
  it('consultas de pré-preenchimento não consomem o limite de envio', async () => {
    const w = await withAttempts(LIMITS.perHour, 'peek', 60_000);
    expect((await call(w, 'submit', await form())).status).toBe(200);
  });
  it('disjuntor global: com o teto de leads do dia atingido, o envio fica indisponível (503) para todos', async () => {
    const w = mundo();
    w.tables.lead_capture_attempts.push(...Array.from({ length: LIMITS.globalOkPerDay }, (_, i) => ({ id: i + 1, ip_hash: 'z'.repeat(64), outcome: 'ok', created_at: iso(T0 - 60_000) })));
    const r = await call(w, 'submit', await form(), { ip: '198.51.100.77' });
    expect(r.status).toBe(503);
    expect(w.tables.marketing_leads).toHaveLength(0);
  });
  it('tentativas com mais de 7 dias são apagadas no envio', async () => {
    const w = mundo({ lead_capture_attempts: [{ id: 1, ip_hash: 'a'.repeat(64), outcome: 'ok', created_at: iso(T0 - 8 * 86_400_000) }, { id: 2, ip_hash: 'b'.repeat(64), outcome: 'ok', created_at: iso(T0 - 2 * 86_400_000) }] });
    await call(w, 'submit', await form());
    expect(w.tables.lead_capture_attempts.some((a) => a.id === 1)).toBe(false);
    expect(w.tables.lead_capture_attempts.some((a) => a.id === 2)).toBe(true);
  });
});

describe('captação: pré-preenchimento e vínculo depois do cadastro', () => {
  async function withLead(over: Record<string, unknown> = {}) {
    const h = await newHandoff(c);
    const w = mundo({ marketing_leads: [{ id: 'L1', name: 'Maria Souza', email: 'maria@exemplo.com.br', email_norm: 'maria@exemplo.com.br', phone: null, status: 'new', handoff_hash: h.hash, handoff_expires_at: iso(T0 + 3_600_000), claimed_by: null, ...over }] });
    return { w, token: h.token };
  }
  it('peek devolve só nome e e-mail para o dono do token', async () => {
    const { w, token } = await withLead();
    expect(await call(w, 'peek', { token })).toMatchObject({ status: 200, body: { valid: true, name: 'Maria Souza', email: 'maria@exemplo.com.br' } });
  });
  it('peek não revela nada para token inválido, vencido, já usado ou de lead descartado', async () => {
    for (const over of [{ handoff_expires_at: iso(T0 - 1) }, { claimed_by: USER }, { status: 'discarded' }]) {
      const { w, token } = await withLead(over);
      expect(body(await call(w, 'peek', { token }))).toEqual({ valid: false });
    }
    const { w } = await withLead();
    for (const token of ['', 'curto', 'x'.repeat(32), null, 5, undefined]) expect(body(await call(w, 'peek', { token }))).toEqual({ valid: false });
  });
  it(`peek tem limite próprio (${LIMITS.peekPerHour} por hora)`, async () => {
    const { w, token } = await withLead();
    const hash = await (await import('../../supabase/functions/_shared/lead-capture-core')).visitorHash(c, SECRET, IP, T0);
    w.tables.lead_capture_attempts.push(...Array.from({ length: LIMITS.peekPerHour }, (_, i) => ({ id: i + 1, ip_hash: hash, outcome: 'peek', created_at: iso(T0 - 60_000) })));
    expect((await call(w, 'peek', { token })).status).toBe(429);
  });
  it('claim exige login; com o token certo liga o cadastro ao lead, vira "signed_up" e o token deixa de valer', async () => {
    const { w, token } = await withLead();
    expect((await call(w, 'claim', { token })).status).toBe(401);
    const r = await call(w, 'claim', { token }, { userId: USER });
    expect(r).toMatchObject({ status: 200, body: { claimed: true } });
    expect(w.tables.marketing_leads[0]).toMatchObject({ status: 'signed_up', claimed_by: USER, claimed_at: iso(T0), handoff_hash: null, handoff_expires_at: null });
    expect((await call(w, 'claim', { token }, { userId: USER })).status).toBe(404); // uso único
    expect(body(await call(w, 'peek', { token }))).toEqual({ valid: false });
  });
  it('claim recusa token inválido, vencido ou de outro lead descartado', async () => {
    for (const over of [{ handoff_expires_at: iso(T0 - 1) }, { status: 'discarded' }]) {
      const { w, token } = await withLead(over);
      expect((await call(w, 'claim', { token }, { userId: USER })).status).toBe(404);
      expect(w.tables.marketing_leads[0].claimed_by).toBeNull();
    }
    const { w } = await withLead();
    for (const token of ['', 'curto', null]) expect((await call(w, 'claim', { token }, { userId: USER })).status).toBe(404);
  });
});

describe('captação: cadastro direto sem e-mail de confirmação (fase de teste)', () => {
  const PASS = 'senha-segura-1';
  async function withLead(over: Record<string, unknown> = {}, users: Record<string, string> = {}) {
    const h = await newHandoff(c);
    const w = fakeAdmin({ marketing_leads: [{ id: 'L1', name: 'Maria Souza', email: 'Maria@Exemplo.com.br', email_norm: 'maria@exemplo.com.br', phone: null, status: 'new', handoff_hash: h.hash, handoff_expires_at: iso(T0 + 3_600_000), claimed_by: null, ...over }], lead_capture_attempts: [] } as Record<string, Row[]>,
      { provision_trial_space: () => ({ data: { created: true, organization_id: 'O1' }, error: null }) }, { users });
    return { w, token: h.token };
  }
  it('cria a conta JÁ CONFIRMADA com o e-mail do lead (guardado no servidor), liga o lead e cria o espaço de teste', async () => {
    const { w, token } = await withLead();
    const r = await call(w, 'activate', { token, password: PASS, email: 'invasor@x.com', name: 'Invasor' });
    expect(r).toMatchObject({ status: 200, body: { activated: true, email: 'Maria@Exemplo.com.br', space: 'created' } });
    expect(w.createdUsers).toHaveLength(1);
    expect(w.createdUsers[0]).toMatchObject({ email: 'Maria@Exemplo.com.br', password: PASS, email_confirm: true, user_metadata: { full_name: 'Maria Souza' } });
    const newId = Object.keys(w.users)[0];
    expect(w.tables.marketing_leads[0]).toMatchObject({ status: 'signed_up', claimed_by: newId, handoff_hash: null, handoff_expires_at: null });
    expect(w.log).toContain('rpc:provision_trial_space');
    expect((await call(w, 'activate', { token, password: PASS })).status).toBe(404); // uso único
  });
  it('é público (sem login), mas só pelo endereço oficial', async () => {
    const { w, token } = await withLead();
    expect((await call(w, 'activate', { token, password: PASS }, { origin: 'https://outro.site' })).status).toBe(403);
    expect((await call(w, 'activate', { token, password: PASS }, { origin: null })).status).toBe(403);
    expect(w.createdUsers).toHaveLength(0);
  });
  it('recusa senha fora de 6 a 72 caracteres, token ruim/vencido/usado/descartado, e lead sem e-mail', async () => {
    const { w, token } = await withLead();
    for (const password of ['12345', 'x'.repeat(73), '', null, 5, undefined]) expect(body(await call(w, 'activate', { token, password })).error).toBe('password_invalid');
    for (const t of ['', 'curto', null, 'x'.repeat(32)]) expect((await call(w, 'activate', { token: t, password: PASS })).status).toBe(404);
    for (const over of [{ handoff_expires_at: iso(T0 - 1) }, { claimed_by: USER }, { status: 'discarded' }]) {
      const k = await withLead(over);
      expect((await call(k.w, 'activate', { token: k.token, password: PASS })).status).toBe(404);
      expect(k.w.createdUsers).toHaveLength(0);
    }
    const sem = await withLead({ email: null, email_norm: null });
    expect(body(await call(sem.w, 'activate', { token: sem.token, password: PASS })).error).toBe('email_required');
    expect(w.createdUsers).toHaveLength(0);
  });
  it('e-mail que já tem conta: 409 account_exists, o lead continua livre e nada é criado', async () => {
    const { w, token } = await withLead({}, { 'u-velho': 'maria@exemplo.com.br' });
    const r = await call(w, 'activate', { token, password: PASS });
    expect(r).toMatchObject({ status: 409, body: { error: 'account_exists' } });
    expect(w.tables.marketing_leads[0]).toMatchObject({ status: 'new', claimed_by: null });
    expect(w.log).not.toContain('rpc:provision_trial_space');
  });
  it('senha fraca recusada pelo Auth vira 422; erro inesperado vira falha genérica sem vazar detalhe', async () => {
    const a = await withLead();
    const weak = fakeAdmin(a.w.tables, {}, { createFail: { code: 'weak_password', message: 'Password should be at least 6 characters' } });
    expect(body(await handleLeadAction(weak.admin, ctx('activate', { token: a.token, password: PASS })))).toMatchObject({ error: 'password_invalid' });
    const b = await withLead();
    const boom = fakeAdmin(b.w.tables, {}, { createFail: { message: 'db exploded: secret' } });
    const r = await handleLeadAction(boom.admin, ctx('activate', { token: b.token, password: PASS }));
    expect(r).toMatchObject({ status: 500, body: { error: 'lead_operation_failed' } });
    expect(JSON.stringify(r)).not.toContain('secret');
  });
  it('falha ao criar o espaço NÃO desfaz a conta nem o vínculo', async () => {
    const h = await newHandoff(c);
    const w = fakeAdmin({ marketing_leads: [{ id: 'L1', name: 'Maria', email: 'maria@exemplo.com.br', email_norm: 'maria@exemplo.com.br', status: 'new', handoff_hash: h.hash, handoff_expires_at: iso(T0 + 3_600_000), claimed_by: null }], lead_capture_attempts: [] } as Record<string, Row[]>, { provision_trial_space: () => ({ data: null, error: { message: 'x' } }) }, {});
    const r = await handleLeadAction(w.admin, ctx('activate', { token: h.token, password: PASS }));
    expect(r).toMatchObject({ status: 200, body: { activated: true, space: 'unavailable' } });
    expect(w.tables.marketing_leads[0]).toMatchObject({ status: 'signed_up' });
  });
  it('tem limite por hora (o mesmo das consultas)', async () => {
    const { w, token } = await withLead();
    const hash = await (await import('../../supabase/functions/_shared/lead-capture-core')).visitorHash(c, SECRET, IP, T0);
    w.tables.lead_capture_attempts.push(...Array.from({ length: LIMITS.peekPerHour }, (_, i) => ({ id: i + 1, ip_hash: hash, outcome: 'peek', created_at: iso(T0 - 60_000) })));
    expect((await call(w, 'activate', { token, password: PASS })).status).toBe(429);
    expect(w.createdUsers).toHaveLength(0);
  });
  it('claim só liga o lead à conta do MESMO e-mail: o gestor (ou outra conta) logado não "rouba" o lead', async () => {
    const { w, token } = await withLead({}, { [USER]: 'randalos.ceo@gmail.com' });
    const r = await call(w, 'claim', { token }, { userId: USER });
    expect(r).toMatchObject({ status: 409, body: { error: 'email_mismatch', claimed: false } });
    expect(w.tables.marketing_leads[0]).toMatchObject({ status: 'new', claimed_by: null });
    expect(w.log).not.toContain('rpc:provision_trial_space');
    // conta sem cadastro no Auth (falha fechada)
    const k = await withLead({}, {});
    expect((await call(k.w, 'claim', { token: k.token }, { userId: USER })).status).toBe(409);
    // mesmo e-mail com maiúsculas/espaços: liga
    const ok = await withLead({}, { [USER]: ' MARIA@exemplo.com.br ' });
    expect((await call(ok.w, 'claim', { token: ok.token }, { userId: USER })).status).toBe(200);
  });
});

describe('captação: caixa do gestor', () => {
  const lead = (id: string, status: string, created: number, extra: Row = {}): Row => ({ id, name: `Lead ${id}`, email: `${id}@x.com`, phone: null, segment: 'advocacia', message: null, site_url: null, source: {}, consent_at: iso(created), consent_version: 'leads-v1', status, claimed_at: null, notes: null, created_at: iso(created), updated_at: iso(created), ip_hash: 'h'.repeat(64), handoff_hash: 'k'.repeat(64), ...extra });
  const L1 = '00000000-0000-4000-8000-0000000000a1', L2 = '00000000-0000-4000-8000-0000000000a2';
  const seeded = () => mundo({ marketing_leads: [lead(L1, 'new', T0 - 3000), lead(L2, 'contacted', T0 - 2000), lead('3', 'signed_up', T0 - 1000), lead('4', 'new', T0)] });
  const mgr = { userId: USER, manager: true };

  it('sem login 401; logado sem ser gestor 403 (list e update)', async () => {
    const w = seeded();
    for (const action of ['list', 'update']) {
      expect((await call(w, action, { id: L1, status: 'contacted' })).status).toBe(401);
      expect((await call(w, action, { id: L1, status: 'contacted' }, { userId: USER, manager: false })).body.error).toBe('manager_only');
    }
    expect(w.tables.marketing_leads.find((l) => l.id === L1)?.status).toBe('new');
  });
  it('gestor lista do mais novo ao mais antigo, com contagem por situação, SEM hash de IP nem de token', async () => {
    const r = await call(seeded(), 'list', {}, mgr);
    const b = body(r);
    expect(r.status).toBe(200);
    expect(b.leads.map((l: Row) => l.id)).toEqual(['4', '3', L2, L1]);
    expect(b.counts).toEqual({ new: 2, contacted: 1, signed_up: 1, discarded: 0 });
    for (const l of b.leads) { expect(l).not.toHaveProperty('ip_hash'); expect(l).not.toHaveProperty('handoff_hash'); expect(l).not.toHaveProperty('handoff_expires_at'); }
  });
  it('filtro por situação, limite e deslocamento; situação inválida é recusada', async () => {
    const w = seeded();
    expect(body(await call(w, 'list', { status: 'new' }, mgr)).leads.map((l: Row) => l.id)).toEqual(['4', L1]);
    expect(body(await call(w, 'list', { limit: 1, offset: 1 }, mgr)).leads.map((l: Row) => l.id)).toEqual(['3']);
    expect((await call(w, 'list', { status: 'apagado' }, mgr)).status).toBe(422);
  });
  it('gestor muda a situação e anota; o que não foi enviado não muda', async () => {
    const w = seeded();
    expect(await call(w, 'update', { id: L1, status: 'contacted', notes: '  Liguei, volta amanhã  ' }, mgr)).toMatchObject({ status: 200, body: { id: L1, status: 'contacted', notes: 'Liguei, volta amanhã' } });
    expect(w.tables.marketing_leads.find((l) => l.id === L1)).toMatchObject({ status: 'contacted', notes: 'Liguei, volta amanhã', name: 'Lead ' + L1 });
    await call(w, 'update', { id: L1, notes: null }, mgr);
    expect(w.tables.marketing_leads.find((l) => l.id === L1)?.notes).toBeNull();
    await call(w, 'update', { id: L1, status: 'discarded' }, mgr);
    expect(w.tables.marketing_leads.find((l) => l.id === L1)?.status).toBe('discarded');
  });
  it('update valida id, situação, anotação e existência', async () => {
    const w = seeded();
    expect((await call(w, 'update', { id: 'x', status: 'new' }, mgr)).status).toBe(422);
    expect((await call(w, 'update', { id: L1, status: 'inventado' }, mgr)).status).toBe(422);
    expect((await call(w, 'update', { id: L1, notes: 'a'.repeat(1001) }, mgr)).status).toBe(422);
    expect((await call(w, 'update', { id: L1, notes: 5 }, mgr)).status).toBe(422);
    expect((await call(w, 'update', { id: L1 }, mgr)).status).toBe(422);
    expect((await call(w, 'update', { id: '00000000-0000-4000-8000-0000000000ff', status: 'new' }, mgr)).status).toBe(404);
  });
});

describe('captação: espaço de teste (opção c) e liberação pela gestão', () => {
  const ORG = '00000000-0000-4000-8000-0000000000b1';
  const mgr = { userId: USER, manager: true };
  async function claimWorld(rpcs: Parameters<typeof fakeAdmin>[1]) {
    const h = await newHandoff(c);
    const w = fakeAdmin({ marketing_leads: [{ id: 'L1', name: 'Maria Souza', email: 'maria@exemplo.com.br', email_norm: 'maria@exemplo.com.br', phone: null, status: 'new', handoff_hash: h.hash, handoff_expires_at: iso(T0 + 3_600_000), claimed_by: null }], lead_capture_attempts: [] } as Record<string, Row[]>, rpcs, { users: { [USER]: 'maria@exemplo.com.br' } });
    return { w, token: h.token };
  }

  it('claim cria o espaço de teste com o NOME DO LEAD (não um nome vindo do navegador) e informa "created"', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const { w, token } = await claimWorld({ provision_trial_space: (args) => { seen.push(args); return { data: { created: true, organization_id: ORG }, error: null }; } });
    const r = await handleLeadAction(w.admin, ctx('claim', { token, nome: 'Invasor' }, { userId: USER }));
    expect(r).toMatchObject({ status: 200, body: { claimed: true, space: 'created' } });
    expect(seen).toEqual([{ p_user: USER, p_display_name: 'Maria Souza' }]);
  });

  it('quem já tem espaço: "existing" (sem criar outro)', async () => {
    const { w, token } = await claimWorld({ provision_trial_space: () => ({ data: { created: false, organization_id: ORG }, error: null }) });
    expect(body(await handleLeadAction(w.admin, ctx('claim', { token }, { userId: USER }))).space).toBe('existing');
  });

  it('se o espaço falhar (erro do banco ou exceção), o vínculo do lead PERMANECE e a resposta diz "unavailable"', async () => {
    for (const rpc of [() => ({ data: null, error: { message: 'trial_capacity_reached' } }), () => { throw new Error('boom'); }]) {
      const { w, token } = await claimWorld({ provision_trial_space: rpc as never });
      const r = await handleLeadAction(w.admin, ctx('claim', { token }, { userId: USER }));
      expect(r).toMatchObject({ status: 200, body: { claimed: true, space: 'unavailable' } });
      expect(w.tables.marketing_leads[0]).toMatchObject({ status: 'signed_up', claimed_by: USER });
    }
  });

  it('claim sem login ou com token ruim NÃO cria espaço nenhum', async () => {
    const { w, token } = await claimWorld({ provision_trial_space: () => ({ data: { created: true }, error: null }) });
    await handleLeadAction(w.admin, ctx('claim', { token }));
    await handleLeadAction(w.admin, ctx('claim', { token: 'curto' }, { userId: USER }));
    expect(w.log.filter((l) => l === 'rpc:provision_trial_space')).toHaveLength(0);
  });

  it('list mostra o espaço (plano e situação) de quem já se cadastrou, sem expor o id do usuário', async () => {
    const lead = (id: string, claimed: string | null): Row => ({ id, name: id, email: `${id}@x.com`, phone: null, segment: null, message: null, site_url: null, source: {}, consent_at: iso(T0), consent_version: 'leads-v1', status: claimed ? 'signed_up' : 'new', claimed_at: null, notes: null, created_at: iso(T0), updated_at: iso(T0), claimed_by: claimed });
    const w = fakeAdmin({ marketing_leads: [lead('A', USER), lead('B', null)], lead_capture_attempts: [] } as Record<string, Row[]>, {
      lead_trial_info: (args) => ({ data: (args.p_users as string[]).map((u) => ({ user_id: u, organization_id: ORG, plan_id: 'trial', subscription_status: 'trialing' })), error: null }),
    });
    const r = body(await handleLeadAction(w.admin, ctx('list', {}, mgr)));
    const a = r.leads.find((l: Row) => l.id === 'A'), b = r.leads.find((l: Row) => l.id === 'B');
    expect(a.space).toEqual({ organization_id: ORG, plan_id: 'trial', status: 'trialing' });
    expect(b.space).toBeNull();
    expect(JSON.stringify(r)).not.toContain(USER);
    expect(a).not.toHaveProperty('claimed_by');
  });

  it('list continua funcionando se a consulta dos espaços falhar (só some a coluna)', async () => {
    const w = fakeAdmin({ marketing_leads: [{ id: 'A', name: 'A', email: 'a@x.com', status: 'signed_up', created_at: iso(T0), claimed_by: USER }], lead_capture_attempts: [] } as Record<string, Row[]>, { lead_trial_info: () => ({ data: null, error: { message: 'x' } }) });
    const r = await handleLeadAction(w.admin, ctx('list', {}, mgr));
    expect(r.status).toBe(200);
    expect(body(r).leads[0].space).toBeNull();
  });

  describe('release', () => {
    const okRpc = (calls: Array<Record<string, unknown>>) => (args: Record<string, unknown>) => { calls.push(args); return { data: { released: true, organization_id: args.p_org, plan_id: args.p_plan }, error: null }; };
    it('só o gestor: 401 sem login, 403 para quem não é gestor; nada é chamado', async () => {
      const calls: Array<Record<string, unknown>> = [];
      const w = fakeAdmin({}, { release_trial_space: okRpc(calls) });
      expect((await handleLeadAction(w.admin, ctx('release', { organization_id: ORG, plan: 'commercial' }))).status).toBe(401);
      expect((await handleLeadAction(w.admin, ctx('release', { organization_id: ORG, plan: 'commercial' }, { userId: USER, manager: false }))).body.error).toBe('manager_only');
      expect(calls).toHaveLength(0);
    });
    it('gestor libera: o banco recebe organização, plano e QUEM liberou (o usuário logado, não um valor do corpo)', async () => {
      const calls: Array<Record<string, unknown>> = [];
      const w = fakeAdmin({}, { release_trial_space: okRpc(calls) });
      const r = await handleLeadAction(w.admin, ctx('release', { organization_id: ORG, plan: 'commercial', actor: 'outro' }, mgr));
      expect(r).toMatchObject({ status: 200, body: { released: true, organization_id: ORG, plan_id: 'commercial' } });
      expect(calls).toEqual([{ p_org: ORG, p_plan: 'commercial', p_actor: USER }]);
    });
    it('entrada inválida é recusada antes de chegar ao banco', async () => {
      const calls: Array<Record<string, unknown>> = [];
      const w = fakeAdmin({}, { release_trial_space: okRpc(calls) });
      for (const b of [{ plan: 'commercial' }, { organization_id: 'x', plan: 'commercial' }, { organization_id: ORG }, { organization_id: ORG, plan: 'Comercial; drop' }, { organization_id: ORG, plan: 7 }]) {
        expect((await handleLeadAction(w.admin, ctx('release', b, mgr))).status).toBe(422);
      }
      expect(calls).toHaveLength(0);
    });
    it('erros do banco viram respostas claras (plano proibido 422, não é de teste 409, não existe 404); outro erro vira 500 sem vazar', async () => {
      const mk = (message: string) => fakeAdmin({}, { release_trial_space: () => ({ data: null, error: { message } }) });
      const go = (message: string) => handleLeadAction(mk(message).admin, ctx('release', { organization_id: ORG, plan: 'internal' }, mgr));
      expect(await go('plan_not_releasable')).toMatchObject({ status: 422, body: { error: 'plan_not_releasable' } });
      expect(await go('not_a_trial_space')).toMatchObject({ status: 409, body: { error: 'not_a_trial_space' } });
      expect(await go('subscription_not_found')).toMatchObject({ status: 404, body: { error: 'space_not_found' } });
      const r = await go('relation secret_table does not exist');
      expect(r).toMatchObject({ status: 500, body: { error: 'lead_operation_failed' } });
      expect(JSON.stringify(r)).not.toContain('secret_table');
    });
  });
});
