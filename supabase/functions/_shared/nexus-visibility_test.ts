/**
 * Testes das ações de `nexus-visibility` (envelopes, validação, gestor x cliente, estados vazios, janelas). Sem rede e sem banco:
 * o acesso a dados é um store simulado. Os dados simulados reproduzem a forma das observações reais do banco (13/11/2026).
 * Executar com: deno test --no-lock --node-modules-dir=none supabase/functions/_shared/nexus-visibility_test.ts
 */
import { assert, assertAlmostEquals, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleVisibilityAction, isDay, normalizeBundle, normalizeHistory, parseCompetitorInput, parsePeriod, READ_ACTIONS, VISIBILITY_ACTIONS, WRITE_ACTIONS,
  type CompetitorRow, type HistoryRaw, type ObsBundle, type UpsertInput, type UpsertResult, type VisibilityDeps, type VisibilityStore,
} from "./nexus-visibility.ts";
import type { Observation } from "./nexus-zvi.ts";

const NOW = Date.parse("2026-11-13T15:00:00Z");
const PROJECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMP_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWN_ALIASES = ["RDM Advogados", "rdmadvogados.com.br", "Rândalos Madeira"];

let seq = 0;
function obs(p: Partial<Observation> = {}): Observation {
  seq++;
  return {
    id: `op${seq}`, engine: "chatgpt", country: "br", query: `pergunta ${seq}`, topic: "tema", intent: "informational", repetition: 1, observed_at: "2026-11-12T19:40:00.000Z",
    mentioned: false, cited: false, personalization_risk: false, citations: [], competitors: [], ...p,
  };
}

class FakeStore implements VisibilityStore {
  obsCalls: Array<{ from: string; to: string; engines: string[] | null; topic: string | null; limit: number }> = [];
  upserts: Array<{ input: UpsertInput; actor: string }> = [];
  removed: string[] = [];
  constructor(
    public bundle: ObsBundle = { observations: [], own_aliases: OWN_ALIASES, own_hosts: ["rdmadvogados.com.br"], truncated: false },
    public rows: CompetitorRow[] = [],
    public historyRaw: HistoryRaw[] = [],
    public promptRows: Array<{ query: string }> = [],
    public gscResult: { clicks: number; impressions: number } | null = null,
    public ga4Result: { sessions: number; ai_sessions: number; key_events: number } | null = null,
    public removeResult = true,
    public upsertResult: UpsertResult | null = null,
  ) {}
  observations(a: { from: string; to: string; engines: string[] | null; topic: string | null; limit: number }) {
    this.obsCalls.push(a);
    // o banco filtra pelo período (inclusivo, UTC); aqui também, para os testes de janela
    const observations = this.bundle.observations.filter((o) => o.observed_at.slice(0, 10) >= a.from && o.observed_at.slice(0, 10) <= a.to);
    return Promise.resolve({ ...this.bundle, observations });
  }
  history(_a: { query: string; engines: string[] | null; limit: number }) { return Promise.resolve(this.historyRaw); }
  competitors() { return Promise.resolve(this.rows); }
  upsertCompetitor(input: UpsertInput, actor: string): Promise<UpsertResult> {
    this.upserts.push({ input, actor });
    return Promise.resolve(this.upsertResult ?? { ok: true, competitor: { id: COMP_ID, name: input.name, domains: input.domains, kind: input.kind, status: input.status, source: "manual", created_at: "2026-11-13T00:00:00Z", updated_at: "2026-11-13T00:00:00Z" } });
  }
  removeCompetitor(id: string) { this.removed.push(id); return Promise.resolve(this.removeResult); }
  prompts() { return Promise.resolve(this.promptRows); }
  gsc() { return Promise.resolve(this.gscResult); }
  ga4() { return Promise.resolve(this.ga4Result); }
}
const CLIENT = { role: "client", can_manage_technical: false };
const MANAGER = { role: "manager", can_manage_technical: true };
const deps = (store: VisibilityStore, viewer = CLIENT): VisibilityDeps => ({ store, viewer, nowMs: NOW, brandName: "RDM Advogados Associados", actorId: "u1" });
const run = async (action: string, body: Record<string, unknown>, store: VisibilityStore, viewer = CLIENT) => handleVisibilityAction(action, body, deps(store, viewer));
// Corpo de resposta lido de forma dinâmica nos testes (a forma é conferida valor a valor abaixo). Mesmo recurso de nexus-intelligence_test.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any>;

/** Reproduz a forma do banco em 13/11/2026: 20 observações manuais; as do Gemini foram feitas com a conta logada do titular (personalização). */
function prodLikeObservations(): Observation[] {
  const list: Observation[] = [];
  const own = (host: string) => ({ host, url: `https://${host}/`, position: 1, is_own: host.includes("rdmadvogados") });
  for (let i = 0; i < 12; i++) list.push(obs({ engine: "chatgpt", query: `q-chatgpt-${i % 6}`, topic: `t${i % 3}`, citations: [own("defensoria.sp.def.br"), own("cnj.jus.br")], competitors: i % 4 === 0 ? [{ name: "Machado Meyer", host: null, source: "mention" }] : [] }));
  for (let i = 0; i < 2; i++) list.push(obs({ engine: "google_search", query: `q-serp-${i}`, topic: "t0", citations: [own("jusbrasil.com.br")], competitors: [{ name: "Rizzardo Advocacia (AIO + orgânico)", host: null, source: "mention" }] }));
  for (let i = 0; i < 6; i++) list.push(obs({ engine: "gemini", query: `q-gemini-${i}`, personalization_risk: true, mentioned: i === 0, cited: i === 0, citations: i === 0 ? [own("rdmadvogados.com.br")] : [] }));
  return list; // 14 válidas (nenhuma menção) + 6 fora do índice (1 delas "mencionou")
}

