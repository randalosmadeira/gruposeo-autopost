import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { handleSpeedAction, type SpeedDeps } from '../../supabase/functions/_shared/speed-handler';
import { runMonitor, type MonitorDeps } from '../../supabase/functions/_shared/monitor-runner';
import { CRUX, PSI } from './helpers/speed-fixtures';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const P = '00000000-0000-4000-8000-0000000000b1';
const USER = '00000000-0000-4000-8000-0000000000c1';
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const EPOCH = '1970-01-01T00:00:00.000Z';
const KEY = 'chave-de-teste';

const project = { id: P, name: 'RDM Advogados', domain: 'exemplo.com.br', organization_id: ORG, wordpress_url: null };
const schedule = (over: Row = {}): Row => ({ project_id: P, organization_id: ORG, enabled: true, frequency: 'daily', devices: 'mobile', extra_urls: [], include_competitors: false, alert_drop_points: 5, next_run_at: '2026-11-19T11:00:00.000Z', last_run_at: null, progress: 0, consecutive_failures: 0, lock_until: EPOCH, ...over });
const prior = (score: number, i: number, over: Row = {}): Row => ({ id: `00000000-0000-4000-8000-${String(50 + i).padStart(12, '0')}`, project_id: P, organization_id: ORG, url: 'https://exemplo.com.br/', host: 'exemplo.com.br', kind: 'own', strategy: 'mobile', fetched_at: `2026-11-1${i}T10:00:00.000Z`, performance_score: score, lcp_ms: 2000, cls: 0.05, tbt_ms: 100, fcp_ms: 1200, ttfb_ms: 300, speed_index_ms: 3000, field: null, lighthouse_version: '13', ...over });
const seed = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({ projects: [project], project_speed_runs: [], project_speed_schedules: [schedule()], project_alerts: [], project_backlinks: [], project_backlink_settings: [], ...over });

interface Net { psi?: (url: string) => Response; pages?: Record<string, () => Response> }
function mdeps(net: Net = {}, now: () => number = () => NOW, apiKey: string | null = KEY) {
  const calls: string[] = [];
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  const d: MonitorDeps = {
    now, apiKey, lookupA: async () => ['93.184.216.34'],
    fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push(url);
      if (url.includes('pagespeedonline')) return net.psi ? net.psi(url) : json(PSI);
      if (url.includes('chromeuxreport')) return JSON.parse(String(init?.body || '{}')).url ? json({}, 404) : json(CRUX);
      const f = net.pages?.[url];
      return f ? f() : new Response('', { status: 404 });
    }) as typeof fetch,
  };
  return { d, calls };
}

