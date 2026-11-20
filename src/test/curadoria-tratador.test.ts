import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { handleCuradoriaAction, CURADORIA_ACTIONS, CURADORIA_MIN_ROLE, curationState } from '../../supabase/functions/_shared/curadoria-handler';
import { checkCurationGate, gateAdvisory, gateModeFrom, gateRefusalBody } from '../../supabase/functions/_shared/curadoria-gate';
import { ADAPTERS, routeEngineRequest, type EngineDeps } from '../../supabase/functions/_shared/engine-router';
import { ENGINE_SPECS, MODULES, engineSpec, moduleByKey, moduleEdges } from '../../supabase/functions/_shared/module-registry';
import { CURADORIA_VERSION } from '../../supabase/functions/_shared/curadoria-core';

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER_ORG = '00000000-0000-4000-8000-0000000000a2';
const P = '00000000-0000-4000-8000-0000000000b1';
const P_OTHER = '00000000-0000-4000-8000-0000000000b9';
const USER = '00000000-0000-4000-8000-0000000000c1';
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const IMG = (n: string) => `https://x.supabase.co/storage/v1/object/public/article-images/p1/${n}.webp`;

const BODY = (topic: string) => `<h2>O que é ${topic}?</h2><p>${topic} é um tema que a defesa criminal acompanha desde o início do inquérito, conferindo documentos e orientando a família sem prometer resultado.</p>
<p>Veja também <a href="/blog/audiencia-de-custodia">audiência de custódia</a> e <a href="/blog/habeas-corpus">habeas corpus</a>.</p><h2>Conclusão</h2><p>Se precisar de orientação sobre ${topic}, entre em contato com o escritório pelo WhatsApp.</p>`;
const article = (n: number, over: Row = {}): Row => ({
  id: id(n), project_id: P, organization_id: ORG, user_id: USER, status: 'draft', title: `Artigo número ${n} sobre defesa criminal`, keyword: `tema ${n} defesa criminal`, secondary_keywords: [], excerpt: `Resumo ${n}`,
  content: BODY(`tema ${n}`), slug: `artigo-numero-${n}-defesa-criminal`, language: 'pt-BR', type: 'blog', featured_image_url: IMG(`img-${n}`), image_prompt: `ilustração do tema ${n}`, image_source: 'generated',
  nicho_detectado: null, published_url: null, config: { image_geo: { alt_text: `Imagem do tema ${n}` } }, created_at: `2026-11-${String(10 + (n % 9)).padStart(2, '0')}T00:00:00Z`, updated_at: '2026-11-10T00:00:00Z', ...over,
});

/** 1 em criação com imagem repetida, 3 na fila (1 boa, 1 sem imagem, 1 repetida), 1 finalizado bom, 1 publicado que usa a imagem repetida */
const SHARED = IMG('compartilhada');
const world = (role: string | null = 'editor', extra: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: [
    { id: P, name: 'Blog RDM', domain: 'rdmadvogados.com.br', wordpress_url: null, organization_id: ORG },
    { id: P_OTHER, name: 'Alheio', domain: 'outra.example', wordpress_url: null, organization_id: OTHER_ORG },
  ],
  organization_members: role ? [{ organization_id: ORG, user_id: USER, role, status: 'active' }] : [],
  organizations: [{ id: ORG, owner_user_id: null }, { id: OTHER_ORG, owner_user_id: null }],
  articles: [
    article(1, { status: 'generating', featured_image_url: SHARED }),
    article(2, { status: 'draft', featured_image_url: IMG('boa-2') }),
    article(3, { status: 'draft', featured_image_url: null }),
    article(4, { status: 'draft', featured_image_url: SHARED }),
    article(5, { status: 'ready', featured_image_url: IMG('boa-5') }),
    article(6, { status: 'published', featured_image_url: SHARED, published_url: 'https://rdmadvogados.com.br/blog/x', published_at: '2026-11-01T00:00:00Z' }),
    { ...article(9, { status: 'draft' }), project_id: P_OTHER, organization_id: OTHER_ORG },
  ],
  article_curation: [], project_taxonomy_nodes: [], project_geo_scope: [], market_queries: [], project_focuses: [], nexus_prompts: [], nexus_prompt_sets: [], project_funnels: [], project_profile_extended: [], wordpress_article_index: [],
  ...extra,
});

