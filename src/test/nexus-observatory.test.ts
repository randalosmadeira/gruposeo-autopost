import { describe, it, expect } from 'vitest';
import {
  buildEngineCountryMatrix, buildSignalsSnippet, deriveGaps, filterSummary, formatRate, gapKey, gapToPauta,
  parseCitationLines, parseCompetitorLines, parseMarkets, rangeForDays, summaryToKpis,
} from '@/lib/nexus-observatory';
import type { NexusObservatorySummary } from '@/types/nexus-observatory';

// Fixture realista: 21 operações, 17 válidas, escritório com 0 citações, concorrentes e entidades públicas.
const fixture: NexusObservatorySummary = {
  period: { from: '2026-10-13', to: '2026-11-12' },
  totals: { operations: 21, valid: 17, mention_rate: 0, citation_rate: 0, own_citations: 0, competitor_mentions: 34, share_of_voice: 0 },
  by_engine: [
    { engine: 'chatgpt_web', valid: 7, mentioned: 0, cited: 0 },
    { engine: 'gemini_web', valid: 6, mentioned: 0, cited: 0 },
    { engine: 'google_serp', valid: 4, mentioned: 0, cited: 0 },
  ],
  by_country: [
    { country: 'br', valid: 9, mentioned: 0, cited: 0 },
    { country: 'us', valid: 8, mentioned: 0, cited: 0 },
  ],
  by_topic: [
    { topic: 'custodia', intent: 'international', valid: 4, mentioned: 0, cited: 0, competitors: ['CNJ', 'Defensoria'] },
    { topic: 'habeas-corpus', intent: 'informational', valid: 3, mentioned: 0, cited: 0, competitors: ['Mattos Filho'] },
    { topic: 'marca', intent: 'branded', valid: 2, mentioned: 1, cited: 1, competitors: [] },
  ],
  trend: [{ day: '2026-11-12', valid: 17, mentioned: 0, cited: 0 }],
  top_competitors: [
    { name: 'Fernandes & Magalhães', host: null, mentions: 3, engines: ['chatgpt_web', 'gemini_web'] },
    { name: 'Mattos Filho', host: 'mattosfilho.com.br', mentions: 2, engines: ['chatgpt_web'] },
    { name: 'CNJ', host: 'cnj.jus.br', mentions: 9, engines: ['google_serp'] },
  ],
  own_urls: [],
  signals: { ai_bot_hits: 0, ai_referrals: 0, search_referrals: 0, by_agent: [], by_path: [], last_batch_at: null },
};

describe('formatRate', () => {
  it('formata em pt-BR e distingue não medido de zero', () => {
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(0.125)).toBe('12,5%');
    expect(formatRate(1)).toBe('100%');
    expect(formatRate(null)).toBe('—');
    expect(formatRate(undefined)).toBe('—');
    expect(formatRate(Number.NaN)).toBe('—');
  });
});

describe('summaryToKpis', () => {
  it('mapeia os seis indicadores do contrato com rodapé de evidência', () => {
    const kpis = summaryToKpis(fixture);
    expect(kpis.map((k) => k.id)).toEqual(['valid', 'mention_rate', 'citation_rate', 'share_of_voice', 'ai_referrals', 'ai_bot_hits']);
    expect(kpis[0]).toMatchObject({ value: '17', footnote: 'de 21 operações no período' });
    expect(kpis[1]).toMatchObject({ value: '0%', footnote: 'observado em 17 operações' });
    expect(kpis[3].footnote).toContain('34 menções a concorrentes');
    expect(kpis[4]).toMatchObject({ value: '—', footnote: 'sem dados' });
  });
  it('resumo ausente ou sem validação vira "sem dados", não zero', () => {
    const kpis = summaryToKpis(undefined);
    expect(kpis[1]).toMatchObject({ value: '—', footnote: 'sem dados' });
    const none = summaryToKpis({ ...fixture, totals: { ...fixture.totals, operations: 0, valid: 0, mention_rate: null, citation_rate: null, share_of_voice: null } });
    expect(none[2].value).toBe('—');
  });
  it('mostra sinais quando o site já enviou lote', () => {
    const k = summaryToKpis({ ...fixture, signals: { ...fixture.signals, ai_referrals: 12, ai_bot_hits: 340, last_batch_at: '2026-11-12T10:00:00Z' } });
    expect(k[4].value).toBe('12');
    expect(k[5].value).toBe('340');
  });
});

describe('buildEngineCountryMatrix', () => {
  it('sem cruzamento do backend, devolve totais por motor e por país', () => {
    const m = buildEngineCountryMatrix(fixture);
    expect(m.crossAvailable).toBe(false);
    expect(m.rows.map((r) => r.engine)).toEqual(['chatgpt_web', 'gemini_web', 'google_serp']);
    expect(m.rows[0].total).toMatchObject({ valid: 7, cited: 0, citationRate: 0 });
    expect(m.countryTotals.br.valid).toBe(9);
  });
  it('com by_engine_country monta a matriz cruzada e deixa células ausentes nulas', () => {
    const m = buildEngineCountryMatrix({
      ...fixture,
      by_engine_country: [
        { engine: 'chatgpt_web', country: 'br', valid: 4, mentioned: 1, cited: 1 },
        { engine: 'chatgpt_web', country: 'us', valid: 3, mentioned: 0, cited: 0 },
        { engine: 'gemini_web', country: 'br', valid: 6, mentioned: 0, cited: 0 },
      ],
    });
    expect(m.crossAvailable).toBe(true);
    expect(m.countries).toEqual(['br', 'us']);
    expect(m.rows[0].cells.br?.citationRate).toBe(0.25);
    expect(m.rows[1].cells.us).toBeNull();
  });
  it('resumo vazio não quebra', () => {
    expect(buildEngineCountryMatrix(undefined).rows).toEqual([]);
  });
});

