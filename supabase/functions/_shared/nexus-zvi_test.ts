/**
 * Testes do módulo puro do Índice Zica de Visibilidade (zvi-1). Sem rede e sem banco.
 * Os números esperados foram calculados à mão (comentados em cada caso).
 * Executar com: deno test --no-lock --node-modules-dir=none supabase/functions/_shared/nexus-zvi_test.ts
 */
import { assert, assertAlmostEquals, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  aggregateQuestions, bootstrapZvi, brandKey, buildChanges, buildOpportunities, classifyBrandName, classifySourceType, cleanBrandName, computeIndicators, computeSourceScores, computeZvi,
  confidenceFor, engineInfo, enginesFor, extractKeywords, METHOD_VERSION, mulberry32, nameMatchesHost, normalizeDomain, rankCompetitors, selectTargets, splitObservations,
  stabilityOfGroup, suggestCompetitors, summarizeVisibility, wilsonInterval, ZVI_WEIGHTS, ZSS_WEIGHTS, MIN_RANK_N,
  type Observation, type SourceCitation, type TrackedCompetitor,
} from "./nexus-zvi.ts";

let seq = 0;
function obs(p: Partial<Observation> = {}): Observation {
  seq++;
  return {
    id: `o${seq}`, engine: 'chatgpt', country: 'br', query: `pergunta ${seq}`, topic: 'tema', intent: 'informational', repetition: 1,
    observed_at: '2026-11-12T12:00:00Z', mentioned: false, cited: false, personalization_risk: false, citations: [], competitors: [], ...p,
  };
}
const many = (n: number, p: Partial<Observation> | ((i: number) => Partial<Observation>)) => Array.from({ length: n }, (_, i) => obs(typeof p === 'function' ? p(i) : p));

// ---------------------------------------------------------------------------
// Wilson
// ---------------------------------------------------------------------------
Deno.test("Wilson — valores calculados à mão: 0/10, 5/10, 10/10; n=0 devolve null; k fora da faixa é limitado", () => {
  // 0/10: centro = 0,19208/1,38416 = 0,13877; meia largura = 1,96·sqrt(3,8416/400)/1,38416 = 0,13877 → [0; 0,2775]
  const a = wilsonInterval(0, 10)!;
  assertAlmostEquals(a.low, 0, 1e-9);
  assertAlmostEquals(a.high, 0.2775, 1e-3);
  // 5/10: simétrico em torno de 0,5 → [0,2366; 0,7634]
  const b = wilsonInterval(5, 10)!;
  assertAlmostEquals(b.low, 0.2366, 1e-3);
  assertAlmostEquals(b.high, 0.7634, 1e-3);
  assertAlmostEquals(b.low + b.high, 1, 1e-9);
  // 10/10: espelho de 0/10
  const c = wilsonInterval(10, 10)!;
  assertAlmostEquals(c.low, 0.7225, 1e-3);
  assertAlmostEquals(c.high, 1, 1e-9);
  assertEquals(wilsonInterval(0, 0), null);
  assertEquals(wilsonInterval(3, -1), null);
  assertEquals(wilsonInterval(Number.NaN, 5), null);
  assertAlmostEquals(wilsonInterval(50, 10)!.high, 1, 1e-9); // k > n é limitado a n
  assertAlmostEquals(wilsonInterval(-5, 10)!.low, 0, 1e-9);
  // n grande estreita o intervalo
  const big = wilsonInterval(500, 1000)!;
  assert(big.high - big.low < 0.07);
});

// ---------------------------------------------------------------------------
// ZVI: redistribuição de pesos
// ---------------------------------------------------------------------------
Deno.test("pesos do ZVI somam 1 e os do ZSS somam 1", () => {
  assertAlmostEquals(Object.values(ZVI_WEIGHTS).reduce((s, w) => s + w, 0), 1, 1e-12);
  assertAlmostEquals(Object.values(ZSS_WEIGHTS).reduce((s, w) => s + w, 0), 1, 1e-12);
  assertEquals(METHOD_VERSION, 'zvi-1');
});

Deno.test("computeZvi — só VR e CR: redistribui (0,35 e 0,25 → 0,5833 e 0,4167); parcial e lista do que falta", () => {
  // VR=0,5 CR=0,25: (0,35·0,5 + 0,25·0,25) / 0,60 = 0,2375/0,6 = 0,395833 → 39,5833
  const z = computeZvi({ vr: { value: 0.5 }, cr: { value: 0.25 }, sov: { value: null }, est: { value: null }, pm: null, rep: null });
  assertAlmostEquals(z.value!, 39.5833, 1e-3);
  assertEquals(z.partial, true);
  assertEquals(z.missing, ['sov', 'pm', 'rep', 'est']);
  assertAlmostEquals(z.weights_used.vr!, 0.35 / 0.6, 1e-9);
  assertAlmostEquals(z.weights_used.cr!, 0.25 / 0.6, 1e-9);
  assertAlmostEquals(Object.values(z.weights_used).reduce((s, w) => s + w, 0), 1, 1e-9);
});

Deno.test("computeZvi — com SoV e EST (sem PM e REP): soma dos pesos 0,80", () => {
  // VR 0,5 · CR 0,25 · SoV 0,4 · EST 0,8: (0,175 + 0,0625 + 0,06 + 0,04) / 0,80 = 0,3375/0,8 = 0,421875 → 42,1875
  const z = computeZvi({ vr: { value: 0.5 }, cr: { value: 0.25 }, sov: { value: 0.4 }, est: { value: 0.8 } });
  assertAlmostEquals(z.value!, 42.1875, 1e-9);
  assertEquals(z.missing, ['pm', 'rep']);
  assertEquals(z.partial, true);
});

