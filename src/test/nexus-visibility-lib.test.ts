import { describe, expect, it } from 'vitest';
import {
  chartAxis, confidenceNote, DEFAULT_METHOD_COMPONENTS, MIN_RANK_SAMPLE, SMALL_SAMPLE, competitorInputFromSuggestion, computeDelta, confidenceHint, confidenceLabel, effectiveConfidence,
  engineLabel, formatDateTime, formatPercent, formatRateInterval, formatSample, formatScore, formatZvi, formatZviInterval, hasTrendData, intentLabel,
  isManagerRequiredError, missingLabel, normalizeCompetitors, normalizeDomain, normalizeHistory, normalizeKeywords, normalizeMethodology, normalizeOpportunities,
  normalizeOverview, normalizeQuestions, normalizeSavedCompetitor, normalizeSources, opportunityKindLabel, parseDays, parseDomains, priorityLabel, safeHttpUrl,
  sourceTypeLabel, sparkValues, suggestionRequestMessage, trendChartData, validateCompetitorForm, visibilityErrorMessage,
} from '@/lib/nexus-visibility';

const FULL = {
  method: { version: 'zvi-1', label: 'Zica Visibility Index (zvi-1)' },
  period: { from: '2026-10-16', to: '2026-11-13' },
  n_observations: 20,
  zvi: { value: 41.6, low: 30, high: 55, partial: true, missing: ['pm', 'rep'], confidence: 'baixa' },
  indicators: { vr: { value: 0.35, low: 0.18, high: 0.57, n: 20 }, cr: { value: 0.2, n: 20 }, sov: { value: 0.4, n: 20 }, est: { value: 0.8, n: 6 }, pm: null, rep: null },
  previous: { zvi: 38, vr: 0.3, cr: 0.1 },
  by_engine: [{ engine: 'gemini', label: 'Gemini', vr: 0.5, cr: 0.2, n: 5 }, { engine: 'chatgpt', label: 'ChatGPT', vr: 0.3, cr: 0.1, n: 15 }],
  trend: [{ day: '2026-11-02', vr: 0.5, cr: 0, n: 2 }, { day: '2026-11-01', vr: 0, cr: 0, n: 0 }, { day: '2026-11-03', vr: 0.25, cr: 0.25, n: 4 }],
  changes: [{ kind: 'up', text: 'A visibilidade subiu.' }, { kind: 'x', text: '' }],
  result: { ga4: { sessions: 100, ai_sessions: 7, key_events: 3 }, gsc: { clicks: 12, impressions: 340 } },
  generated_at: '2026-11-13T12:00:00Z',
};

