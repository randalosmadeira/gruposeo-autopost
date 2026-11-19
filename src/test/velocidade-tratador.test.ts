import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { MAX_COMPETITOR_HOSTS, MAX_RUNS_PER_PROJECT_DAY, SPEED_ACTIONS, handleSpeedAction, type SpeedDeps } from '../../supabase/functions/_shared/speed-handler';
import { CRUX, PSI } from './helpers/speed-fixtures';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const P = '00000000-0000-4000-8000-0000000000b1';
const NO_DOMAIN = '00000000-0000-4000-8000-0000000000b3';
const USER = '00000000-0000-4000-8000-0000000000c1';
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const KEY = 'chave-secreta-de-teste';

interface Net { psi?: () => Response; cruxUrl?: () => Response; cruxOrigin?: () => Response }
function deps(net: Net = {}, apiKey: string | null = KEY) {
  const calls: Array<{ url: string; body?: string }> = [];
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  const d: SpeedDeps = {
    now: () => NOW, apiKey,
    fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.includes('pagespeedonline')) return net.psi ? net.psi() : json(PSI);
      if (url.includes('chromeuxreport')) {
        const b = JSON.parse(String(init?.body || '{}'));
        if (b.url) return net.cruxUrl ? net.cruxUrl() : json({ error: { code: 404 } }, 404);
        return net.cruxOrigin ? net.cruxOrigin() : json(CRUX);
      }
      return new Response('nao', { status: 404 });
    }) as typeof fetch,
  };
  return { d, calls };
}
const seed = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: [
    { id: P, name: 'Exemplo', domain: 'exemplo.com.br', organization_id: ORG, wordpress_url: null },
    { id: NO_DOMAIN, name: 'Sem site', domain: null, organization_id: ORG, wordpress_url: null },
  ],
  project_speed_runs: [], ...over,
});
const call = (action: string, body: Record<string, unknown>, o: { role?: string | null; tables?: Record<string, Row[]>; net?: Net; key?: string | null } = {}) => {
  const { d, calls } = deps(o.net, o.key === undefined ? KEY : o.key);
  const roleByOrg = new Map<string, string>(o.role === null ? [[OTHER, 'owner']] : [[ORG, o.role || 'owner']]);
  const tables = o.tables || seed();
  return handleSpeedAction(fakeAdmin(tables).admin, { action, body: { projectId: P, ...body }, userId: USER, roleByOrg, deps: d }).then((r) => ({ ...r, calls, tables }));
};