// ---------------------------------------------------------------------------
// Permissões: o cliente não escreve concorrentes
// ---------------------------------------------------------------------------
Deno.test("cliente não grava nem remove concorrentes: 403 manager_required (antes de validar e sem tocar no banco)", async () => {
  const s = new FakeStore();
  for (const [action, body] of [["competitor_upsert", { name: "Alfa", domains: [], kind: "escritorio", status: "tracked" }], ["competitor_upsert", {}], ["competitor_remove", { id: COMP_ID }], ["competitor_remove", {}]] as const) {
    const r = await run(action, body as Record<string, unknown>, s, CLIENT);
    assertEquals([r.status, r.body.error], [403, "manager_required"], action);
  }
  assertEquals(s.upserts.length + s.removed.length, 0);
  // dono/admin de organização interna (org_admin) também pode; gestor pode
  assertEquals((await run("competitor_remove", { id: COMP_ID }, s, { role: "org_admin", can_manage_technical: true })).status, 200);
});

Deno.test("gestor: cadastro valida entrada, normaliza domínios, grava como o ator e não devolve created_by", async () => {
  const s = new FakeStore();
  const r = await run("competitor_upsert", { name: "  Machado   Meyer ", domains: ["https://www.MachadoMeyer.com.br/x", "machadomeyer.com.br", "outro.adv.br"], kind: "escritorio", status: "tracked" }, s, MANAGER);
  assertEquals(r.status, 200);
  assertEquals(s.upserts[0].input, { id: null, name: "Machado Meyer", domains: ["machadomeyer.com.br", "outro.adv.br"], kind: "escritorio", status: "tracked" });
  assertEquals(s.upserts[0].actor, "u1");
  const c = (r.body as Body).competitor;
  assertEquals(c.name, "Machado Meyer");
  assertFalse("created_by" in c);
  assertEquals(Object.keys(c).sort(), ["created_at", "domains", "id", "kind", "name", "source", "status", "updated_at"]);
  // com id (renomear/editar)
  const withId = await run("competitor_upsert", { id: COMP_ID, name: "Machado Meyer Advogados", domains: [], kind: "escritorio", status: "ignored" }, s, MANAGER);
  assertEquals(withId.status, 200);
  assertEquals(s.upserts[1].input.id, COMP_ID);
});

Deno.test("gestor: entradas inválidas → 400 com código estável", async () => {
  const s = new FakeStore();
  const good = { name: "Alfa", domains: [], kind: "escritorio", status: "tracked" };
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ ...good, id: "nao-uuid" }, "id_invalid"], [{ ...good, name: "A" }, "name_invalid"], [{ ...good, name: "x".repeat(161) }, "name_invalid"], [{ ...good, name: 5 }, "name_invalid"],
    [{ ...good, domains: "a.com" }, "domains_invalid"], [{ ...good, domains: undefined }, "domains_invalid"], [{ ...good, domains: ["sem espaco.com"] }, "domains_invalid"],
    [{ ...good, domains: ["localhost"] }, "domains_invalid"], [{ ...good, domains: [1] }, "domains_invalid"],
    [{ ...good, domains: Array.from({ length: 11 }, (_, i) => `d${i}.com`) }, "domains_invalid"],
    [{ ...good, kind: "hacker" }, "kind_invalid"], [{ ...good, kind: undefined }, "kind_invalid"], [{ ...good, status: "x" }, "status_invalid"], [{ ...good, status: undefined }, "status_invalid"],
  ];
  for (const [body, error] of cases) {
    const r = await run("competitor_upsert", body, s, MANAGER);
    assertEquals([r.status, r.body.error], [400, error], JSON.stringify(body).slice(0, 80));
  }
  assertEquals(s.upserts.length, 0);
  assertEquals((await run("competitor_remove", { id: "x" }, s, MANAGER)).body.error, "id_invalid");
  assertEquals(parseCompetitorInput({ ...good, domains: ["a.com", "A.com", "www.a.com"] }).ok && (parseCompetitorInput({ ...good, domains: ["a.com", "A.com", "www.a.com"] }) as { value: UpsertInput }).value.domains.length, 1);
});

