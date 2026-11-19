/**
 * Testes da observação agendada (14/11/2026): cadência, mercados, chaves determinísticas, portões de gasto e execução com banco em memória.
 * Executar com: deno test --node-modules-dir=none supabase/functions/_shared/nexus-observe_test.ts
 */
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  budgetLeftMicros, buildRunRows, cadenceDue, executableEngines, executeObservation, marketsFor, runObservationTickForOrg,
  OBSERVE_BUDGET_MARGIN_MICROS, type ObserveAdmin, type PromptSet,
} from './nexus-observe.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const PRJ = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const SET = '44444444-4444-4444-8444-444444444444';
const NOW = Date.parse('2026-11-14T22:00:00.000Z');
const HOUR = 3_600_000;

// ---------------------------------------------------------------------------
// Banco em memória (só o que o executor usa)
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
function makeDb(over: { program?: Row | null; secrets?: Record<string, string>; reserveError?: boolean; ops?: Row[]; sets?: Row[]; prompts?: Row[]; budgetPerReserve?: number } = {}) {
  const t: Record<string, Row[]> = {
    nexus_programs: over.program === null ? [] : [{ organization_id: ORG, execution_enabled: true, budget_usd_micros: 5_000_000, reserved_usd_micros: 0, consumed_usd_micros: 0, settings: { providers_enabled: ['serper', 'openai', 'brave'], observation_model: 'gpt-4o-mini' }, ...(over.program ?? {}) }],
    nexus_prompt_sets: over.sets ?? [{ id: SET, organization_id: ORG, project_id: PRJ, user_id: USER, cadence: 'daily', status: 'active', engines: ['chatgpt_web', 'google_serp'], markets: [{ country: 'br', language: 'pt-BR' }, { country: 'pt', language: 'pt-BR', city: 'Lisboa' }] }],
    nexus_prompts: over.prompts ?? [
      { id: 'p1', prompt_set_id: SET, query: 'advogado criminalista em São Paulo', topic: 'criminal', intent: 'discovery', branded: false, active: true, position: 0 },
      { id: 'p2', prompt_set_id: SET, query: 'RDM Advogados é bom?', topic: 'marca', intent: 'branded', branded: true, active: true, position: 1 },
    ],
    projects: [{ id: PRJ, name: 'RDM Advogados', domain: 'rdmadvogados.com.br', wordpress_url: 'https://rdmadvogados.com.br/blog' }],
    nexus_operations: over.ops ?? [],
  };
  const calls = { secret: [] as string[], reserve: [] as string[], finish: [] as string[] };
  let seq = 0;
  const matches = (row: Row, f: Array<[string, string, unknown]>) => f.every(([op, k, v]) => {
    const cur = row[k];
    if (op === 'eq') return cur === v;
    if (op === 'neq') return cur !== v;
    if (op === 'gte') return String(cur) >= String(v);
    if (op === 'in') return (v as unknown[]).includes(cur);
    if (op === 'like') return new RegExp('^' + String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$').test(String(cur));
    return true;
  });
  function builder(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    let patch: Row | null = null; let order: [string, boolean] | null = null; let limit = 1000; let upsertRows: Row[] | null = null; let ignoreDup = false; let single = false;
    const run = (): { data: unknown; error: unknown } => {
      const rows = t[table] ?? [];
      if (upsertRows) {
        const out: Row[] = [];
        for (const r of upsertRows) {
          if (rows.some((x) => x.organization_id === r.organization_id && x.request_key === r.request_key)) { if (ignoreDup) continue; }
          const row = { id: `op-${++seq}`, status: 'prepared', created_at: new Date(NOW + seq).toISOString(), ...r }; rows.push(row); out.push({ id: row.id });
        }
        return { data: out, error: null };
      }
      let sel = rows.filter((r) => matches(r, filters));
      if (patch) { for (const r of sel) Object.assign(r, patch); return { data: sel, error: null }; }
      if (order) sel = [...sel].sort((a, b) => (String(a[order![0]]) < String(b[order![0]]) ? -1 : 1) * (order![1] ? 1 : -1));
      sel = sel.slice(0, limit);
      return { data: single ? (sel[0] ?? null) : sel, error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b, eq: (k: string, v: unknown) => { filters.push(['eq', k, v]); return b; }, neq: (k: string, v: unknown) => { filters.push(['neq', k, v]); return b; },
      in: (k: string, v: unknown) => { filters.push(['in', k, v]); return b; },
      gte: (k: string, v: unknown) => { filters.push(['gte', k, v]); return b; }, like: (k: string, v: unknown) => { filters.push(['like', k, v]); return b; },
      order: (k: string, o?: { ascending?: boolean }) => { order = [k, o?.ascending !== false]; return b; }, limit: (n: number) => { limit = n; return b; },
      maybeSingle: () => { single = true; return Promise.resolve(run()); },
      upsert: (rws: Row[], o?: { ignoreDuplicates?: boolean }) => { upsertRows = rws; ignoreDup = o?.ignoreDuplicates === true; return b; },
      update: (p: Row) => { patch = p; return b; },
      then: (res: (v: { data: unknown; error: unknown }) => unknown) => Promise.resolve(run()).then(res),
    };
    return b;
  }
  const admin: ObserveAdmin = {
    from: (table: string) => builder(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'nexus_provider_secret_read') { calls.secret.push(String(args.p_provider)); const s = over.secrets ?? { serper: 'serper-key', openai: 'openai-key' }; return Promise.resolve({ data: s[String(args.p_provider)] ?? null, error: null }); }
      if (name === 'nexus_reserve_operation') {
        calls.reserve.push(String(args.p_operation));
        if (over.reserveError) return Promise.resolve({ data: null, error: { message: 'budget' } });
        const prog = t.nexus_programs[0]; prog.reserved_usd_micros = Number(prog.reserved_usd_micros) + (over.budgetPerReserve ?? 20_000);
        const op = t.nexus_operations.find((o) => o.id === args.p_operation); if (op) op.status = 'reserved';
        return Promise.resolve({ data: {}, error: null });
      }
      if (name === 'nexus_finish_operation') { calls.finish.push(String(args.p_operation)); const op = t.nexus_operations.find((o) => o.id === args.p_operation); if (op) { op.status = 'succeeded'; op.output = args.p_output; } return Promise.resolve({ data: null, error: null }); }
      return Promise.resolve({ data: null, error: { message: 'rpc_desconhecida' } });
    },
  };
  return { admin, t, calls };
}
const serperFetch = (log: Array<{ url: string; key: string }> = [], fail = false) => ((url: string | URL, init?: RequestInit) => {
  log.push({ url: String(url), key: String((init?.headers as Record<string, string>)?.['X-API-KEY']) });
  if (fail) return Promise.resolve(new Response('x', { status: 500 }));
  return Promise.resolve(new Response(JSON.stringify({ organic: [{ position: 1, title: 'RDM', link: 'https://rdmadvogados.com.br/criminal', snippet: 's' }, { position: 2, title: 'Outro', link: 'https://concorrente.example/x', snippet: 's' }] }), { status: 200 }));
}) as typeof fetch;

// ---------------------------------------------------------------------------
Deno.test('cadência: diária 20 h, semanal 6,5 dias, manual nunca; mercados por cadência', () => {
  assert(cadenceDue('daily', null, NOW));
  assertFalse(cadenceDue('daily', NOW - 19 * HOUR, NOW));
  assert(cadenceDue('daily', NOW - 20 * HOUR, NOW));
  assertFalse(cadenceDue('weekly', NOW - 6 * 24 * HOUR, NOW));
  assert(cadenceDue('weekly', NOW - 6.5 * 24 * HOUR, NOW));
  assertFalse(cadenceDue('manual', null, NOW));
  const m = [{ country: 'br', language: 'pt-BR' }, { country: 'pt', language: 'pt-BR', city: 'Lisboa' }];
  assertEquals(marketsFor('daily', m), [m[0]]);
  assertEquals(marketsFor('weekly', m), m);
  assertEquals(marketsFor('daily', []), [{ country: 'br', language: 'pt-BR' }]);
  assertEquals(executableEngines(['chatgpt_web', 'google_serp', 'google_serp', 'gemini_web', 'brave_search', 'x']), ['google_serp', 'brave_search']);
  assertEquals(budgetLeftMicros({ budget_usd_micros: '5000000', reserved_usd_micros: 20000, consumed_usd_micros: 10000 }), 4_970_000);
  assertEquals(budgetLeftMicros(null), 0);
});

Deno.test('buildRunRows: chave determinística por dia (repetir não duplica) e marca de agendamento', () => {
  const set = { id: SET, organization_id: ORG, project_id: PRJ, user_id: USER, cadence: 'daily', status: 'active', engines: [], markets: [] } as PromptSet;
  const o = { set, prompts: [{ id: 'p1', query: 'RDM Advogados é bom?', intent: 'discovery' }], engines: ['google_serp'], markets: [{ country: 'br', language: 'pt-BR' }], variants: ['RDM Advogados'], day: '2026-11-14' };
  const a = buildRunRows(o); const b = buildRunRows(o);
  assertEquals(a.length, 1);
  assertEquals(a[0].request_key, b[0].request_key);
  assertEquals(a[0].kind, 'serp');
  assertEquals((a[0].input as Record<string, unknown>).branded, true); // a consulta cita a marca
  assertEquals((a[0].input as Record<string, unknown>).scheduled, true);
  assert(buildRunRows({ ...o, day: '2026-11-15' })[0].request_key !== a[0].request_key);
});

Deno.test('executeObservation (serper): portão, credencial, reserva e registro; a chave só vai ao provedor', async () => {
  const { admin, t, calls } = makeDb({ ops: [{ id: 'op-a', organization_id: ORG, project_id: PRJ, kind: 'serp', status: 'prepared', request_key: 'k1', input: {} }] });
  const log: Array<{ url: string; key: string }> = [];
  const program = t.nexus_programs[0];
  const op = { id: 'op-a', kind: 'serp', input: { engine: 'google_serp', query: 'advogado criminalista', country: 'br', language: 'pt-BR', variants: ['RDM'] } };
  const out = await executeObservation(admin, serperFetch(log), { orgId: ORG, host: 'rdmadvogados.com.br', program }, op, () => NOW);
  assertEquals(out, { ok: true });
  assertEquals(log.length, 1);
  assertEquals(new URL(log[0].url).hostname, 'google.serper.dev');
  assertEquals(log[0].key, 'serper-key');
  assertEquals([calls.secret, calls.reserve, calls.finish], [['serper'], ['op-a'], ['op-a']]);
  const done = t.nexus_operations[0];
  assertEquals(done.status, 'succeeded');
  assertEquals((done.output as Record<string, unknown>).observed_rank, 1);
  assertFalse(JSON.stringify(done.output).includes('serper-key'));
});

Deno.test('executeObservation: sem gasto quando o portão, a credencial ou o modelo faltam; reserva negada para a organização', async () => {
  const base = { id: 'op-a', kind: 'serp', input: { engine: 'google_serp', query: 'q', country: 'br', language: 'pt-BR' } };
  // provedor não habilitado: nada é lido nem reservado
  let db = makeDb({ program: { settings: { providers_enabled: ['openai'] } } });
  let out = await executeObservation(db.admin, serperFetch(), { orgId: ORG, host: 'x.com', program: db.t.nexus_programs[0] }, base, () => NOW);
  assertEquals(out, { ok: false, code: 'provider_not_enabled', stopOrg: false });
  assertEquals([db.calls.secret.length, db.calls.reserve.length], [0, 0]);
  // programa desligado / orçamento zero
  db = makeDb({ program: { execution_enabled: false } });
  out = await executeObservation(db.admin, serperFetch(), { orgId: ORG, host: 'x.com', program: db.t.nexus_programs[0] }, base, () => NOW);
  assertEquals(out, { ok: false, code: 'budget_paused', stopOrg: true });
  // sem credencial
  db = makeDb({ secrets: {} });
  out = await executeObservation(db.admin, serperFetch(), { orgId: ORG, host: 'x.com', program: db.t.nexus_programs[0] }, base, () => NOW);
  assertEquals(out, { ok: false, code: 'organization_credential_required' });
  assertEquals(db.calls.reserve.length, 0);
  // IA sem modelo configurado: não gasta
  db = makeDb({ program: { settings: { providers_enabled: ['openai'] } } });
  out = await executeObservation(db.admin, serperFetch(), { orgId: ORG, host: 'x.com', program: db.t.nexus_programs[0] }, { id: 'op-b', kind: 'ai_observation', input: { engine: 'chatgpt_api', query: 'q' } }, () => NOW);
  assertEquals(out, { ok: false, code: 'model_not_configured' });
  // mecanismo web (não executável) e tipo errado
  out = await executeObservation(db.admin, serperFetch(), { orgId: ORG, host: 'x.com', program: db.t.nexus_programs[0] }, { id: 'op-c', kind: 'serp', input: { engine: 'chatgpt_web', query: 'q' } }, () => NOW);
  assertEquals(out, { ok: false, code: 'engine_not_executable' });
  out = await executeObservation(db.admin, serperFetch(), { orgId: ORG, host: 'x.com', program: db.t.nexus_programs[0] }, { id: 'op-d', kind: 'editorial_review', input: {} }, () => NOW);
  assertEquals(out, { ok: false, code: 'kind_not_schedulable' });
  // reserva negada (sem preço/orçamento): para a organização e nenhuma chamada ao provedor
  db = makeDb({ reserveError: true });
  const log: Array<{ url: string; key: string }> = [];
  out = await executeObservation(db.admin, serperFetch(log), { orgId: ORG, host: 'x.com', program: db.t.nexus_programs[0] }, base, () => NOW);
  assertEquals(out, { ok: false, code: 'budget_or_pricing_gate', stopOrg: true });
  assertEquals(log.length, 0);
});

Deno.test('executeObservation: falha do provedor depois da reserva marca "uncertain" e retém a reserva', async () => {
  const { admin, t } = makeDb({ ops: [{ id: 'op-a', organization_id: ORG, project_id: PRJ, kind: 'serp', status: 'prepared', request_key: 'k1', input: {} }] });
  const out = await executeObservation(admin, serperFetch([], true), { orgId: ORG, host: 'x.com', program: t.nexus_programs[0] }, { id: 'op-a', kind: 'serp', input: { engine: 'google_serp', query: 'q', country: 'br', language: 'pt-BR' } }, () => NOW);
  assertEquals(out, { ok: false, code: 'failed_reservation_retained:provider_request_failed' });
  assertEquals(t.nexus_operations[0].status, 'uncertain');
});

Deno.test('tick: prepara e executa o mercado principal, não repete no mesmo dia, ignora manual e respeita dry run', async () => {
  const db = makeDb();
  const log: Array<{ url: string; key: string }> = [];
  const deps = { admin: db.admin, fetchFn: serperFetch(log), now: () => NOW };
  // dry run: planeja, não cria nada
  const dry = await runObservationTickForOrg({ ...deps, dryRun: true }, ORG);
  assertEquals([dry.sets[0].due, dry.sets[0].skipped_reason, db.t.nexus_operations.length, log.length], [true, 'dry_run', 0, 0]);
  // execução real: 2 perguntas × 1 mecanismo executável (google_serp) × 1 mercado (diária) = 2 operações
  const r = await runObservationTickForOrg(deps, ORG);
  assertEquals([r.sets[0].prepared, r.sets[0].executed, r.sets[0].failed], [2, 2, 0]);
  assertEquals(log.length, 2);
  assertEquals(db.t.nexus_operations.map((o) => (o.input as Record<string, unknown>).country), ['br', 'br']);
  // mesmo dia, de novo: nada devido (última rodada recente) e nenhuma chamada nova
  const again = await runObservationTickForOrg({ ...deps, now: () => NOW + 2 * HOUR }, ORG);
  assertEquals([again.sets[0].due, again.sets[0].executed, log.length], [false, 0, 2]);
  // 21 h depois: devida de novo (novo dia → novas chaves)
  const next = await runObservationTickForOrg({ ...deps, now: () => NOW + 26 * HOUR }, ORG);
  assertEquals([next.sets[0].executed, log.length], [2, 4]);
  // conjunto manual nunca roda
  const manual = makeDb({ sets: [{ id: SET, organization_id: ORG, project_id: PRJ, user_id: USER, cadence: 'manual', status: 'active', engines: ['google_serp'], markets: [] }] });
  const m = await runObservationTickForOrg({ admin: manual.admin, fetchFn: serperFetch(), now: () => NOW }, ORG);
  assertEquals([m.sets.length, manual.t.nexus_operations.length], [0, 0]);
});

Deno.test('tick: semanal usa todos os mercados; limite por execução continua no tick seguinte sem duplicar', async () => {
  const db = makeDb({ sets: [{ id: SET, organization_id: ORG, project_id: PRJ, user_id: USER, cadence: 'weekly', status: 'active', engines: ['google_serp'], markets: [{ country: 'br', language: 'pt-BR' }, { country: 'pt', language: 'pt-BR', city: 'Lisboa' }] }] });
  const log: Array<{ url: string; key: string }> = [];
  const deps = { admin: db.admin, fetchFn: serperFetch(log), now: () => NOW, maxOps: 3 };
  const a = await runObservationTickForOrg(deps, ORG);
  assertEquals([a.sets[0].prepared, a.sets[0].executed, a.sets[0].codes], [4, 3, ['tick_op_limit']]); // 2 perguntas × 2 mercados
  const b = await runObservationTickForOrg({ ...deps, now: () => NOW + HOUR }, ORG);
  assertEquals([b.sets[0].executed, log.length], [1, 4]); // a operação que sobrou continua devida; nada em dobro
  const c = await runObservationTickForOrg({ ...deps, now: () => NOW + 2 * HOUR }, ORG);
  assertEquals([c.sets[0].executed, log.length], [0, 4]);
});

Deno.test('tick: sobra "prepared" de um dia anterior é executada no dia seguinte (não fica órfã)', async () => {
  const db = makeDb({ sets: [{ id: SET, organization_id: ORG, project_id: PRJ, user_id: USER, cadence: 'weekly', status: 'active', engines: ['google_serp'], markets: [{ country: 'br', language: 'pt-BR' }, { country: 'pt', language: 'pt-BR', city: 'Lisboa' }] }] });
  const log: Array<{ url: string; key: string }> = [];
  const deps = { admin: db.admin, fetchFn: serperFetch(log), now: () => NOW, maxOps: 3 };
  const a = await runObservationTickForOrg(deps, ORG);
  assertEquals([a.sets[0].executed, a.sets[0].codes], [3, ['tick_op_limit']]);
  // outro dia (chave do dia diferente): a operação que sobrou ainda é devida
  const b = await runObservationTickForOrg({ ...deps, now: () => NOW + 26 * HOUR }, ORG);
  assertEquals([b.sets[0].executed, log.length], [1, 4]);
  const c = await runObservationTickForOrg({ ...deps, now: () => NOW + 27 * HOUR }, ORG);
  assertEquals([c.sets[0].executed, log.length], [0, 4]);
});

Deno.test('tick: margem de orçamento e reserva negada param a organização sem chamar o provedor', async () => {
  const low = makeDb({ program: { budget_usd_micros: 5_000_000, reserved_usd_micros: 4_600_000, consumed_usd_micros: 0 } });
  assert(budgetLeftMicros(low.t.nexus_programs[0] as never) < OBSERVE_BUDGET_MARGIN_MICROS);
  const log: Array<{ url: string; key: string }> = [];
  const r = await runObservationTickForOrg({ admin: low.admin, fetchFn: serperFetch(log), now: () => NOW }, ORG);
  assertEquals([r.stopped, log.length, r.sets[0].executed], ['budget_margin', 0, 0]);
  const denied = makeDb({ reserveError: true });
  const d = await runObservationTickForOrg({ admin: denied.admin, fetchFn: serperFetch(log), now: () => NOW }, ORG);
  assertEquals([d.stopped, log.length], ['budget_or_pricing_gate', 0]);
  const off = makeDb({ program: { execution_enabled: false } });
  assertEquals((await runObservationTickForOrg({ admin: off.admin, fetchFn: serperFetch(log), now: () => NOW }, ORG)).stopped, 'program_off');
});

Deno.test('tick: pergunta adicionada depois do horário é completada sem repetir o que já rodou (top-up)', async () => {
  const db = makeDb();
  const log: Array<{ url: string; key: string }> = [];
  const deps = { admin: db.admin, fetchFn: serperFetch(log), now: () => NOW };
  const first = await runObservationTickForOrg(deps, ORG);
  assertEquals([first.sets[0].prepared, first.sets[0].executed, log.length], [2, 2, 2]);
  // mais tarde, no mesmo período, o conjunto ganha uma 3ª pergunta
  db.t.nexus_prompts.push({ id: 'p3', prompt_set_id: SET, query: 'habeas corpus quanto tempo demora', topic: 'criminal', intent: 'informational', branded: false, active: true, position: 2 });
  const later = await runObservationTickForOrg({ ...deps, now: () => NOW + 3 * HOUR }, ORG);
  assertEquals([later.sets[0].due, later.sets[0].prepared, later.sets[0].executed, later.sets[0].codes, log.length], [true, 1, 1, ['top_up'], 3]);
  // depois disso nada mais é devido (nenhuma chamada nova)
  const again = await runObservationTickForOrg({ ...deps, now: () => NOW + 4 * HOUR }, ORG);
  assertEquals([again.sets[0].executed, again.sets[0].skipped_reason, log.length], [0, 'not_due', 3]);
  // dry run não prepara nem chama
  db.t.nexus_prompts.push({ id: 'p4', prompt_set_id: SET, query: 'outra pergunta', topic: 'x', intent: 'informational', branded: false, active: true, position: 3 });
  const dry = await runObservationTickForOrg({ ...deps, now: () => NOW + 5 * HOUR, dryRun: true }, ORG);
  assertEquals([dry.sets[0].executed, log.length, db.t.nexus_operations.length], [0, 3, 3]);
});
