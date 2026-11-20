import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSpendDb, ORG_A, ORG_B, PROJECT_1, USER_1, usdm } from './helpers/fake-spend';
import {
  SpendDeniedError, bindSpendIdentity, type DenyInfo, commitSpend, coverTextCall, createGuardedFetch, currentSpendScope, gate, newSpendScope, releaseSpend, resetPriceCache,
  runWithSpendScope, spendCapReached, spendDeniedBody, spendDeniedResponse, spendScoped, type RuntimeScopeEnv, type SpendScope,
} from '../../supabase/functions/_shared/spend-gate';
import { RESERVATION_TTL_MS } from '../../supabase/functions/_shared/spend-gate-core';
import { PAID_SERVICES_BLOCKED, installSpendLock, makeProviderFetch, paidLockedServe, scopedServe } from '../../supabase/functions/_shared/nexus-spend-lock';
import { AIOrchestrator } from '../../supabase/functions/_shared/ai-orchestrator';

// jsdom não tem AbortSignal.timeout (o orquestrador usa em cada chamada ao provedor)
if (typeof AbortSignal.timeout !== 'function') (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = () => new AbortController().signal;

const T_0950 = Date.UTC(2026, 10, 20, 12, 50, 0); // 09:50 de Brasília
const ctx = { module: 'teste' };
const scopeOf = (db: ReturnType<typeof fakeSpendDb>, init: Partial<SpendScope> = {}) =>
  newSpendScope({ module: 'teste', admin: db.admin as never, now: db.clock.now, orgId: ORG_A, ...init });

beforeEach(() => resetPriceCache());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('teto diário: o gate reserva, confirma e devolve', () => {
  it('reserva dentro do teto e confirma com o custo real: o gasto vira ledger', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    const g = await gate(db.admin as never, ORG_A, usdm(1), ctx);
    expect(g).toMatchObject({ allowed: true, duplicate: false });
    if (!g.allowed) return;
    expect(db.totals(ORG_A)).toMatchObject({ spent: 0, reserved: usdm(1) });
    await commitSpend(db.admin as never, g.reservationId, usdm(0.4), { recordLedger: true, estimated: true });
    expect(db.totals(ORG_A)).toMatchObject({ spent: usdm(0.4), reserved: 0 });
    expect(db.ledger[0].metadata).toMatchObject({ source: 'spend_gate', estimated: true });
  });

  it('confirmar sem gravar ledger (o consumo já foi pelo token_usage_logs) não duplica o gasto', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    const g = await gate(db.admin as never, ORG_A, usdm(1), ctx);
    if (!g.allowed) throw new Error('esperava permitir');
    await commitSpend(db.admin as never, g.reservationId, usdm(0.4), { recordLedger: false, estimated: false });
    expect(db.ledger).toHaveLength(0);
    expect(db.reservations[0]).toMatchObject({ status: 'committed', actual: usdm(0.4) });
  });

  it('operação nova bloqueada em 7,00: 423 daily_cap_reached, executed:false, mensagem em português com gasto e teto', async () => {
    const db = fakeSpendDb({ now: () => T_0950, ledger: [{ organization_id: ORG_A, amount: usdm(7), occurred_at: T_0950 - 3600_000, metadata: {} }] });
    const g = await gate(db.admin as never, ORG_A, usdm(0.05), ctx);
    expect(g.allowed).toBe(false);
    if (g.allowed) return;
    const d = g as DenyInfo;
    expect(d).toMatchObject({ code: 'daily_cap_reached', httpStatus: 423, retryable: false });
    expect(d.message).toMatch(/US\$ 7,00 gastos hoje de US\$ 7,00/);
    const res = spendDeniedResponse(d);
    expect(res.status).toBe(423);
    expect(await res.json()).toMatchObject({ success: false, code: 'daily_cap_reached', executed: false, retryable: false, spend: { cap: usdm(7), extra: usdm(2.2) } });
    expect(spendDeniedBody(d).error).toBe(d.message);
  });

  it('operação já iniciada termina usando o adicional (mesma chave de operação), mas operação nova de outra chave continua barrada', async () => {
    const db = fakeSpendDb({ now: () => T_0950, ledger: [{ organization_id: ORG_A, amount: usdm(6.9), occurred_at: T_0950 - 60_000, metadata: {} }] });
    const first = await gate(db.admin as never, ORG_A, usdm(0.05), { ...ctx, operationKey: 'artigo-1' });
    expect(first.allowed).toBe(true); // 6,95 <= 7,00: começou
    if (!first.allowed) return;
    await commitSpend(db.admin as never, first.reservationId, usdm(0.05), { recordLedger: true, estimated: false });
    db.ledger.push({ organization_id: ORG_A, amount: usdm(0.05), occurred_at: T_0950, metadata: {} }); // chega a 7,00
    expect((await gate(db.admin as never, ORG_A, usdm(1), { ...ctx, operationKey: 'artigo-1' })).allowed).toBe(true); // a mesma operação termina no adicional
    expect((await gate(db.admin as never, ORG_A, usdm(0.5), { ...ctx, operationKey: 'artigo-2' })).allowed).toBe(false); // outra, nova, não começa
  });

  it('adicional liberado pelo dono: operações novas passam a caber, só até 9,20', async () => {
    const db = fakeSpendDb({ now: () => T_0950, ledger: [{ organization_id: ORG_A, amount: usdm(7), occurred_at: T_0950 - 1000, metadata: {} }] });
    expect((await gate(db.admin as never, ORG_A, usdm(1), ctx)).allowed).toBe(false);
    await db.rpc('spend_unlock_extra', { p_org: ORG_A, p_actor: USER_1 });
    expect((await gate(db.admin as never, ORG_A, usdm(2), ctx)).allowed).toBe(true); // 9,00
    const over = await gate(db.admin as never, ORG_A, usdm(0.3), ctx); // 9,30 > 9,20
    expect(over).toMatchObject({ allowed: false, code: 'daily_cap_reached' });
    if (!over.allowed) expect((over as DenyInfo).message).toMatch(/limite absoluto é US\$ 9,20/);
  });

  it('o adicional vale só no dia em que foi liberado', async () => {
    let now = Date.UTC(2026, 10, 20, 12, 0, 0);
    const db = fakeSpendDb({ now: () => now });
    await db.rpc('spend_unlock_extra', { p_org: ORG_A, p_actor: USER_1 });
    db.ledger.push({ organization_id: ORG_A, amount: usdm(7), occurred_at: now, metadata: {} });
    expect(db.statusOf(ORG_A).extra_unlocked).toBe(true);
    now = Date.UTC(2026, 10, 21, 12, 0, 0); // dia seguinte
    expect(db.statusOf(ORG_A)).toMatchObject({ extra_unlocked: false, spent_usd_micros: 0, state: 'livre' });
  });

  it('nunca acima de 9,20, nem com 10 reservas simultâneas (com o lock por organização)', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    await db.rpc('spend_unlock_extra', { p_org: ORG_A, p_actor: USER_1 });
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => gate(db.admin as never, ORG_A, usdm(0.99), { ...ctx, operationKey: `op-${i}` })));
    const granted = results.filter((r) => r.allowed).length;
    expect(granted).toBe(9); // 9 x 0,99 = 8,91; a décima daria 9,90 > 9,20
    expect(db.totals(ORG_A).reserved).toBe(usdm(0.99) * 9);
    expect(db.totals(ORG_A).reserved).toBeLessThanOrEqual(9_200_000);
  });

  it('simultâneas sem o adicional: operações novas param exatamente no teto de 7,00', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => gate(db.admin as never, ORG_A, usdm(1), { ...ctx, operationKey: `op-${i}` })));
    expect(results.filter((r) => r.allowed)).toHaveLength(7);
    expect(db.totals(ORG_A).reserved).toBe(usdm(7));
  });

  it('CONTROLE NEGATIVO: sem o lock, as mesmas 10 reservas estouram o teto (o teste de concorrência tem dentes)', async () => {
    const db = fakeSpendDb({ now: () => T_0950, lock: false });
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => gate(db.admin as never, ORG_A, usdm(1), { ...ctx, operationKey: `op-${i}` })));
    expect(results.filter((r) => r.allowed).length).toBeGreaterThan(7);
  });

  it('idempotência: a mesma chave não reserva duas vezes', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    const a = await gate(db.admin as never, ORG_A, usdm(2), ctx, 'chave-fixa-0001');
    const b = await gate(db.admin as never, ORG_A, usdm(2), ctx, 'chave-fixa-0001');
    expect(a).toMatchObject({ allowed: true, duplicate: false });
    expect(b).toMatchObject({ allowed: true, duplicate: true });
    if (a.allowed && b.allowed) expect(b.reservationId).toBe(a.reservationId);
    expect(db.totals(ORG_A).reserved).toBe(usdm(2));
    expect(db.reservations).toHaveLength(1);
  });

  it('reserva expirada devolve o saldo (e confirmar depois do prazo ainda registra o gasto real)', async () => {
    let now = T_0950;
    const db = fakeSpendDb({ now: () => now });
    const big = await gate(db.admin as never, ORG_A, usdm(6), ctx);
    expect((await gate(db.admin as never, ORG_A, usdm(2), ctx)).allowed).toBe(false); // 6 + 2 > 7
    now += RESERVATION_TTL_MS + 1000;
    expect((await gate(db.admin as never, ORG_A, usdm(2), ctx)).allowed).toBe(true); // saldo devolvido
    expect(db.reservations[0].status).toBe('expired');
    if (big.allowed) {
      await commitSpend(db.admin as never, big.reservationId, usdm(0.3), { recordLedger: true, estimated: false });
      expect(db.ledger.at(-1)?.amount).toBe(usdm(0.3)); // a verdade vale mais que o prazo
    }
  });

  it('release devolve o saldo na hora', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    const g = await gate(db.admin as never, ORG_A, usdm(6), ctx);
    if (!g.allowed) throw new Error('esperava permitir');
    await releaseSpend(db.admin as never, g.reservationId);
    expect(db.totals(ORG_A).reserved).toBe(0);
    expect((await gate(db.admin as never, ORG_A, usdm(6), ctx)).allowed).toBe(true);
  });

  it('zera à meia-noite de Brasília: 23:59 ainda barra, 00:00 libera (datas fixas)', async () => {
    let now = Date.UTC(2026, 10, 20, 2, 59, 59); // 23:59:59 do dia 19 em Brasília
    const db = fakeSpendDb({ now: () => now, ledger: [{ organization_id: ORG_A, amount: usdm(7), occurred_at: Date.UTC(2026, 10, 20, 2, 0, 0), metadata: {} }] });
    expect((await gate(db.admin as never, ORG_A, usdm(0.1), ctx)).allowed).toBe(false);
    now = Date.UTC(2026, 10, 20, 3, 0, 0); // 00:00:00 do dia 20
    expect(db.statusOf(ORG_A)).toMatchObject({ day: '2026-11-20', spent_usd_micros: 0, state: 'livre' });
    expect((await gate(db.admin as never, ORG_A, usdm(0.1), ctx)).allowed).toBe(true);
  });

  it('isolamento entre organizações: o gasto da A não consome o teto da B', async () => {
    const db = fakeSpendDb({ now: () => T_0950, ledger: [{ organization_id: ORG_A, amount: usdm(7), occurred_at: T_0950 - 1000, metadata: {} }] });
    expect((await gate(db.admin as never, ORG_A, usdm(1), ctx)).allowed).toBe(false);
    expect((await gate(db.admin as never, ORG_B, usdm(1), ctx)).allowed).toBe(true);
    expect(db.totals(ORG_B).spent).toBe(0);
  });

  it('organização pausada pelo dono nega com spend_paused', async () => {
    const db = fakeSpendDb({ now: () => T_0950, policies: { [ORG_A]: { enabled: false } } });
    const g = await gate(db.admin as never, ORG_A, 10, ctx);
    expect(g).toMatchObject({ allowed: false, code: 'spend_paused' });
  });
});