Deno.test("gestor: erros do armazenamento viram 409/429/404 e remoção inexistente é 404", async () => {
  const dup = new FakeStore(undefined, [], [], [], null, null, true, { ok: false, error: "competitor_name_taken", status: 409 });
  assertEquals((await run("competitor_upsert", { name: "Alfa", domains: [], kind: "escritorio", status: "tracked" }, dup, MANAGER)).status, 409);
  const many = new FakeStore(undefined, [], [], [], null, null, true, { ok: false, error: "too_many_competitors", status: 429 });
  assertEquals((await run("competitor_upsert", { name: "Alfa", domains: [], kind: "escritorio", status: "tracked" }, many, MANAGER)).status, 429);
  const gone = new FakeStore(undefined, [], [], [], null, null, false);
  const r = await run("competitor_remove", { id: COMP_ID }, gone, MANAGER);
  assertEquals([r.status, r.body.error], [404, "competitor_not_found"]);
  const okRemove = new FakeStore();
  assertEquals((await run("competitor_remove", { id: COMP_ID }, okRemove, MANAGER)).body, { ok: true, generated_at: "2026-11-13T15:00:00.000Z" });
  assertEquals(okRemove.removed, [COMP_ID]);
});

// ---------------------------------------------------------------------------
// Estados vazios e honestos
// ---------------------------------------------------------------------------
Deno.test("overview com ZERO dados: índice n/d, parcial, 'sem_dados', sem inventar número; 200 útil", async () => {
  const r = await run("overview", {}, new FakeStore());
  assertEquals(r.status, 200);
  const b = r.body as Body;
  assertEquals(b.method, { version: "zvi-1", label: "Índice Zica de Visibilidade (ZVI), método zvi-1" });
  assertEquals(b.period, { from: "2026-10-17", to: "2026-11-13" }); // 28 dias terminando hoje (UTC)
  assertEquals(b.n_observations, 0);
  assertEquals(b.zvi, { value: null, low: null, high: null, partial: true, missing: ["vr", "cr", "sov", "pm", "rep", "est"], confidence: "sem_dados" });
  assertEquals(b.indicators.vr, { value: null, low: null, high: null, n: 0 });
  assertEquals(b.indicators.cr.value, null);
  assertEquals(b.indicators.sov, { value: null, n: 0 });
  assertEquals(b.indicators.est, { value: null, n: 0 });
  assertEquals([b.indicators.pm, b.indicators.rep], [null, null]);
  assertEquals(b.previous, null);
  assertEquals([b.by_engine, b.trend], [[], []]);
  assertEquals(b.changes[0].kind, "sem_observacoes");
  assertEquals(b.result, { ga4: null, gsc: null });
  assertEquals(b.truncated, false);
  assertEquals(b.generated_at, "2026-11-13T15:00:00.000Z");
  assertEquals(b.viewer, { role: "client", can_manage_technical: false });
  assertEquals(((await run("overview", {}, new FakeStore(), MANAGER)).body as Body).viewer, { role: "manager", can_manage_technical: true });
  assertEquals(((await run("competitors", {}, new FakeStore(), MANAGER)).body as Body).viewer.can_manage_technical, true);
});

Deno.test("overview com os dados reais (forma do banco): observações com conta logada ficam FORA do índice; ZVI 0 parcial, n=14, confiança baixa", async () => {
  const s = new FakeStore({ observations: prodLikeObservations(), own_aliases: OWN_ALIASES, own_hosts: ["rdmadvogados.com.br"], truncated: false });
  const b = (await run("overview", {}, s)).body as Body;
  assertEquals(b.n_observations, 14);
  assertEquals(b.indicators.vr.n, 14);
  assertEquals(b.indicators.vr.value, 0);
  assertEquals(b.indicators.vr.low, 0);
  assertAlmostEquals(b.indicators.vr.high, 0.2153, 1e-3); // Wilson 0/14
  assertEquals(b.zvi.value, 0);
  assertEquals(b.zvi.partial, true);
  assertEquals(b.zvi.confidence, "baixa");
  assertEquals(b.zvi.missing, ["sov", "pm", "rep", "est"]); // sem concorrentes rastreados e sem repetições
  assertEquals(b.quality, { observations_total: 20, excluded_personalization: 6, excluded_unmeasured: 0 });
  assert(b.changes.some((c: { kind: string }) => c.kind === "observacoes_desconsideradas"));
  // Gemini só tem observações logadas: aparece, mas sem taxa (n=0), em vez de sumir ou ganhar a menção contaminada
  const gem = b.by_engine.find((e: { engine: string }) => e.engine === "gemini");
  assertEquals([gem.n, gem.vr, gem.cr, gem.label], [0, null, null, "Gemini"]);
  assertEquals(b.by_engine.map((e: { engine: string }) => e.engine), ["chatgpt", "google_search", "gemini"]);
  assertEquals(b.by_engine[0], { engine: "chatgpt", label: "ChatGPT", vr: 0, cr: 0, n: 12 });
  assertEquals(b.trend, [{ day: "2026-11-12", vr: 0, cr: 0, n: 14 }]);
  // com a opção do contrato (mais restritiva para o cliente) NÃO há como reativar: nenhum parâmetro do corpo muda isso
  const again = (await run("overview", { includePersonalized: true }, s)).body as Body;
  assertEquals(again.n_observations, 14);
});