describe('monitor: velocidade agendada', () => {
  it('mede o que venceu, guarda no histórico e programa a próxima rodada (sem login de usuário)', async () => {
    const tables = seed();
    const { d, calls } = mdeps();
    const rep = await runMonitor(fakeAdmin(tables).admin, d);
    expect(rep.speed).toMatchObject({ schedules: 1, measured: 1, failed: 0, alerts: 0 });
    expect(calls.filter((c) => c.includes('pagespeedonline'))).toHaveLength(1);
    expect(tables.project_speed_runs).toHaveLength(1);
    expect(tables.project_speed_runs[0]).toMatchObject({ project_id: P, kind: 'own', strategy: 'mobile', requested_by: null, url: 'https://exemplo.com.br/' });
    expect(tables.project_speed_schedules[0]).toMatchObject({ next_run_at: '2026-11-20T12:00:00.000Z', last_run_at: new Date(NOW).toISOString(), progress: 0, consecutive_failures: 0, lock_until: EPOCH });
  });
  it('não mede o que ainda não venceu, o que está desligado nem o que está reservado por outra rodada', async () => {
    for (const s of [schedule({ next_run_at: '2026-11-19T13:00:00.000Z' }), schedule({ enabled: false }), schedule({ lock_until: '2026-11-19T12:03:00.000Z' })]) {
      const tables = seed({ project_speed_schedules: [s] });
      const { d, calls } = mdeps();
      const rep = await runMonitor(fakeAdmin(tables).admin, d);
      expect(rep.speed.schedules).toBe(0);
      expect(calls).toEqual([]);
    }
  });
  it('sem chave do Google não mede nada e não quebra', async () => {
    const tables = seed();
    const rep = await runMonitor(fakeAdmin(tables).admin, mdeps({}, () => NOW, null).d);
    expect(rep.speed.schedules).toBe(0);
    expect(tables.project_speed_runs).toHaveLength(0);
  });
  it('queda real da nota vs. a mediana das últimas medições cria o aviso (uma vez) e aponta a página', async () => {
    const tables = seed({ project_speed_runs: [prior(99, 1), prior(100, 2), prior(98, 3)] });
    const rep = await runMonitor(fakeAdmin(tables).admin, mdeps().d); // PSI de teste dá nota 92: queda de 7 contra mediana 99
    expect(rep.speed.alerts).toBe(1);
    expect(tables.project_alerts).toHaveLength(1);
    expect(tables.project_alerts[0]).toMatchObject({ project_id: P, organization_id: ORG, source: 'speed', kind: 'score_drop', ref_url: 'https://exemplo.com.br/' });
    expect(String(tables.project_alerts[0].title)).toMatch(/caiu 7 pontos \(de 99 para 92\)/);
    expect(tables.project_alerts[0].detail).toMatchObject({ baseline: 99, score: 92, compared_with: 3 });
  });
  it('sem piora, sem aviso', async () => {
    const tables = seed({ project_speed_runs: [prior(93, 1), prior(92, 2), prior(94, 3)] });
    const rep = await runMonitor(fakeAdmin(tables).admin, mdeps().d);
    expect(rep.speed.alerts).toBe(0);
    expect(tables.project_alerts).toHaveLength(0);
  });
  it('celular + computador, página extra e concorrente já medido (se pedido): cada alvo vira uma medição', async () => {
    const tables = seed({
      project_speed_schedules: [schedule({ devices: 'both', extra_urls: ['https://exemplo.com.br/contato'], include_competitors: true })],
      project_speed_runs: [prior(90, 1, { url: 'https://rival.com.br/', host: 'rival.com.br', kind: 'competitor' })],
    });
    const { d, calls } = mdeps();
    const rep = await runMonitor(fakeAdmin(tables).admin, d);
    expect(rep.speed.measured).toBe(5);
    const measured = calls.filter((c) => c.includes('pagespeedonline')).map((c) => `${new URL(c).searchParams.get('url')}|${new URL(c).searchParams.get('strategy')}`).sort();
    expect(measured).toEqual(['https://exemplo.com.br/contato|desktop', 'https://exemplo.com.br/contato|mobile', 'https://exemplo.com.br/|desktop', 'https://exemplo.com.br/|mobile', 'https://rival.com.br/|mobile'].sort());
    expect(tables.project_alerts).toHaveLength(0); // concorrente e primeira medição não geram aviso
  });
  it('cota do Google: para tudo, reserva por 30 minutos, não conta como falha do site e continua devendo', async () => {
    const tables = seed();
    const rep = await runMonitor(fakeAdmin(tables).admin, mdeps({ psi: () => new Response('', { status: 429 }) }).d);
    expect(rep.speed.quota_hit).toBe(true);
    expect(tables.project_speed_schedules[0].consecutive_failures).toBe(0);
    expect(tables.project_speed_schedules[0].lock_until).toBe('2026-11-19T12:30:00.000Z');
    expect(tables.project_speed_schedules[0].next_run_at).toBe('2026-11-19T11:00:00.000Z');
  });
  it('falha em todas as medições do site: na 2ª rodada seguida avisa que não consegue medir', async () => {
    const tables = seed({ project_speed_schedules: [schedule({ consecutive_failures: 1 })] });
    const rep = await runMonitor(fakeAdmin(tables).admin, mdeps({ psi: () => new Response('', { status: 500 }) }).d);
    expect(rep.speed.failed).toBe(1);
    expect(tables.project_alerts[0]).toMatchObject({ kind: 'measure_failed', source: 'speed' });
    expect(tables.project_speed_schedules[0].consecutive_failures).toBe(2);
    expect(tables.project_speed_schedules[0].next_run_at).toBe('2026-11-20T12:00:00.000Z'); // tenta de novo no próximo ciclo
  });
  it('acabou o tempo no meio: guarda o progresso e a próxima rodada continua de onde parou', async () => {
    let t = NOW;
    const tick = () => { t += 8000; return t; };
    const tables = seed({ project_speed_schedules: [schedule({ devices: 'both', extra_urls: ['https://exemplo.com.br/a', 'https://exemplo.com.br/b'] })] });
    const rep = await runMonitor(fakeAdmin(tables).admin, mdeps({}, tick).d);
    const s = tables.project_speed_schedules[0];
    expect(rep.speed.measured).toBe(3);
    expect(s.progress).toBe(3);
    expect(s.next_run_at).toBe('2026-11-19T11:00:00.000Z'); // ainda vencido
    expect(s.lock_until).toBe(EPOCH);
    const rep2 = await runMonitor(fakeAdmin(tables).admin, mdeps({}, () => t + 600_000).d);
    expect(rep2.speed.measured).toBe(3);
    expect(tables.project_speed_runs).toHaveLength(6);
    expect(tables.project_speed_schedules[0].progress).toBe(0);
    expect(String(tables.project_speed_schedules[0].next_run_at) > '2026-11-19T12:00:00.000Z').toBe(true);
  });
});