describe('normalizeOverview', () => {
  it('lê o envelope completo e ordena motores por amostra e a tendência por dia', () => {
    const o = normalizeOverview(FULL);
    expect(o.zvi).toMatchObject({ value: 41.6, low: 30, high: 55, partial: true, missing: ['pm', 'rep'], confidence: 'baixa' });
    expect(o.indicators.vr).toEqual({ value: 0.35, low: 0.18, high: 0.57, n: 20 });
    expect(o.indicators.pm).toBeNull();
    expect(o.indicators.rep).toBeNull();
    expect(o.by_engine.map((e) => e.engine)).toEqual(['chatgpt', 'gemini']);
    expect(o.trend.map((t) => t.day)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(o.changes).toEqual([{ kind: 'up', text: 'A visibilidade subiu.' }]);
    expect(o.previous).toEqual({ zvi: 38, vr: 0.3, cr: 0.1, n: null });
    expect(o.result.ga4).toEqual({ sessions: 100, ai_sessions: 7, key_events: 3 });
  });

  it('nunca quebra com lixo, vazio ou campos ausentes e assume o caso restritivo (parcial, baixa confiança)', () => {
    for (const raw of [undefined, null, 'x', 42, [], {}, { zvi: 'a', indicators: 5, by_engine: 'b', trend: [null, 3] }]) {
      const o = normalizeOverview(raw);
      expect(o.n_observations).toBe(0);
      expect(o.zvi.value).toBeNull();
      expect(o.zvi.partial).toBe(true);
      expect(o.zvi.confidence).toBe('baixa');
      expect(o.indicators.vr.value).toBeNull();
      expect(o.by_engine).toEqual([]);
      expect(o.trend).toEqual([]);
      expect(o.previous).toBeNull();
      expect(o.result).toEqual({ ga4: null, gsc: null });
      expect(o.method.version).toBe('zvi-1');
    }
  });

  it('aceita percentual 0 a 100 no grupo inteiro (divide por 100) e corta o que passar do limite', () => {
    const o = normalizeOverview({ indicators: { vr: { value: 35, low: 18, high: 57, n: 20 }, cr: { value: 250, n: 3 } }, previous: { zvi: 300, vr: 30, cr: 10 } });
    expect(o.indicators.vr).toEqual({ value: 0.35, low: 0.18, high: 0.57, n: 20 });
    expect(o.indicators.cr.value).toBe(1);
    expect(o.previous).toEqual({ zvi: 100, vr: 0.3, cr: 0.1, n: null });
  });

  it('previous aceita número solto ou objeto com value', () => {
    expect(normalizeOverview({ previous: { zvi: { value: 10 }, vr: { value: 0.2 }, cr: null } }).previous).toEqual({ zvi: 10, vr: 0.2, cr: null, n: null });
    expect(normalizeOverview({ previous: { zvi: 10, vr: 0.2, cr: 0, n: 7.4 } }).previous?.n).toBe(7);
    expect(normalizeOverview({ previous: { zvi: null, vr: null, cr: null } }).previous).toBeNull();
  });

  it('o papel do servidor só entra como dica restritiva', () => {
    expect(normalizeOverview({ viewer: { can_manage_technical: false } }).viewer_can_manage).toBe(false);
    expect(normalizeOverview({}).viewer_can_manage).toBeNull();
  });

  it('texto vem como texto (sem HTML interpretado) e truncated só com true', () => {
    const o = normalizeOverview({ changes: [{ kind: 'info', text: '<img src=x onerror=alert(1)>' }], truncated: 'sim' });
    expect(o.changes[0].text).toBe('<img src=x onerror=alert(1)>');
    expect(o.truncated).toBe(false);
    expect(normalizeOverview({ truncated: true }).truncated).toBe(true);
  });
});

describe('outros normalizadores', () => {
  it('fontes: tipo desconhecido vira outro, ordena por nota e exige host', () => {
    const s = normalizeSources({ sources: [{ host: 'A.com', type: 'midia', zss: 40 }, { host: 'b.com', type: 'zzz', zss: 77.5, engines: ['gemini', ''], is_own: true }, { type: 'midia' }, { host: 'c.com', zss: 500 }], targets: [{ host: 'g1.globo.com', type: 'midia', zss: 80, why: 'Citada 5 vezes' }, { type: 'x' }] });
    expect(s.sources.map((x) => x.host)).toEqual(['c.com', 'b.com', 'a.com']);
    expect(s.sources[0].zss).toBe(100);
    expect(s.sources[1]).toMatchObject({ type: 'outro', is_own: true, engines: ['gemini'] });
    expect(s.targets).toEqual([{ host: 'g1.globo.com', type: 'midia', zss: 80, why: 'Citada 5 vezes' }]);
    expect(normalizeSources(null).sources).toEqual([]);
  });

  it('concorrentes: preserva o ranking do servidor e converte percentuais', () => {
    const c = normalizeCompetitors({
      tracked: [{ id: 'c1', name: 'Alfa', domains: ['alfa.adv.br'], kind: 'escritorio', vr: 20, sov: 0.1, mentions: 4, n: 12, insufficient_sample: false }, { name: 'sem id' }],
      suggested: [{ name: 'Beta', domain: 'BETA.com.br', mentions: 3, engines: ['chatgpt'], reason: 'Citado 3 vezes' }, { domain: 'x.com' }],
      own: { vr: 0.35, sov: 0.5, n: 20 },
      ranking: [{ rank: 1, name: 'Marca', is_own: true, vr: 0.35, sov: 0.5, n: 20, insufficient_sample: false }, { rank: null, name: 'Alfa', vr: 0.2, sov: 0.1, n: 3, insufficient_sample: true }],
    });
    expect(c.tracked).toHaveLength(1);
    expect(c.tracked[0]).toMatchObject({ id: 'c1', vr: 0.2, kind: 'escritorio', status: 'tracked' });
    expect(c.suggested).toEqual([{ name: 'Beta', domain: 'beta.com.br', mentions: 3, engines: ['chatgpt'], reason: 'Citado 3 vezes' }]);
    expect(c.ranking[1]).toMatchObject({ rank: null, insufficient_sample: true });
    expect(normalizeCompetitors(undefined)).toMatchObject({ tracked: [], suggested: [], ranking: [], own: { vr: null, sov: null, n: 0 } });
  });

  it('competidor salvo aceita o envelope { competitor }', () => {
    expect(normalizeSavedCompetitor({ competitor: { id: 'x', name: 'Alfa', domains: ['alfa.com'], kind: 'portal', status: 'tracked' } })).toEqual({ id: 'x', name: 'Alfa', domains: ['alfa.com'], kind: 'portal', status: 'tracked' });
    expect(normalizeSavedCompetitor({})).toBeNull();
  });

  it('perguntas e histórico', () => {
    const q = normalizeQuestions({ total: 3, questions: [{ query: 'Como pedir indenização?', topic: 'consumidor', observations: 4, vr: 0.5, cr: 0, last_observed_at: '2026-11-12T10:00:00Z', engines: ['chatgpt'] }, { topic: 'sem pergunta' }] });
    expect(q.total).toBe(3);
    expect(q.questions).toHaveLength(1);
    expect(normalizeQuestions({ questions: [{ query: 'a' }, { query: 'b' }] }).total).toBe(2);
    const h = normalizeHistory({ query: 'a', items: [
      { observed_at: '2026-11-10T10:00:00Z', engine: 'gemini', mentioned: true, cited: false, position: 2, brands: ['X'], sources: [{ host: 'a.com', url: 'https://a.com/x' }, {}], response_excerpt: 'Texto' },
      { observed_at: '2026-11-12T10:00:00Z', engine: 'chatgpt', mentioned: false, cited: false, response_excerpt: '' },
    ] });
    expect(h.items.map((i) => i.engine)).toEqual(['chatgpt', 'gemini']);
    expect(h.items[0].response_excerpt).toBeNull();
    expect(h.items[1].sources).toEqual([{ host: 'a.com', url: 'https://a.com/x' }]);
  });

  it('palavras-chave', () => {
    expect(normalizeKeywords({ keywords: [{ term: 'cnh', prompts: 4, observations: 8, vr: 0.25 }, { prompts: 1 }] })).toEqual([{ term: 'cnh', prompts: 4, observations: 8, vr: 0.25 }]);
    expect(normalizeKeywords(null)).toEqual([]);
  });

  it('oportunidades: ordena por prioridade e formata a evidência sem inventar', () => {
    const items = normalizeOpportunities({ items: [
      { kind: 'fonte_alvo', title: 'Ganhar presença no g1', detail: 'd', priority: 'baixa', evidence: { host: 'g1.globo.com', zss: 81.234, citations: 7, vr: 0.4, nested: { a: 1 }, engines: ['chatgpt', 'gemini'] } },
      { kind: 'pergunta_sem_marca', title: 'Pergunta X', priority: 'alta', evidence: { query: 'Pergunta X', observations: 3 } },
      { kind: 'concorrente_a_frente', priority: 'media' },
    ] });
    expect(items.map((i) => i.priority)).toEqual(['alta', 'baixa']);
    const fonte = items[1];
    expect(fonte.evidence).toContainEqual({ label: 'Fonte', value: 'g1.globo.com' });
    expect(fonte.evidence).toContainEqual({ label: 'Nota da fonte', value: '81,2' });
    expect(fonte.evidence).toContainEqual({ label: 'Visibilidade', value: '40%' });
    expect(fonte.evidence).toContainEqual({ label: 'IAs', value: 'chatgpt, gemini' });
    expect(fonte.evidence.find((e) => e.label === 'nested')).toBeUndefined();
  });

  it('metodologia: sem componentes do servidor usa o padrão zvi-1 e avisa; com servidor, usa o dele', () => {
    const d = normalizeMethodology(undefined);
    expect(d.fromServer).toBe(false);
    expect(d.components).toHaveLength(DEFAULT_METHOD_COMPONENTS.length);
    expect(d.components.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1, 10);
    const s = normalizeMethodology({ version: 'zvi-1.1', components: [{ id: 'vr', label: 'VR', weight: 35, description: 'x' }], notes: ['n1'] });
    expect(s).toMatchObject({ fromServer: true, version: 'zvi-1.1', notes: ['n1'] });
    expect(s.components[0].weight).toBe(0.35);
  });
});

describe('confiança', () => {
  it('nunca é mais otimista que o servidor nem que a regra local (n<30 = baixa; n=0 = sem dados)', () => {
    expect(effectiveConfidence('alta', 0)).toBe('sem_dados');
    expect(effectiveConfidence('alta', 1)).toBe('baixa');
    expect(effectiveConfidence('alta', SMALL_SAMPLE - 1)).toBe('baixa');
    expect(effectiveConfidence('alta', SMALL_SAMPLE)).toBe('alta');
    expect(effectiveConfidence('media', 500)).toBe('media');
    expect(effectiveConfidence('baixa', 500)).toBe('baixa');
    expect(effectiveConfidence('sem_dados', 500)).toBe('sem_dados');
  });
  it('rótulos e dicas em português', () => {
    expect(confidenceLabel('baixa')).toBe('Baixa confiança');
    expect(confidenceLabel('sem_dados')).toBe('Sem dados');
    expect(confidenceHint('baixa', 1)).toContain('1 observação');
    expect(confidenceHint('baixa', 12)).toContain('12 observações');
    expect(confidenceHint('sem_dados', 0)).toContain('Ainda não há observações');
  });
  it('limiares do método', () => { expect(SMALL_SAMPLE).toBe(30); expect(MIN_RANK_SAMPLE).toBe(8); });
});

describe('formatação', () => {
  it('ZVI inteiro, taxa em %, intervalos e amostra; sem dado vira n/d', () => {
    expect(formatZvi(41.6)).toBe('42');
    expect(formatZvi(null)).toBe('n/d');
    expect(formatPercent(0.355)).toBe('35,5%');
    expect(formatPercent(null)).toBe('n/d');
    expect(formatZviInterval(30.2, 54.7)).toBe('entre 30 e 55');
    expect(formatZviInterval(null, 5)).toBe('intervalo n/d');
    expect(formatRateInterval(0.18, 0.57)).toBe('entre 18% e 57%');
    expect(formatSample(1)).toBe('1 observação');
    expect(formatSample(1500)).toBe('1.500 observações');
    expect(formatScore(72.4)).toBe('72');
    expect(formatScore(undefined)).toBe('n/d');
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('lixo')).toBe('—');
  });

  it('variação: ZVI em pontos, taxa em pontos percentuais, estável abaixo de 0,5', () => {
    expect(computeDelta(41.6, 38, 'pts')).toMatchObject({ direction: 'up', label: '+3,6 pts' });
    expect(computeDelta(30, 38, 'pts')).toMatchObject({ direction: 'down', label: '−8 pts' });
    expect(computeDelta(0.35, 0.3, 'pp')).toMatchObject({ direction: 'up', label: '+5 p.p.' });
    expect(computeDelta(0.1, 0.3, 'pp')?.spoken).toContain('Caiu 20 pontos percentuais');
    expect(computeDelta(0.302, 0.3, 'pp')).toMatchObject({ direction: 'flat', label: 'estável' });
    expect(computeDelta(10, 10, 'pts')?.direction).toBe('flat');
    expect(computeDelta(10, null, 'pts')).toBeNull();
    expect(computeDelta(null, 10, 'pts')).toBeNull();
    expect(computeDelta(NaN, 10, 'pts')).toBeNull();
  });
});