Deno.test("computeZvi — completo: P = 1/PM e R = (REP+100)/200; não é parcial", () => {
  // PM=2 → P=0,5; REP=50 → R=0,75. Soma = 0,175 + 0,0625 + 0,06 + 0,05 + 0,075 + 0,04 = 0,4625 → 46,25
  const z = computeZvi({ vr: { value: 0.5 }, cr: { value: 0.25 }, sov: { value: 0.4 }, est: { value: 0.8 }, pm: { value: 2 }, rep: { value: 50 } });
  assertAlmostEquals(z.value!, 46.25, 1e-9);
  assertFalse(z.partial);
  assertEquals(z.missing, []);
  // PM=0,5 (impossível, mas limitado) → P=clip(2)=1 ; REP=-100 → R=0
  const e = computeZvi({ vr: { value: 1 }, cr: { value: 1 }, sov: { value: 1 }, est: { value: 1 }, pm: { value: 0.5 }, rep: { value: -100 } });
  assertAlmostEquals(e.value!, 90, 1e-9); // 100·(1 − 0,10) com R=0
});

Deno.test("computeZvi — sem VR (sem observações válidas) não há índice; pesos personalizados e inválidos", () => {
  const none = computeZvi({ vr: { value: null }, cr: { value: null }, sov: null, est: null });
  assertEquals(none.value, null);
  assertEquals(none.partial, true);
  // só CR disponível, sem VR: continua sem índice (o VR é a base)
  assertEquals(computeZvi({ vr: null, cr: { value: 1 }, sov: null, est: null }).value, null);
  // pesos personalizados: vr=1, cr=1, resto 0 → média simples
  const w = computeZvi({ vr: { value: 0.2 }, cr: { value: 0.6 }, sov: { value: 0.9 }, est: { value: 0.9 } }, { vr: 1, cr: 1, sov: 0, est: 0, pm: 0, rep: 0 });
  assertAlmostEquals(w.value!, 40, 1e-9);
  // peso negativo/NaN é ignorado (mantém o padrão)
  const bad = computeZvi({ vr: { value: 1 }, cr: { value: 1 }, sov: null, est: null }, { vr: -3, cr: Number.NaN });
  assertAlmostEquals(bad.value!, 100, 1e-9);
  // 100% e 0% extremos
  assertAlmostEquals(computeZvi({ vr: { value: 1 }, cr: { value: 1 }, sov: null, est: null }).value!, 100, 1e-9);
  assertAlmostEquals(computeZvi({ vr: { value: 0 }, cr: { value: 0 }, sov: null, est: null }).value!, 0, 1e-9);
});

Deno.test("confidenceFor — sem dados, baixa, media, alta; índice parcial nunca passa de media", () => {
  assertEquals(confidenceFor(0, true), 'sem_dados');
  assertEquals(confidenceFor(29, false), 'baixa');
  assertEquals(confidenceFor(30, false), 'media');
  assertEquals(confidenceFor(99, false), 'media');
  assertEquals(confidenceFor(100, false), 'alta');
  assertEquals(confidenceFor(5000, true), 'media');
});

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------
Deno.test("computeIndicators — zero observações: tudo null, n=0 (não inventa número)", () => {
  const ind = computeIndicators([]);
  assertEquals(ind.n, 0);
  assertEquals(ind.vr.value, null);
  assertEquals(ind.vr.low, null);
  assertEquals(ind.cr.value, null);
  assertEquals(ind.sov.value, null);
  assertEquals(ind.est.value, null);
  assertEquals(ind.pm, null);
  assertEquals(ind.rep, null);
  const s = summarizeVisibility([]);
  assertEquals(s.zvi.value, null);
  assertEquals(s.zvi.low, null);
  assertEquals(s.zvi.confidence, 'sem_dados');
  assertEquals(s.zvi.partial, true);
});

Deno.test("computeIndicators — VR e CR com observações mistas; menção sem citação e citação própria sem flag", () => {
  const list = [
    obs({ mentioned: true, cited: true }),
    obs({ mentioned: true, cited: false }),
    obs({ mentioned: false, cited: false, citations: [{ host: 'rdmadvogados.com.br', url: 'https://rdmadvogados.com.br/x', position: 1, is_own: true }] }), // citada por is_own
    obs({ mentioned: false, cited: false }),
  ];
  const ind = computeIndicators(list);
  assertEquals(ind.n, 4);
  assertEquals(ind.vr.k, 2);
  assertEquals(ind.vr.value, 0.5);
  assertEquals(ind.cr.k, 2); // a 1ª (flag) e a 3ª (is_own)
  assertEquals(ind.cr.value, 0.5);
  assertAlmostEquals(ind.vr.low!, 0.15, 1e-2); // Wilson 2/4 = [0,150; 0,850]
  assertAlmostEquals(ind.vr.high!, 0.85, 1e-2);
});

Deno.test("splitObservations — personalização e flag ausente ficam fora (e são contados); includePersonalized reativa", () => {
  const list = [obs({ mentioned: true, personalization_risk: true }), obs({ mentioned: null }), obs({ mentioned: false }), obs({ mentioned: true })];
  const s = splitObservations(list);
  assertEquals(s.valid.length, 2);
  assertEquals(s.excluded, { personalization: 1, unmeasured: 1 });
  assertEquals(splitObservations(list, { includePersonalized: true }).valid.length, 3);
  // índice: 1 menção em 2 válidas
  assertEquals(computeIndicators(list).vr.value, 0.5);
  assertEquals(computeIndicators(list).excluded.personalization, 1);
});