describe('velocidade: função de borda', () => {
  it('ações existentes', () => { expect(SPEED_ACTIONS).toEqual(['run', 'history', 'schedule_save', 'alerts_dismiss']); });

  it('mede o site do projeto: laboratório (PageSpeed) + campo (CrUX do site inteiro quando a URL não tem dados) e guarda no histórico', async () => {
    const r = await call('run', { url: 'exemplo.com.br', strategy: 'mobile' });
    expect(r.status).toBe(200);
    const run = r.body.run as Record<string, unknown>;
    expect(run).toMatchObject({ url: 'https://exemplo.com.br/', host: 'exemplo.com.br', kind: 'own', strategy: 'mobile', performance_score: 92, lcp_ms: 2683, cls: 0.046, ttfb_ms: 50 });
    expect(run.field).toMatchObject({ scope: 'origin', lcp: 2300, inp: 180 });
    expect(r.tables.project_speed_runs).toHaveLength(1);
    expect(r.tables.project_speed_runs[0]).toMatchObject({ project_id: P, organization_id: ORG, requested_by: USER, kind: 'own' });
    expect(r.body.previous).toBeNull();
  });

  it('a chave do Google vai só para o Google e NUNCA aparece na resposta nem no que é gravado', async () => {
    const r = await call('run', { url: 'https://exemplo.com.br/' });
    expect(JSON.stringify(r.body)).not.toContain(KEY);
    expect(JSON.stringify(r.tables)).not.toContain(KEY);
    expect(r.calls.every((c) => /googleapis\.com/.test(c.url))).toBe(true);
    expect(r.calls.filter((c) => c.url.includes('key=')).length).toBeGreaterThan(0);
  });

  it('campo por URL tem prioridade; sem dados nem na URL nem no site inteiro = campo nulo com a explicação', async () => {
    const urlHit = await call('run', { url: 'https://exemplo.com.br/' }, { net: { cruxUrl: () => new Response(JSON.stringify(CRUX), { status: 200 }) } });
    expect((urlHit.body.run as { field: { scope: string } }).field.scope).toBe('url');
    const none = await call('run', { url: 'https://exemplo.com.br/' }, { net: { cruxOrigin: () => new Response('{}', { status: 404 }) } });
    expect((none.body.run as { field: unknown }).field).toBeNull();
    expect(none.body.field_note).toBe('no_field_data');
    const down = await call('run', { url: 'https://exemplo.com.br/' }, { net: { cruxUrl: () => new Response('x', { status: 500 }) } });
    expect(down.status).toBe(200); // o laboratório não depende do campo
    expect(down.body.field_note).toBe('crux_unavailable');
  });

  it('compara com a medição anterior da MESMA URL e dispositivo', async () => {
    const tables = seed({ project_speed_runs: [{ id: 'r0', project_id: P, organization_id: ORG, url: 'https://exemplo.com.br/', host: 'exemplo.com.br', kind: 'own', strategy: 'mobile', fetched_at: '2026-11-18T10:00:00.000Z', performance_score: 80, lcp_ms: 3100, cls: 0.1, tbt_ms: 90, fcp_ms: 1900, ttfb_ms: 60, speed_index_ms: 5000, field: null, lighthouse_version: '13' }] });
    const r = await call('run', { url: 'https://exemplo.com.br/' }, { tables });
    expect(r.body.delta).toMatchObject({ score: 12, lcp: -417 });
    expect((r.body.previous as { id: string }).id).toBe('r0');
    const desk = await call('run', { url: 'https://exemplo.com.br/', strategy: 'desktop' }, { tables });
    expect(desk.body.delta).toBeNull(); // outro dispositivo: sem comparação
  });

  it('URL de outro site só entra como concorrente declarado; limite de concorrentes por projeto', async () => {
    expect((await call('run', { url: 'https://concorrente.com.br/' })).body.error).toBe('url_outside_project_domain');
    const ok = await call('run', { url: 'https://concorrente.com.br/', kind: 'competitor' });
    expect(ok.status).toBe(200);
    expect(ok.body.run).toMatchObject({ kind: 'competitor', host: 'concorrente.com.br' });
    const cheio = seed({ project_speed_runs: Array.from({ length: MAX_COMPETITOR_HOSTS }, (_, i) => ({ id: `c${i}`, project_id: P, organization_id: ORG, url: `https://c${i}.com.br/`, host: `c${i}.com.br`, kind: 'competitor', strategy: 'mobile', fetched_at: '2026-11-19T01:00:00.000Z' })) });
    expect((await call('run', { url: 'https://novo-concorrente.com.br/', kind: 'competitor' }, { tables: cheio })).body.error).toBe('competitor_limit');
    expect((await call('run', { url: 'https://c3.com.br/', kind: 'competitor' }, { tables: cheio })).status).toBe(200); // concorrente já medido pode repetir
  });

  it('subdomínio do próprio projeto conta como "own"', async () => {
    expect((await call('run', { url: 'https://blog.exemplo.com.br/artigo' })).body.run).toMatchObject({ kind: 'own', host: 'blog.exemplo.com.br' });
  });

  it('recusa endereços inválidos ou perigosos sem chamar o Google', async () => {
    for (const url of ['', 'ftp://exemplo.com.br', 'http://127.0.0.1/x', 'localhost', 'https://user:pass@exemplo.com.br/', 'exemplo']) {
      const r = await call('run', { url });
      expect(r.status, url).toBe(422);
      expect(r.calls, url).toHaveLength(0);
    }
  });

  it('limite diário por projeto', async () => {
    const tables = seed({ project_speed_runs: Array.from({ length: MAX_RUNS_PER_PROJECT_DAY }, (_, i) => ({ id: `d${i}`, project_id: P, organization_id: ORG, url: 'https://exemplo.com.br/', host: 'exemplo.com.br', kind: 'own', strategy: 'mobile', fetched_at: '2026-11-19T08:00:00.000Z' })) });
    const r = await call('run', { url: 'https://exemplo.com.br/' }, { tables });
    expect(r).toMatchObject({ status: 429, body: { error: 'daily_limit', limit: MAX_RUNS_PER_PROJECT_DAY } });
    expect(r.calls).toHaveLength(0);
  });

  it('erros do Google viram mensagens claras e nada é gravado', async () => {
    const e = async (psi: () => Response) => call('run', { url: 'https://exemplo.com.br/' }, { net: { psi } });
    expect((await e(() => new Response('{}', { status: 429 }))).body.error).toBe('google_quota');
    const nm = await e(() => new Response(JSON.stringify({ error: { message: 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST' } }), { status: 400 }));
    expect(nm).toMatchObject({ status: 422, body: { error: 'url_not_measurable' } });
    expect(String(nm.body.detail)).toMatch(/FAILED_DOCUMENT_REQUEST/);
    expect((await e(() => new Response('x', { status: 500 }))).body.error).toBe('google_error');
    expect((await e(() => new Response('{"lighthouseResult":{"audits":{}}}', { status: 200 }))).body.error).toBe('google_no_report');
    const down = await call('run', { url: 'https://exemplo.com.br/' }, { net: { psi: () => { throw new Error('rede'); } } });
    expect(down.body.error).toBe('google_timeout');
    expect(down.tables.project_speed_runs).toHaveLength(0);
  });

  it('sem chave configurada: avisa, sem chamar ninguém', async () => {
    const r = await call('run', { url: 'https://exemplo.com.br/' }, { key: null });
    expect(r).toMatchObject({ status: 503, body: { error: 'speed_not_configured' } });
    expect(r.calls).toHaveLength(0);
  });

  it('permissões: ler é de qualquer membro; medir exige papel de escrita; outra organização é barrada', async () => {
    expect((await call('run', { url: 'https://exemplo.com.br/' }, { role: 'viewer' })).body.error).toBe('role_not_allowed');
    expect((await call('run', { url: 'https://exemplo.com.br/' }, { role: null })).body.error).toBe('organization_membership_required');
    const h = await call('history', {}, { role: 'viewer' });
    expect(h.status).toBe(200);
    expect(h.body).toMatchObject({ can_run: false, project: { domain: 'exemplo.com.br' } });
    expect((await call('history', {}, { role: null })).status).toBe(403);
    expect((await call('run', { projectId: NO_DOMAIN, url: 'https://exemplo.com.br/' })).body.error).toBe('project_domain_required');
    expect((await call('run', { projectId: 'x', url: 'a.com' })).body.error).toBe('project_id_required');
    expect((await call('nada', {})).status).toBe(400);
  });

  it('histórico: últimas medições do projeto (e só dele) e lista de concorrentes já medidos', async () => {
    const tables = seed({ project_speed_runs: [
      { id: 'a', project_id: P, organization_id: ORG, url: 'https://exemplo.com.br/', host: 'exemplo.com.br', kind: 'own', strategy: 'mobile', fetched_at: '2026-11-18T10:00:00.000Z', performance_score: 80 },
      { id: 'b', project_id: P, organization_id: ORG, url: 'https://rival.com.br/', host: 'rival.com.br', kind: 'competitor', strategy: 'mobile', fetched_at: '2026-11-19T10:00:00.000Z', performance_score: 70 },
      { id: 'x', project_id: NO_DOMAIN, organization_id: ORG, url: 'https://outro.com/', host: 'outro.com', kind: 'own', strategy: 'mobile', fetched_at: '2026-11-19T11:00:00.000Z', performance_score: 50 },
    ] });
    const h = await call('history', {}, { tables });
    expect((h.body.runs as Array<{ id: string }>).map((r) => r.id)).toEqual(['b', 'a']);
    expect(h.body.competitors).toEqual(['rival.com.br']);
  });
});