describe('agenda da velocidade: ações do cliente', () => {
  const sd: SpeedDeps = { fetchFn: fetch, now: () => NOW, apiKey: KEY };
  const call = (action: string, body: Record<string, unknown>, role = 'owner', tables = seed({ project_speed_schedules: [] })) =>
    handleSpeedAction(fakeAdmin(tables).admin, { action, body: { projectId: P, ...body }, userId: USER, roleByOrg: new Map([[ORG, role]]), deps: sd }).then((r) => ({ ...r, tables }));
  const valid = { enabled: true, frequency: 'weekly', devices: 'both', extra_urls: ['exemplo.com.br/contato'], include_competitors: true, alert_drop_points: 12 };

  it('liga o acompanhamento: a 1ª medição fica para a próxima rodada do monitor (agora)', async () => {
    const r = await call('schedule_save', { schedule: valid });
    expect(r.status).toBe(200);
    expect(r.tables.project_speed_schedules[0]).toMatchObject({ project_id: P, organization_id: ORG, enabled: true, frequency: 'weekly', devices: 'both', extra_urls: ['https://exemplo.com.br/contato'], include_competitors: true, alert_drop_points: 12, next_run_at: new Date(NOW).toISOString(), created_by: USER });
  });
  it('mudar só o limiar não reinicia o relógio; mudar a frequência reinicia; desligar programa a próxima pela frequência', async () => {
    const tables = seed({ project_speed_schedules: [schedule({ frequency: 'weekly', devices: 'mobile', next_run_at: '2026-11-25T10:00:00.000Z' })] });
    await call('schedule_save', { schedule: { enabled: true, frequency: 'weekly', devices: 'mobile', extra_urls: [], include_competitors: false, alert_drop_points: 20 } }, 'owner', tables);
    expect(tables.project_speed_schedules[0]).toMatchObject({ alert_drop_points: 20, next_run_at: '2026-11-25T10:00:00.000Z' });
    await call('schedule_save', { schedule: { enabled: true, frequency: 'daily', devices: 'mobile', extra_urls: [], include_competitors: false, alert_drop_points: 20 } }, 'owner', tables);
    expect(tables.project_speed_schedules[0].next_run_at).toBe(new Date(NOW).toISOString());
    await call('schedule_save', { schedule: { enabled: false, frequency: 'daily', devices: 'mobile', extra_urls: [], include_competitors: false, alert_drop_points: 20 } }, 'owner', tables);
    expect(tables.project_speed_schedules[0].enabled).toBe(false);
    expect(tables.project_speed_schedules).toHaveLength(1);
  });
  it('valida e respeita o papel', async () => {
    expect((await call('schedule_save', { schedule: { ...valid, extra_urls: ['https://outro.com/'] } })).body.error).toBe('schedule_url_outside_project_domain');
    expect((await call('schedule_save', { schedule: valid }, 'viewer')).status).toBe(403);
    expect((await call('alerts_dismiss', { all: true }, 'viewer')).status).toBe(403);
  });
  it('history devolve o agendamento e só os avisos de velocidade em aberto; dispensar tira da lista', async () => {
    const tables = seed({ project_alerts: [
      { id: '00000000-0000-4000-8000-0000000007a1', project_id: P, source: 'speed', kind: 'score_drop', title: 'caiu', detail: {}, ref_url: null, created_at: '2026-11-19T10:00:00.000Z', dismissed_at: null },
      { id: '00000000-0000-4000-8000-0000000007a2', project_id: P, source: 'backlinks', kind: 'links_lost', title: 'x', detail: {}, ref_url: null, created_at: '2026-11-19T10:00:00.000Z', dismissed_at: null },
      { id: '00000000-0000-4000-8000-0000000007a3', project_id: P, source: 'speed', kind: 'score_drop', title: 'velho', detail: {}, ref_url: null, created_at: '2026-11-18T10:00:00.000Z', dismissed_at: '2026-11-18T11:00:00.000Z' },
    ] });
    const h = await call('history', {}, 'viewer', tables);
    expect((h.body.schedule as Row).frequency).toBe('daily');
    expect((h.body.alerts as Row[]).map((a) => a.title)).toEqual(['caiu']);
    const d = await call('alerts_dismiss', { alertId: '00000000-0000-4000-8000-0000000007a1' }, 'editor', tables);
    expect(d.body.dismissed).toBe(1);
    expect(((await call('history', {}, 'viewer', tables)).body.alerts as Row[])).toHaveLength(0);
    expect(tables.project_alerts.find((a) => a.source === 'backlinks')?.dismissed_at).toBeNull();
  });
});