Deno.test("overview: variação contra o período anterior, janelas, filtros repassados ao banco e resultado GA4/GSC", async () => {
  const cur = Array.from({ length: 10 }, (_, i) => obs({ observed_at: "2026-11-10T10:00:00.000Z", mentioned: i < 5, cited: i < 2, query: `c${i}` }));
  const prev = Array.from({ length: 10 }, (_, i) => obs({ observed_at: "2026-10-10T10:00:00.000Z", mentioned: i < 2, cited: false, query: `p${i}` }));
  const s = new FakeStore({ observations: [...cur, ...prev], own_aliases: [], own_hosts: [], truncated: true }, [], [], [], { clicks: 120, impressions: 4500 }, { sessions: 800, ai_sessions: 40, key_events: 12 });
  const b = (await run("overview", { from: "2026-10-17", to: "2026-11-13", engine: "chatgpt", topic: " tema " }, s)).body as Body;
  // período anterior: 28 dias imediatamente antes (19/09 a 16/10); busca uma vez só, cobrindo os dois
  assertEquals(s.obsCalls.length, 1);
  assertEquals([s.obsCalls[0].from, s.obsCalls[0].to, s.obsCalls[0].limit], ["2026-09-19", "2026-11-13", 20000]);
  assertEquals(s.obsCalls[0].engines?.sort(), ["chatgpt", "chatgpt_api", "chatgpt_web"]);
  assertEquals(s.obsCalls[0].topic, "tema");
  assertEquals(b.n_observations, 10);
  assertEquals(b.indicators.vr.value, 0.5);
  assertEquals(b.indicators.cr.value, 0.2);
  assertEquals(b.previous, { zvi: 11.7, vr: 0.2, cr: 0, n: 10 }); // ZVI anterior = 100·(0,35·0,2 + 0,25·0)/0,60 = 11,67
  assert(b.changes.some((c: { kind: string }) => c.kind === "visibilidade_subiu"));
  assertEquals(b.result, { ga4: { sessions: 800, ai_sessions: 40, key_events: 12 }, gsc: { clicks: 120, impressions: 4500 } });
  assertEquals(b.truncated, true);
});

Deno.test("overview: confiança e intervalo; ZVI 100% com tudo mencionado; período inválido → 400", async () => {
  const all = new FakeStore({ observations: Array.from({ length: 40 }, (_, i) => obs({ mentioned: true, cited: true, query: `q${i}` })), own_aliases: [], own_hosts: [], truncated: false });
  const b = (await run("overview", {}, all)).body as Body;
  assertEquals([b.zvi.value, b.zvi.low, b.zvi.high, b.zvi.confidence, b.zvi.partial], [100, 100, 100, "media", true]);
  for (const body of [{ from: "2026-11-14", to: "2026-11-13" }, { from: "nao-data" }, { to: "2026-02-30" }, { from: "2025-01-01", to: "2026-11-13" }, { from: 20261101 }]) {
    const r = await run("overview", body, new FakeStore());
    assertEquals([r.status, r.body.error], [400, "period_invalid"], JSON.stringify(body));
  }
  assertEquals((await run("overview", { engine: "x y" }, new FakeStore())).body.error, "engine_invalid");
  assertEquals((await run("overview", { topic: 3 }, new FakeStore())).body.error, "topic_invalid");
});

// ---------------------------------------------------------------------------
// Fontes
// ---------------------------------------------------------------------------
Deno.test("sources: ZSS, tipos, alvos de presença; filtro por tipo e limite; só observações do índice", async () => {
  const recent = "2026-11-12T19:40:00.000Z";
  const list = [
    ...Array.from({ length: 4 }, (_, i) => obs({ engine: i % 2 ? "chatgpt" : "gemini", query: `q${i}`, observed_at: recent, citations: [
      { host: "jusbrasil.com.br", url: "https://jusbrasil.com.br/a", position: 1, is_own: false }, { host: "cnj.jus.br", url: "https://cnj.jus.br/", position: 2, is_own: false },
      { host: "mattosfilho.com.br", url: "https://mattosfilho.com.br/", position: 3, is_own: false }] ,
      competitors: [{ name: "Mattos Filho", host: null, source: "mention" }] })),
    obs({ engine: "gemini", query: "q9", personalization_risk: true, mentioned: true, observed_at: recent, citations: [{ host: "rdmadvogados.com.br", url: "https://rdmadvogados.com.br/", position: 1, is_own: true }] }), // fora do índice
  ];
  const s = new FakeStore({ observations: list, own_aliases: OWN_ALIASES, own_hosts: ["rdmadvogados.com.br"], truncated: false });
  const b = (await run("sources", {}, s)).body as Body;
  assertEquals(b.n_observations, 4);
  const byHost = Object.fromEntries(b.sources.map((x: { host: string }) => [x.host, x]));
  assertEquals(byHost["jusbrasil.com.br"].type, "portal_agregador");
  assertEquals(byHost["cnj.jus.br"].type, "orgao_oficial");
  assertEquals(byHost["mattosfilho.com.br"].type, "escritorio"); // concorrente inferido pela sugestão (nome ~ domínio)
  assertFalse("rdmadvogados.com.br" in byHost); // a citação própria estava numa observação fora do índice
  assertEquals(byHost["jusbrasil.com.br"].engines, ["ChatGPT", "Gemini"]); // rótulos legíveis
  assertEquals(byHost["jusbrasil.com.br"].citations, 4);
  assertEquals(byHost["jusbrasil.com.br"].queries, 4);
  assertEquals(byHost["jusbrasil.com.br"].coverage, 1); // 4 de 4 perguntas
  assertEquals(byHost["jusbrasil.com.br"].is_own, false);
  assert(typeof byHost["jusbrasil.com.br"].zss === "number" && byHost["jusbrasil.com.br"].zss > 0 && byHost["jusbrasil.com.br"].zss <= 100);
  assertEquals(b.targets.map((t: { host: string }) => t.host), ["jusbrasil.com.br"]); // não sugere órgão oficial nem concorrente
  assertEquals(Object.keys(b.sources[0]).sort(), ["brand_present", "citations", "coverage", "diversity", "engines", "host", "is_own", "last_seen", "position", "queries", "recency", "relevance", "type", "zss"]);
  // filtros
  assertEquals(((await run("sources", { type: "orgao_oficial" }, s)).body as Body).sources.map((x: { host: string }) => x.host), ["cnj.jus.br"]);
  assertEquals(((await run("sources", { limit: 1 }, s)).body as Body).sources.length, 1);
  assertEquals((await run("sources", { type: "inexistente" }, s)).body.error, "type_invalid");
  assertEquals((await run("sources", { limit: 201 }, s)).body.error, "limit_invalid");
  assertEquals((await run("sources", { limit: 0 }, s)).body.error, "limit_invalid");
  // vazio
  const empty = (await run("sources", {}, new FakeStore())).body as Body;
  assertEquals([empty.sources, empty.targets, empty.n_observations], [[], [], 0]);
});

