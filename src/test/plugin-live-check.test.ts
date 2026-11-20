import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import {
  ORIGIN_LIVE, ORIGIN_STORED, applyPluginVersionPush, checkOne, checkProjectsLive, cleanVersion, liveBase, parseQueue, persistLiveVersions, sanitizeQueueError, safeGetJson,
  type LiveDeps, type LiveTarget,
} from '../../supabase/functions/_shared/plugin-live-check';
import { assessProject, buildItems, normalizeFacts, type ProjectFacts } from '../../supabase/functions/_shared/project-health-core';
import { PLUGIN_VERSION } from '../../supabase/functions/_shared/plugin-version';
import { handleLifecycleAction, withLiveCheck } from '../../supabase/functions/_shared/project-lifecycle-handler';

const NOW = Date.UTC(2026, 10, 20, 15, 0, 0);
const P = '00000000-0000-4000-8000-0000000000b1';
const ORG = '00000000-0000-4000-8000-0000000000a1';
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const versionBody = (v: string) => ({ success: true, software_id: 'zica-posts', version: v });

interface Call { url: string; headers: Record<string, string> }
/** Rede falsa: `routes` casa por pedaço da URL; devolve o que a função devolver. */
const net = (handler: (url: string, headers: Record<string, string>) => Response | Promise<Response>, opts: { dns?: (h: string) => string[] } = {}) => {
  const calls: Call[] = [];
  const deps: LiveDeps = {
    fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers || {}) as Record<string, string>;
      calls.push({ url, headers });
      return await handler(url, headers);
    }) as typeof fetch,
    lookupA: async (h) => (opts.dns ? opts.dns(h) : ['203.0.113.10']),
    now: () => NOW,
    timeoutMs: 60,
    getKey: async (ref) => (ref === 'ref-ok' ? 'chave-secreta-do-plugin-0123456789' : null),
  };
  return { deps, calls };
};
const target = (over: Partial<LiveTarget> = {}): LiveTarget => ({ project_id: P, wordpress_url: 'https://rdmadvogados.com.br/blog', namespace: 'zica-posts/v1', credential_ref: null, stored_version: '3.16.1', stored_verified_at: '2026-11-10T10:00:00.000Z', ...over });