describe('monitor: reverificação de backlinks', () => {
  const link = (i: number, over: Row = {}): Row => ({
    id: `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`, organization_id: ORG, project_id: P, target_host: 'exemplo.com.br', kind: 'own', source_url: `https://site${i}.com/p`, source_host: `site${i}.com`, source_domain: `site${i}.com`,
    origin: 'ahrefs', status: 'live', anchor: 'RDM', link_attr: 'follow', first_seen_at: '2026-10-01T10:00:00.000Z', last_checked_at: '2026-10-20T10:00:00.000Z', status_changed_at: '2026-10-20T10:00:00.000Z', last_live_at: '2026-10-20T10:00:00.000Z', ...over,
  });
  const settings = (over: Row = {}): Row => ({ project_id: P, organization_id: ORG, enabled: true, recheck_days: 14, last_run_at: null, lock_until: EPOCH, ...over });
  const withLink = () => '<a href="https://exemplo.com.br/">RDM</a>';

  it('reverifica só o que passou do prazo e avisa quando link que estava no ar sumiu', async () => {
    const tables = seed({
      project_speed_schedules: [], project_backlink_settings: [settings()],
      project_backlinks: [link(1), link(2), link(3, { last_checked_at: '2026-11-18T10:00:00.000Z' })],
    });
    const { d, calls } = mdeps({ pages: { 'https://site1.com/p': () => new Response(withLink(), { status: 200, headers: { 'content-type': 'text/html' } }), 'https://site2.com/p': () => new Response('<p>sem</p>', { status: 200, headers: { 'content-type': 'text/html' } }) } });
    const rep = await runMonitor(fakeAdmin(tables).admin, d);
    expect(rep.backlinks).toMatchObject({ projects: 1, checked: 2, alerts: 1 });
    expect(calls.some((c) => c.includes('site3.com'))).toBe(false); // verificado ontem: ainda no prazo
    expect(tables.project_backlinks[0]).toMatchObject({ status: 'live', last_checked_at: new Date(NOW).toISOString() });
    expect(tables.project_backlinks[1]).toMatchObject({ status: 'lost', status_changed_at: new Date(NOW).toISOString() });
    expect(tables.project_alerts[0]).toMatchObject({ source: 'backlinks', kind: 'links_lost', project_id: P });
    expect(tables.project_alerts[0].detail).toMatchObject({ count: 1 });
    expect(tables.project_backlink_settings[0]).toMatchObject({ last_run_at: new Date(NOW).toISOString(), lock_until: EPOCH });
  });
  it('desligado ou reservado: não faz nada; link de concorrente que some não gera aviso', async () => {
    for (const s of [settings({ enabled: false }), settings({ lock_until: '2026-11-19T12:03:00.000Z' })]) {
      const tables = seed({ project_speed_schedules: [], project_backlink_settings: [s], project_backlinks: [link(1)] });
      const { d, calls } = mdeps();
      await runMonitor(fakeAdmin(tables).admin, d);
      expect(calls).toEqual([]);
    }
    const tables = seed({ project_speed_schedules: [], project_backlink_settings: [settings()], project_backlinks: [link(1, { kind: 'competitor', target_host: 'rival.com.br' })] });
    const rep = await runMonitor(fakeAdmin(tables).admin, mdeps({ pages: { 'https://site1.com/p': () => new Response('<p>sem</p>', { status: 200, headers: { 'content-type': 'text/html' } }) } }).d);
    expect(rep.backlinks.alerts).toBe(0);
    expect(tables.project_backlinks[0].status).toBe('lost');
  });
  it('a rodada de backlinks roda mesmo sem chave do Google (a velocidade é que fica de fora)', async () => {
    const tables = seed({ project_backlink_settings: [settings()], project_backlinks: [link(1)] });
    const rep = await runMonitor(fakeAdmin(tables).admin, mdeps({ pages: { 'https://site1.com/p': () => new Response(withLink(), { status: 200, headers: { 'content-type': 'text/html' } }) } }, () => NOW, null).d);
    expect(rep.backlinks.checked).toBe(1);
    expect(rep.speed.schedules).toBe(0);
  });
});