// ---------------------------------------------------------------------------
// Concorrentes
// ---------------------------------------------------------------------------
const row = (p: Partial<CompetitorRow>): CompetitorRow => ({ id: COMP_ID, name: "Machado Meyer", domains: [], kind: "escritorio", status: "tracked", source: "manual", created_at: "2026-11-13T00:00:00Z", updated_at: "2026-11-13T00:00:00Z", ...p });

Deno.test("competitors: sem concorrentes cadastrados — ranking só com a marca, sugestões calculadas na leitura, amostra insuficiente", async () => {
  const s = new FakeStore({ observations: prodLikeObservations(), own_aliases: OWN_ALIASES, own_hosts: ["rdmadvogados.com.br"], truncated: false });
  const b = (await run("competitors", {}, s)).body as Body;
  assertEquals(b.tracked, []);
  assertEquals(b.own, { name: "RDM Advogados Associados", vr: 0, sov: null, n: 14, mentions: 0 });
  assertEquals(b.ranking.length, 1);
  assertEquals(b.ranking[0].insufficient_sample, false); // 14 >= 8
  assertEquals(b.ranking[0].rank, 1);
  assertEquals(b.suggested.map((x: { name: string }) => x.name), ["Machado Meyer", "Rizzardo Advocacia"]);
  assertEquals(b.suggested[0].mentions, 3);
  assertEquals(b.suggested[0].engines, ["ChatGPT"]);
  assertEquals(b.ignored, []);
  assertEquals(b.min_rank_n, 8);
  assertEquals(s.rows.length, 0); // nada foi gravado
});