describe('rótulos', () => {
  it('motores, tipos, oportunidades, intenção, ausentes', () => {
    expect(engineLabel('chatgpt')).toBe('ChatGPT');
    expect(engineLabel('GOOGLE_AIO')).toBe('Google (visão geral por IA)');
    expect(engineLabel('motor_novo')).toBe('Motor novo');
    expect(engineLabel('')).toBe('Não informado');
    expect(sourceTypeLabel('orgao_oficial')).toBe('Órgão oficial');
    expect(opportunityKindLabel('fonte_alvo')).toBe('Fonte para ganhar presença');
    expect(priorityLabel('alta')).toBe('Prioridade alta');
    expect(intentLabel('commercial')).toBe('Comparação');
    expect(intentLabel(null)).toBe('—');
    expect(missingLabel('pm')).toBe('Posição de menção');
    expect(missingLabel('xyz')).toBe('xyz');
  });
});

describe('períodos e séries', () => {
  it('período só aceita 7, 28 ou 90 (padrão 28)', () => {
    expect(parseDays('7')).toBe(7); expect(parseDays('90')).toBe(90);
    expect(parseDays('15')).toBe(28); expect(parseDays(null)).toBe(28); expect(parseDays('abc')).toBe(28);
  });
  it('dia sem observação vira lacuna, nunca zero', () => {
    const o = normalizeOverview(FULL);
    const data = trendChartData(o.trend);
    expect(data.map((d) => d.vr)).toEqual([null, 50, 25]);
    expect(sparkValues(o.trend, 'vr')).toEqual([null, 0.5, 0.25]);
    expect(hasTrendData(o.trend)).toBe(true);
    expect(hasTrendData([{ day: '2026-11-01', vr: 0, cr: 0, n: 0 }])).toBe(false);
  });
});