Deno.test("SoV — só com concorrentes rastreados; conta no máximo 1 menção por concorrente por observação (nome, domínio de concorrente ou citação do domínio)", () => {
  const tracked: TrackedCompetitor[] = [
    { name: 'Machado Meyer', domains: ['machadomeyer.com.br'] },
    { name: 'Rizzardo Advocacia', domains: [] },
  ];
  const list = [
    obs({ mentioned: true, competitors: [{ name: 'Machado Meyer', host: null, source: 'mention' }, { name: 'Machado Meyer (AIO)', host: null, source: 'mention' }] }), // 1 menção (duplicada no mesmo obs)
    obs({ mentioned: false, citations: [{ host: 'www.machadomeyer.com.br', url: 'https://www.machadomeyer.com.br/', position: 2, is_own: false }] }), // por domínio citado
    obs({ mentioned: false, competitors: [{ name: 'Rizzardo Advocacia (AIO + orgânico)', host: null, source: 'mention' }] }), // limpa o parêntese
    obs({ mentioned: false, competitors: [{ name: 'Outro Desconhecido', host: null, source: 'mention' }] }), // não rastreado
  ];
  const ind = computeIndicators(list, { tracked });
  assertEquals(ind.sov.own, 1);
  assertEquals(ind.sov.competitors, 3); // Machado (obs 1), Machado (obs 2), Rizzardo (obs 3)
  assertEquals(ind.sov.n, 4);
  assertEquals(ind.sov.value, 1 / 4);
  // sem rastreados: SoV não existe (n/d), mesmo com menções próprias
  const none = computeIndicators(list);
  assertEquals(none.sov.value, null);
  assertEquals(none.sov.n, 0);
  // rastreados mas nenhuma menção de ninguém: null (0/0)
  assertEquals(computeIndicators([obs()], { tracked }).sov.value, null);
  // marca 0 e concorrente 2 → SoV 0 (não null)
  const zero = computeIndicators([obs({ competitors: [{ name: 'Machado Meyer', host: null, source: 'mention' }] }), obs({ competitors: [{ name: 'Machado Meyer', host: null, source: 'mention' }] })], { tracked });
  assertEquals(zero.sov.value, 0);
});

Deno.test("EST — 1 − 2·desvio padrão por grupo (pergunta × motor × mercado) com ao menos 2 repetições; média dos grupos", () => {
  assertAlmostEquals(stabilityOfGroup(0, 3), 1, 1e-12);
  assertAlmostEquals(stabilityOfGroup(3, 3), 1, 1e-12);
  assertAlmostEquals(stabilityOfGroup(1, 2), 0, 1e-12); // p=0,5: instabilidade máxima
  assertAlmostEquals(stabilityOfGroup(1, 4), 1 - Math.sqrt(0.75), 1e-12); // p=0,25: 1 − 2·sqrt(0,1875) = 0,1340
  // grupo A (q1/chatgpt, 2 reps, 1 menção) → 0 ; grupo B (q2/chatgpt, 2 reps, 2 menções) → 1 ; grupo C (q3, 1 só rep) é ignorado
  const list = [
    obs({ query: 'q1', mentioned: true }), obs({ query: 'q1', mentioned: false }),
    obs({ query: 'q2', mentioned: true }), obs({ query: 'q2', mentioned: true }),
    obs({ query: 'q3', mentioned: true }),
  ];
  const ind = computeIndicators(list);
  assertEquals(ind.est.n, 2);
  assertAlmostEquals(ind.est.value!, 0.5, 1e-12);
  // grupos em que a marca nunca aparece não contam (ausência constante não é estabilidade): EST segue n/d e o ZVI não é premiado
  const absent = [obs({ query: 'x', mentioned: false }), obs({ query: 'x', mentioned: false }), obs({ query: 'y', mentioned: false }), obs({ query: 'y', mentioned: false })];
  assertEquals(computeIndicators(absent).est, { value: null, n: 0 });
  assertAlmostEquals(summarizeVisibility(absent).zvi.value!, 0, 1e-9);
  // mesma pergunta em motores diferentes NÃO é repetição
  const diff = computeIndicators([obs({ query: 'q', engine: 'chatgpt' }), obs({ query: 'q', engine: 'gemini' })]);
  assertEquals(diff.est.value, null);
  assertEquals(diff.est.n, 0);
  // chatgpt_api e chatgpt_web são o mesmo motor (família)
  assertEquals(computeIndicators([obs({ query: 'q', engine: 'chatgpt_api', mentioned: true }), obs({ query: 'Q ', engine: 'chatgpt_web', mentioned: true })]).est.n, 1);
});

// ---------------------------------------------------------------------------
// Bootstrap determinístico
// ---------------------------------------------------------------------------
Deno.test("bootstrap — determinístico (mesma entrada e semente → mesmo intervalo); semente diferente muda; extremos colapsam", () => {
  const list = many(40, (i) => ({ mentioned: i % 4 === 0, cited: i % 8 === 0, query: `q${i % 10}` }));
  const a = bootstrapZvi(list)!;
  const b = bootstrapZvi(list)!;
  assertEquals(a, b);
  const c = bootstrapZvi(list, {}, 999)!;
  assert(c.low !== a.low || c.high !== a.high);
  const point = summarizeVisibility(list, { interval: false }).zvi.value!;
  const s = summarizeVisibility(list);
  assert(s.zvi.low! <= point && point <= s.zvi.high!);
  assert(s.zvi.high! - s.zvi.low! > 1); // com 40 observações existe incerteza
  assertEquals(summarizeVisibility(list), s); // idempotente
  // todas mencionadas e citadas → ZVI 100 e intervalo [100,100]
  const all = summarizeVisibility(many(12, { mentioned: true, cited: true }));
  assertAlmostEquals(all.zvi.value!, 100, 1e-9);
  assertAlmostEquals(all.zvi.low!, 100, 1e-9);
  assertAlmostEquals(all.zvi.high!, 100, 1e-9);
  // nenhuma → 0 e [0,0]
  const zero = summarizeVisibility(many(12, {}));
  assertAlmostEquals(zero.zvi.value!, 0, 1e-9);
  assertAlmostEquals(zero.zvi.high!, 0, 1e-9);
  assertEquals(bootstrapZvi([]), null);
  // n=1: intervalo existe e contém o ponto
  const one = summarizeVisibility([obs({ mentioned: true })]);
  assertEquals(one.zvi.confidence, 'baixa');
  assert(one.zvi.low! <= one.zvi.value! && one.zvi.value! <= one.zvi.high!);
  // interval:false pula o bootstrap
  assertEquals(summarizeVisibility(list, { interval: false }).zvi.low, null);
  // gerador conhecido: mesma semente → mesma sequência
  const r1 = mulberry32(7), r2 = mulberry32(7);
  assertEquals([r1(), r1(), r1()], [r2(), r2(), r2()]);
});