Deno.test("competitors: cadastrados com VR/SoV, ranking com empate, ignorados só para o gestor, rastreados não voltam como sugestão", async () => {
  const list = [
    ...Array.from({ length: 10 }, (_, i) => obs({ query: `q${i}`, mentioned: i < 3, competitors: [
      ...(i < 5 ? [{ name: "Machado Meyer", host: null, source: "mention" }] : []), ...(i >= 7 ? [{ name: "Rizzardo Advocacia (AIO)", host: null, source: "mention" }, { name: "Novo Escritório Associados", host: null, source: "mention" }] : [])] })),
  ];
  const rows = [row({ id: COMP_ID, name: "Machado Meyer", domains: ["machadomeyer.com.br"] }), row({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Rizzardo Advocacia", status: "tracked" }), row({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "Ignorado Ltda", status: "ignored" })];
  const s = new FakeStore({ observations: list, own_aliases: OWN_ALIASES, own_hosts: [], truncated: false }, rows);
  const b = (await run("competitors", {}, s, CLIENT)).body as Body;
  assertEquals(b.tracked.map((t: { name: string; mentions: number; vr: number; n: number }) => [t.name, t.mentions, t.vr, t.n]), [["Machado Meyer", 5, 0.5, 10], ["Rizzardo Advocacia", 3, 0.3, 10]]);
  assertEquals(b.own.mentions, 3);
  assertAlmostEquals(b.own.sov, 3 / 11, 1e-3); // 3 / (3 + 5 + 3)
  // ranking: Machado (5) → 1; empate entre a marca (3) e Rizzardo (3) → ambos 2
  assertEquals(b.ranking.map((r: { name: string; rank: number }) => [r.name, r.rank]), [["Machado Meyer", 1], ["RDM Advogados Associados", 2], ["Rizzardo Advocacia", 2]]);
  assertEquals(b.suggested.map((x: { name: string }) => x.name), ["Novo Escritório Associados"]);
  assertEquals(b.ignored, []); // o cliente não vê o que o gestor ignorou
  const m = (await run("competitors", {}, s, MANAGER)).body as Body;
  assertEquals(m.ignored.map((x: { name: string }) => x.name), ["Ignorado Ltda"]);
  // amostra insuficiente (n < 8): sem posição
  const few = new FakeStore({ observations: list.slice(0, 7), own_aliases: [], own_hosts: [], truncated: false }, rows);
  const f = (await run("competitors", {}, few)).body as Body;
  assertEquals(f.ranking.map((r: { rank: number | null }) => r.rank), [null, null, null]);
  assert(f.ranking.every((r: { insufficient_sample: boolean }) => r.insufficient_sample));
  assert(f.tracked.every((t: { insufficient_sample: boolean }) => t.insufficient_sample));
});

Deno.test("competitors: sugestão já cadastrada pelo gestor (status suggested) aparece como sugestão, com domínio", async () => {
  const s = new FakeStore({ observations: [obs({ competitors: [{ name: "Sem Relação", host: null, source: "mention" }] })], own_aliases: [], own_hosts: [], truncated: false }, [row({ name: "Cadastro Manual", status: "suggested", domains: ["cadastro.com.br"] })]);
  const b = (await run("competitors", {}, s)).body as Body;
  assertEquals(b.suggested.map((x: { name: string }) => x.name).sort(), ["Cadastro Manual", "Sem Relação"]);
  assertEquals(b.suggested.find((x: { name: string }) => x.name === "Cadastro Manual").domain, "cadastro.com.br");
  assertEquals(b.tracked, []);
});

// ---------------------------------------------------------------------------
// Perguntas, histórico, palavras-chave, oportunidades, metodologia
// ---------------------------------------------------------------------------
Deno.test("questions: total, página, filtro de tema (repassado ao banco) e de intenção; limites", async () => {
  const list = [
    obs({ query: "A", topic: "t1", intent: "informational", observed_at: "2026-11-12T10:00:00.000Z", mentioned: true }),
    obs({ query: "A", topic: "t1", intent: "informational", observed_at: "2026-11-11T10:00:00.000Z", engine: "gemini", personalization_risk: true, mentioned: true }),
    obs({ query: "B", topic: "t2", intent: "branded", observed_at: "2026-11-13T10:00:00.000Z" }),
    obs({ query: "C", topic: "t1", intent: "informational", observed_at: "2026-11-09T10:00:00.000Z" }),
  ];
  const s = new FakeStore({ observations: list, own_aliases: [], own_hosts: [], truncated: false });
  const b = (await run("questions", {}, s)).body as Body;
  assertEquals(b.total, 3);
  assertEquals(b.questions.map((q: { query: string }) => q.query), ["B", "A", "C"]);
  assertEquals(b.questions[1], { query: "A", topic: "t1", intent: "informational", observations: 2, n: 1, vr: 1, cr: 0, last_observed_at: "2026-11-12T10:00:00.000Z", engines: ["ChatGPT", "Gemini"] });
  assertEquals(((await run("questions", { limit: 1, offset: 1 }, s)).body as Body).questions.map((q: { query: string }) => q.query), ["A"]);
  assertEquals(((await run("questions", { intent: "branded" }, s)).body as Body).questions.map((q: { query: string }) => q.query), ["B"]);
  await run("questions", { topic: "t1" }, s);
  assertEquals(s.obsCalls.at(-1)?.topic, "t1");
  assertEquals((await run("questions", { offset: -1 }, s)).body.error, "offset_invalid");
  assertEquals((await run("questions", { limit: "abc" }, s)).body.error, "limit_invalid");
  const empty = (await run("questions", {}, new FakeStore())).body as Body;
  assertEquals([empty.total, empty.questions], [0, []]);
});

Deno.test("question_history: resposta exata, marcas, fontes, posição própria, personalização marcada e motor legível", async () => {
  const hist: HistoryRaw[] = [
    { observed_at: "2026-11-12T19:41:00.000Z", engine: "gemini", country: "us", mentioned: true, cited: true, personalization_risk: true, answer_excerpt: "Texto exato da resposta.", citations: [{ host: "rdmadvogados.com.br", url: "https://rdmadvogados.com.br/", position: 3, is_own: true }, { host: "jusbrasil.com.br", url: "https://jusbrasil.com.br/x", position: 1, is_own: false }], competitors: [{ name: "Machado Meyer (AIO)", host: null, source: "mention" }, { name: "Machado Meyer", host: null, source: "mention" }] },
    { observed_at: "2026-11-12T19:40:00.000Z", engine: "chatgpt_api", country: "br", mentioned: false, cited: false, personalization_risk: false, answer_excerpt: null, citations: [], competitors: [] },
    { observed_at: "2026-11-11T19:40:00.000Z", engine: "claude_api", country: "br", mentioned: null, cited: null, personalization_risk: false, answer_excerpt: null, citations: [], competitors: [] },
  ];
  const s = new FakeStore(undefined, [], hist);
  const b = (await run("question_history", { query: "  minha pergunta  " }, s)).body as Body;
  assertEquals(b.query, "minha pergunta");
  assertEquals(b.items.length, 3);
  const g = b.items[0];
  assertEquals([g.engine, g.engine_label, g.mentioned, g.cited, g.position, g.counted], ["gemini", "Gemini", true, true, 3, false]);
  assertEquals(g.brands, ["RDM Advogados Associados", "Machado Meyer"]); // própria marca + concorrente (sem duplicar "Machado Meyer (AIO)")
  assertEquals(g.sources, [{ host: "rdmadvogados.com.br", url: "https://rdmadvogados.com.br/" }, { host: "jusbrasil.com.br", url: "https://jusbrasil.com.br/x" }]);
  assertEquals(g.response_excerpt, "Texto exato da resposta.");
  assert(String(g.note).includes("conta logada"));
  const c = b.items[1];
  assertEquals([c.engine, c.engine_label, c.counted, c.note, c.response_excerpt, c.position, c.brands], ["chatgpt", "ChatGPT", true, null, null, null, []]);
  assertEquals([b.items[2].mentioned, b.items[2].counted], [null, false]); // "não informado" não vira "não mencionou"
  assertEquals(Object.keys(g).sort(), ["brands", "cited", "counted", "country", "engine", "engine_label", "mentioned", "note", "observed_at", "position", "response_excerpt", "sources"]);
  assertEquals((await run("question_history", {}, s)).body.error, "query_required");
  assertEquals((await run("question_history", { query: "x".repeat(501) }, s)).body.error, "query_required");
  assertEquals((await run("question_history", { query: "x", limit: 101 }, s)).body.error, "limit_invalid");
  assertEquals((await run("question_history", { query: "x", engine: "a-b" }, s)).body.error, "engine_invalid");
  assertEquals(((await run("question_history", { query: "x" }, new FakeStore())).body as Body).items, []);
});

Deno.test("keywords: termos dos textos observados + prompts cadastrados sem observação; VR só com observações válidas", async () => {
  const s = new FakeStore(
    { observations: [obs({ query: "Roubo de celular com simulacro de arma", mentioned: true }), obs({ query: "Roubo de celular com simulacro de arma", mentioned: false }), obs({ query: "Habeas corpus em Guarulhos", mentioned: false })], own_aliases: [], own_hosts: [], truncated: false },
    [], [], [{ query: "Prisão preventiva em flagrante" }, { query: "habeas corpus em guarulhos" }],
  );
  const b = (await run("keywords", {}, s)).body as Body;
  const terms = b.keywords.map((k: { term: string }) => k.term);
  assert(terms.includes("roubo"));
  assert(terms.includes("simulacro arma") || terms.includes("simulacro"));
  assert(terms.includes("prisão preventiva"));
  const roubo = b.keywords.find((k: { term: string }) => k.term === "roubo");
  assertEquals([roubo.prompts, roubo.observations, roubo.valid, roubo.vr], [1, 2, 2, 0.5]);
  assertEquals(b.keywords.find((k: { term: string }) => k.term === "prisão preventiva").vr, null); // sem observação: n/d
  assertEquals(b.n_prompts, 3); // o prompt "habeas corpus em guarulhos" já existe como pergunta observada (sem duplicar)
  assertEquals(((await run("keywords", {}, new FakeStore())).body as Body).keywords, []);
});

Deno.test("opportunities: determinístico, com evidência; vazio sem observações", async () => {
  const list = [
    ...Array.from({ length: 10 }, (_, i) => obs({ query: `q${i}`, engine: i % 2 ? "chatgpt" : "gemini", mentioned: false, competitors: [{ name: "Machado Meyer", host: null, source: "mention" }], citations: [{ host: "jusbrasil.com.br", url: "u", position: 1, is_own: false }] })),
    obs({ query: "ok", mentioned: true }),
  ];
  const s = new FakeStore({ observations: list, own_aliases: [], own_hosts: [], truncated: false }, [row({ name: "Machado Meyer" })]);
  const b = (await run("opportunities", {}, s)).body as Body;
  const kinds = b.items.map((i: { kind: string }) => i.kind);
  assert(kinds.includes("pergunta_sem_marca") && kinds.includes("concorrente_a_frente") && kinds.includes("fonte_alvo"));
  assertEquals(b.items[0].priority, "alta");
  assert(b.items.every((i: { title: string; detail: string; evidence: unknown }) => i.title && i.detail && typeof i.evidence === "object"));
  const rival = b.items.find((i: { kind: string }) => i.kind === "concorrente_a_frente");
  assertEquals(rival.evidence.competitor, "Machado Meyer");
  assertEquals(rival.evidence.n, 11);
  assertFalse(b.items.some((i: { title: string }) => i.title.includes('"ok"'))); // a pergunta em que a marca aparece não é oportunidade
  assertEquals(((await run("opportunities", {}, new FakeStore())).body as Body).items, []);
});

Deno.test("methodology: versão, componentes com pesos que somam 1, notas; sem dado de projeto", async () => {
  const b = (await run("methodology", {}, new FakeStore())).body as Body;
  assertEquals(b.version, "zvi-1");
  assertEquals(b.components.map((c: { id: string }) => c.id), ["vr", "cr", "sov", "pm", "rep", "est"]);
  assertAlmostEquals(b.components.reduce((s: number, c: { weight: number }) => s + c.weight, 0), 1, 1e-12);
  assert(b.notes.length >= 5 && b.components.every((c: { label: string; description: string }) => c.label && c.description));
  assert(String(b.components.find((c: { id: string }) => c.id === "pm").description).includes("Ainda não medido"));
});

// ---------------------------------------------------------------------------
// Visão do cliente: nada técnico; utilitários
// ---------------------------------------------------------------------------
Deno.test("nada técnico nas respostas de leitura (ids de operação, observador, evidência, chaves, custo)", async () => {
  const s = new FakeStore({ observations: prodLikeObservations(), own_aliases: OWN_ALIASES, own_hosts: ["rdmadvogados.com.br"], truncated: false }, [row({})], [], [{ query: "p" }]);
  for (const action of READ_ACTIONS) {
    const text = JSON.stringify((await run(action, action === "question_history" ? { query: "q" } : {}, s, CLIENT)).body);
    for (const forbidden of ["op1", "claude-code-browser", "evidence_path", "created_by", "api_key", "usd", "budget", "secret", "raw"]) assertFalse(text.includes(forbidden), `${action} contém ${forbidden}`);
    assert(text.includes("generated_at"), action);
  }
});

Deno.test("ações: lista completa e ação desconhecida", async () => {
  assertEquals([...READ_ACTIONS, ...WRITE_ACTIONS].sort(), VISIBILITY_ACTIONS.slice().sort());
  assertEquals(VISIBILITY_ACTIONS.length, 10);
  const r = await run("nao_existe", {}, new FakeStore());
  assertEquals([r.status, r.body.error], [400, "unsupported_action"]);
});

Deno.test("período: padrão, datas reais, limites (366 dias)", () => {
  assertEquals(parsePeriod({}, NOW), { ok: true, value: { from: "2026-10-17", to: "2026-11-13", days: 28 } });
  assertEquals(parsePeriod({ from: "2026-11-01", to: "2026-11-01" }, NOW), { ok: true, value: { from: "2026-11-01", to: "2026-11-01", days: 1 } });
  assertEquals(parsePeriod({ to: "2026-11-10" }, NOW), { ok: true, value: { from: "2026-10-14", to: "2026-11-10", days: 28 } });
  assertEquals(parsePeriod({ from: "2025-11-13", to: "2026-11-13" }, NOW).ok, true); // 366 dias (inclusivo)
  assertEquals(parsePeriod({ from: "2025-11-12", to: "2026-11-13" }, NOW).ok, false); // 367
  assertEquals(parsePeriod({ from: "2026-11-02", to: "2026-11-01" }, NOW).ok, false);
  assert(isDay("2026-02-28") && !isDay("2026-02-30") && !isDay("2026-13-01") && !isDay("26-01-01") && !isDay(20261101) && !isDay(null));
  assertEquals(parsePeriod({ from: null, to: null }, NOW).ok, true);
});

Deno.test("normalizadores tolerantes: linhas ruins são descartadas, tipos corrigidos, nada quebra", () => {
  const b = normalizeBundle({
    truncated: true, own_aliases: ["RDM", 5, "  ", null], own_hosts: "x",
    observations: [
      null, 7, { id: "a" }, { observed_at: "2026-11-12T00:00:00Z" }, // sem id / sem data
      { id: "ok", observed_at: "2026-11-12T19:40:00+00:00", engine: "chatgpt", mentioned: "true", cited: null, personalization_risk: "true", repetition: "1",
        citations: [{ host: "WWW.A.com", url: "u", position: "2", is_own: 1 }, { host: "", url: "x" }, "string"], competitors: [{ name: "Alfa" }, { name: "" }, 5] },
    ],
  });
  assertEquals(b.truncated, true);
  assertEquals(b.own_aliases, ["RDM"]);
  assertEquals(b.own_hosts, []);
  assertEquals(b.observations.length, 1);
  const o = b.observations[0];
  assertEquals([o.id, o.observed_at, o.mentioned, o.cited, o.personalization_risk, o.repetition], ["ok", "2026-11-12T19:40:00.000Z", null, null, false, null]); // texto "true" NÃO vira booleano (o banco já devolve boolean)
  assertEquals(o.citations, [{ host: "a.com", url: "u", position: null, is_own: false }]);
  assertEquals(o.competitors, [{ name: "Alfa", host: null, source: "mention" }]);
  assertEquals(normalizeBundle(null), { observations: [], own_aliases: [], own_hosts: [], truncated: false });
  assertEquals(normalizeHistory("x"), []);
  assertEquals(normalizeHistory([{ observed_at: "lixo" }, { observed_at: "2026-11-12T00:00:00Z", engine: "gemini", answer_excerpt: "  " }]).map((h) => [h.engine, h.answer_excerpt]), [["gemini", null]]);
});
