import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { ANALYZE_ACTIONS, MAX_RUNS_PER_PROJECT_DAY, handleAnalyzeAction } from '../../supabase/functions/_shared/profile-analyze-handler';
import type { Deps } from '../../supabase/functions/_shared/profile-analyze-core';

const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);
const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER_ORG = '00000000-0000-4000-8000-0000000000a2';
const PROJECT = '00000000-0000-4000-8000-0000000000b1';
const OTHER_PROJECT = '00000000-0000-4000-8000-0000000000b2';
const USER = '00000000-0000-4000-8000-0000000000c1';
const goodHtml = '<!doctype html><html lang="pt-BR"><head><title>Exemplo Advogados — Direito do Consumidor</title><meta name="description" content="d"><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://exemplo.com.br/"></head><body><h1>Oi</h1></body></html>';

function network() {
  const calls: string[] = [];
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  const deps: Deps = {
    now: () => T0,
    lookupA: async () => ['93.184.216.34'],
    fetchFn: (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (/brasilapi\.com\.br\/api\/cnpj/.test(url)) return json({ razao_social: 'EMPRESA TESTE', descricao_situacao_cadastral: 'ATIVA', municipio: 'SAO PAULO', uf: 'SP', qsa: [{ nome_socio: 'FULANO' }] });
      if (/brasilapi\.com\.br\/api\/cep/.test(url)) return json({ city: 'São Paulo', state: 'SP' });
      if (/rdap\.registro\.br/.test(url)) return json({ events: [{ eventAction: 'expiration', eventDate: new Date(T0 + 400 * 86_400_000).toISOString() }] });
      if (/cloudflare-dns/.test(url)) return json({ Status: 0, Answer: [] });
      if (/archive\.org/.test(url)) return json({ archived_snapshots: {} });
      if (/^http:\/\//.test(url)) return new Response(null, { status: 301, headers: { location: 'https://exemplo.com.br/' } });
      if (/robots\.txt/.test(url)) return new Response('User-agent: *\nAllow: /', { status: 200, headers: { 'content-type': 'text/plain' } });
      if (/exemplo\.com\.br\/$/.test(url)) return new Response(goodHtml, { status: 200, headers: { 'content-type': 'text/html' } });
      return new Response('nao', { status: 404, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch,
  };
  return { deps, calls };
}

function seed(extra: Partial<Record<string, Row[]>> = {}) {
  return {
    projects: [
      { id: PROJECT, name: 'Exemplo', domain: 'exemplo.com.br', organization_id: ORG, user_id: USER, wordpress_url: null, nexus_strategy: { sites: 'https://exemplo.com.br\nhttps://outro.com', instagram: 'https://instagram.com/exemplo' }, nexus_strategy_version: 1 },
      { id: OTHER_PROJECT, name: 'Outro', domain: 'outro.com', organization_id: OTHER_ORG, user_id: USER, wordpress_url: null, nexus_strategy: {}, nexus_strategy_version: 1 },
    ] as Row[],
    project_profile_extended: [{ project_id: PROJECT, sections: { negocio: { cnpj: '11.222.333/0001-81', cnpjstat: 'Tenho CNPJ', endereco: 'Rua A, 10, Centro, São Paulo, CEP 01310-100' } } }] as Row[],
    project_profile_private: [{ project_id: PROJECT, finance: { capital: 'SEGREDO-FINANCEIRO-999' }, goals: { meta30: 'SEGREDO-META' } }] as Row[],
    project_analysis_runs: [] as Row[], project_analysis_checks: [] as Row[], project_findings: [] as Row[],
    ...extra,
  } as Record<string, Row[]>;
}
const roles = (role: string | null, org = ORG) => new Map<string, string>(role ? [[org, role]] : []);
async function call(admin: unknown, action: string, body: Record<string, unknown>, role: string | null = 'editor', deps: Deps = network().deps, org = ORG) {
  const r = await handleAnalyzeAction(admin, { action, body: { projectId: PROJECT, ...body }, userId: USER, roleByOrg: roles(role, org), deps });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: r.status, body: r.body as Record<string, any> };
}
const KEY = 'chave-de-pedido-0001';

describe('pente fino: iniciar', () => {
  it('as 4 ações existem', () => expect(ANALYZE_ACTIONS).toEqual(['start', 'get', 'history', 'decide_finding']));

  it('executa, grava execução + verificações + achados e devolve o relatório ordenado', async () => {
    const { admin, tables } = fakeAdmin(seed());
    const { deps } = network();
    const r = await call(admin, 'start', { requestKey: KEY }, 'editor', deps);
    expect(r.status).toBe(200);
    expect(r.body.run).toMatchObject({ status: 'done' });
    expect(r.body.checks.map((c: { check_key: string }) => c.check_key)).toEqual(['cnpj_formato', 'cnpj_receita', 'cep', 'dominio_rdap', 'dns', 'site_resposta', 'robots_txt', 'sitemap', 'llms_txt', 'site_idade', 'redes_formato', 'maps_google_meu_negocio', 'ia_marca']);
    expect(tables.project_analysis_runs).toHaveLength(1);
    expect(tables.project_analysis_runs[0]).toMatchObject({ organization_id: ORG, project_id: PROJECT, requested_by: USER, request_key: KEY, level: 'basico', status: 'done' });
    expect(tables.project_analysis_checks).toHaveLength(13);
    expect(r.body.checks.find((c: { check_key: string }) => c.check_key === 'cnpj_receita')).toMatchObject({ status: 'ok' });
    expect(r.body.checks.find((c: { check_key: string }) => c.check_key === 'maps_google_meu_negocio')).toMatchObject({ status: 'skipped', measured: {} });
    const sev = r.body.findings.map((f: { severity: string }) => f.severity);
    const order = ['alta', 'media', 'baixa', 'info'];
    expect([...sev].sort((a: string, b: string) => order.indexOf(a) - order.indexOf(b))).toEqual(sev);
    expect(tables.project_findings.every((f) => f.state === 'open')).toBe(true);
  });

  it('usa só valores PÚBLICOS do perfil: CNPJ, CEP, primeiro site e redes; financeiro e metas nunca aparecem', async () => {
    const { admin, tables } = fakeAdmin(seed());
    const net = network();
    await call(admin, 'start', { requestKey: KEY }, 'editor', net.deps);
    expect(net.calls.some((u) => u.includes('/cnpj/v1/11222333000181'))).toBe(true);
    expect(net.calls.some((u) => u.includes('/cep/v2/01310100'))).toBe(true);
    expect(net.calls.some((u) => u.includes('exemplo.com.br'))).toBe(true);
    expect(net.calls.some((u) => u.includes('outro.com'))).toBe(false);
    const stored = JSON.stringify([tables.project_analysis_runs, tables.project_analysis_checks, tables.project_findings]);
    expect(stored).not.toMatch(/SEGREDO/);
    expect(stored).not.toMatch(/FULANO/);
  });

  it('o mesmo pedido repetido devolve a execução existente, sem novas consultas', async () => {
    const { admin, tables } = fakeAdmin(seed());
    const first = network();
    await call(admin, 'start', { requestKey: KEY }, 'editor', first.deps);
    const second = network();
    const r = await call(admin, 'start', { requestKey: KEY }, 'editor', second.deps);
    expect(r.status).toBe(200);
    expect(r.body.replayed).toBe(true);
    expect(second.calls).toEqual([]);
    expect(tables.project_analysis_runs).toHaveLength(1);
  });

  it('a mesma chave usada em outro projeto da mesma organização é recusada', async () => {
    const { admin } = fakeAdmin(seed({ projects: [...seed().projects.slice(0, 1), { id: OTHER_PROJECT, name: 'Irmão', domain: 'i.com', organization_id: ORG, user_id: USER, nexus_strategy: {}, nexus_strategy_version: 1 }] }));
    await call(admin, 'start', { requestKey: KEY });
    const r = await handleAnalyzeAction(admin, { action: 'start', body: { projectId: OTHER_PROJECT, requestKey: KEY }, userId: USER, roleByOrg: roles('editor'), deps: network().deps });
    expect(r.status).toBe(409);
  });

  it('exige chave de pedido, projeto válido, papel de escrita e participação na organização', async () => {
    const { admin } = fakeAdmin(seed());
    expect((await call(admin, 'start', {})).status).toBe(422);
    expect((await call(admin, 'start', { requestKey: 'curta' })).status).toBe(422);
    expect((await call(admin, 'start', { requestKey: KEY, projectId: 'nao-e-uuid' })).status).toBe(422);
    expect((await call(admin, 'start', { requestKey: KEY, projectId: '00000000-0000-4000-8000-0000000000ff' })).status).toBe(404);
    expect((await call(admin, 'start', { requestKey: KEY }, 'viewer')).body.error).toBe('role_not_allowed');
    expect((await call(admin, 'start', { requestKey: KEY }, null)).body.error).toBe('organization_membership_required');
    // papel de OUTRA organização não vale para este projeto
    expect((await call(admin, 'start', { requestKey: KEY }, 'owner', network().deps, OTHER_ORG)).status).toBe(403);
    for (const role of ['owner', 'admin', 'editor']) {
      const f = fakeAdmin(seed());
      expect((await call(f.admin, 'start', { requestKey: KEY }, role)).status, role).toBe(200);
    }
  });

  it('uma execução por vez: em andamento recente = 409; travada há mais de 3 minutos é encerrada e a nova roda', async () => {
    const running = { id: '00000000-0000-4000-8000-0000000000d1', organization_id: ORG, project_id: PROJECT, request_key: 'antiga-0001', level: 'basico', status: 'running', started_at: new Date(T0 - 30_000).toISOString(), created_at: new Date(T0 - 30_000).toISOString() };
    const a = fakeAdmin(seed({ project_analysis_runs: [{ ...running }] }));
    expect((await call(a.admin, 'start', { requestKey: KEY })).body.error).toBe('already_running');
    const stale = { ...running, started_at: new Date(T0 - 10 * 60_000).toISOString(), created_at: new Date(T0 - 10 * 60_000).toISOString() };
    const b = fakeAdmin(seed({ project_analysis_runs: [stale] }));
    const r = await call(b.admin, 'start', { requestKey: KEY });
    expect(r.status).toBe(200);
    expect(b.tables.project_analysis_runs.find((x) => x.id === running.id)).toMatchObject({ status: 'failed', error: 'interrompida' });
  });

  it(`limite de ${MAX_RUNS_PER_PROJECT_DAY} execuções por projeto em 24 h`, async () => {
    const recent = Array.from({ length: MAX_RUNS_PER_PROJECT_DAY }, (_, i) => ({ id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, organization_id: ORG, project_id: PROJECT, request_key: `chave-antiga-${i}`, level: 'basico', status: 'done', created_at: new Date(T0 - 3_600_000 - i * 1000).toISOString() }));
    const a = fakeAdmin(seed({ project_analysis_runs: recent }));
    const r = await call(a.admin, 'start', { requestKey: KEY });
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('daily_limit');
    const old = recent.map((x) => ({ ...x, created_at: new Date(T0 - 3 * 86_400_000).toISOString() }));
    expect((await call(fakeAdmin(seed({ project_analysis_runs: old })).admin, 'start', { requestKey: KEY })).status).toBe(200);
  });

  it('falha ao gravar: a execução fica "failed", sem relatório pela metade', async () => {
    const fa = fakeAdmin(seed());
    const admin = { ...fa.admin, from: (n: string) => { const q = fa.admin.from(n); return n === 'project_analysis_checks' ? { ...q, insert: () => Promise.resolve({ data: null, error: { code: 'X' } }) } : q; } };
    const r = await call(admin, 'start', { requestKey: KEY });
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('analyze_run_failed');
    expect(fa.tables.project_analysis_runs[0]).toMatchObject({ status: 'failed', error: 'falha_interna' });
  });

  it('rede toda fora do ar: execução termina como "partial" e o relatório mostra erro, não números', async () => {
    const { admin } = fakeAdmin(seed());
    const dead: Deps = { now: () => T0, lookupA: async () => ['93.184.216.34'], fetchFn: (async () => { throw new Error('rede'); }) as typeof fetch };
    const r = await call(admin, 'start', { requestKey: KEY }, 'editor', dead);
    expect(r.body.run.status).toBe('partial');
    expect(r.body.checks.find((c: { check_key: string }) => c.check_key === 'cnpj_receita')).toMatchObject({ status: 'error', measured: {} });
  });
});

describe('pente fino: ler', () => {
  async function withRun() {
    const f = fakeAdmin(seed());
    const r = await call(f.admin, 'start', { requestKey: KEY });
    return { ...f, runId: r.body.run.id as string };
  }
  it('qualquer membro (inclusive visualizador) lê a última execução, uma específica e o histórico', async () => {
    const { admin, runId } = await withRun();
    const latest = await call(admin, 'get', {}, 'viewer');
    expect(latest.body.run.id).toBe(runId);
    expect(latest.body.checks).toHaveLength(13);
    expect((await call(admin, 'get', { runId }, 'viewer')).body.run.id).toBe(runId);
    const h = await call(admin, 'history', {}, 'viewer');
    expect(h.body.runs).toHaveLength(1);
    expect(h.body.runs[0]).toMatchObject({ id: runId, status: 'done' });
  });
  it('sem execução devolve vazio; não-membro, execução de outro projeto e id inválido são recusados', async () => {
    const { admin, runId } = await withRun();
    expect((await call(admin, 'get', {}, null)).status).toBe(403);
    expect((await call(admin, 'get', { runId: 'xx' }, 'viewer')).status).toBe(422);
    expect((await call(admin, 'get', { runId: '00000000-0000-4000-8000-0000000000ff' }, 'viewer')).status).toBe(404);
    const other = await handleAnalyzeAction(admin, { action: 'get', body: { projectId: OTHER_PROJECT, runId }, userId: USER, roleByOrg: roles('owner', OTHER_ORG), deps: network().deps });
    expect(other.status).toBe(404);
    const empty = fakeAdmin(seed());
    expect((await call(empty.admin, 'get', {}, 'viewer')).body).toEqual({ run: null, checks: [], findings: [] });
  });
});

describe('pente fino: decidir achado', () => {
  async function withFinding() {
    const f = fakeAdmin(seed({ project_profile_extended: [{ project_id: PROJECT, sections: { negocio: { cnpj: '11.222.333/0001-82', cnpjstat: 'Tenho CNPJ' } } }] }));
    const r = await call(f.admin, 'start', { requestKey: KEY });
    const finding = (r.body.findings as Array<{ id: string; check_key: string }>).find((x) => x.check_key === 'cnpj_formato')!;
    return { ...f, findingId: finding.id };
  }
  it('editor marca como resolvido/ignorado e reabre; fica registrado quem decidiu', async () => {
    const { admin, tables, findingId } = await withFinding();
    expect((await call(admin, 'decide_finding', { findingId, state: 'applied' })).body).toEqual({ id: findingId, state: 'applied' });
    expect(tables.project_findings.find((x) => x.id === findingId)).toMatchObject({ state: 'applied', decided_by: USER });
    expect((await call(admin, 'decide_finding', { findingId, state: 'ignored' })).status).toBe(200);
    await call(admin, 'decide_finding', { findingId, state: 'open' });
    expect(tables.project_findings.find((x) => x.id === findingId)).toMatchObject({ state: 'open', decided_by: null, decided_at: null });
  });
  it('visualizador não decide; estado e id inválidos e achado de outro projeto são recusados', async () => {
    const { admin, findingId } = await withFinding();
    expect((await call(admin, 'decide_finding', { findingId, state: 'applied' }, 'viewer')).body.error).toBe('role_not_allowed');
    expect((await call(admin, 'decide_finding', { findingId, state: 'apagado' })).status).toBe(422);
    expect((await call(admin, 'decide_finding', { findingId: 'xx', state: 'applied' })).status).toBe(422);
    expect((await call(admin, 'decide_finding', { findingId: '00000000-0000-4000-8000-0000000000ff', state: 'applied' })).status).toBe(404);
    const cross = await handleAnalyzeAction(admin, { action: 'decide_finding', body: { projectId: OTHER_PROJECT, findingId, state: 'ignored' }, userId: USER, roleByOrg: roles('owner', OTHER_ORG), deps: network().deps });
    expect(cross.status).toBe(404);
  });
});