Deno.test("intervalo do ZVI estreita quando n cresce (mesma taxa)", () => {
  const small = summarizeVisibility(many(20, (i) => ({ mentioned: i % 2 === 0 })));
  const large = summarizeVisibility(many(400, (i) => ({ mentioned: i % 2 === 0 })));
  assert(large.zvi.high! - large.zvi.low! < small.zvi.high! - small.zvi.low!);
});

// ---------------------------------------------------------------------------
// Tipo de fonte
// ---------------------------------------------------------------------------
Deno.test("classifySourceType — regras do contrato (exemplos reais do banco)", () => {
  const cases: Array<[string, string]> = [
    ['cnj.jus.br', 'orgao_oficial'], ['www.planalto.gov.br', 'orgao_oficial'], ['gov.br', 'orgao_oficial'], ['stj.jus.br', 'orgao_oficial'], ['processo.stj.jus.br', 'orgao_oficial'],
    ['www2.oabsp.org.br', 'orgao_oficial'], ['consulta.oab.org.br', 'orgao_oficial'], ['oabsp.org.br', 'orgao_oficial'],
    ['defensoria.sp.def.br', 'orgao_oficial'], ['www2.camara.leg.br', 'orgao_oficial'], ['www12.senado.leg.br', 'orgao_oficial'], ['travel.state.gov', 'orgao_oficial'], ['br.usembassy.gov', 'orgao_oficial'],
    ['jusbrasil.com.br', 'portal_agregador'], ['www.migalhas.com.br', 'portal_agregador'], ['conjur.com.br', 'portal_agregador'], ['www.conjur.com.br', 'portal_agregador'], ['consultor-juridico.com.br', 'portal_agregador'],
    ['g1.globo.com', 'midia'], ['oglobo.globo.com', 'midia'], ['noticias.uol.com.br', 'midia'], ['www1.folha.uol.com.br', 'midia'], ['estadao.com.br', 'midia'], ['terra.com.br', 'midia'], ['cnnbrasil.com.br', 'midia'],
    ['instagram.com', 'rede_social'], ['www.youtube.com', 'rede_social'], ['youtu.be', 'rede_social'], ['facebook.com', 'rede_social'], ['br.linkedin.com', 'rede_social'], ['x.com', 'rede_social'],
    ['twitter.com', 'rede_social'], ['reddit.com', 'rede_social'], ['tiktok.com', 'rede_social'],
    ['unicamp.edu.br', 'academico'], ['scielo.br', 'academico'], ['www.scielo.org', 'academico'], ['usp.br', 'academico'], ['direito.usp.br', 'academico'],
    ['jesseconrado.adv.br', 'escritorio'], ['rdmadvogados.com.br', 'escritorio'], ['jlcadvogados.com.br', 'escritorio'], ['jsantosadvocacia.com.br', 'escritorio'], ['marcosviveiroadvocacia.com', 'escritorio'],
    ['conssanpaolo.esteri.it', 'orgao_oficial'], ['ambbrasilia.esteri.it', 'orgao_oficial'], ['gov.pt', 'orgao_oficial'], ['www.gob.mx', 'orgao_oficial'], ['br.usembassy.org', 'orgao_oficial'],
    ['paulomagalhaesadv.com', 'escritorio'], ['advocaciarainov.com.br', 'escritorio'],
    ['mattosfilho.com.br', 'outro'], ['legalcloud.com.br', 'outro'], ['example.org', 'outro'], ['', 'outro'], ['sijur.com.br', 'outro'], ['gabriel.com.br', 'outro'],
  ];
  for (const [host, type] of cases) assertEquals(classifySourceType(host), type, host);
  // não confunde `max.com` com x.com nem `terraform.io` com a mídia `terra`
  assertEquals(classifySourceType('max.com'), 'outro');
  assertEquals(classifySourceType('terraform.io'), 'outro');
  assertEquals(classifySourceType('goaback.com'), 'outro'); // "oab" só vale no início de um rótulo
  assertEquals(classifySourceType('adv.com'), 'outro'); // "adv" só vale em rótulo com mais de 5 letras
  assertEquals(classifySourceType('government.com'), 'outro');
});

// ---------------------------------------------------------------------------
// ZSS
// ---------------------------------------------------------------------------
const NOW = Date.parse('2026-12-12T12:00:00Z');
function cit(p: Partial<SourceCitation>): SourceCitation {
  return { obs_id: 'x', host: 'a.com', url: 'https://a.com/', engine: 'chatgpt', query: 'q1', topic: 'tema', position: 1, is_own: false, observed_at: '2026-11-12T12:00:00Z', brand_present: false, ...p };
}

Deno.test("ZSS — fórmula conferida à mão (cobertura, posição, diversidade, recência, relevância)", () => {
  // Fonte A: 2 perguntas de 4 (cobertura 0,5); posições 1 e 4 (média 1 e 0,25 = 0,625); 2 de 2 motores (1);
  // última citação há exatamente 30 dias (0,5); todas com tema alvo (1).
  // ZSS = 100·(0,40·0,5 + 0,25·0,625 + 0,20·1 + 0,10·0,5 + 0,05·1) = 100·(0,2+0,15625+0,2+0,05+0,05) = 65,625 → 65,6
  const list = [
    cit({ host: 'a.com', query: 'q1', engine: 'chatgpt', position: 1 }),
    cit({ host: 'a.com', query: 'q2', engine: 'gemini', position: 4 }),
  ];
  const [a] = computeSourceScores(list, { nowMs: NOW, totalQueries: 4, activeEngines: 2 });
  assertEquals(a.host, 'a.com');
  assertEquals(a.coverage, 0.5);
  assertEquals(a.position, 0.625);
  assertEquals(a.diversity, 1);
  assertEquals(a.recency, 0.5);
  assertEquals(a.relevance, 1);
  assertEquals(a.zss, 65.6);
  assertEquals(a.citations, 2);
  assertEquals(a.queries, 2);
  assertEquals(a.engines, ['chatgpt', 'gemini']);
  assertEquals(a.last_seen, '2026-11-12T12:00:00.000Z');
});

