import { describe, expect, it } from 'vitest';
import { MAX_TARGETS_PER_ROUND, buildTargets, evaluateSpeedAlerts, median, nextRunAt, validateSchedule } from '../../supabase/functions/_shared/monitor-core';
import type { SpeedRunRow } from '../../supabase/functions/_shared/speed-core';

const run = (over: Partial<SpeedRunRow> = {}): SpeedRunRow => ({
  url: 'https://exemplo.com.br/', host: 'exemplo.com.br', kind: 'own', strategy: 'mobile', fetched_at: '2026-11-19T10:00:00.000Z',
  performance_score: 90, lcp_ms: 2000, cls: 0.05, tbt_ms: 100, fcp_ms: 1200, ttfb_ms: 300, speed_index_ms: 3000, lighthouse_version: '13', field: null, ...over,
});
const base = { enabled: true, frequency: 'weekly', devices: 'both', include_competitors: false, alert_drop_points: 10 };

describe('monitor: agendamento', () => {
  it('aceita um agendamento válido e normaliza as páginas extras do mesmo site', () => {
    const r = validateSchedule({ ...base, extra_urls: ['exemplo.com.br/contato', 'https://www.exemplo.com.br/blog#topo', 'exemplo.com.br/contato'] }, 'exemplo.com.br');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.extra_urls).toEqual(['https://exemplo.com.br/contato', 'https://www.exemplo.com.br/blog']);
  });
  it('recusa página de outro site, mais de 2 extras, valores fora da lista e limiar absurdo', () => {
    expect(validateSchedule({ ...base, extra_urls: ['https://outro.com.br/'] }, 'exemplo.com.br')).toEqual({ ok: false, error: 'schedule_url_outside_project_domain' });
    expect(validateSchedule({ ...base, extra_urls: ['/a', '/b'].map((p) => `exemplo.com.br${p}`).concat('exemplo.com.br/c') }, 'exemplo.com.br')).toEqual({ ok: false, error: 'schedule_too_many_urls' });
    expect(validateSchedule({ ...base, frequency: 'hourly' }, 'exemplo.com.br')).toEqual({ ok: false, error: 'schedule_frequency_invalid' });
    expect(validateSchedule({ ...base, devices: 'tv' }, 'exemplo.com.br')).toEqual({ ok: false, error: 'schedule_devices_invalid' });
    expect(validateSchedule({ ...base, alert_drop_points: 1 }, 'exemplo.com.br')).toEqual({ ok: false, error: 'schedule_threshold_invalid' });
    expect(validateSchedule({ ...base, extra_urls: ['http://127.0.0.1/'] }, 'exemplo.com.br')).toEqual({ ok: false, error: 'schedule_urls_invalid' });
    expect(validateSchedule({ ...base, enabled: 'sim' }, 'exemplo.com.br')).toEqual({ ok: false, error: 'schedule_enabled_invalid' });
  });
  it('sem site cadastrado só vale sem páginas extras', () => {
    expect(validateSchedule({ ...base, extra_urls: ['exemplo.com.br/x'] }, null)).toEqual({ ok: false, error: 'project_domain_required' });
    expect(validateSchedule(base, null).ok).toBe(true);
  });
  it('próxima rodada: 1, 7 e 30 dias', () => {
    const t = Date.UTC(2026, 10, 19, 12);
    expect(nextRunAt('daily', t)).toBe('2026-11-20T12:00:00.000Z');
    expect(nextRunAt('weekly', t)).toBe('2026-11-26T12:00:00.000Z');
    expect(nextRunAt('monthly', t)).toBe('2026-12-19T12:00:00.000Z');
  });
  it('alvos: página inicial + extras nos aparelhos escolhidos; concorrentes só se pedido, no máximo 4, um por site', () => {
    const t = buildTargets({ devices: 'both', extra_urls: ['https://exemplo.com.br/a'], include_competitors: false }, 'exemplo.com.br', ['https://rival.com.br/']);
    expect(t.map((x) => `${x.url}|${x.strategy}|${x.kind}`)).toEqual(['https://exemplo.com.br/|mobile|own', 'https://exemplo.com.br/|desktop|own', 'https://exemplo.com.br/a|mobile|own', 'https://exemplo.com.br/a|desktop|own']);
    const rivals = ['https://a.com.br/', 'https://a.com.br/x', 'https://b.com.br/', 'https://c.com.br/', 'https://d.com.br/', 'https://e.com.br/'];
    const c = buildTargets({ devices: 'desktop', extra_urls: [], include_competitors: true }, 'exemplo.com.br', rivals);
    expect(c.filter((x) => x.kind === 'competitor').map((x) => x.url)).toEqual(['https://a.com.br/', 'https://b.com.br/', 'https://c.com.br/', 'https://d.com.br/']);
    expect(c.every((x) => x.strategy === 'desktop')).toBe(true);
    expect(c.length).toBeLessThanOrEqual(MAX_TARGETS_PER_ROUND);
  });
});