describe('conferência ao vivo da versão do plugin', () => {
  it('versão mudou: lê ao vivo, devolve a nova e marca changed (o caso real: painel dizia 3.16.1 e o site já estava na 3.18.0)', async () => {
    const { deps, calls } = net(() => json(versionBody('3.18.0')));
    const r = await checkOne(target(), deps);
    expect(r).toMatchObject({ version: '3.18.0', stored_version: '3.16.1', changed: true, origem: ORIGIN_LIVE, motivo: null, motivo_texto: null });
    expect(r.conferido_em).toBe(new Date(NOW).toISOString());
    expect(calls[0].url).toBe('https://rdmadvogados.com.br/blog/wp-json/zica-posts/v1/version');
  });

  it('versão igual: changed=false, continua "ao vivo"', async () => {
    const { deps } = net(() => json(versionBody('3.16.1')));
    expect(await checkOne(target(), deps)).toMatchObject({ version: '3.16.1', changed: false, origem: ORIGIN_LIVE });
  });

  it('timeout: usa o valor guardado, diz que o site não respondeu e NÃO tenta outra rota (site fora do ar)', async () => {
    const { deps, calls } = net(() => new Promise<Response>(() => undefined));
    const r = await checkOne(target(), deps);
    expect(r).toMatchObject({ version: '3.16.1', changed: false, origem: ORIGIN_STORED, motivo: 'tempo_esgotado', conferido_em: '2026-11-10T10:00:00.000Z' });
    expect(r.motivo_texto).toContain('3 segundos');
    expect(calls).toHaveLength(1);
  });

  it('erro 500 em todas as rotas: guardado com o motivo HTTP por extenso', async () => {
    const { deps } = net(() => json({ code: 'internal' }, 500));
    const r = await checkOne(target(), deps);
    expect(r).toMatchObject({ origem: ORIGIN_STORED, motivo: 'http_500', version: '3.16.1' });
    expect(r.motivo_texto).toContain('HTTP 500');
  });

  it('wp-json devolve 404 mas ?rest_route= responde (permalink simples): usa a segunda rota', async () => {
    const { deps, calls } = net((url) => (url.includes('rest_route') ? json(versionBody('3.18.0')) : json({}, 404)));
    expect(await checkOne(target(), deps)).toMatchObject({ version: '3.18.0', origem: ORIGIN_LIVE });
    expect(calls).toHaveLength(2);
  });

  it('resposta inválida (HTML de outro site, JSON sem versão, versão com lixo, software de outro plugin): nunca vira versão', async () => {
    for (const make of [() => new Response('<html>oi</html>', { status: 200 }), () => json({ success: true }), () => json({ success: true, version: '3.18.0; DROP TABLE' }), () => json({ success: true, version: '3.18.0', software_id: 'outro-plugin' }), () => json([1, 2])]) {
      const { deps } = net(make);
      const r = await checkOne(target(), deps);
      expect(r, String(make)).toMatchObject({ origem: ORIGIN_STORED, version: '3.16.1', changed: false, motivo: 'resposta_invalida' });
    }
  });

  it('URL insegura: não faz NENHUMA requisição (http, IP, localhost, rede privada, credenciais, porta estranha, DNS privado)', async () => {
    for (const url of ['http://exemplo.com.br', 'https://127.0.0.1', 'https://localhost/blog', 'https://servidor.internal', 'https://user:pass@exemplo.com.br', 'https://exemplo.com.br:8443', 'https://10.0.0.5/x', 'ftp://exemplo.com.br']) {
      const { deps, calls } = net(() => json(versionBody('9.9.9')));
      const r = await checkOne(target({ wordpress_url: url }), deps);
      expect(r.origem, url).toBe(ORIGIN_STORED);
      expect(r.changed, url).toBe(false);
      expect(calls, url).toHaveLength(0);
    }
    const priv = net(() => json(versionBody('9.9.9')), { dns: () => ['10.1.2.3'] });
    expect(await checkOne(target(), priv.deps)).toMatchObject({ origem: ORIGIN_STORED, motivo: 'url_insegura' });
    expect(priv.calls).toHaveLength(0);
    const semUrl = await checkOne(target({ wordpress_url: '  ' }), net(() => json({})).deps);
    expect(semUrl).toMatchObject({ motivo: 'sem_endereco', origem: ORIGIN_STORED });
  });

  it('redirecionamento: aceita o mesmo site (www), recusa host diferente, nunca manda a chave a outro host e nunca desce para http', async () => {
    const same = net((url) => (url.startsWith('https://rdmadvogados.com.br') ? new Response(null, { status: 301, headers: { location: 'https://www.rdmadvogados.com.br/blog/wp-json/zica-posts/v1/version' } }) : json(versionBody('3.18.0'))));
    expect(await checkOne(target(), same.deps)).toMatchObject({ version: '3.18.0', origem: ORIGIN_LIVE });
    const other = net(() => new Response(null, { status: 302, headers: { location: 'https://atacante.example/versao' } }));
    const r = await checkOne(target(), other.deps);
    expect(r).toMatchObject({ origem: ORIGIN_STORED, motivo: 'redirecionamento_externo' });
    expect(other.calls).toHaveLength(1);
    const down = net(() => new Response(null, { status: 302, headers: { location: 'http://rdmadvogados.com.br/versao' } }));
    expect(await checkOne(target(), down.deps)).toMatchObject({ motivo: 'url_insegura' });
    const hop = await safeGetJson(net((url) => (url.startsWith('https://a.com.br') ? new Response(null, { status: 302, headers: { location: 'https://www.a.com.br/x' } }) : json({ ok: 1 }))).deps, 'https://a.com.br/x', { 'X-ZICA-POSTS-Key': 'k' });
    expect(hop.ok).toBe(true);
  });

  it('a chave do plugin só vai ao host original e a resposta de /status vira a fila (com o motivo já saneado)', async () => {
    const { deps, calls } = net((url) => (url.endsWith('/version') ? json(versionBody('3.19.0')) : json({ success: true, outbox: { failed: 206 }, outbox_summary: { counts: { failed: 206, delivered: 10 }, last_error: 'cURL error 28: timed out for https://hub.zica.ai/hook?token=abcdefghijklmnopqrstuvwxyz0123456789', last_error_event_at: '2026-11-20 14:00:00' } })));
    const r = await checkOne(target({ credential_ref: 'ref-ok' }), deps);
    expect(r.queue).toMatchObject({ failed: 206, detail: true, last_error: 'cURL error 28: timed out for [endereço]', last_error_at: '2026-11-20 14:00:00' });
    expect(JSON.stringify(r)).not.toContain('chave-secreta');
    expect(JSON.stringify(r)).not.toContain('abcdefghijklmnop');
    expect(calls[0].headers['X-ZICA-POSTS-Key']).toBeUndefined();
    expect(calls[1].url.endsWith('/status')).toBe(true);
    expect(calls[1].headers['X-ZICA-POSTS-Key']).toBe('chave-secreta-do-plugin-0123456789');
  });

  it('plugin antigo (3.18): só contagens, motivo "sem dados"; sem chave no cofre: fila null', async () => {
    const old = net((url) => (url.endsWith('/version') ? json(versionBody('3.18.0')) : json({ success: true, outbox: { failed: 206, pending: 0 } })));
    const r = await checkOne(target({ credential_ref: 'ref-ok' }), old.deps);
    expect(r.queue).toMatchObject({ failed: 206, pending: 0, detail: false, last_error: null });
    const noKey = net(() => json(versionBody('3.18.0')));
    expect((await checkOne(target({ credential_ref: 'ref-sem-chave' }), noKey.deps)).queue).toBeNull();
    expect(noKey.calls).toHaveLength(1);
    expect(parseQueue(null)).toBeNull();
    expect(parseQueue({ success: true })).toBeNull();
  });

  it('vários sites: concorrência limitada, um site lento não atrasa nem derruba os outros, cache curto evita nova consulta e "conferir agora" ignora o cache', async () => {
    let inFlight = 0; let peak = 0;
    const { deps, calls } = net(async (url) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return url.includes('lento.com.br') ? new Promise<Response>(() => undefined) : json(versionBody('3.18.0'));
    });
    const targets = Array.from({ length: 12 }, (_, i) => target({ project_id: `p${i}`, wordpress_url: i === 3 ? 'https://lento.com.br' : `https://site${i}.com.br` }));
    const cache = new Map();
    const out = await checkProjectsLive(targets, deps, { cache, concurrency: 5 });
    expect(out).toHaveLength(12);
    expect(peak).toBeLessThanOrEqual(5);
    expect(out[3]).toMatchObject({ origem: ORIGIN_STORED, motivo: 'tempo_esgotado' });
    expect(out.filter((r) => r.origem === ORIGIN_LIVE)).toHaveLength(11);
    const before = calls.length;
    await checkProjectsLive(targets, deps, { cache });
    expect(calls.length).toBe(before);
    await checkProjectsLive(targets, deps, { cache, force: true });
    expect(calls.length).toBeGreaterThan(before);
  });

  it('utilitários: versão válida, base da URL, erro saneado', () => {
    expect(cleanVersion('3.18.0')).toBe('3.18.0');
    expect(cleanVersion('3.19.0-rc1')).toBe('3.19.0-rc1');
    expect(cleanVersion('3.18')).toBeNull();
    expect(cleanVersion(3)).toBeNull();
    expect(liveBase('rdmadvogados.com.br/blog/')).toBe('https://rdmadvogados.com.br/blog');
    expect(liveBase('https://x.com.br/blog/wp-json/zica-posts/v1/')).toBe('https://x.com.br/blog');
    expect(liveBase('http://x.com.br')).toBeNull();
    expect(sanitizeQueueError('falha em https://a.com/?api_key=ZZZ senha=hunter2')).toBe('falha em [endereço] senha=[oculto]');
    expect(sanitizeQueueError('x'.repeat(500))!.length).toBeLessThanOrEqual(201);
    expect(sanitizeQueueError('   ')).toBeNull();
  });
});

