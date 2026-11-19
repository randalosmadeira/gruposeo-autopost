import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { BACKLINK_ACTIONS, MAX_VERIFY_PER_PROJECT_DAY, PAGE_SIZE, handleBacklinkAction } from '../../supabase/functions/_shared/backlinks-handler';
import { MAX_LINKS_PER_PROJECT } from '../../supabase/functions/_shared/backlinks-core';
import type { Deps } from '../../supabase/functions/_shared/profile-analyze-core';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const P = '00000000-0000-4000-8000-0000000000b1';
const NO_DOMAIN = '00000000-0000-4000-8000-0000000000b3';
const USER = '00000000-0000-4000-8000-0000000000c1';
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);

const html = (h: string) => () => new Response(h, { status: 200, headers: { 'content-type': 'text/html' } });
function deps(pages: Record<string, () => Response> = {}): { d: Deps; calls: string[] } {
  const calls: string[] = [];
  return { calls, d: { now: () => NOW, lookupA: async () => ['93.184.216.34'], fetchFn: (async (input: RequestInfo | URL) => { const u = String(input); calls.push(u); const f = pages[u]; if (!f) return new Response('', { status: 404 }); return f(); }) as typeof fetch } };
}
const seed = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: [
    { id: P, name: 'RDM Advogados', domain: 'rdmadvogados.com.br', organization_id: ORG, wordpress_url: null },
    { id: NO_DOMAIN, name: 'Sem site', domain: null, organization_id: ORG, wordpress_url: null },
  ],
  project_backlinks: [], project_alerts: [], project_backlink_settings: [], ...over,
});
const link = (i: number, over: Row = {}): Row => ({
  id: `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`, organization_id: ORG, project_id: P, target_host: 'rdmadvogados.com.br', kind: 'own',
  source_url: `https://site${i}.com/p`, source_host: `site${i}.com`, source_domain: `site${i}.com`, target_url: null, anchor: null, link_attr: null, origin: 'ahrefs', status: 'unverified',
  http_status: null, source_noindex: null, links_found: null, check_error: null, first_seen_at: '2026-11-10T10:00:00.000Z', last_checked_at: null, status_changed_at: null, last_live_at: null, ...over,
});
const call = (action: string, body: Record<string, unknown>, o: { role?: string | null; tables?: Record<string, Row[]>; pages?: Record<string, () => Response>; now?: () => number } = {}) => {
  const { d, calls } = deps(o.pages);
  const roleByOrg = new Map<string, string>(o.role === null ? [[OTHER, 'owner']] : [[ORG, o.role || 'owner']]);
  const tables = o.tables || seed();
  return handleBacklinkAction(fakeAdmin(tables).admin, { action, body: { projectId: P, ...body }, userId: USER, roleByOrg, deps: o.now ? { ...d, now: o.now } : d }).then((r) => ({ ...r, calls, tables }));
};