describe('monitor: alertas de piora', () => {
  it('mediana', () => { expect(median([])).toBeNull(); expect(median([5, 1, 9])).toBe(5); expect(median([4, 8])).toBe(6); });

  it('queda real da nota (mediana das anteriores contra a nova) gera alerta com a conta explicada', () => {
    const a = evaluateSpeedAlerts(run({ performance_score: 70 }), [run({ performance_score: 91 }), run({ performance_score: 90 }), run({ performance_score: 89 })], 10);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'score_drop', ref_url: 'https://exemplo.com.br/' });
    expect(a[0].detail).toMatchObject({ baseline: 90, score: 70, drop: 20, compared_with: 3 });
    expect(a[0].title).toMatch(/caiu 20 pontos \(de 90 para 70\)/);
  });
  it('oscilação normal do laboratório NÃO gera alerta; uma medição anterior ruim isolada também não', () => {
    expect(evaluateSpeedAlerts(run({ performance_score: 84 }), [run({ performance_score: 90 })], 10)).toEqual([]);
    expect(evaluateSpeedAlerts(run({ performance_score: 85 }), [run({ performance_score: 95 }), run({ performance_score: 96 }), run({ performance_score: 40 })], 10)).toHaveLength(1);
    expect(evaluateSpeedAlerts(run({ performance_score: 88 }), [run({ performance_score: 91 }), run({ performance_score: 90 }), run({ performance_score: 40 })], 10)).toEqual([]);
  });
  it('limiar é o do cliente', () => {
    expect(evaluateSpeedAlerts(run({ performance_score: 80 }), [run({ performance_score: 90 })], 10)).toHaveLength(1);
    expect(evaluateSpeedAlerts(run({ performance_score: 80 }), [run({ performance_score: 90 })], 15)).toHaveLength(0);
  });
  it('concorrente e primeira medição nunca geram alerta', () => {
    expect(evaluateSpeedAlerts(run({ kind: 'competitor', performance_score: 10 }), [run({ performance_score: 90 })], 10)).toEqual([]);
    expect(evaluateSpeedAlerts(run({ performance_score: 10 }), [], 10)).toEqual([]);
  });
  it('visitantes reais que passam para faixa pior geram alerta (e só se o escopo for o mesmo)', () => {
    const f = (lcp: number, scope: 'url' | 'origin' = 'origin') => ({ scope, lcp, cls: 0.05, inp: 150, fcp: 1200, ttfb: 500, period: null });
    const a = evaluateSpeedAlerts(run({ field: f(3200) }), [run({ field: f(2200) })], 10);
    expect(a.find((x) => x.kind === 'field_worse')?.detail.metrics).toEqual([{ metric: 'lcp', from: 2200, to: 3200, from_rating: 'bom', to_rating: 'melhorar' }]);
    expect(evaluateSpeedAlerts(run({ field: f(3200, 'url') }), [run({ field: f(2200, 'origin') })], 10)).toEqual([]);
    expect(evaluateSpeedAlerts(run({ field: f(2000) }), [run({ field: f(3000) })], 10)).toEqual([]); // melhorou
  });
});
