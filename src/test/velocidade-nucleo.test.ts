import { describe, expect, it } from 'vitest';
import { CRUX, PSI } from './helpers/speed-fixtures';
import { THRESHOLDS, compareRuns, formatMetric, formatMs, parseCrux, parsePsi, rate, rateScore, type SpeedRunRow } from '../../supabase/functions/_shared/speed-core';

describe('velocidade: leitura das respostas do Google', () => {
  it('PageSpeed vira métricas de laboratório arredondadas, com versão e hora da coleta', () => {
    expect(parsePsi(PSI)).toEqual({ score: 92, lcp: 2683, cls: 0.046, tbt: 20, fcp: 1513, ttfb: 50, speedIndex: 4981, lighthouseVersion: '13.6.0', fetchTime: '2026-11-19T04:11:47.823Z', finalUrl: 'https://exemplo.com.br/' });
  });

  it('resposta sem relatório do Lighthouse não vira número nenhum', () => {
    expect(parsePsi({})).toBeNull();
    expect(parsePsi({ lighthouseResult: { audits: {} } })).toBeNull();
    expect(parsePsi(null)).toBeNull();
    const parcial = parsePsi({ lighthouseResult: { audits: { 'speed-index': { numericValue: 3000 } } } });
    expect(parcial).toMatchObject({ score: null, lcp: null, speedIndex: 3000 }); // o que faltou fica nulo, nada é estimado
  });

  it('CrUX: percentil 75 de usuários reais, janela de coleta, e rótulo de onde veio (URL ou site inteiro)', () => {
    expect(parseCrux(CRUX, 'url')).toEqual({ scope: 'url', lcp: 2300, cls: 0.05, inp: 180, fcp: 1700, ttfb: 620, period: { first: '2026-10-20', last: '2026-11-16' } });
    expect(parseCrux(CRUX, 'origin')?.scope).toBe('origin');
  });

  it('CrUX sem registro ou sem nenhuma métrica = sem dados de campo (null)', () => {
    expect(parseCrux({}, 'url')).toBeNull();
    expect(parseCrux({ record: { metrics: {} } }, 'url')).toBeNull();
    expect(parseCrux({ record: { metrics: { largest_contentful_paint: {} } } }, 'url')).toBeNull();
  });

  it('classificação segue os limites publicados pelo Google (inclusive nas bordas)', () => {
    expect(THRESHOLDS.lcp).toEqual([2500, 4000]);
    expect(rate('lcp', 2500)).toBe('bom');
    expect(rate('lcp', 2501)).toBe('melhorar');
    expect(rate('lcp', 4000)).toBe('melhorar');
    expect(rate('lcp', 4001)).toBe('ruim');
    expect(rate('cls', 0.1)).toBe('bom');
    expect(rate('cls', 0.26)).toBe('ruim');
    expect(rate('inp', 200)).toBe('bom');
    expect(rate('inp', 501)).toBe('ruim');
    expect(rate('ttfb', 800)).toBe('bom');
    expect(rate('lcp', null)).toBeNull();
    expect(rateScore(90)).toBe('bom');
    expect(rateScore(89)).toBe('melhorar');
    expect(rateScore(49)).toBe('ruim');
    expect(rateScore(null)).toBeNull();
  });

  it('formatação em português, "sem dados" quando falta o número', () => {
    expect(formatMs(2683)).toBe('2,7 s');
    expect(formatMs(850)).toBe('850 ms');
    expect(formatMs(null)).toBe('sem dados');
    expect(formatMetric('cls', 0.046)).toBe('0,046');
    expect(formatMetric('lcp', null)).toBe('sem dados');
  });

  it('comparação só entre medições da MESMA URL e do MESMO dispositivo; vazio não entra', () => {
    const base: SpeedRunRow = { url: 'https://x.com.br/', host: 'x.com.br', kind: 'own', strategy: 'mobile', fetched_at: '2026-11-18T10:00:00Z', performance_score: 80, lcp_ms: 3000, cls: 0.1, tbt_ms: 100, fcp_ms: 2000, ttfb_ms: null, speed_index_ms: 4000, field: null, lighthouse_version: '13' };
    const now = { ...base, performance_score: 92, lcp_ms: 2500, cls: 0.05, ttfb_ms: 400 };
    expect(compareRuns(now, base)).toEqual({ score: 12, lcp: -500, cls: -0.05, tbt: 0, fcp: 0, speedIndex: 0 }); // ttfb: sem número antes, fica de fora
    expect(compareRuns(now, { ...base, strategy: 'desktop' })).toBeNull();
    expect(compareRuns(now, { ...base, url: 'https://x.com.br/outra' })).toBeNull();
    expect(compareRuns(now, null)).toBeNull();
  });
});