describe('teto diário: falha fechada (sem leitura confiável do gasto, nega)', () => {
  it('erro do banco, exceção de rede, resposta malformada, sem cliente e organização inválida: tudo nega', async () => {
    for (const mode of [true, 'throw', 'malformed'] as const) {
      const db = fakeSpendDb({ now: () => T_0950 });
      db.state.failRead = mode;
      const g = await gate(db.admin as never, ORG_A, 1, ctx);
      expect(g).toMatchObject({ allowed: false, code: 'spend_status_unavailable', httpStatus: 423, retryable: true });
      if (!g.allowed) expect((g as DenyInfo).message).toMatch(/nenhuma chamada paga foi feita/);
    }
    expect(await gate(null, ORG_A, 1, ctx)).toMatchObject({ allowed: false, code: 'spend_status_unavailable' });
    const db = fakeSpendDb();
    expect(await gate(db.admin as never, 'nao-e-uuid', 1, ctx)).toMatchObject({ allowed: false });
    expect(await gate(db.admin as never, ORG_A, Number.NaN, ctx)).toMatchObject({ allowed: false });
    expect(await gate(db.admin as never, ORG_A, -5, ctx)).toMatchObject({ allowed: false });
    expect(db.calls).toHaveLength(0); // nem chegou ao banco com entrada inválida
  });

  it('commit e release nunca lançam (falha vira log; a reserva expira sozinha)', async () => {
    const db = fakeSpendDb();
    db.state.failRead = 'throw';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(commitSpend(db.admin as never, 'x', 1, { recordLedger: true, estimated: true })).resolves.toBe(false);
    await expect(releaseSpend(db.admin as never, 'x')).resolves.toBeUndefined();
  });
});