Deno.test("ZSS — bordas: citação recente (recência 1), muito antiga (≈0), posição ausente, tema fora do alvo, denominadores 0, host www e mesma pergunta repetida", () => {
  const nowIso = new Date(NOW).toISOString();
  const [fresh] = computeSourceScores([cit({ host: 'b.com', observed_at: nowIso })], { nowMs: NOW, totalQueries: 1, activeEngines: 1 });
  assertEquals(fresh.recency, 1);
  assertEquals(fresh.zss, 100); // cobertura 1, posição 1, diversidade 1, recência 1, relevância 1
  const [old] = computeSourceScores([cit({ host: 'c.com', observed_at: '2025-01-01T00:00:00Z' })], { nowMs: NOW, totalQueries: 1, activeEngines: 1 });
  assert(old.recency < 0.001);
  const [nopos] = computeSourceScores([cit({ host: 'd.com', position: null })], { nowMs: NOW, totalQueries: 1, activeEngines: 1 });
  assertEquals(nopos.position, 0);
  const [off] = computeSourceScores([cit({ host: 'e.com', topic: 'outro' })], { nowMs: NOW, totalQueries: 1, activeEngines: 1, targetTopics: new Set(['tema']) });
  assertEquals(off.relevance, 0);
  const [zero] = computeSourceScores([cit({ host: 'f.com' })], { nowMs: NOW, totalQueries: 0, activeEngines: 0 });
  assertEquals(zero.coverage, 0);
  assertEquals(zero.diversity, 0);
  // www é ignorado e a mesma pergunta repetida conta 1 vez na cobertura
  const [w] = computeSourceScores([cit({ host: 'WWW.G.com', query: 'Q1' }), cit({ host: 'g.com', query: 'q1 ' })], { nowMs: NOW, totalQueries: 2, activeEngines: 1 });
  assertEquals(w.host, 'g.com');
  assertEquals(w.queries, 1);
  assertEquals(w.coverage, 0.5);
  assertEquals(w.citations, 2);
  assertEquals(computeSourceScores([], { nowMs: NOW, totalQueries: 0, activeEngines: 0 }), []);
});

Deno.test("ZSS — ordenação (zss, citações, host), tipo e override de escritório (próprio e concorrente)", () => {
  const list = [
    cit({ host: 'b.com', query: 'q1' }), cit({ host: 'a.com', query: 'q1' }),
    cit({ host: 'mattosfilho.com.br', query: 'q2' }),
    cit({ host: 'meusite.com.br', query: 'q3', is_own: true }),
    cit({ host: 'cnj.jus.br', query: 'q1' }),
  ];
  const out = computeSourceScores(list, { nowMs: NOW, totalQueries: 3, activeEngines: 1, competitorDomains: ['mattosfilho.com.br'] });
  // empate total entre a.com, b.com e cnj.jus.br (mesma cobertura/posição/etc.): desempate por host
  const tie = out.filter((s) => ['a.com', 'b.com', 'cnj.jus.br'].includes(s.host)).map((s) => s.host);
  assertEquals(tie, ['a.com', 'b.com', 'cnj.jus.br']);
  assertEquals(out.find((s) => s.host === 'mattosfilho.com.br')!.type, 'escritorio'); // concorrente cadastrado
  assertEquals(out.find((s) => s.host === 'meusite.com.br')!.is_own, true);
  assertEquals(out.find((s) => s.host === 'meusite.com.br')!.type, 'escritorio');
  assertEquals(out.find((s) => s.host === 'cnj.jus.br')!.type, 'orgao_oficial');
  const sorted = [...out].sort((x, y) => y.zss - x.zss);
  assertEquals(out.map((s) => s.zss), sorted.map((s) => s.zss));
});