describe('gravação e empurrão do plugin', () => {
  it('persistLiveVersions grava SÓ quando mudou e foi lido ao vivo', async () => {
    const tables: Record<string, Row[]> = { projects: [{ id: 'a', wordpress_plugin_version: '3.16.1' }, { id: 'b', wordpress_plugin_version: '3.18.0' }, { id: 'c', wordpress_plugin_version: '3.16.1' }] };
    const { admin } = fakeAdmin(tables);
    const base = { stored_version: null, conferido_em: null, tentado_em: 'x', motivo: null, motivo_texto: null, queue: null } as const;
    const n = await persistLiveVersions(admin, [
      { ...base, project_id: 'a', version: '3.18.0', changed: true, origem: ORIGIN_LIVE },
      { ...base, project_id: 'b', version: '3.18.0', changed: false, origem: ORIGIN_LIVE },
      { ...base, project_id: 'c', version: '3.18.0', changed: true, origem: ORIGIN_STORED },
    ], '2026-11-20T15:00:00.000Z');
    expect(n).toBe(1);
    expect(tables.projects.map((p) => p.wordpress_plugin_version)).toEqual(['3.18.0', '3.18.0', '3.16.1']);
    expect(tables.projects[0].updated_at).toBe('2026-11-20T15:00:00.000Z');
  });

  it('applyPluginVersionPush: o plugin avisa a versão nova e o projeto com aquela chave (e só ele) é atualizado', async () => {
    const hash = 'abcdef0123456789'.repeat(4);
    const tables: Record<string, Row[]> = { projects: [
      { id: 'a', organization_id: ORG, wordpress_connector_mode: 'zica_posts', wordpress_credential_ref: `wordpress_user1_${hash.slice(0, 16)}`, wordpress_plugin_version: '3.16.1' },
      { id: 'b', organization_id: ORG, wordpress_connector_mode: 'zica_posts', wordpress_credential_ref: 'wordpress_user1_ffffffffffffffff', wordpress_plugin_version: '3.16.1' },
      { id: 'c', organization_id: ORG, wordpress_connector_mode: 'application_password', wordpress_credential_ref: `wordpress_user1_${hash.slice(0, 16)}`, wordpress_plugin_version: null },
    ] };
    const { admin } = fakeAdmin(tables);
    const r = await applyPluginVersionPush(admin, { keyHash: hash, version: '3.19.0', nowIso: 'T' });
    expect(r.changed).toEqual([{ project_id: 'a', organization_id: ORG, from: '3.16.1', to: '3.19.0' }]);
    expect(tables.projects.map((p) => p.wordpress_plugin_version)).toEqual(['3.19.0', '3.16.1', null]);
    expect((await applyPluginVersionPush(admin, { keyHash: hash, version: '3.19.0', nowIso: 'T' })).updated).toBe(0);
    expect((await applyPluginVersionPush(admin, { keyHash: hash, version: 'lixo', nowIso: 'T' })).updated).toBe(0);
    expect((await applyPluginVersionPush(admin, { keyHash: 'curto', version: '3.19.0', nowIso: 'T' })).updated).toBe(0);
  });
});