describe('teto diário: contexto da requisição e fetch guardado', () => {
  const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  it('chamada que não é paga passa direto, sem tocar no banco', async () => {
    const db = fakeSpendDb();
    const original = vi.fn(async () => new Response('ok'));
    const f = createGuardedFetch({ original: original as never, getScope: () => scopeOf(db) });
    await f('https://meusite.com.br/blog');
    await f('https://api.openai.com/v1/models');
    expect(original).toHaveBeenCalledTimes(2);
    expect(db.calls).toHaveLength(0);
  });

  it('chamada paga SEM contexto de requisição é negada (nada sai)', async () => {
    const original = vi.fn();
    const f = createGuardedFetch({ original: original as never, getScope: () => undefined });
    await expect(f('https://api.openai.com/v1/responses', { method: 'POST', body: '{}' })).rejects.toMatchObject({ info: { code: 'spend_scope_missing' } });
    expect(original).not.toHaveBeenCalled();
  });

  it('host pago sem preço cadastrado é negado', async () => {
    const db = fakeSpendDb();
    const original = vi.fn();
    const f = createGuardedFetch({ original: original as never, getScope: () => scopeOf(db) });
    await expect(f('https://api.replicate.com/v1/predictions', { method: 'POST' })).rejects.toMatchObject({ info: { code: 'spend_provider_unpriced' } });
    expect(original).not.toHaveBeenCalled();
  });

  it('texto direto: reserva a estimativa e confirma com o uso real lido da resposta (ledger não estimado)', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    const original = vi.fn(async () => okJson({ usage: { prompt_tokens: 1000, completion_tokens: 500 }, choices: [] }));
    const scope = scopeOf(db);
    const f = createGuardedFetch({ original: original as never, getScope: () => scope });
    const body = JSON.stringify({ model: 'gpt-4.1', max_tokens: 2000, messages: [{ role: 'user', content: 'oi' }] });
    const res = await f('https://api.openai.com/v1/chat/completions', { method: 'POST', body });
    expect(res.ok).toBe(true);
    expect(await res.json()).toMatchObject({ usage: { prompt_tokens: 1000 } }); // a resposta continua legível pelo chamador
    expect((original.mock.calls[0] as unknown[])[1]).toMatchObject({ redirect: 'manual' });
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0]).toMatchObject({ amount: 6_000, provider: 'openai' }); // 1000x2 + 500x8
    expect(db.ledger[0].metadata).toMatchObject({ estimated: false, source: 'spend_gate' });
  });

  it('imagem e busca (sem uso na resposta): gasto ESTIMADO no ledger com metadata.estimated=true', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    const original = vi.fn(async () => okJson({ data: [{ b64_json: 'x' }] }));
    const f = createGuardedFetch({ original: original as never, getScope: () => scopeOf(db) });
    await f('https://api.openai.com/v1/images/generations', { method: 'POST', body: JSON.stringify({ model: 'gpt-image-2', n: 1 }) });
    await f('https://google.serper.dev/search', { method: 'POST', body: JSON.stringify({ q: 'x' }) });
    expect(db.ledger.map((l) => [l.provider, l.amount, l.metadata.estimated])).toEqual([['openai', 250_000, true], ['serper', 2_000, true]]);
  });

  it('resposta com erro do provedor devolve a reserva (não houve gasto)', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    const original = vi.fn(async () => new Response('{}', { status: 500 }));
    const f = createGuardedFetch({ original: original as never, getScope: () => scopeOf(db) });
    const res = await f('https://google.serper.dev/search', { method: 'POST', body: '{}' });
    expect(res.status).toBe(500);
    expect(db.reservations[0].status).toBe('released');
    expect(db.ledger).toHaveLength(0);
    original.mockRejectedValueOnce(new Error('rede'));
    await expect(f('https://google.serper.dev/search', { method: 'POST', body: '{}' })).rejects.toThrow('rede');
    expect(db.reservations[1].status).toBe('released');
  });

  it('estimativa que não cabe: a chamada NÃO sai e o contexto marca a negação', async () => {
    const db = fakeSpendDb({ now: () => T_0950, ledger: [{ organization_id: ORG_A, amount: usdm(6.99), occurred_at: T_0950 - 1000, metadata: {} }] });
    const original = vi.fn();
    const scope = scopeOf(db);
    const f = createGuardedFetch({ original: original as never, getScope: () => scope });
    await expect(f('https://api.openai.com/v1/images/generations', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(SpendDeniedError); // 0,25 > 0,01 restante
    expect(original).not.toHaveBeenCalled();
    expect(scope.denied).toMatchObject({ code: 'daily_cap_reached' });
  });

  it('teto atingido no meio de um lote: as próximas chamadas são negadas SEM ir ao banco (nada de laço de tentativas)', async () => {
    const db = fakeSpendDb({ now: () => T_0950, ledger: [{ organization_id: ORG_A, amount: usdm(7), occurred_at: T_0950 - 1000, metadata: {} }] });
    const original = vi.fn();
    const scope = scopeOf(db);
    const f = createGuardedFetch({ original: original as never, getScope: () => scope });
    await expect(f('https://google.serper.dev/search', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(SpendDeniedError);
    const reservasAntes = db.calls.filter((c) => c.name === 'spend_reserve').length;
    for (let i = 0; i < 5; i++) await expect(f('https://google.serper.dev/search', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(SpendDeniedError);
    expect(db.calls.filter((c) => c.name === 'spend_reserve').length).toBe(reservasAntes);
    expect(original).not.toHaveBeenCalled();
    await runWithSpendScope(scope, async () => expect(spendCapReached()).toBe(true));
  });

  it('organização não identificada (ambígua ou sem vínculo): nega com spend_org_unresolved', async () => {
    const db = fakeSpendDb({ resolveOrg: () => null });
    const scope = scopeOf(db, { orgId: undefined, userId: USER_1 });
    const original = vi.fn();
    const f = createGuardedFetch({ original: original as never, getScope: () => scope });
    await expect(f('https://google.serper.dev/search', { method: 'POST', body: '{}' })).rejects.toMatchObject({ info: { code: 'spend_org_unresolved' } });
    const noIdentity = scopeOf(db, { orgId: undefined });
    const f2 = createGuardedFetch({ original: original as never, getScope: () => noIdentity });
    await expect(f2('https://google.serper.dev/search', { method: 'POST', body: '{}' })).rejects.toMatchObject({ info: { code: 'spend_org_unresolved' } });
    expect(original).not.toHaveBeenCalled();
  });

  it('a organização vem do projeto informado; trocar de projeto no lote troca a organização (e zera o estado de teto)', async () => {
    const P2 = '00000000-0000-4000-8000-0000000000b2';
    const db = fakeSpendDb({
      now: () => T_0950, ledger: [{ organization_id: ORG_A, amount: usdm(7), occurred_at: T_0950 - 1000, metadata: {} }],
      resolveOrg: (_u, p) => (p === PROJECT_1 ? ORG_A : p === P2 ? ORG_B : null),
    });
    const original = vi.fn(async () => okJson({}));
    const scope = newSpendScope({ module: 'lote', admin: db.admin as never, now: db.clock.now });
    const f = createGuardedFetch({ original: original as never, getScope: () => scope });
    await runWithSpendScope(scope, async () => {
      bindSpendIdentity({ projectId: PROJECT_1 });
      await expect(f('https://google.serper.dev/search', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(SpendDeniedError); // A está no teto
      bindSpendIdentity({ projectId: P2 });
      await expect(f('https://google.serper.dev/search', { method: 'POST', body: '{}' })).resolves.toBeTruthy(); // B tem teto próprio
    });
    expect(db.ledger.some((l) => l.organization_id === ORG_B)).toBe(true);
  });

  it('só o corpo/identidade lido na hora vale: usuário verificado + projeto do corpo viram a organização', async () => {
    const calls: string[] = [];
    const env: RuntimeScopeEnv = {
      url: 'https://proj.supabase.co', serviceKeys: ['service-key-de-teste'],
      rawFetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input); calls.push(url);
        if (url.endsWith('/auth/v1/user')) return okJson({ id: USER_1 });
        if (url.endsWith('/rest/v1/rpc/spend_resolve_org')) { expect(JSON.parse(String(init?.body))).toMatchObject({ p_user: USER_1, p_project: PROJECT_1 }); return okJson(ORG_A); }
        if (url.endsWith('/rest/v1/rpc/spend_price_table')) return okJson([]);
        if (url.endsWith('/rest/v1/rpc/spend_reserve')) return okJson({ allowed: true, duplicate: false, reservation_id: '00000000-0000-4000-8000-0000000000f1' });
        if (url.endsWith('/rest/v1/rpc/spend_commit')) return okJson({ ok: true });
        return okJson({});
      }) as typeof fetch,
    };
    const original = vi.fn(async () => okJson({}));
    const handler = spendScoped(async (req) => {
      const f = createGuardedFetch({ original: original as never });
      await f('https://google.serper.dev/search', { method: 'POST', body: '{}' });
      return new Response(await req.text());
    }, env, { module: 'teste' });
    const res = await handler(new Request('https://proj.supabase.co/functions/v1/x', { method: 'POST', headers: { Authorization: 'Bearer token-do-usuario' }, body: JSON.stringify({ projectId: PROJECT_1, userId: 'ignorado-no-modo-usuario' }) }));
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.endsWith('/auth/v1/user'))).toBe(true);
    expect(original).toHaveBeenCalledTimes(1);
  });

  it('requisições concorrentes não compartilham estado: cada uma enxerga o próprio contexto', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    const seen: string[] = [];
    await Promise.all(['a', 'b', 'c'].map((m) => runWithSpendScope(newSpendScope({ module: m, admin: db.admin as never }), async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      bindSpendIdentity({ userId: USER_1 });
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      seen.push(`${m}:${currentSpendScope()?.module}`);
    })));
    expect(seen.sort()).toEqual(['a:a', 'b:b', 'c:c']);
    expect(currentSpendScope()).toBeUndefined();
  });
});