describe('deriveGaps', () => {
  it('prefere as lacunas do backend, ordenadas por concorrentes', () => {
    const gaps = deriveGaps({
      ...fixture,
      gaps: [
        { topic: 'a', intent: 'discovery', query: 'q a', country: 'br', engines_missing: ['chatgpt_web'], competitors: ['X'] },
        { topic: 'b', intent: 'discovery', query: 'q b', country: 'us', engines_missing: ['chatgpt_web'], competitors: ['X', 'Y', 'CNJ'] },
      ],
    });
    expect(gaps.map((g) => g.topic)).toEqual(['b', 'a']);
  });
  it('deriva de by_topic quando o backend não traz gaps: só tópicos sem citação própria', () => {
    const gaps = deriveGaps(fixture);
    expect(gaps.map((g) => g.topic)).toEqual(['custodia', 'habeas-corpus']);
    expect(gaps[0].competitors).toEqual(['CNJ', 'Defensoria']);
    expect(gaps[0].engines_missing).toEqual(['chatgpt_web', 'gemini_web', 'google_serp']);
    expect(gaps[0].country).toBe(''); // dois países: a derivação não inventa um
  });
  it('respeita o limite e trata resumo vazio', () => {
    expect(deriveGaps(fixture, 1)).toHaveLength(1);
    expect(deriveGaps(undefined)).toEqual([]);
  });
});

describe('gapKey e gapToPauta', () => {
  const gap = { topic: 'custodia', intent: 'international', query: 'Custódia de menor entre Brasil e EUA', country: 'us', engines_missing: ['chatgpt_web'], competitors: ['CNJ'] };
  it('gapKey é estável e distingue países', () => {
    expect(gapKey(gap)).toBe(gapKey({ ...gap }));
    expect(gapKey(gap)).not.toBe(gapKey({ ...gap, country: 'br' }));
    expect(gapKey(gap)).toMatch(/^g[a-z0-9]+$/);
  });
  it('converte em pauta validada e guarda a origem', () => {
    expect(gapToPauta(gap)).toEqual({
      keyword: 'custodia', title: 'Custódia de menor entre Brasil e EUA',
      nexusGap: { query: gap.query, country: 'us', engines_missing: ['chatgpt_web'] },
    });
    expect(gapToPauta({ ...gap, topic: '123', query: '456' })).toBeNull();
  });
});

describe('buildSignalsSnippet', () => {
  it('monta a tag com origem do app, site e endpoint, sem barra dupla', () => {
    expect(buildSignalsSnippet('abc123def456', 'https://x.supabase.co/functions/v1/zica-signals', 'https://app.zica.ai/'))
      .toBe('<script src="https://app.zica.ai/zica-signals.js" data-site="abc123def456" data-endpoint="https://x.supabase.co/functions/v1/zica-signals" defer></script>');
  });
  it('escapa atributos', () => {
    expect(buildSignalsSnippet('a"b', 'https://x/?a=1&b=2', 'https://app')).toContain('data-site="a&quot;b"');
  });
});

describe('parsers de formulário', () => {
  it('citações: separa URL e título, conta inválidas', () => {
    const r = parseCitationLines('https://cnj.jus.br/x | CNJ\n\nnao-e-url\nhttps://a.com');
    expect(r.items).toEqual([{ url: 'https://cnj.jus.br/x', title: 'CNJ' }, { url: 'https://a.com' }]);
    expect(r.invalid).toBe(1);
  });
  it('concorrentes: nome e host normalizado', () => {
    expect(parseCompetitorLines('Fernandes & Magalhães\nMattos Filho | https://www.mattosfilho.com.br/')).toEqual([
      { name: 'Fernandes & Magalhães' }, { name: 'Mattos Filho', host: 'mattosfilho.com.br' },
    ]);
  });
  it('mercados', () => {
    expect(parseMarkets('BR:pt-BR, us:en-US:Miami, x:pt')).toEqual([
      { country: 'br', language: 'pt-BR' }, { country: 'us', language: 'en-US', city: 'Miami' },
    ]);
  });
});

describe('filterSummary e rangeForDays', () => {
  it('filtra concorrentes e URLs por motor', () => {
    const f = filterSummary(fixture, 'google_serp', 'all');
    expect(f.top_competitors.map((c) => c.name)).toEqual(['CNJ']);
    expect(f.by_engine).toHaveLength(1);
  });
  it('sem filtro devolve o mesmo objeto', () => {
    expect(filterSummary(fixture, 'all', 'all')).toBe(fixture);
  });
  it('período em dias', () => {
    expect(rangeForDays(30, new Date(2026, 10, 12))).toEqual({ from: '2026-10-13', to: '2026-11-12' });
  });
});