Deno.test("alvos de presença — fonte forte sem a marca; exclui própria, órgão oficial, concorrente e fonte onde a marca já aparece", () => {
  const list = [
    cit({ host: 'portal.com.br', query: 'q1', observed_at: new Date(NOW).toISOString() }),
    cit({ host: 'portal.com.br', query: 'q2', observed_at: new Date(NOW).toISOString(), engine: 'gemini' }),
    cit({ host: 'cnj.jus.br', query: 'q1', observed_at: new Date(NOW).toISOString() }),
    cit({ host: 'minha.com.br', query: 'q1', is_own: true, observed_at: new Date(NOW).toISOString() }),
    cit({ host: 'rival.com.br', query: 'q1', observed_at: new Date(NOW).toISOString() }),
    cit({ host: 'comigo.com.br', query: 'q1', observed_at: new Date(NOW).toISOString(), brand_present: true }),
    cit({ host: 'fraca.com.br', query: 'q3', position: 100, topic: null, observed_at: '2026-01-01T00:00:00Z' }), // ZSS ≈ 23,6 (< 25)
  ];
  const ctx = { nowMs: NOW, totalQueries: 3, activeEngines: 2, competitorDomains: ['rival.com.br'] };
  const sources = computeSourceScores(list, ctx);
  const t = selectTargets(sources, { competitorDomains: ctx.competitorDomains });
  assertEquals(t.map((x) => x.host), ['portal.com.br']);
  assert(t[0].why.includes('2 perguntas') && t[0].why.includes('2 motores'));
  assertEquals(selectTargets(sources, { minZss: 0, limit: 1, competitorDomains: ctx.competitorDomains }).length, 1);
  assertEquals(selectTargets([], {}), []);
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------
Deno.test("rankCompetitors — n >= 8: posições, SoV e empate (1, 2, 2, 4); n < 8: sem posição e com amostra insuficiente", () => {
  const rows = rankCompetitors({ own: { name: 'RDM', mentions: 3 }, competitors: [{ id: 'a', name: 'Alfa', mentions: 5 }, { id: 'b', name: 'Beta', mentions: 3 }, { id: 'c', name: 'Gama', mentions: 0 }], n: 10 });
  assertEquals(rows.map((r) => [r.name, r.rank]), [['Alfa', 1], ['Beta', 2], ['RDM', 2], ['Gama', 4]]);
  const own = rows.find((r) => r.is_own)!;
  assertEquals(own.vr, 0.3);
  assertAlmostEquals(own.sov!, 3 / 11, 1e-12); // 3 de 3+5+3+0
  assertEquals(rows.find((r) => r.name === 'Gama')!.sov, 0);
  assertEquals(rows.every((r) => r.n === 10 && !r.insufficient_sample), true);
  assertEquals(rows.find((r) => r.name === 'Alfa')!.id, 'a');
  // limite exato: n = 8 ranqueia; n = 7 não
  assertEquals(rankCompetitors({ own: { name: 'RDM', mentions: 1 }, competitors: [], n: MIN_RANK_N })[0].rank, 1);
  const few = rankCompetitors({ own: { name: 'RDM', mentions: 1 }, competitors: [{ name: 'Alfa', mentions: 2 }], n: 7 });
  assertEquals(few.map((r) => r.rank), [null, null]);
  assertEquals(few.every((r) => r.insufficient_sample), true);
  // ninguém mencionado: SoV nulo, todos empatados em 1
  const empty = rankCompetitors({ own: { name: 'RDM', mentions: 0 }, competitors: [{ name: 'Alfa', mentions: 0 }], n: 20 });
  assertEquals(empty.map((r) => r.sov), [null, null]);
  assertEquals(empty.map((r) => r.rank), [1, 1]);
  // n = 0
  assertEquals(rankCompetitors({ own: { name: 'RDM', mentions: 0 }, competitors: [], n: 0 })[0].vr, null);
});

// ---------------------------------------------------------------------------
// Marcas, domínios e sugestões
// ---------------------------------------------------------------------------
Deno.test("cleanBrandName / brandKey / normalizeDomain / nameMatchesHost", () => {
  assertEquals(cleanBrandName('Juliana Alves - Advogada Criminalista (Guarulhos)'), 'Juliana Alves - Advogada Criminalista');
  assertEquals(cleanBrandName('Rizzardo Advocacia (AIO + orgânico)'), 'Rizzardo Advocacia');
  assertEquals(brandKey('RDM Advogados Associados'), 'rdm');
  assertEquals(brandKey('Dr. Fábio Viana (São Paulo, via mapa)'), 'fabioviana');
  assertEquals(brandKey('TozziniFreire'), 'tozzinifreire');
  assertEquals(brandKey('Advocacia'), 'advocacia'); // só palavra genérica: não vira chave vazia
  assertEquals(normalizeDomain('https://www.Machado-Meyer.com.br/path?x=1'), 'machado-meyer.com.br');
  assertEquals(normalizeDomain('rdmadvogados.com.br'), 'rdmadvogados.com.br');
  assertEquals(normalizeDomain('http://x.com:8080/a'), 'x.com');
  for (const bad of ['', 'sem espaco.com', 'localhost', 'a@b.com', 'http://', '-a.com', 'a..com', 123, null, 'a'.repeat(300) + '.com']) assertEquals(normalizeDomain(bad as unknown), null, String(bad));
  assert(nameMatchesHost('Machado Meyer', 'www.machadomeyer.com.br'));
  assert(nameMatchesHost('JLC Advogados', 'jlcadvogados.com.br'));
  assert(nameMatchesHost('JLC Advogados (AIO + orgânico)', 'jlcadvogados.com.br'));
  assert(nameMatchesHost('Rizzardo Advocacia', 'rizzardo.com.br'));
  assert(nameMatchesHost('Felipe Alencar Criminalista', 'felipealencarcriminalista.com.br'));
  assert(nameMatchesHost('J. Santos Advocacia', 'jsantosadvocacia.com.br'));
  assertFalse(nameMatchesHost('Mattos Filho', 'machadomeyer.com.br'));
  assert(nameMatchesHost('RDM', 'rdm.com.br')); // rótulo de 3 letras já casa
  assertFalse(nameMatchesHost('AB', 'ab.com.br')); // rótulo de 2 letras é curto demais
});

Deno.test("classifyBrandName — nomes reais anotados pelo observador", () => {
  const cases: Array<[string, string]> = [
    ['Machado Meyer', 'escritorio'], ['Rizzardo Advocacia (AIO + orgânico)', 'escritorio'], ['Dr. Fabio Viana (São Paulo, via mapa)', 'advogado_individual'],
    ['Juliana Alves - Advogada Criminalista (Guarulhos)', 'advogado_individual'], ['Falivene Advogados - Advogado Criminalista (São Paulo, via mapa)', 'escritorio'],
    ['Instagram: Adib Abdouni, Gamil Föppel', 'rede_social'], ['YouTube: Prof. Diego Pureza', 'rede_social'], ['Jusbrasil (citado na AIO)', 'portal'],
    ['gabriel.com.br', 'dominio'], ['International Lawyer Brazil (guarda de crianças, fora do tema)', 'fora_do_tema'], ['Jurídico AI (concorrente editorial)', 'escritorio'],
    ['Tribunal de Justiça de São Paulo', 'oficial'], ['Defensoria Pública', 'oficial'],
  ];
  for (const [name, cls] of cases) assertEquals(classifyBrandName(name), cls, name);
});

Deno.test("suggestCompetitors — filtra a própria marca, redes, portais, domínios soltos e fora do tema; infere domínio; não repete rastreados", () => {
  const list = [
    obs({ id: 'a', engine: 'chatgpt', citations: [{ host: 'machadomeyer.com.br', url: 'https://machadomeyer.com.br/', position: 2, is_own: false }], competitors: [
      { name: 'Machado Meyer', host: null, source: 'mention' }, { name: 'Jusbrasil (citado na AIO)', host: null, source: 'mention' }, { name: 'gabriel.com.br', host: null, source: 'mention' },
      { name: 'Instagram: Fulano', host: null, source: 'mention' }, { name: 'RDM Advogados Associados', host: null, source: 'mention' }, { name: 'Alves Jacob (guarda de crianças, fora do tema)', host: null, source: 'mention' } ] }),
    obs({ id: 'b', engine: 'gemini', competitors: [{ name: 'Machado Meyer', host: null, source: 'mention' }, { name: 'Dr. Fabio Viana (São Paulo, via mapa)', host: null, source: 'mention' }, { name: 'Já Rastreado Advocacia', host: null, source: 'mention' }] }),
    obs({ id: 'c', engine: 'chatgpt', competitors: [{ name: 'Machado Meyer', host: null, source: 'mention' }] }),
  ];
  const s = suggestCompetitors(list, { ownAliases: ['RDM Advogados', 'rdmadvogados.com.br', 'Rândalos Madeira'], ownHosts: ['www.rdmadvogados.com.br'], known: [{ name: 'Já Rastreado Advocacia', domains: [] }] });
  assertEquals(s.map((x) => x.name), ['Machado Meyer', 'Dr. Fabio Viana']);
  assertEquals(s[0].mentions, 3);
  assertEquals(s[0].engines, ['chatgpt', 'gemini']);
  assertEquals(s[0].domain, 'machadomeyer.com.br');
  assertEquals(s[0].kind, 'escritorio');
  assertEquals(s[1].kind, 'advogado_individual');
  assertEquals(s[1].domain, null);
  assert(s[0].reason.includes('3 respostas') && s[0].reason.includes('2 motores'));
  assertEquals(suggestCompetitors([], { ownAliases: [], ownHosts: [], known: [] }), []);
  // um concorrente já rastreado por DOMÍNIO também some da lista
  const byDomain = suggestCompetitors(list, { ownAliases: [], ownHosts: [], known: [{ name: 'Outra Grafia', domains: ['machadomeyer.com.br'] }] });
  assertFalse(byDomain.some((x) => x.name === 'Machado Meyer'));
  assertEquals(suggestCompetitors(list, { ownAliases: [], ownHosts: [], known: [], limit: 1 }).length, 1);
});

// ---------------------------------------------------------------------------
// Perguntas, palavras-chave, oportunidades, mudanças
// ---------------------------------------------------------------------------
Deno.test("aggregateQuestions — total x válidas, VR por pergunta, motores e concorrentes", () => {
  const list = [
    obs({ query: 'q1', mentioned: true, observed_at: '2026-11-10T10:00:00Z', engine: 'chatgpt' }),
    obs({ query: 'q1', mentioned: false, observed_at: '2026-11-12T10:00:00Z', engine: 'gemini', competitors: [{ name: 'Alfa (AIO)', host: null, source: 'mention' }] }),
    obs({ query: 'q1', mentioned: true, personalization_risk: true, observed_at: '2026-11-11T10:00:00Z', engine: 'gemini' }), // fora do índice
    obs({ query: 'q2', mentioned: false, observed_at: '2026-11-13T10:00:00Z', topic: 'outro' }),
    obs({ query: null }),
  ];
  const q = aggregateQuestions(list);
  assertEquals(q.map((x) => x.query), ['q2', 'q1']); // mais recente primeiro
  const q1 = q.find((x) => x.query === 'q1')!;
  assertEquals([q1.observations, q1.n, q1.vr, q1.cr], [3, 2, 0.5, 0]);
  assertEquals(q1.engines, ['chatgpt', 'gemini']);
  assertEquals(q1.competitors, ['Alfa']);
  assertEquals(q1.last_observed_at, '2026-11-12T10:00:00Z');
  // pergunta só com observações excluídas: aparece, mas sem VR
  const onlyExcluded = aggregateQuestions([obs({ query: 'x', mentioned: true, personalization_risk: true })]);
  assertEquals([onlyExcluded[0].observations, onlyExcluded[0].n, onlyExcluded[0].vr], [1, 0, null]);
});

Deno.test("extractKeywords — stopwords PT, n-gramas 1 a 3, sem atravessar stopwords, contido no mais longo some, ordenação estável", () => {
  const prompts = [
    { query: 'Roubo de celular com simulacro de arma: qual é a pena em 2026?', observations: 2, valid: 2, mentioned: 0 },
    { query: 'Meu irmão foi preso em flagrante em Guarulhos. O que a família deve fazer?', observations: 1, valid: 1, mentioned: 0 },
    { query: 'Roubo de celular pena lei 15.397/2026', observations: 1, valid: 1, mentioned: 1 },
  ];
  const k = extractKeywords(prompts);
  const terms = k.map((x) => x.term);
  assert(terms.includes('roubo'));
  assert(terms.includes('celular'));
  assert(!terms.includes('de'));
  assert(!terms.includes('meu'));
  assertFalse(terms.some((t) => t.includes(' de ') || t.startsWith('de ') || t.endsWith(' de')));
  const roubo = k.find((x) => x.term === 'roubo')!; // "roubo de celular": o "de" separa os termos (n-gramas não atravessam stopwords)
  assertEquals(roubo.prompts, 2);
  assertEquals(roubo.observations, 3);
  assertEquals(roubo.valid, 3);
  assertAlmostEquals(roubo.vr!, 1 / 3, 1e-12);
  assertFalse(terms.includes('roubo celular'));
  // n-grama de 3 palavras ("celular pena lei") e termo contido no mais longo que cobre as mesmas perguntas some ("lei" só existe na pergunta 3)
  assert(terms.includes('celular pena lei'));
  assertFalse(terms.includes('lei'));
  assertFalse(terms.includes('celular pena'));
  assert(k.some((x) => x.size === 3));
  // ordenação: mais perguntas primeiro
  assert(k[0].prompts >= k[k.length - 1].prompts);
  // minPrompts e limit
  assert(extractKeywords(prompts, { minPrompts: 2 }).every((x) => x.prompts >= 2));
  assertEquals(extractKeywords(prompts, { limit: 2 }).length, 2);
  assertEquals(extractKeywords([]), []);
  assertEquals(extractKeywords([{ query: 'a de o', observations: 0, valid: 0, mentioned: 0 }]), []);
  // sem observações válidas: VR nulo (n/d)
  assertEquals(extractKeywords([{ query: 'habeas corpus', observations: 0, valid: 0, mentioned: 0 }])[0].vr, null);
  // "São Paulo" é um termo só; palavras de instrução do roteiro de coleta não viram tema
  const sp = extractKeywords([{ query: 'Minha empresa em São Paulo recebeu uma citação. Pesquise na web e cite links que você consultou.', observations: 1, valid: 1, mentioned: 0 }]).map((x) => x.term);
  assert(sp.some((t) => t.includes('são paulo')));
  assertFalse(sp.some((t) => /pesquise|cite|links|web/.test(t)));
  // determinismo
  assertEquals(extractKeywords(prompts), extractKeywords(prompts));
});

Deno.test("buildOpportunities — prioridade determinística, evidência, ordenação e limite", () => {
  const questions = aggregateQuestions([
    obs({ query: 'Pergunta com rival', mentioned: false, engine: 'chatgpt', competitors: [{ name: 'Alfa', host: null, source: 'mention' }] }),
    obs({ query: 'Pergunta isolada', mentioned: false }),
    obs({ query: 'Pergunta ok', mentioned: true }),
  ]);
  const items = buildOpportunities({
    questions,
    targets: [{ host: 'portal.com.br', type: 'portal_agregador', zss: 55, why: 'Citada em 3 perguntas.' }, { host: 'fraca.com.br', type: 'outro', zss: 26, why: 'x' }],
    own: { name: 'RDM', vr: 0.1, n: 20 },
    rivals: [{ name: 'Alfa', vr: 0.5, mentions: 10 }, { name: 'Beta', vr: 0.15, mentions: 3 }, { name: 'Gama', vr: 0.05, mentions: 1 }],
  });
  assertEquals(items.map((i) => i.kind + ':' + i.priority), [
    'pergunta_sem_marca:alta', 'concorrente_a_frente:alta', 'fonte_alvo:alta', 'pergunta_sem_marca:baixa', 'concorrente_a_frente:baixa', 'fonte_alvo:baixa',
  ]);
  assert(items.find((i) => i.title.includes('Pergunta com rival'))!.detail.includes('Alfa'));
  assertEquals((items.find((i) => i.kind === 'fonte_alvo')!.evidence as { host: string }).host, 'portal.com.br');
  // "Pergunta ok" (com menção) não vira oportunidade; Gama (VR menor) não aparece
  assertFalse(items.some((i) => i.title.includes('Pergunta ok') || i.title.includes('Gama')));
  // amostra pequena (n < 8): não compara concorrentes
  assertFalse(buildOpportunities({ questions: [], targets: [], own: { name: 'RDM', vr: 0, n: 7 }, rivals: [{ name: 'Alfa', vr: 0.9, mentions: 6 }] }).some((i) => i.kind === 'concorrente_a_frente'));
  assertEquals(buildOpportunities({ questions: [], targets: [], own: { name: 'RDM', vr: null, n: 0 }, rivals: [] }), []);
  assertEquals(buildOpportunities({ questions, targets: [], own: { name: 'RDM', vr: 0, n: 1 }, rivals: [], limit: 1 }).length, 1);
});

Deno.test("buildChanges — sem dados, sem comparação, subiu, caiu, estável, fontes novas, 1ª citação e observações desconsideradas", () => {
  const empty = summarizeVisibility([], { interval: false });
  assertEquals(buildChanges({ current: empty, previous: null, currentObs: [], previousObs: [] })[0].kind, 'sem_observacoes');
  const prevObs = many(10, (i) => ({ mentioned: i < 2, citations: [{ host: 'velha.com', url: 'u', position: 1, is_own: false }] }));
  const curObs = [...many(10, (i) => ({ mentioned: i < 5, citations: [{ host: 'nova.com', url: 'u', position: 1, is_own: false }, { host: 'velha.com', url: 'u', position: 2, is_own: false }] })), obs({ mentioned: true, personalization_risk: true }), obs({ cited: true, mentioned: true })];
  const cur = summarizeVisibility(curObs, { interval: false });
  const prev = summarizeVisibility(prevObs, { interval: false });
  const ch = buildChanges({ current: cur, previous: prev, currentObs: curObs, previousObs: prevObs });
  const kinds = ch.map((c) => c.kind);
  assert(kinds.includes('visibilidade_subiu'));
  assert(ch.find((c) => c.kind === 'visibilidade_subiu')!.text.includes('20%'));
  assert(kinds.includes('fontes_novas'));
  assert(ch.find((c) => c.kind === 'fontes_novas')!.text.includes('nova.com'));
  assertFalse(ch.find((c) => c.kind === 'fontes_novas')!.text.includes('velha.com'));
  assert(kinds.includes('primeira_citacao'));
  assert(kinds.includes('observacoes_desconsideradas'));
  // caiu / estável / sem comparação
  const down = buildChanges({ current: prev, previous: cur, currentObs: prevObs, previousObs: curObs });
  assert(down.some((c) => c.kind === 'visibilidade_caiu'));
  const same = buildChanges({ current: prev, previous: prev, currentObs: prevObs, previousObs: prevObs });
  assert(same.some((c) => c.kind === 'visibilidade_estavel'));
  assert(buildChanges({ current: cur, previous: null, currentObs: curObs, previousObs: [] }).some((c) => c.kind === 'sem_comparacao'));
});

Deno.test("motores — famílias, rótulos e expansão de filtro", () => {
  assertEquals(engineInfo('chatgpt_api'), { id: 'chatgpt', label: 'ChatGPT', kind: 'ia' });
  assertEquals(engineInfo('chatgpt'), { id: 'chatgpt', label: 'ChatGPT', kind: 'ia' });
  assertEquals(engineInfo('google_serp').id, 'google_search');
  assertEquals(engineInfo('google_search').kind, 'busca');
  assertEquals(engineInfo('serpapi_bing').id, 'bing_search');
  assertEquals(engineInfo('google_aio').kind, 'ia');
  assertEquals(engineInfo('novo_motor'), { id: 'novo_motor', label: 'novo_motor', kind: 'ia' });
  assertEquals(engineInfo(null).id, 'desconhecido');
  assertEquals(enginesFor('chatgpt').sort(), ['chatgpt', 'chatgpt_api', 'chatgpt_web']);
  assertEquals(enginesFor('google_serp').includes('google_search'), true);
  assertEquals(enginesFor('novo_motor'), ['novo_motor']);
  assertEquals(enginesFor(''), []);
});