const baseFacts = (over: Partial<ProjectFacts['wordpress']> = {}): ProjectFacts => normalizeFacts({
  id: P, name: 'Blog RDM', domain: 'rdmadvogados.com.br', wordpress_url: 'https://rdmadvogados.com.br/blog', created_at: '2026-01-01T00:00:00Z', lifecycle_status: 'ativo',
  wordpress: { connected: true, plugin_version: '3.16.1', mode: 'zica_posts', connected_at: '2026-10-01T00:00:00Z', last_verified_at: '2026-11-10T10:00:00Z', ...over },
  articles: { total: 1, published: 1, last_published_at: '2026-11-19T00:00:00Z' }, gsc: { rows: 0, last_day: null }, ga4: { rows: 0, last_day: null }, providers: [],
  signals: { tracking_key: false, last_batch_at: null, last_day: null, cta_28d: 0 }, automation: { news_agents_active: 0, rss_active: 0 },
});
const live = (over: Record<string, unknown>) => ({ origin: ORIGIN_LIVE, checked_at: '2026-11-20T15:00:00.000Z', attempted_at: '2026-11-20T15:00:00.000Z', reason: null, queue: null, ...over });

describe('saúde do projeto com a conferência ao vivo', () => {
  const plugin = (f: ProjectFacts) => buildItems(f, NOW).find((i) => i.key === 'plugin')!;
  const queue = (f: ProjectFacts) => buildItems(f, NOW).find((i) => i.key === 'fila_plugin');

  it('sem a conferência nada muda (nenhum item de fila, texto antigo)', () => {
    const f = baseFacts();
    expect(queue(f)).toBeUndefined();
    expect(plugin(f).detail).toBe(`Plugin 3.16.1 desatualizado; a versão atual é ${PLUGIN_VERSION}.`);
  });

  it('ao vivo: mostra a versão lida e diz que foi conferida agora', () => {
    const f = baseFacts({ plugin_version: '3.18.0', live: live({}) as never });
    expect(plugin(f).detail).toContain('Plugin 3.18.0');
    expect(plugin(f).detail).toContain('Conferido ao vivo agora.');
    const atual = baseFacts({ plugin_version: PLUGIN_VERSION, live: live({}) as never });
    expect(plugin(atual).status).toBe('ok');
  });

  it('site não respondeu: valor guardado dito por extenso ("não conferido agora") com a data da última verificação', () => {
    const f = baseFacts({ live: live({ origin: ORIGIN_STORED, checked_at: '2026-11-10T10:00:00.000Z', reason: 'demorou mais de 3 segundos' }) as never });
    expect(plugin(f).detail).toContain('Não conferido agora: demorou mais de 3 segundos.');
    expect(plugin(f).detail).toContain('10/11/2026');
    expect(queue(f)).toMatchObject({ status: 'sem_dados' });
  });

  it('fila: falhas com o motivo; plugin antigo diz que o motivo só vem na versão nova; fila em dia fica ok; sem fila é "sem dados"', () => {
    const q = { counts: { failed: 206 }, failed: 206, pending: 0, detail: true, last_error: 'cURL error 28: timed out', last_error_at: '2026-11-20 14:00:00' };
    const novo = queue(baseFacts({ live: live({ queue: q }) as never }))!;
    expect(novo.status).toBe('atencao');
    expect(novo.detail).toContain('206 envios falharam');
    expect(novo.detail).toContain('Último erro registrado: cURL error 28: timed out');
    const antigo = queue(baseFacts({ live: live({ queue: { ...q, detail: false, last_error: null } }) as never }))!;
    expect(antigo.detail).toContain(`só aparece com o plugin ${PLUGIN_VERSION}`);
    expect(queue(baseFacts({ live: live({ queue: { counts: {}, failed: 0, pending: 2, detail: true, last_error: null, last_error_at: null } }) as never }))!.status).toBe('ok');
    expect(queue(baseFacts({ live: live({ queue: null }) as never }))!.status).toBe('sem_dados');
  });

  it('assessProject com a fila quebrada: aparece como atenção e nunca esconde o resto', () => {
    const f = baseFacts({ plugin_version: PLUGIN_VERSION, live: live({ queue: { counts: { failed: 3 }, failed: 3, pending: 0, detail: true, last_error: 'hub_http_500', last_error_at: null } }) as never });
    const h = assessProject(f, [f], NOW);
    expect(h.items.some((i) => i.key === 'fila_plugin' && i.status === 'atencao')).toBe(true);
  });
});