describe('teto diário: AIOrchestrator (ponto central das chamadas de texto)', () => {
  const answer = (usage = { input_tokens: 1000, output_tokens: 500 }) =>
    new Response(JSON.stringify({ output_text: 'resposta pronta', usage }), { status: 200, headers: { 'content-type': 'application/json' } });
  const build = (opts: { blocked?: boolean } = {}) => {
    vi.stubGlobal('Deno', { env: { get: () => '' } });
    const o = new AIOrchestrator(opts);
    o.setKeys({ openai: 'sk-chave-de-teste' });
    return o;
  };
  const msgs = [{ role: 'user' as const, content: 'Escreva um parágrafo curto.' }];

  it('com a constante true (hoje) o comportamento é o de sempre: lança global_paid_services_blocked, sem rede e sem banco', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('Deno', { env: { get: () => '' } });
    const o = new AIOrchestrator({ blocked: true }); // modo bloqueio total (a constante hoje é false: o teto diário vale)
    o.setKeys({ openai: 'sk-chave-de-teste' });
    await expect(o.callWithMeta('article_generation', msgs)).rejects.toThrow('global_paid_services_blocked');
    await expect(o.callDualWithMeta('article_generation', msgs)).rejects.toThrow('global_paid_services_blocked');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('teto ligado e sem contexto de requisição: nega (falha fechada) e a chamada NÃO sai', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(build({ blocked: false }).callWithMeta('article_generation', msgs)).rejects.toMatchObject({ info: { code: 'spend_scope_missing' } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('teto ligado: reserva antes, confirma com o uso real depois; com usageSink o ledger não é duplicado', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    const fetcher = vi.fn(async () => answer());
    vi.stubGlobal('fetch', fetcher);
    const o = build({ blocked: false });
    const sink = vi.fn(async () => undefined);
    o.setUsageSink(sink);
    const out = await runWithSpendScope(scopeOf(db), () => o.callWithMeta('article_generation', msgs, { articleId: undefined }));
    expect(out.content).toBe('resposta pronta');
    expect(sink).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(db.reservations).toHaveLength(1);
    expect(db.reservations[0]).toMatchObject({ status: 'committed', actual: 6_000 }); // gpt-4.1: 1000x2 + 500x8
    expect(db.ledger).toHaveLength(0); // o ledger recebe o gasto pelo token_usage_logs, não em dobro
  });

  it('sem usageSink (ou se ele falhar), o gate grava o gasto real no ledger: nenhum gasto fica sem medida', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    vi.stubGlobal('fetch', vi.fn(async () => answer()));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const semSink = build({ blocked: false });
    await runWithSpendScope(scopeOf(db), () => semSink.callWithMeta('article_generation', msgs));
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0]).toMatchObject({ amount: 6_000 });
    const comSinkQuebrado = build({ blocked: false });
    comSinkQuebrado.setUsageSink(async () => { throw new Error('banco fora'); });
    await runWithSpendScope(scopeOf(db), () => comSinkQuebrado.callWithMeta('article_generation', msgs));
    expect(db.ledger).toHaveLength(2);
  });

  it('teto atingido: nenhuma chamada ao provedor, nenhum outro provedor é tentado, erro tipado com a mensagem em português', async () => {
    const db = fakeSpendDb({ now: () => T_0950, ledger: [{ organization_id: ORG_A, amount: usdm(7), occurred_at: T_0950 - 1000, metadata: {} }] });
    const fetcher = vi.fn(async () => answer());
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('Deno', { env: { get: () => '' } });
    const o = new AIOrchestrator({ blocked: false });
    o.setKeys({ openai: 'sk-chave-de-teste', anthropic: 'chave-anthropic-de-teste' });
    const err = await runWithSpendScope(scopeOf(db), () => o.callWithMeta('article_generation', msgs)).catch((e) => e);
    expect(err).toBeInstanceOf(SpendDeniedError);
    expect(err.info.message).toMatch(/Teto diário de gasto com IA atingido/);
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.calls.filter((c) => c.name === 'spend_reserve')).toHaveLength(1); // não tentou o segundo provedor
  });

  it('falha do provedor devolve a reserva (e tenta o próximo provedor, como sempre)', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const o = build({ blocked: false });
    await expect(runWithSpendScope(scopeOf(db), () => o.callWithMeta('article_generation', msgs))).rejects.toThrow(/openai_unavailable/);
    expect(db.reservations.every((r) => r.status === 'released')).toBe(true);
    expect(db.totals(ORG_A).reserved).toBe(0);
  });

  it('chamada dupla (dois provedores em paralelo) reserva cada uma; se o teto negar as duas, o erro é o do teto', async () => {
    const db = fakeSpendDb({ now: () => T_0950, ledger: [{ organization_id: ORG_A, amount: usdm(7), occurred_at: T_0950 - 1000, metadata: {} }] });
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('Deno', { env: { get: () => '' } });
    const o = new AIOrchestrator({ blocked: false });
    o.setKeys({ openai: 'sk-chave-de-teste', anthropic: 'chave-anthropic-de-teste' });
    await expect(runWithSpendScope(scopeOf(db), () => o.callDualWithMeta('article_generation', msgs))).rejects.toBeInstanceOf(SpendDeniedError);
  });

  it('o fetch guardado reconhece a chamada do orquestrador pelo grant: UMA reserva só, sem reservar de novo por estimativa', async () => {
    const db = fakeSpendDb({ now: () => T_0950 });
    const original = vi.fn(async () => answer());
    vi.stubGlobal('fetch', createGuardedFetch({ original: original as never }));
    const o = build({ blocked: false });
    await runWithSpendScope(scopeOf(db), () => o.callWithMeta('article_generation', msgs));
    expect(original).toHaveBeenCalledTimes(1);
    expect(db.reservations).toHaveLength(1);
    // fora do grant, a mesma chamada exigiria uma segunda reserva própria
    await runWithSpendScope(scopeOf(db), () => fetch('https://api.openai.com/v1/responses', { method: 'POST', body: '{"model":"gpt-4.1"}' }));
    expect(db.reservations).toHaveLength(2);
  });

  it('cobertura direta: reservar sem contexto lança; com contexto, a estimativa respeita o máximo de tokens pedido', async () => {
    await expect(coverTextCall({ provider: 'openai', models: ['gpt-4.1'], inputChars: 30, maxOutputTokens: 100 })).rejects.toBeInstanceOf(SpendDeniedError);
    const db = fakeSpendDb({ now: () => T_0950 });
    const cover = await runWithSpendScope(scopeOf(db), () => coverTextCall({ provider: 'openai', models: ['gpt-4.1', 'gpt-4o'], inputChars: 3000, maxOutputTokens: 1000 }));
    expect(db.reservations[0].estimate).toBe(1000 * 2.5 + 1000 * 10); // gpt-4o é o mais caro dos dois
    await cover.release();
  });
});