describe('eixo do gráfico', () => {
  it('passo redondo, no máximo 5 faixas, teto 100', () => {
    expect(chartAxis(0)).toEqual({ max: 4, ticks: [0, 2, 4] });
    expect(chartAxis(18)).toEqual({ max: 20, ticks: [0, 5, 10, 15, 20] });
    expect(chartAxis(50)).toEqual({ max: 50, ticks: [0, 10, 20, 30, 40, 50] });
    expect(chartAxis(53.4)).toEqual({ max: 60, ticks: [0, 20, 40, 60] });
    expect(chartAxis(100)).toEqual({ max: 100, ticks: [0, 20, 40, 60, 80, 100] });
    expect(chartAxis(NaN).max).toBe(4);
    expect(confidenceNote('baixa')).toContain('pista');
  });
});

describe('segurança de links', () => {
  it('só http e https viram link', () => {
    expect(safeHttpUrl('https://exemplo.com/a?b=1')).toBe('https://exemplo.com/a?b=1');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,x')).toBeNull();
    expect(safeHttpUrl('//exemplo.com')).toBeNull();
    expect(safeHttpUrl('')).toBeNull();
  });
});

describe('formulário de concorrente', () => {
  it('normaliza domínio: sem protocolo, caminho, www, porta; minúsculas', () => {
    expect(normalizeDomain('https://www.Exemplo.com.br/pagina?x=1')).toBe('exemplo.com.br');
    expect(normalizeDomain('  EXEMPLO.adv.br:8080/x ')).toBe('exemplo.adv.br');
    expect(normalizeDomain('exemplo')).toBeNull();
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('a b.com')).toBeNull();
    expect(normalizeDomain('javascript:alert(1)')).toBeNull();
  });
  it('separa por vírgula/espaço, remove duplicados e lista inválidos', () => {
    expect(parseDomains('a.com, www.a.com; b.com.br  c')).toEqual({ domains: ['a.com', 'b.com.br'], invalid: ['c'] });
  });
  it('valida nome (2 a 160) e domínios (máx. 10)', () => {
    expect(validateCompetitorForm({ name: 'A', domainsText: '' }).errors.name).toContain('mínimo 2');
    expect(validateCompetitorForm({ name: 'x'.repeat(161), domainsText: '' }).errors.name).toContain('160');
    expect(validateCompetitorForm({ name: 'Alfa', domainsText: 'zzz' }).errors.domains).toContain('zzz');
    const many = Array.from({ length: 11 }, (_, i) => `d${i}.com`).join(',');
    expect(validateCompetitorForm({ name: 'Alfa', domainsText: many }).errors.domains).toContain('10');
    expect(validateCompetitorForm({ name: ' Alfa ', domainsText: 'https://alfa.com.br/x' })).toMatchObject({ ok: true, domains: ['alfa.com.br'] });
    expect(validateCompetitorForm({ name: 'Alfa', domainsText: '' }).ok).toBe(true);
  });
  it('aprovar uma sugestão cria um concorrente acompanhado; o cliente pede por solicitação', () => {
    const s = { name: 'Beta', domain: 'BETA.com.br', mentions: 3, engines: [], reason: '' };
    expect(competitorInputFromSuggestion(s)).toEqual({ name: 'Beta', domains: ['beta.com.br'], kind: 'escritorio', status: 'tracked' });
    expect(competitorInputFromSuggestion({ ...s, domain: '' }).domains).toEqual([]);
    expect(suggestionRequestMessage(s)).toContain('Beta');
    expect(suggestionRequestMessage(s)).toContain('BETA.com.br');
  });
});

describe('erros em linguagem simples', () => {
  it('traduz códigos do servidor e nunca vaza código cru', () => {
    expect(visibilityErrorMessage(new Error('manager_required'))).toContain('Só o gestor');
    expect(visibilityErrorMessage(new Error('409'))).toContain('Já existe');
    expect(visibilityErrorMessage(new Error('429'))).toContain('Muitas consultas');
    expect(visibilityErrorMessage(new Error('500'))).toContain('servidor não respondeu');
    expect(visibilityErrorMessage(new Error('algum_codigo_interno'))).not.toContain('algum_codigo_interno');
    expect(visibilityErrorMessage(undefined)).toContain('Tente de novo');
    expect(visibilityErrorMessage('Mensagem já amigável.')).toBe('Mensagem já amigável.');
    expect(isManagerRequiredError(new Error('manager_required'))).toBe(true);
    expect(isManagerRequiredError(new Error('x'))).toBe(false);
  });
});