describe('Central: leitura com a conferência ao vivo plugada', () => {
  const rpcs = { project_health_inputs: () => ({ data: [{ ...baseFacts() }], error: null }) };
  const seed = (): Record<string, Row[]> => ({ projects: [{ id: P, organization_id: ORG, wordpress_url: 'https://rdmadvogados.com.br/blog', wordpress_plugin_namespace: 'zica-posts/v1', wordpress_credential_ref: 'ref-ok', wordpress_plugin_version: '3.16.1', lifecycle_status: 'ativo', paused_snapshot: null }] });
  const run = async (handler: (url: string) => Response | Promise<Response>, action = 'health_overview', body: Record<string, unknown> = {}) => {
    const tables = seed();
    const { deps } = net(handler);
    const { admin } = fakeAdmin(tables, rpcs);
    const r = await handleLifecycleAction(admin, { action, body: { organizationId: ORG, projectId: P, force: true, ...body }, userId: 'u', roleByOrg: new Map([[ORG, 'viewer']]), deps: { now: () => NOW, live: deps } });
    return { r, tables };
  };

  it('health_overview: versão mudou no site, painel mostra a nova e o projeto é gravado', async () => {
    const { r, tables } = await run((url) => (url.endsWith('/version') ? json(versionBody('3.18.0')) : json({ success: true, outbox: { failed: 206 } })));
    expect(r.status).toBe(200);
    const proj = (r.body.projects as Array<{ items: Array<{ key: string; detail: string }> }>)[0];
    expect(proj.items.find((i) => i.key === 'plugin')!.detail).toContain('Plugin 3.18.0');
    expect(proj.items.find((i) => i.key === 'plugin')!.detail).toContain('Conferido ao vivo agora.');
    expect(proj.items.find((i) => i.key === 'fila_plugin')!.detail).toContain('206 envios falharam');
    expect(r.body.live).toMatchObject({ enabled: true, projects: 1, ao_vivo: 1, guardado: 0, versions_updated: 1 });
    expect(tables.projects[0].wordpress_plugin_version).toBe('3.18.0');
  });

  it('site fora do ar: a Central NÃO quebra, mostra o valor guardado e diz que não conferiu agora', async () => {
    const { r, tables } = await run(() => json({}, 503), 'health_detail');
    expect(r.status).toBe(200);
    const items = (r.body.health as { items: Array<{ key: string; detail: string }> }).items;
    expect(items.find((i) => i.key === 'plugin')!.detail).toContain('Não conferido agora');
    expect(items.find((i) => i.key === 'plugin')!.detail).toContain('Plugin 3.16.1');
    expect(r.body.live).toBeUndefined();
    expect(tables.projects[0].wordpress_plugin_version).toBe('3.16.1');
  });

  it('sem a dependência de rede (chamada antiga) o comportamento é o de antes e o resumo diz enabled=false', async () => {
    const tables = seed();
    const { admin } = fakeAdmin(tables, rpcs);
    const ctx = { action: 'health_overview', body: { organizationId: ORG }, userId: 'u', roleByOrg: new Map([[ORG, 'viewer']]), deps: { now: () => NOW } };
    const r = await handleLifecycleAction(admin, ctx);
    expect(r.body.live).toMatchObject({ enabled: false });
    const w = await withLiveCheck(admin, ctx, [baseFacts()], null);
    expect(w.facts[0].wordpress.live).toBeUndefined();
  });

  it('projeto arquivado ou conectado de outro jeito não é consultado', async () => {
    const calls: string[] = [];
    const tables = seed();
    const { admin } = fakeAdmin(tables, rpcs);
    const { deps } = net((u) => { calls.push(u); return json(versionBody('3.18.0')); });
    const ctx = { action: 'health_overview', body: { organizationId: ORG }, userId: 'u', roleByOrg: new Map([[ORG, 'viewer']]), deps: { now: () => NOW, live: deps } };
    await withLiveCheck(admin, ctx, [{ ...baseFacts(), lifecycle_status: 'arquivado' }, baseFacts({ mode: 'application_password' })], null);
    expect(calls).toHaveLength(0);
  });
});