describe('backlinks: função de borda', () => {
  it('ações existentes', () => { expect(BACKLINK_ACTIONS).toEqual(['get', 'import', 'verify', 'remove', 'settings_save', 'alerts_dismiss']); });

  it('importa a lista do site do projeto: guarda origem, deixa "não verificado" e avisa o que foi descartado', async () => {
    const r = await call('import', { origin: 'google_search_console', text: 'https://a.com/1\nhttps://a.com/1\nhttps://rdmadvogados.com.br/x\nlixo\nhttps://b.com/2' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ added: 2, already_there: 0, invalid: 1, self_links: 1, duplicates_in_file: 1, over_limit: 0 });
    expect(r.tables.project_backlinks).toHaveLength(2);
    expect(r.tables.project_backlinks[0]).toMatchObject({ project_id: P, organization_id: ORG, target_host: 'rdmadvogados.com.br', kind: 'own', origin: 'google_search_console', status: 'unverified', created_by: USER });
  });
  it('importar de novo não duplica', async () => {
    const tables = seed({ project_backlinks: [link(1, { source_url: 'https://a.com/1' })] });
    const r = await call('import', { text: 'https://a.com/1\nhttps://b.com/2' }, { tables });
    expect(r.body).toMatchObject({ added: 1, already_there: 1 });
    expect(tables.project_backlinks).toHaveLength(2);
  });
  it('importa links de um CONCORRENTE sem misturar com os do cliente, no máximo 5 concorrentes', async () => {
    const tables = seed();
    const r = await call('import', { target: 'https://www.rival.com.br/', text: 'https://a.com/1' }, { tables });
    expect(r.status).toBe(200);
    expect(tables.project_backlinks[0]).toMatchObject({ target_host: 'rival.com.br', kind: 'competitor' });
    const full = seed({ project_backlinks: ['a', 'b', 'c', 'd', 'e'].map((x, i) => link(i, { target_host: `${x}.com.br`, kind: 'competitor' })) });
    const over = await call('import', { target: 'f.com.br', text: 'https://a.com/1' }, { tables: full });
    expect(over).toMatchObject({ status: 422, body: { error: 'competitor_limit' } });
  });
  it('respeita o teto de links por projeto', async () => {
    const full = seed({ project_backlinks: Array.from({ length: MAX_LINKS_PER_PROJECT - 1 }, (_, i) => link(i, { source_url: `https://x${i}.com/p`, id: `00000000-0000-4000-8000-${String(5000 + i).padStart(12, '0')}` })) });
    const r = await call('import', { text: 'https://n1.com/\nhttps://n2.com/\nhttps://n3.com/' }, { tables: full });
    expect(r.body).toMatchObject({ added: 1, over_limit: 2 });
  });
  it('recusa origem desconhecida, lista vazia e projeto sem site (importar para o próprio site)', async () => {
    expect((await call('import', { origin: 'hack', text: 'https://a.com/1' })).body.error).toBe('origin_invalid');
    expect((await call('import', { text: '   ' })).body.error).toBe('list_required');
    expect((await call('import', { projectId: NO_DOMAIN, text: 'https://a.com/1' })).body.error).toBe('project_domain_required');
  });

  it('papéis: só dono/admin/editor escrevem; visualizador lê; quem não é da organização não vê nada', async () => {
    expect((await call('import', { text: 'https://a.com/1' }, { role: 'viewer' })).body.error).toBe('role_not_allowed');
    expect((await call('verify', {}, { role: 'viewer' })).status).toBe(403);
    expect((await call('remove', { ids: [] }, { role: 'viewer' })).status).toBe(403);
    const v = await call('get', {}, { role: 'viewer' });
    expect(v.status).toBe(200);
    expect(v.body.can_edit).toBe(false);
    expect((await call('get', {}, { role: null })).body.error).toBe('organization_membership_required');
    expect((await call('get', { projectId: 'nao-e-uuid' })).body.error).toBe('project_id_required');
  });

  it('verifica um lote ao vivo: no ar, link perdido e página fora do ar; guarda a prova e a data', async () => {
    const tables = seed({ project_backlinks: [link(1), link(2), link(3)] });
    const pages = { 'https://site1.com/p': html('<a href="https://rdmadvogados.com.br/x" rel="nofollow">RDM Advogados</a>'), 'https://site2.com/p': html('<p>sem link</p>') };
    const r = await call('verify', {}, { tables, pages });
    expect(r.body).toMatchObject({ checked: 3, failed: 0, changes: 3, remaining_pending: 0 });
    const [a, b, c] = tables.project_backlinks;
    expect(a).toMatchObject({ status: 'live', anchor: 'RDM Advogados', link_attr: 'nofollow', http_status: 200, last_checked_at: new Date(NOW).toISOString(), last_live_at: new Date(NOW).toISOString(), target_url: 'https://rdmadvogados.com.br/x' });
    expect(b).toMatchObject({ status: 'lost', check_error: 'link_nao_encontrado_no_html', last_live_at: null });
    expect(c).toMatchObject({ status: 'dead', http_status: 404 });
  });
  it('por padrão verifica só as nunca verificadas, no máximo 12 por chamada, e diz quantas faltam', async () => {
    const rows = Array.from({ length: 15 }, (_, i) => link(i));
    rows.push(link(99, { status: 'live', last_checked_at: '2026-11-18T10:00:00.000Z' }));
    const tables = seed({ project_backlinks: rows });
    const r = await call('verify', {}, { tables });
    expect(r.body).toMatchObject({ checked: 12, remaining_pending: 3 });
  });
  it('verificar por ids só mexe nas linhas pedidas (e só do projeto)', async () => {
    const tables = seed({ project_backlinks: [link(1), link(2)] });
    const r = await call('verify', { ids: [tables.project_backlinks[1].id] }, { tables });
    expect(r.body.checked).toBe(1);
    expect(tables.project_backlinks[0].last_checked_at).toBeNull();
    expect((await call('verify', { ids: ['x'] }, { tables })).body.error).toBe('ids_invalid');
  });
  it('limite diário de verificações', async () => {
    const rows = Array.from({ length: MAX_VERIFY_PER_PROJECT_DAY }, (_, i) => link(i, { last_checked_at: new Date(NOW - 3600_000).toISOString(), status: 'live' }));
    const r = await call('verify', {}, { tables: seed({ project_backlinks: rows.slice(0, 5).concat(rows.slice(5)).map((x, i) => ({ ...x, id: `00000000-0000-4000-8000-${String(20000 + i).padStart(12, '0')}` })) }) });
    expect(r).toMatchObject({ status: 429, body: { error: 'daily_limit' } });
  });

  it('get: resumo, alvos acompanhados, filtro por situação, busca e página', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => link(i, { id: `00000000-0000-4000-8000-${String(300 + i).padStart(12, '0')}`, status: i % 2 ? 'live' : 'unverified', anchor: i % 2 ? 'RDM Advogados' : null, link_attr: i % 2 ? 'follow' : null }));
    rows.push(link(500, { target_host: 'rival.com.br', kind: 'competitor' }));
    const tables = seed({ project_backlinks: rows });
    const r = await call('get', {}, { tables });
    const b = r.body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(b.summary.total).toBe(120);
    expect(b.summary.by_status).toMatchObject({ live: 60, unverified: 60 });
    expect(b.summary.anchors.marca).toBe(60);
    expect(b.targets).toEqual(expect.arrayContaining([{ host: 'rdmadvogados.com.br', kind: 'own', count: 120 }, { host: 'rival.com.br', kind: 'competitor', count: 1 }]));
    expect(b.links).toHaveLength(PAGE_SIZE);
    expect(b.filtered_total).toBe(120);
    const live = (await call('get', { status: 'live', page: 1 }, { tables })).body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(live.filtered_total).toBe(60);
    expect(live.links).toHaveLength(10);
    const q = (await call('get', { q: 'site7/' }, { tables })).body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(q.filtered_total).toBe(0);
    const comp = (await call('get', { target: 'https://rival.com.br' }, { tables })).body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(comp.summary.total).toBe(1);
    expect(comp.target).toEqual({ host: 'rival.com.br', kind: 'competitor' });
  });

  it('remove só do projeto, settings_save e alerts_dismiss', async () => {
    const tables = seed({ project_backlinks: [link(1), link(2)], project_alerts: [{ id: '00000000-0000-4000-8000-0000000007a1', project_id: P, source: 'backlinks', dismissed_at: null }, { id: '00000000-0000-4000-8000-0000000007a2', project_id: P, source: 'speed', dismissed_at: null }] });
    const rm = await call('remove', { ids: [tables.project_backlinks[0].id] }, { tables });
    expect(rm.body.removed).toBe(1);
    expect(tables.project_backlinks).toHaveLength(1);
    expect((await call('settings_save', { enabled: true, recheck_days: 21 }, { tables })).body.settings).toEqual({ enabled: true, recheck_days: 21 });
    expect(tables.project_backlink_settings[0]).toMatchObject({ project_id: P, organization_id: ORG, enabled: true, recheck_days: 21, updated_by: USER });
    expect((await call('settings_save', { enabled: true, recheck_days: 3 }, { tables })).body.error).toBe('settings_days_invalid');
    await call('settings_save', { enabled: false, recheck_days: 14 }, { tables });
    expect(tables.project_backlink_settings).toHaveLength(1);
    expect(tables.project_backlink_settings[0].enabled).toBe(false);
    const d = await call('alerts_dismiss', { all: true }, { tables });
    expect(d.body.dismissed).toBe(1);
    expect(tables.project_alerts.find((a) => a.source === 'speed')?.dismissed_at).toBeNull(); // aviso de velocidade não é tocado
    expect((await call('alerts_dismiss', {}, { tables })).body.error).toBe('alert_id_required');
  });
});