const call = async (action: string, body: Record<string, unknown> = {}, o: { tables?: Record<string, Row[]>; role?: string | null; now?: () => number; budgetMs?: number } = {}) => {
  const tables = o.tables || world(o.role === undefined ? 'editor' : o.role);
  const f = fakeAdmin(tables);
  const roleByOrg = new Map<string, string>(((tables.organization_members || []) as Array<{ organization_id: string; role: string }>).map((m) => [m.organization_id, m.role]));
  const r = await handleCuradoriaAction(f.admin, { action, body: { projectId: P, ...body }, userId: USER, roleByOrg, deps: { now: o.now || (() => NOW), budgetMs: o.budgetMs } });
  return { ...r, tables, log: f.log, admin: f.admin };
};

afterEach(() => { vi.restoreAllMocks(); });

describe('curadoria: ações do handler', () => {
  it('resumo: contagem por etapa x estado, com "sem curadoria"; publicado só entra como total, sem estado', async () => {
    const r = await call('resumo');
    expect(r.status).toBe(200);
    const b = r.body as Record<string, any>;
    expect(b.por_status.generating).toMatchObject({ total: 1, sem_curadoria: 1 });
    expect(b.por_status.draft).toMatchObject({ total: 3, sem_curadoria: 3, aprovado: 0 });
    expect(b.por_status.ready).toMatchObject({ total: 1, sem_curadoria: 1 });
    expect(b.publicados.total).toBe(1);
    expect(b.total_artigos).toBe(6);
    expect(b.totais.total).toBe(5);
  });

  it('resumo por organização lista os projetos da organização (e só os dela)', async () => {
    const t = world('member');
    const f = fakeAdmin(t);
    const r = await handleCuradoriaAction(f.admin, { action: 'resumo', body: { organizationId: ORG }, userId: USER, roleByOrg: new Map([[ORG, 'member']]), deps: { now: () => NOW } });
    expect(r.status).toBe(200);
    expect((r.body.projects as Array<{ project_id: string }>).map((p) => p.project_id)).toEqual([P]);
    const denied = await handleCuradoriaAction(f.admin, { action: 'resumo', body: { organizationId: OTHER_ORG }, userId: USER, roleByOrg: new Map([[ORG, 'member']]), deps: { now: () => NOW } });
    expect(denied.status).toBe(403);
  });

  it('rodar: avalia só artigos NÃO publicados, grava article_curation, NÃO altera nenhum artigo e não chama nada externo', async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    const t = world('editor');
    const before = JSON.stringify(t.articles);
    const r = await call('rodar', { limit: 50 }, { tables: t });
    expect(r.status).toBe(200);
    const b = r.body as Record<string, any>;
    expect(b).toMatchObject({ processados: 5, restantes: 0, concluido: true, custo_ia: 0 });
    expect(b.estados).toMatchObject({ aprovado: 2, bloqueado: 3, precisa_correcao: 0 });
    expect(JSON.stringify(t.articles)).toBe(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    const rows = t.article_curation as Row[];
    expect(rows).toHaveLength(5);
    expect(rows.some((x) => x.article_id === id(6))).toBe(false);
    expect(rows.some((x) => x.article_id === id(9))).toBe(false);
    const by = (n: number) => rows.find((x) => x.article_id === id(n))!;
    expect(by(1)).toMatchObject({ estado: 'bloqueado', image_state: 'repetida', image_uses: 3, organization_id: ORG, project_id: P, version: CURADORIA_VERSION, curated_by: USER });
    expect(by(3)).toMatchObject({ estado: 'bloqueado', image_state: 'ausente' });
    expect(by(4)).toMatchObject({ estado: 'bloqueado', image_state: 'repetida' });
    expect(by(2)).toMatchObject({ estado: 'aprovado', image_state: 'ok' });
    expect(by(5)).toMatchObject({ estado: 'aprovado' });
    expect(by(2).content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect((by(2).checks as { itens: unknown[] }).itens).toHaveLength(12);
  });

  it('rodar: em lotes (N por chamada), em ordem de prioridade Em criação > Na fila > Finalizado, e converge', async () => {
    const t = world('editor');
    const r1 = await call('rodar', { limit: 2 }, { tables: t });
    expect((r1.body.artigos as Array<{ article_id: string; status: string }>).map((a) => a.status)).toEqual(['generating', 'draft']);
    expect(r1.body).toMatchObject({ processados: 2, restantes: 3, concluido: false });
    const r2 = await call('rodar', { limit: 2 }, { tables: t });
    expect(r2.body).toMatchObject({ processados: 2, restantes: 1 });
    const r3 = await call('rodar', { limit: 2 }, { tables: t });
    expect(r3.body).toMatchObject({ processados: 1, restantes: 0, concluido: true });
    expect(((await call('rodar', { limit: 2 }, { tables: t })).body)).toMatchObject({ processados: 0, restantes: 0, concluido: true });
  });

  it('rodar: respeita o teto de tempo (corta o lote e diz quantos faltam)', async () => {
    let clock = NOW;
    const r = await call('rodar', { limit: 5, budgetMs: 1000 }, { now: () => (clock += 600) });
    expect(r.body.cortado_pelo_tempo).toBe(true);
    expect(r.body.processados as number).toBeLessThan(5);
    expect(r.body.concluido).toBe(false);
    expect(((r.tables.article_curation as Row[]).length)).toBe(r.body.processados);
  });

  it('rodar: artigo alterado depois da curadoria fica "desatualizada" e volta para a fila; refazer exige a hora de início da rodada', async () => {
    const t = world('editor');
    await call('rodar', { limit: 50 }, { tables: t });
    expect(((await call('resumo', {}, { tables: t })).body.por_status as Record<string, any>).draft.aprovado).toBe(1);
    (t.articles as Row[]).find((a) => a.id === id(2))!.updated_at = '2026-11-21T00:00:00Z';
    const res = await call('resumo', {}, { tables: t });
    expect((res.body.por_status as Record<string, any>).draft).toMatchObject({ desatualizada: 1, aprovado: 0 });
    expect((await call('rodar', { limit: 50 }, { tables: t })).body).toMatchObject({ processados: 1, concluido: true });
    expect((await call('rodar', { refazer: true }, { tables: t })).body.error).toBe('desde_required');
  });

  it('rodar: imagem bloqueada é reconferida uma vez por rodada (desde), sem laço infinito; ao trocar a imagem do irmão o outro destrava', async () => {
    const t = world('editor');
    const desde1 = new Date(NOW - 1000).toISOString();
    await call('rodar', { limit: 50, desde: desde1 }, { tables: t });
    // o irmão da fila ganha imagem própria; o artigo 4 ainda divide a imagem com o publicado (continua repetida), o 1 também
    const a4 = (t.articles as Row[]).find((a) => a.id === id(4))!; a4.featured_image_url = IMG('nova-4'); a4.updated_at = '2026-11-10T00:00:00Z';
    const desde2 = new Date(NOW + 1000).toISOString();
    const again = await call('rodar', { limit: 50, desde: desde2 }, { tables: t, now: () => NOW + 2000 });
    // 4 (desatualizada pela troca... updated_at antigo) + 1 e 3 (imagem repetida/ausente) reconferidos
    expect(again.body.processados).toBeGreaterThanOrEqual(2);
    expect(again.body.concluido).toBe(true);
    const next = await call('rodar', { limit: 50, desde: desde2 }, { tables: t, now: () => NOW + 3000 });
    expect(next.body).toMatchObject({ processados: 0, concluido: true });
  });

  it('listar: filtra por etapa e por estado, ordena por prioridade e pagina', async () => {
    const t = world('editor');
    await call('rodar', { limit: 50 }, { tables: t });
    const all = await call('listar', {}, { tables: t });
    expect(all.body.total).toBe(5);
    expect((all.body.artigos as Array<{ status: string }>).map((a) => a.status)).toEqual(['generating', 'draft', 'draft', 'draft', 'ready']);
    const blocked = await call('listar', { status: 'draft', estado: 'bloqueado' }, { tables: t });
    expect(blocked.body.total).toBe(2);
    const page = await call('listar', { pageSize: 2, page: 3 }, { tables: t });
    expect((page.body.artigos as unknown[]).length).toBe(1);
    expect((await call('listar', { status: 'published' }, { tables: t })).body.error).toBe('status_invalid');
    expect((await call('listar', { estado: 'xyz' }, { tables: t })).body.error).toBe('estado_invalid');
  });

  it('detalhe: devolve o relatório gravado; sem gravado calcula agora; recalcular força; outro projeto = 404', async () => {
    const t = world('member');
    const fresh = await call('detalhe', { articleId: id(2) }, { tables: t });
    expect(fresh.body).toMatchObject({ gravado: false, calculado_agora: true });
    expect((fresh.body.relatorio as { itens: unknown[] }).itens).toHaveLength(12);
    expect((t.article_curation as Row[]).length).toBe(0); // leitura nunca grava
    const t2 = world('editor');
    await call('rodar', { limit: 50 }, { tables: t2 });
    const stored = await call('detalhe', { articleId: id(1) }, { tables: t2 });
    expect(stored.body).toMatchObject({ gravado: true, calculado_agora: false, estado_gravado: 'bloqueado', publicado: false });
    expect((await call('detalhe', { articleId: id(1), recalcular: true }, { tables: t2 })).body.calculado_agora).toBe(true);
    expect((await call('detalhe', { articleId: id(9) }, { tables: t2 })).status).toBe(404);
    expect((await call('detalhe', { articleId: 'x' }, { tables: t2 })).status).toBe(422);
  });

  it('prompts_abertos: pergunta sem artigo, só em produção ou coberta; com a correspondência e o rótulo de heurística', async () => {
    const t = world('member', {
      nexus_prompt_sets: [{ id: 's1', project_id: P, name: 'Criminal', status: 'active' }],
      nexus_prompts: [
        { id: 'q1', project_id: P, prompt_set_id: 's1', query: 'habeas corpus plantão noturno', topic: 'criminal', intent: 'informational', active: true },
        { id: 'q2', project_id: P, prompt_set_id: 's1', query: 'quanto custa advogado trabalhista em campinas', topic: 'trabalhista', intent: 'transactional', active: true },
        { id: 'q3', project_id: P, prompt_set_id: 's1', query: 'pergunta desativada sobre trânsito', active: false },
      ],
    });
    (t.articles as Row[]).find((a) => a.id === id(2))!.secondary_keywords = ['habeas corpus plantão'];
    const r = await call('prompts_abertos', {}, { tables: t });
    const b = r.body as Record<string, any>;
    expect(b).toMatchObject({ sem_dados: false, total_prompts: 2, heuristica: true });
    expect(b.resumo).toMatchObject({ so_em_producao: 1, sem_artigo: 1 });
    expect(b.regra).toMatch(/Heurística/);
    const only = (b.prompts as Array<{ query: string; estado: string; conjunto: string; cobertos_por: unknown[] }>);
    expect(only.find((p) => p.estado === 'sem_artigo')!.query).toMatch(/campinas/);
    expect(only.find((p) => p.estado === 'so_em_producao')!.cobertos_por.length).toBeGreaterThan(0);
    expect(only[0].conjunto).toBe('Criminal');
    expect((await call('prompts_abertos', { estado: 'sem_artigo' }, { tables: t })).body.prompts).toHaveLength(1);
    expect((await call('prompts_abertos', { estado: 'zzz' }, { tables: t })).body.error).toBe('estado_invalid');
  });

  it('prompts_abertos sem nenhum prompt: "sem dados" explícito', async () => {
    const r = await call('prompts_abertos');
    expect(r.body).toMatchObject({ sem_dados: true, total_prompts: 0, prompts: [] });
    expect(String(r.body.motivo)).toMatch(/Observatório/);
  });

  it('imagens: diagnóstico de repetição e lista priorizada (Em criação > Na fila > Finalizado; ausente antes de repetida)', async () => {
    const r = await call('imagens');
    const b = r.body as Record<string, any>;
    expect(b.total_artigos).toBe(6);
    expect(b.imagens_distintas).toBe(3);
    expect(b.artigos_sem_imagem).toBe(1);
    expect(b.grupos_repetidos).toBe(1);
    expect(b.mais_repetidas[0]).toMatchObject({ usos: 3, usada_em_publicado: true });
    expect(b.mais_repetidas[0].por_status).toMatchObject({ generating: 1, draft: 1, published: 1 });
    expect(b.por_status.draft).toMatchObject({ artigos: 3, sem_imagem: 1, em_imagem_repetida: 1, imagens_distintas: 2 });
    const list = b.precisam_imagem_nova.artigos as Array<{ article_id: string; status: string; motivo: string; prioridade: number }>;
    expect(b.precisam_imagem_nova.total).toBe(3);
    expect(list.map((a) => [a.status, a.motivo])).toEqual([['generating', 'repetida'], ['draft', 'ausente'], ['draft', 'repetida']]);
    expect(list.map((a) => a.prioridade)).toEqual([1, 2, 3]);
    expect((await call('imagens', { limit: 1, offset: 1 })).body.precisam_imagem_nova).toMatchObject({ total: 3, offset: 1 });
  });

  it('papéis e fronteiras: leitor lê mas não roda; sem vínculo, 403; projeto de outra organização, 403; ação desconhecida, 400', async () => {
    expect((await call('resumo', {}, { role: 'member' })).status).toBe(200);
    expect((await call('rodar', {}, { role: 'member' })).body.error).toBe('role_not_allowed');
    expect((await call('resumo', {}, { role: null })).body.error).toBe('organization_membership_required');
    expect((await call('resumo', { projectId: P_OTHER }, { role: 'owner' })).status).toBe(403);
    expect((await call('apagar')).status).toBe(400);
    expect((await call('resumo', { projectId: 'nao-e-uuid' })).status).toBe(422);
  });

  it('curationState: sem curadoria, desatualizada (artigo mudou ou regras novas) ou o estado gravado', () => {
    const cur = { article_id: 'a', estado: 'aprovado', nota: 80, image_state: 'ok', image_uses: 1, curated_at: '2026-11-15T00:00:00Z', version: CURADORIA_VERSION };
    expect(curationState({ updated_at: '2026-11-10T00:00:00Z' }, undefined)).toBe('sem_curadoria');
    expect(curationState({ updated_at: '2026-11-10T00:00:00Z' }, cur)).toBe('aprovado');
    expect(curationState({ updated_at: '2026-11-16T00:00:00Z' }, cur)).toBe('desatualizada');
    expect(curationState({ updated_at: '2026-11-10T00:00:00Z' }, { ...cur, version: CURADORIA_VERSION + 1 })).toBe('desatualizada');
  });
});

describe('curadoria: registro no portão engine e no manifesto', () => {
  it('módulo `curadoria` registrado: rota, adaptador, custo zero, ações e papéis idênticos aos do handler', () => {
    const m = moduleByKey('curadoria')!;
    expect(m).toMatchObject({ key: 'curadoria', route: '/curadoria', status: 'ativo' });
    expect(m.produces).toEqual(['article_curation']);
    expect(m.exportTables.map((x) => x.table)).toEqual(['article_curation']);
    const spec = engineSpec('curadoria')!;
    expect(spec).toMatchObject({ handler: 'curadoria', scope: 'project', roleSource: 'members', cost: 'none' });
    expect(ADAPTERS.curadoria).toBeTypeOf('function');
    expect(Object.keys(spec.actions).sort()).toEqual([...CURADORIA_ACTIONS].sort());
    for (const a of CURADORIA_ACTIONS) { expect(spec.actions[a].minRole).toBe(CURADORIA_MIN_ROLE[a]); expect(spec.actions[a].paid).toBeFalsy(); }
    expect(ENGINE_SPECS.filter((s) => s.name === 'curadoria')).toHaveLength(1);
    expect(MODULES.find((x) => x.key === 'curadoria')!.hasData({} as never)).toBeNull();
    expect(MODULES.find((x) => x.key === 'curadoria')!.hasData({ curation: { total: 3 } } as never)).toBe(true);
  });

  it('liga ao conteúdo (real) e aos demais módulos por leituras dispensáveis', () => {
    const edges = moduleEdges().filter((e) => e.to === 'curadoria');
    expect(edges.some((e) => e.from === 'conteudo' && !e.optional)).toBe(true);
    expect(edges.filter((e) => e.optional).map((e) => e.from)).toEqual(expect.arrayContaining(['perfil', 'taxonomia', 'observatorio', 'funil']));
  });

  it('pelo portão: leitura = membro, rodar = editor; sem IA nem gasto (cost none nunca chama o guarda de gasto)', async () => {
    const spendGuard = vi.fn(async () => ({ allowed: false as const }));
    const deps = (): EngineDeps => ({ fetchFn: (async () => new Response('x', { status: 404 })) as typeof fetch, lookupA: async () => ['93.184.216.34'], now: () => NOW, sleep: async () => undefined, speedApiKey: null, paidBlocked: true, spendGuard });
    const via = (body: Record<string, unknown>, role: string) => { const t = world(role); return routeEngineRequest(fakeAdmin(t).admin, { userId: USER, body }, deps()); };
    expect((await via({ module: 'curadoria', action: 'resumo', projectId: P }, 'member')).status).toBe(200);
    expect((await via({ module: 'curadoria', action: 'rodar', projectId: P }, 'member')).body.error).toBe('role_not_allowed');
    expect((await via({ module: 'curadoria', action: 'rodar', projectId: P, limit: 5 }, 'editor')).status).toBe(200);
    expect((await via({ module: 'curadoria', action: 'inexistente', projectId: P }, 'editor')).body.error).toBe('unknown_action');
    expect(spendGuard).not.toHaveBeenCalled();
  });
});

describe('curadoria: portão na saída', () => {
  const run = async () => { const t = world('editor'); await call('rodar', { limit: 50 }, { tables: t }); return t; };
  const gate = (t: Record<string, Row[]>, n: number, o: Parameters<typeof checkCurationGate>[2] = {}) => checkCurationGate(fakeAdmin(t).admin, (t.articles as Row[]).find((a) => a.id === id(n)) as never, { mode: 'ligado', ...o });

  it('artigo sem curadoria é recusado com a mensagem do que falta', async () => {
    const t = world('editor');
    const v = await gate(t, 2);
    expect(v).toMatchObject({ allowed: false, pending: true, reason: 'sem_curadoria' });
    expect(v.message).toMatch(/Curadoria/);
    expect(gateRefusalBody(v, 'req-1')).toMatchObject({ success: false, code: 'curadoria_pendente', motivo: 'sem_curadoria', retryable: false, request_id: 'req-1' });
  });

  it('aprovado e atual passa; mudou depois, não passa; versão antiga, não passa', async () => {
    const t = await run();
    expect(await gate(t, 2)).toMatchObject({ allowed: true, pending: false, reason: 'ok', estado: 'aprovado' });
    (t.articles as Row[]).find((a) => a.id === id(2))!.content = `${BODY('tema 2')}<p>mudou</p>`;
    expect(await gate(t, 2)).toMatchObject({ allowed: false, reason: 'desatualizada' });
    (t.articles as Row[]).find((a) => a.id === id(5))!;
    (t.article_curation as Row[]).find((r) => r.article_id === id(5))!.version = 0;
    expect(await gate(t, 5)).toMatchObject({ allowed: false, reason: 'versao_antiga' });
  });

  it('imagem repetida ou ausente (curadoria bloqueada) é recusada e lista o que falta', async () => {
    const t = await run();
    const rep = await gate(t, 1);
    expect(rep).toMatchObject({ allowed: false, reason: 'bloqueado', estado: 'bloqueado' });
    expect(rep.faltando.join(' ')).toMatch(/Imagem repetida/);
    expect(await gate(t, 3)).toMatchObject({ allowed: false, reason: 'imagem_ausente' });
  });

  it('um irmão que tomou a mesma imagem DEPOIS da curadoria também barra (conferência ao vivo)', async () => {
    const t = await run();
    (t.articles as Row[]).push(article(7, { status: 'draft', featured_image_url: IMG('boa-2') }));
    expect(await gate(t, 2)).toMatchObject({ allowed: false, reason: 'imagem_repetida_ao_vivo' });
  });

  it('já publicado não é tocado; rascunho no WordPress não passa pelo portão; interruptor desliga; modo aviso deixa seguir mas informa', async () => {
    const t = world('editor');
    expect(await gate(t, 6)).toMatchObject({ allowed: true, reason: 'ja_publicado' });
    expect(await gate(t, 2, { publishStatus: 'draft' })).toMatchObject({ allowed: true, pending: false });
    expect(await gate(t, 2, { mode: 'desligado' })).toMatchObject({ allowed: true, reason: 'desligado' });
    const adv = await gate(t, 2, { mode: 'aviso' });
    expect(adv).toMatchObject({ allowed: true, pending: true, reason: 'sem_curadoria' });
    expect(gateAdvisory(adv)).toMatchObject({ modo: 'aviso', motivo: 'sem_curadoria' });
    expect(gateAdvisory((await gate(t, 6)))).toBeNull();
  });

  it('falha de leitura: no modo ligado a publicação NÃO sai (falha fechada); no modo aviso segue', async () => {
    const broken = { from: () => { throw new Error('boom'); } };
    const a = { id: id(2), project_id: P, status: 'draft' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await checkCurationGate(broken, a, { mode: 'ligado' })).toMatchObject({ allowed: false, reason: 'erro_de_leitura' });
    expect(await checkCurationGate(broken, a, { mode: 'aviso' })).toMatchObject({ allowed: true, pending: true });
  });

  it('interruptor por variável de ambiente: padrão ligado', () => {
    expect(gateModeFrom(undefined)).toBe('ligado');
    expect(gateModeFrom('')).toBe('ligado');
    expect(gateModeFrom('1')).toBe('ligado');
    expect(gateModeFrom('aviso')).toBe('aviso');
    expect(gateModeFrom('WARN')).toBe('aviso');
    for (const v of ['0', 'off', 'false', 'desligado']) expect(gateModeFrom(v)).toBe('desligado');
  });
});

describe('curadoria: ligação com a publicação e arquivos de banco (verificação estática do fonte)', () => {
  const pub = read('supabase/functions/publish-to-wordpress/index.ts');
  it('publish-to-wordpress confere o portão ANTES do piloto e de qualquer envio, e recusa com 409', () => {
    expect(pub).toContain('from "../_shared/curadoria-gate.ts"');
    const gate = pub.indexOf('checkCurationGate(admin, article');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(pub.indexOf('invoke("auto-optimize"'));
    expect(gate).toBeLessThan(pub.indexOf('publishPlugin(project'));
    expect(pub).toMatch(/gateRefusalBody\(curationGate, requestId\), 409/);
    expect(pub).toContain('publishStatus: body.publishStatus || "publish"');
  });
  it('auto-publish-article continua aposentada (410) e nenhum outro caminho grava status publicado sem passar por publish-to-wordpress', () => {
    expect(read('supabase/functions/auto-publish-article/index.ts')).toContain('status: 410');
    expect(pub).toContain('status: "published"');
  });
  it('migração: tabela com RLS, sem permissão para anon/authenticated, índices e gatilhos; rollback desfaz tudo', () => {
    const sql = read('supabase/migrations/20261120800000_curadoria_conteudo.sql');
    const rb = read('supabase/rollbacks/20261120800000_curadoria_conteudo_rollback.sql');
    expect(sql).toContain('create table if not exists public.article_curation');
    expect(sql).toContain('article_id uuid not null unique references public.articles(id) on delete cascade');
    expect(sql).toContain('organization_id uuid not null references public.organizations(id) on delete cascade');
    expect(sql).toContain('alter table public.article_curation enable row level security');
    expect(sql).toContain('revoke all on table public.article_curation from public, anon, authenticated');
    expect(sql).toContain('grant all on table public.article_curation to service_role');
    expect(sql.split(/\r?\n/).filter((l) => /^\s*grant\b/i.test(l) && /\b(anon|authenticated)\b/i.test(l))).toEqual([]);
    expect(sql).toMatch(/estado in \('aprovado', 'precisa_correcao', 'bloqueado'\)/);
    expect(sql).toMatch(/image_state in \('ok', 'aviso', 'repetida', 'ausente'\)/);
    expect(sql).toContain('profile_assert_project_org()');
    expect((sql.match(/create index if not exists/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain('project_curation_summary');
    expect(rb).toContain('drop table if exists public.article_curation');
    expect(rb).toContain('drop function if exists public.project_curation_summary(uuid)');
    // a migração não altera tabela existente
    expect(sql).not.toMatch(/alter table public\.(articles|projects)/);
  });
  it('o núcleo e o handler não importam nenhum cliente de IA, de busca paga nem de rede', () => {
    for (const f of ['curadoria-core.ts', 'curadoria-handler.ts', 'curadoria-gate.ts']) {
      const src = read('supabase/functions/_shared', f);
      expect(src, f).not.toMatch(/ai-orchestrator|byok-resolver|provider-fetch|spend-gate|gemini|serper|anthropic|openai|fetch\(/i);
    }
  });
});