describe('pulso da organização (tempo real por varredura leve)', () => {
  const tables = (): Record<string, Row[]> => ({
    projects: [{ id: P, organization_id: ORG, updated_at: '2026-11-20T12:00:00.000Z' }, { id: 'x', organization_id: 'outra', updated_at: '2030-01-01T00:00:00.000Z' }],
    project_events: [
      { id: 'e1', organization_id: ORG, project_id: P, module: 'indexacao', kind: 'indexacao.verificadas', payload: { count: 5 }, created_at: '2026-11-20T13:00:00.000Z' },
      { id: 'e2', organization_id: ORG, project_id: P, module: 'projeto', kind: 'conexao.plugin_atualizado', payload: {}, created_at: '2026-11-20T14:00:00.000Z' },
      { id: 'e3', organization_id: 'outra', project_id: 'x', module: 'radar', kind: 'radar.rodada_concluida', payload: {}, created_at: '2026-11-20T14:30:00.000Z' },
    ],
    articles: [{ id: 'a1', project_id: P, updated_at: '2026-11-20T11:00:00.000Z' }, { id: 'a2', project_id: 'x', updated_at: '2031-01-01T00:00:00.000Z' }],
    spend_reservations: [{ id: 's1', organization_id: ORG, updated_at: '2026-11-20T10:00:00.000Z' }],
  });
  const pulse = async (body: Record<string, unknown>, role: string | null = 'viewer') => {
    const { admin } = fakeAdmin(tables());
    return await handleLifecycleAction(admin, { action: 'pulse', body, userId: 'u', roleByOrg: new Map(role ? [[ORG, role]] : []), deps: { now: () => NOW } });
  };

  it('devolve o carimbo de cada área só da organização do usuário, e os fatos novos desde o cursor', async () => {
    const r = await pulse({ organizationId: ORG, since: '2026-11-20T13:30:00.000Z' });
    expect(r.status).toBe(200);
    expect(r.body.stamps).toEqual({ events: '2026-11-20T14:00:00.000Z', projects: '2026-11-20T12:00:00.000Z', articles: '2026-11-20T11:00:00.000Z', spend: '2026-11-20T10:00:00.000Z' });
    expect((r.body.events as Array<{ id: string; text: string }>).map((e) => e.id)).toEqual(['e2']);
    expect((r.body.events as Array<{ text: string }>)[0].text).toBe('Plugin do WordPress atualizado (o plugin avisou)');
    expect(r.body.server_time).toBe(new Date(NOW).toISOString());
  });

  it('sem cursor não devolve fatos (só os carimbos); sem participação na organização é recusado; id inválido é recusado', async () => {
    expect((await pulse({ organizationId: ORG })).body.events).toEqual([]);
    expect((await pulse({ organizationId: ORG }, null)).status).toBe(403);
    expect((await pulse({ organizationId: 'nao-uuid' })).status).toBe(422);
  });
});