describe('teto diário: a constante true mantém o comportamento de hoje', () => {
  const serveCapture = () => {
    const holder: { handler?: (req: Request) => Response | Promise<Response> } = {};
    vi.stubGlobal('Deno', { env: { get: () => '' }, serve: (h: (req: Request) => Response | Promise<Response>) => { holder.handler = h; return {}; } });
    return holder;
  };

  it('paidLockedServe com a constante true devolve o 423 global_paid_services_blocked e NÃO executa o handler', async () => {
    const holder = serveCapture();
    const handler = vi.fn(async () => new Response('ok'));
    paidLockedServe(handler, { blocked: true });
    const res = await holder.handler!(new Request('https://x.test/functions/v1/generate-article', { method: 'POST' }));
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(423);
    expect(await res.json()).toMatchObject({ success: false, code: 'global_paid_services_blocked', executed: false, retryable: false });
    expect((await holder.handler!(new Request('https://x.test/f', { method: 'OPTIONS' }))).status).toBe(200);
  });

  it('scopedServe e makeProviderFetch com a constante true são Deno.serve e fetch originais (nada novo no caminho)', () => {
    const holder = serveCapture();
    const h = async () => new Response('ok');
    scopedServe(h, { blocked: true });
    expect(holder.handler).toBe(h);
    const original = vi.fn() as unknown as typeof fetch;
    expect(makeProviderFetch(original, { blocked: true })).toBe(original);
    expect(makeProviderFetch(original, { blocked: false })).not.toBe(original);
  });

  it('installSpendLock sem contexto de gasto continua negando provedor pago e nunca chama a rede', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('Deno', { env: { get: () => 'https://own.supabase.co' } });
    installSpendLock();
    // Sem contexto de gasto (nenhuma reserva), o fetch guardado nega provedor pago e escrita externa, com qualquer valor da constante.
    await expect(fetch('https://api.openai.com/v1/responses', { method: 'POST' })).rejects.toThrow();
    // (escrita externa em host que não é provedor pago deixou de ser barrada: era uma regra do bloqueio total)
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('teto diário: com a constante virada (injetada nos testes), a função roda sob o gate', () => {
  const serveCapture = () => {
    const holder: { handler?: (req: Request) => Response | Promise<Response> } = {};
    vi.stubGlobal('Deno', {
      env: { get: (k: string) => ({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key-de-teste' } as Record<string, string>)[k] },
      serve: (h: (req: Request) => Response | Promise<Response>) => { holder.handler = h; return {}; },
    });
    return holder;
  };

  it('paidLockedServe com blocked:false executa o handler (não responde 423 fixo) e OPTIONS é do próprio handler', async () => {
    const holder = serveCapture();
    const handler = vi.fn(async (req: Request) => new Response(req.method === 'OPTIONS' ? null : 'rodou', { headers: { 'x-h': '1' } }));
    paidLockedServe(handler, { blocked: false });
    const res = await holder.handler!(new Request('https://proj.supabase.co/functions/v1/generate-article', { method: 'POST' }));
    expect(await res.text()).toBe('rodou');
    expect((await holder.handler!(new Request('https://x.test/f', { method: 'OPTIONS' }))).headers.get('x-h')).toBe('1');
  });

  it('negação do teto dentro da função vira 423 daily_cap_reached (executed:false) no lugar do 500 genérico do handler', async () => {
    const holder = serveCapture();
    paidLockedServe(async () => {
      const scope = currentSpendScope()!;
      scope.denied = { code: 'daily_cap_reached', facts: { code: 'daily_cap_reached' }, message: 'Teto diário de gasto com IA atingido: US$ 7,00 gastos hoje de US$ 7,00.', httpStatus: 423, retryable: false, spend: { spent: usdm(7), reserved: 0, cap: usdm(7), extra: usdm(2.2), extraUnlocked: false } };
      return new Response(JSON.stringify({ error: 'Falha ao gerar' }), { status: 500, headers: { 'Access-Control-Allow-Origin': 'https://app.exemplo.com' } });
    }, { blocked: false });
    const res = await holder.handler!(new Request('https://proj.supabase.co/functions/v1/generate-article', { method: 'POST' }));
    expect(res.status).toBe(423);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.exemplo.com');
    expect(await res.json()).toMatchObject({ code: 'daily_cap_reached', executed: false, retryable: false, error: expect.stringMatching(/Teto diário/) });
  });

  it('SpendDeniedError que escapa do handler também vira 423; resposta de sucesso não é tocada', async () => {
    const holder = serveCapture();
    let falhar = true;
    paidLockedServe(async () => {
      if (falhar) throw new SpendDeniedError({ code: 'spend_status_unavailable', facts: { code: 'spend_status_unavailable' }, message: 'sem leitura', httpStatus: 423, retryable: true });
      return new Response('ok');
    }, { blocked: false });
    const r1 = await holder.handler!(new Request('https://proj.supabase.co/functions/v1/x', { method: 'POST' }));
    expect(r1.status).toBe(423);
    expect(await r1.json()).toMatchObject({ code: 'spend_status_unavailable', executed: false, retryable: true });
    falhar = false;
    expect(await (await holder.handler!(new Request('https://proj.supabase.co/functions/v1/x', { method: 'POST' }))).text()).toBe('ok');
  });

  it('installSpendLock com blocked:false: o que não é pago passa (inclusive escrita externa, como antes da trava); provedor pago sem contexto é negado', async () => {
    const fetcher = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('Deno', { env: { get: () => 'https://own.supabase.co' } });
    installSpendLock('', { blocked: false });
    await fetch('https://site.test/x', { method: 'POST', body: '{}' });
    await fetch('https://wp.cliente.com.br/wp-json/zica-posts/v1/articles', { method: 'POST' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(fetch('https://api.openai.com/v1/responses', { method: 'POST', body: '{}' })).rejects.toMatchObject({ info: { code: 'spend_scope_missing' } });
    await expect(fetch('https://google.serper.dev/search', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(SpendDeniedError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
