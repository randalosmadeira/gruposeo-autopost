import { describe, expect, it, vi } from 'vitest';
import { fakeAdmin, type Row, type RpcHandler } from './helpers/fake-admin';
import { handleStudioAction, STUDIO_ACTIONS, type StudioDeps } from '../../supabase/functions/_shared/studio-handler';
import { routeEngineRequest, type EngineDeps } from '../../supabase/functions/_shared/engine-router';
import type { StudioAiPort, StudioAiRequest } from '../../supabase/functions/_shared/studio-pipeline';
import { FACTS, GOOD_BODY, ORIGIN } from './helpers/estudio-fixtures';

// o jsdom não tem AbortSignal.timeout (o Deno de produção tem): polifill só no teste
if (typeof (AbortSignal as unknown as { timeout?: unknown }).timeout !== 'function') (AbortSignal as unknown as { timeout: (n: number) => AbortSignal }).timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms).unref?.(); return c.signal; };

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const P = '00000000-0000-4000-8000-0000000000b1';
const P_OTHER = '00000000-0000-4000-8000-0000000000b9';
const USER = '00000000-0000-4000-8000-0000000000c1';
const USER2 = '00000000-0000-4000-8000-0000000000c2';
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

const TITLE = 'Advogado criminalista em Guarulhos: flagrante, custódia e plantão';
const META = 'O que acontece depois de uma prisão em flagrante em Guarulhos, em que prazo sai a audiência de custódia e como falar com o escritório.';
const SOURCES = [{ url: 'https://atos.cnj.jus.br/atos/detalhar/2234', label: 'Resolução 213/2015 do CNJ', official: true, verified: true }];

const world = (role: string | null = 'owner', over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: [
    { id: P, name: 'Aurora', domain: 'aurora-advogados.example', wordpress_url: 'https://aurora-advogados.example', organization_id: ORG, nicho: 'Advocacia', empresa_nome: 'Aurora Advogados', empresa_telefone: '(11) 4002-8922', empresa_whatsapp: '(11) 99999-0001', empresa_endereco: 'Rua das Palmeiras, 120, sala 5, Guarulhos - SP, 07010-000',
      commercial_info: { email: 'contato@aurora-advogados.example' }, social_linkedin: 'https://www.linkedin.com/company/aurora-advogados-exemplo', nexus_strategy: { businessName: 'Aurora Advogados', offer: 'Defesa criminal e plantão para flagrantes.' },
      editorial_identity: { optimization_rules: { palavras: 120 }, studio_profile: { hours: 'Mo-Fr 09:00-18:00', logo_url: `${ORIGIN}/logo.png`, authors: [{ name: 'Marina Souza', credential: 'Advogada, OAB/SP 123456', url: `${ORIGIN}/equipe/marina-souza/` }] } }, updated_at: '2026-11-01T00:00:00.000Z' },
    { id: P_OTHER, name: 'Alheio', domain: 'outra-org.example', wordpress_url: null, organization_id: OTHER, updated_at: '2026-11-01T00:00:00.000Z' },
  ],
  organization_members: role ? [{ organization_id: ORG, user_id: USER, role, status: 'active' }, { organization_id: ORG, user_id: USER2, role: 'admin', status: 'active' }] : [{ organization_id: OTHER, user_id: USER, role: 'owner', status: 'active' }],
  organizations: [{ id: ORG, owner_user_id: null }, { id: OTHER, owner_user_id: null }],
  project_profile_extended: [{ project_id: P, sections: { negocio: { seg: 'Advocacia' } } }],
  studio_pages: [], studio_page_versions: [], studio_page_links: [], studio_page_assets: [], studio_publications: [], project_events: [], index_keys: [], index_submissions: [], prompt_templates: [],
  index_urls: [
    { project_id: P, url: `${ORIGIN}/advogado-criminalista/`, host: 'aurora-advogados.example', path: '/advogado-criminalista/', gsc_impressions: 900, http_status: 200 },
    { project_id: P, url: `${ORIGIN}/advogado-criminalista/flagrante/`, host: 'aurora-advogados.example', path: '/advogado-criminalista/flagrante/', gsc_impressions: 400, http_status: 200 },
    { project_id: P, url: `${ORIGIN}/advogado-criminalista/audiencia-de-custodia/`, host: 'aurora-advogados.example', path: '/advogado-criminalista/audiencia-de-custodia/', gsc_impressions: 200, http_status: 200 },
  ],
  ...over,
});
const RPCS: Record<string, RpcHandler> = { studio_optional_tables: () => ({ data: { index_urls: true, index_keys: true, market_queries: true, market_serp_results: true, nexus_citations: true }, error: null }) };

type Deps = Partial<StudioDeps>;
const baseDeps = (over: Deps = {}): StudioDeps => ({ fetchFn: (async () => new Response('x', { status: 404 })) as typeof fetch, lookupA: async () => ['93.184.216.34'], now: () => NOW, ...over });
const memberRoles = (t: Record<string, Row[]>, user = USER) => new Map<string, string>((t.organization_members as Array<{ organization_id: string; user_id: string; role: string }>).filter((m) => m.user_id === user).map((m) => [m.organization_id, m.role]));
const call = async (action: string, body: Record<string, unknown>, o: { t?: Record<string, Row[]>; role?: string | null; deps?: Deps; user?: string } = {}) => {
  const t = o.t || world(o.role === undefined ? 'owner' : o.role);
  const fake = fakeAdmin(t, RPCS);
  const r = await handleStudioAction(fake.admin, { action, body: { projectId: P, ...body }, userId: o.user || USER, roleByOrg: memberRoles(t, o.user || USER), deps: baseDeps(o.deps) });
  return { ...r, t, log: fake.log };
};
const rows = (t: Record<string, Row[]>, name: string) => t[name] as Array<Record<string, unknown>>;

const BRIEF = { query: 'advogado criminalista em Guarulhos', type: 'local', place: 'Guarulhos', subject: 'Advogado criminalista', language: 'pt-BR', fieldFacts: FACTS, sources: SOURCES };

/** Cria o briefing e leva a página pelo caminho humano até ficar pronta: revisa (texto, título, meta), planeja links, verifica. */
async function readyPage(t = world(), over: Record<string, unknown> = {}) {
  const b = await call('brief', { ...BRIEF, ...over }, { t });
  expect(b.status, JSON.stringify(b.body)).toBe(201);
  const id = (b.body.page as { id: string }).id;
  const rv = await call('revise', { pageId: id, title: TITLE, metaDescription: META, h1: 'Advogado criminalista em Guarulhos', bodyHtml: GOOD_BODY, fieldFacts: FACTS, sources: SOURCES }, { t });
  expect(rv.status, JSON.stringify(rv.body)).toBe(200);
  const pl = await call('plan_links', { pageId: id }, { t });
  expect(pl.status, JSON.stringify(pl.body)).toBe(200);
  return { t, id };
}

describe('Estúdio: briefing', () => {
  it('cria a página em rascunho (v1) com briefing de superação, trilha pela hierarquia do endereço e evento no barramento', async () => {
    const r = await call('brief', BRIEF);
    expect(r.status).toBe(201);
    const page = rows(r.t, 'studio_pages')[0];
    expect(page).toMatchObject({ status: 'rascunho', version: 1, slug_path: 'advogado-criminalista/guarulhos', type: 'local', language: 'pt-BR', organization_id: ORG, project_id: P, adapter: 'wordpress_plugin' });
    expect(rows(r.t, 'studio_page_versions')).toHaveLength(1);
    expect(rows(r.t, 'project_events').map((e) => e.kind)).toEqual(['estudio.briefing_criado']);
    const doc = page.doc as { breadcrumbs: Array<{ url: string }> };
    expect(doc.breadcrumbs.map((c) => c.url)).toEqual([`${ORIGIN}/`, `${ORIGIN}/advogado-criminalista/`, `${ORIGIN}/advogado-criminalista/guarulhos/`]);
    const brief = r.body.brief as { pendings: Array<{ id: string }>; radarSource: string; surfaces: Array<{ kind: string }>; goals: { goals: Array<{ key: string }> } };
    expect(brief.radarSource).toBe('ausente');
    expect(brief.pendings.map((p) => p.id)).toEqual(expect.arrayContaining(['radar_sem_dados', 'observatorio_sem_dados']));
    expect(brief.surfaces.map((s) => s.kind)).toEqual(['pagina', 'video', 'post_curto', 'resposta_ia', 'google_business', 'links']);
    expect(brief.goals.goals.map((g) => g.key)).toEqual(expect.arrayContaining(['posicao', 'citacao_ia', 'indexacao']));
  });
  it('não presume idioma, exige a busca, recusa tipo/adaptador inválidos e projeto sem domínio', async () => {
    expect((await call('brief', { ...BRIEF, language: undefined })).body.error).toBe('language_required');
    expect((await call('brief', { ...BRIEF, query: '' })).body.error).toBe('query_required');
    expect((await call('brief', { ...BRIEF, type: 'x' })).body.error).toBe('type_invalid');
    expect((await call('brief', { ...BRIEF, adapter: 'ftp' })).body.error).toBe('adapter_invalid');
    const t = world(); (t.projects[0] as Row).domain = null; (t.projects[0] as Row).wordpress_url = null;
    expect((await call('brief', BRIEF, { t })).body.error).toBe('origin_required');
  });
  it('colisão de endereço NÃO gera "-2": recusa e sugere alternativas; página-pai inexistente é recusada', async () => {
    const t = world();
    expect((await call('brief', BRIEF, { t })).status).toBe(201);
    const again = await call('brief', { ...BRIEF, query: 'outra coisa' }, { t });
    expect(again.status).toBe(422);
    const slug = again.body.slug as { issues: Array<{ code: string }>; suggestions: string[] };
    expect(slug.issues.map((i) => i.code)).toContain('colisao');
    expect(slug.suggestions.length).toBeGreaterThan(0);
    expect(slug.suggestions.some((s) => /-2$/.test(s))).toBe(false);
    const orphan = await call('brief', { ...BRIEF, slugPath: 'servicos-novos/guarulhos' });
    expect(orphan.status).toBe(422);
    expect((orphan.body.slug as { issues: Array<{ code: string }> }).issues.map((i) => i.code)).toContain('pai_inexistente');
  });
  it('trava contra páginas finas em massa: o limite de páginas novas por lote vem do perfil de regras (não é fixo)', async () => {
    const t = world();
    (t.projects[0].editorial_identity as Record<string, unknown>).studio_rules = { options: { lote: 2 } };
    expect((await call('brief', { ...BRIEF, slugPath: 'advogado-criminalista/guarulhos' }, { t })).status).toBe(201);
    expect((await call('brief', { ...BRIEF, query: 'osasco', place: 'Osasco', slugPath: 'advogado-criminalista/osasco' }, { t })).status).toBe(201);
    const third = await call('brief', { ...BRIEF, query: 'santo andré', place: 'Santo André', slugPath: 'advogado-criminalista/santo-andre' }, { t });
    expect(third.status).toBe(429);
    expect(third.body.error).toBe('batch_limit');
    expect(String(third.body.message)).toMatch(/limite|lote/i);
    expect(rows(t, 'studio_pages')).toHaveLength(2);
  });
  it('lê o Radar só se existir: sem Radar vira pendência; com SERP do planejador usa posição e título; mapa de fontes citadas vem do Observatório', async () => {
    const t = world('owner', {
      market_queries: [{ id: 'q1', project_id: P, query: 'advogado criminalista guarulhos' }],
      market_serp_results: [
        { id: 's1', project_id: P, query_id: 'q1', position: 1, url: 'https://concorrente-a.example/criminal-guarulhos/', host: 'concorrente-a.example', title: 'Advogado criminal em Guarulhos | Concorrente A', kind: 'organico' },
        { id: 's2', project_id: P, query_id: 'q1', position: 2, url: 'https://www.youtube.com/watch?v=abc', host: 'www.youtube.com', title: 'O que fazer no flagrante (vídeo)', kind: 'organico' },
      ],
      nexus_citations: [1, 2, 3].map((i) => ({ project_id: P, engine: 'chatgpt', query: 'advogado criminalista guarulhos', topic: 'criminal', url: `https://www.jusbrasil.com.br/artigo/${i}`, host: 'www.jusbrasil.com.br', is_own: false, position: i, title: 't' })),
    });
    const r = await call('brief', BRIEF, { t });
    const brief = r.body.brief as { radarSource: string; benchmark: { depth: string; n: number }; pendings: Array<{ id: string }>; citedSources: { byHost: Array<{ host: string; kind: string }>; presenceTargets: Array<{ host: string; action: string }> }; intent: { extraSurfaces: string[] } };
    expect(brief.radarSource).toBe('serp_local');
    expect(brief.benchmark).toMatchObject({ depth: 'so_titulos', n: 2 });
    expect(brief.pendings.map((p) => p.id)).toContain('radar_so_titulos');
    expect(brief.pendings.map((p) => p.id)).not.toContain('observatorio_sem_dados');
    expect(brief.citedSources.byHost[0]).toMatchObject({ host: 'jusbrasil.com.br', kind: 'diretorio' });
    expect(brief.citedSources.presenceTargets[0].action).toMatch(/cadastro|diretório/i);
    expect(brief.intent.extraSurfaces).toContain('video');
  });
});

describe('Estúdio: gerar (IA por etapas, dentro do teto, sem inventar)', () => {
  const answer = '<p>Quem é preso em flagrante em Guarulhos passa pela delegacia e, em até 24 horas, por uma audiência de custódia, conforme a Resolução 213/2015 do CNJ.</p>';
  const section = '<p>A 1ª Delegacia de Polícia de Guarulhos recebe os presos em flagrante da região central. A família descobre ali onde a pessoa está.</p>';
  const recorded = (calls: StudioAiRequest[] = [], over: (req: StudioAiRequest) => string | null = () => null): StudioAiPort => ({
    async call(req) { calls.push(req); const o = over(req); return { content: o ?? (req.stepId === 'rascunho:resposta' ? answer : section), costMicros: 1000, usage: { inputTokens: 100, outputTokens: 50 } }; },
  });
  const withAi = (port: StudioAiPort): Deps => ({ ai: async () => port });

  it('rascunho por seção: um passo pequeno de IA por seção, tokens do perfil, só com os fatos fornecidos; salva versão, qualidade e evento', async () => {
    const b = await call('brief', BRIEF);
    const id = (b.body.page as { id: string }).id;
    const calls: StudioAiRequest[] = [];
    const g = await call('generate', { pageId: id }, { t: b.t, deps: withAi(recorded(calls)) });
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.every((c) => c.maxTokens <= 4000 && c.task === 'conversion_content' || c.task === 'content_editing')).toBe(true);
    expect(calls[0].user).toMatch(/FACTS/);
    expect(calls[0].user).not.toMatch(/concorrente-a/);
    expect(calls[0].system).toMatch(/NEVER invent/);
    const page = rows(g.t, 'studio_pages')[0];
    expect(page.version).toBe(2);
    expect(String(page.body_html)).toContain('Resolução 213/2015');
    expect(rows(g.t, 'studio_page_versions')).toHaveLength(2);
    expect(rows(g.t, 'project_events').map((e) => e.kind)).toContain('estudio.pagina_gerada');
    const pipe = g.body.pipeline as { ai_used: number; cost_is_estimate: boolean; stopped: unknown };
    expect(pipe.ai_used).toBe(calls.length);
    expect(pipe.cost_is_estimate).toBe(true);
    expect(pipe.stopped).toBeNull();
  });
  it('NUNCA inventa: número, telefone, link e depoimento fora dos dados reprovam na guarda; a seção vira pendência e o texto inventado não entra', async () => {
    const b = await call('brief', BRIEF);
    const id = (b.body.page as { id: string }).id;
    const bad = '<p>Em 2019 atendemos 4.500 casos com 98% de êxito. Ligue (11) 90000-1234 ou veja https://inventado.example/x. Depoimento: “Fui muito bem atendido e recomendo a todos” — João.</p>';
    const calls: StudioAiRequest[] = [];
    const g = await call('generate', { pageId: id }, { t: b.t, deps: withAi(recorded(calls, () => bad)) });
    expect(g.status).toBe(200);
    const body = String(rows(g.t, 'studio_pages')[0].body_html);
    expect(body).not.toContain('4.500'); expect(body).not.toContain('90000-1234'); expect(body).not.toContain('inventado.example'); expect(body).not.toContain('Fui muito bem');
    expect(body).toMatch(/\[PENDENTE:/);
    const pend = g.body.pendings as Array<{ kind: string }>;
    expect(pend.length).toBeGreaterThan(0);
    expect(calls.length).toBeGreaterThanOrEqual(4); // cada seção tenta duas vezes (a 2ª com o motivo da recusa)
    expect(calls.some((c) => /FIX THIS/.test(c.user))).toBe(true);
    const page = rows(g.t, 'studio_pages')[0];
    expect(page.status).toBe('rascunho');
    expect(Number(page.pending_count)).toBeGreaterThan(0);
  });
  it('para no TETO diário: a negativa para o pipeline, guarda o que já saiu e uma nova chamada RETOMA de onde parou', async () => {
    const b = await call('brief', BRIEF);
    const id = (b.body.page as { id: string }).id;
    let n = 0;
    const denying: StudioAiPort = { async call(req) { if (++n >= 2) { const e = new Error('Teto diário atingido'); e.name = 'SpendDeniedError'; throw e; } return { content: req.stepId === 'rascunho:resposta' ? answer : section, costMicros: 1000 }; } };
    const g1 = await call('generate', { pageId: id }, { t: b.t, deps: withAi(denying) });
    const pipe = g1.body.pipeline as { stopped: { reason: string } | null; sections: Array<{ status: string }> };
    expect(pipe.stopped?.reason).toBe('teto');
    expect(pipe.sections.filter((s) => s.status === 'ok')).toHaveLength(1);
    expect((g1.body.pendings as Array<{ kind: string }>).some((p) => p.kind === 'teto')).toBe(true);
    const calls: StudioAiRequest[] = [];
    const g2 = await call('generate', { pageId: id }, { t: g1.t, deps: withAi(recorded(calls)) });
    expect(calls.some((c) => c.stepId === 'rascunho:resposta')).toBe(false); // a seção já pronta não é refeita
    expect((g2.body.pipeline as { stopped: unknown }).stopped).toBeNull();
    expect((g2.body.pipeline as { sections: Array<{ status: string }> }).sections.every((s) => s.status === 'ok')).toBe(true);
  });
  it('limite de passos de IA vem do perfil de regras; sem IA o rascunho vira pendências (nunca enchimento)', async () => {
    const t = world();
    (t.projects[0].editorial_identity as Record<string, unknown>).studio_rules = { options: { passos_ia: 1 } };
    const b = await call('brief', BRIEF, { t });
    const id = (b.body.page as { id: string }).id;
    const calls: StudioAiRequest[] = [];
    const g = await call('generate', { pageId: id }, { t, deps: withAi(recorded(calls)) });
    expect(calls).toHaveLength(1);
    expect((g.body.pipeline as { stopped: { reason: string } }).stopped.reason).toBe('limite');
    const t2 = world();
    const b2 = await call('brief', BRIEF, { t: t2 });
    const g2 = await call('generate', { pageId: (b2.body.page as { id: string }).id }, { t: t2 });
    expect((g2.body.pipeline as { ai_available: boolean }).ai_available).toBe(false);
    const html = String(rows(t2, 'studio_pages')[0].body_html);
    expect(html).toMatch(/\[PENDENTE:/);
    expect(html).not.toMatch(/lorem|no mundo atual/i);
  });
  it('edição humana simulada: parágrafo com cara de IA é reescrito em passo pequeno e só é aceito se melhorar e não inventar', async () => {
    const b = await call('brief', BRIEF);
    const id = (b.body.page as { id: string }).id;
    const iaText = '<p>No mundo atual, vale destacar que o atendimento é rápido, eficiente e seguro. Não é apenas um serviço, é uma solução completa.</p>';
    const calls: StudioAiRequest[] = [];
    const port: StudioAiPort = { async call(req) { calls.push(req); if (req.task === 'content_editing') return { content: '<p>A 1ª Delegacia de Polícia de Guarulhos recebe os presos em flagrante da região central.</p>', costMicros: 500 }; return { content: iaText.replace('No mundo atual, vale destacar que o', 'O'), costMicros: 500 }; } };
    const g = await call('generate', { pageId: id }, { t: b.t, deps: withAi(port) });
    expect(g.status).toBe(200);
    const edits = calls.filter((c) => c.task === 'content_editing');
    expect(edits.length).toBeGreaterThan(0);
    expect(edits[0].user).toMatch(/PROBLEMS FOUND/);
    expect(edits[0].maxTokens).toBeLessThanOrEqual(700);
  });
});

describe('Estúdio: revisão humana, links, verificação, aprovação obrigatória', () => {
  it('o caminho humano completo deixa a página sem falha em portão obrigatório (verificação + plano de links)', async () => {
    const { t, id } = await readyPage();
    const c = await call('check', { pageId: id }, { t });
    expect(c.status).toBe(200);
    const q = c.body.quality as { blocking: string[]; complete: boolean; score: number };
    expect(q.blocking, JSON.stringify((c.body.quality as { results: Array<{ id: string; status: string; details: string[] }> }).results.filter((r) => r.status === 'falha'))).toEqual([]);
    expect(q.complete).toBe(true);
    const links = rows(t, 'studio_page_links');
    expect(links.some((l) => l.direction === 'entrada' && l.url === `${ORIGIN}/advogado-criminalista/`)).toBe(true);
    expect(links.filter((l) => l.direction === 'saida' && l.kind === 'interno').length).toBeGreaterThanOrEqual(3);
    expect(links.some((l) => l.kind === 'externo' && String(l.url).includes('cnj.jus.br'))).toBe(true);
    const body = String(rows(t, 'studio_pages')[0].body_html);
    expect(body.match(/data-zica-links/g)).toHaveLength(1);
  });
  it('plano de links: âncoras variam entre páginas, só links de páginas existentes, fonte externa não oficial sem verificação é recusada', async () => {
    const { t, id } = await readyPage();
    const pl = await call('plan_links', { pageId: id, verifyLinks: false }, { t });
    const links = pl.body.links as Array<{ url: string; anchor: string; kind: string }>;
    expect(links.filter((l) => l.kind === 'interno').every((l) => l.url.startsWith(ORIGIN))).toBe(true);
    const r = await call('revise', { pageId: id, sources: [...SOURCES, { url: 'https://blog-qualquer.example/post/', label: 'Um blog' }] }, { t });
    expect(r.status).toBe(200);
    const pl2 = await call('plan_links', { pageId: id }, { t });
    expect((pl2.body.rejected_external as Array<{ url: string; why: string }>).some((x) => x.url.includes('blog-qualquer') && /não é fonte oficial/.test(x.why))).toBe(true);
  });
  it('verifica fontes por HEAD/200 (rede injetada): 404 marca a fonte como não verificada', async () => {
    const { t, id } = await readyPage();
    const fetchFn = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const c = await call('check', { pageId: id, verifyLinks: true }, { t, deps: { fetchFn } });
    expect(fetchFn).toHaveBeenCalled();
    expect(c.body.links_verified).toBeGreaterThan(0);
    expect(rows(t, 'studio_page_links').find((l) => l.kind === 'externo')?.verified).toBe(false);
  });
  it('APROVAÇÃO OBRIGATÓRIA: rascunho não publica; aprovar exige "em revisão"; pendência no texto e portão reprovado bloqueiam', async () => {
    const { t, id } = await readyPage();
    const direct = await call('publish', { pageId: id }, { t, deps: { plugin: async () => ({ success: true }) } });
    expect([403, 422]).toContain(direct.status);
    expect(direct.body.error).toBe('not_approved');
    const early = await call('approve', { pageId: id, step: 'aprovar' }, { t });
    expect(early.status).toBe(422);
    expect((early.body.reasons as string[]).join(' ')).toMatch(/em revisão/);
    expect((await call('approve', { pageId: id, step: 'enviar' }, { t })).status).toBe(200);
    // pendência no texto
    await call('revise', { pageId: id, bodyHtml: `${GOOD_BODY}<p>O fórum fica em [PENDENTE: endereço do fórum].</p>` }, { t });
    await call('approve', { pageId: id, step: 'enviar' }, { t });
    const blocked = await call('approve', { pageId: id, step: 'aprovar' }, { t });
    expect(blocked.status).toBe(422);
    expect((blocked.body.reasons as string[]).join(' ')).toMatch(/pendência|Portões obrigatórios/);
    expect(rows(t, 'studio_pages')[0].status).toBe('em_revisao');
    expect(rows(t, 'studio_pages')[0].approved_by).toBeNull();
  });
  it('aprovar registra o aprovador e o hash; EDITAR depois desfaz a aprovação; aprovador distinto é regra do perfil', async () => {
    const { t, id } = await readyPage();
    await call('approve', { pageId: id, step: 'enviar' }, { t });
    const ok = await call('approve', { pageId: id, step: 'aprovar' }, { t });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const row = rows(t, 'studio_pages')[0];
    expect(row).toMatchObject({ status: 'aprovada', approved_by: USER });
    expect(row.approved_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.approved_hash).toBe(row.content_hash);
    await call('revise', { pageId: id, metaDescription: `${META} Atendemos de segunda a sexta.` }, { t });
    expect(rows(t, 'studio_pages')[0]).toMatchObject({ status: 'rascunho', approved_by: null, approved_hash: null });
    // aprovador distinto
    const t2 = world(); (t2.projects[0].editorial_identity as Record<string, unknown>).studio_rules = { options: { aprovador_distinto: 'sim' } };
    const r2 = await readyPage(t2);
    await call('approve', { pageId: r2.id, step: 'enviar' }, { t: t2 });
    const same = await call('approve', { pageId: r2.id, step: 'aprovar' }, { t: t2 });
    expect(same.status).toBe(422);
    expect((same.body.reasons as string[]).join(' ')).toMatch(/outra pessoa/);
    const other = await call('approve', { pageId: r2.id, step: 'aprovar' }, { t: t2, user: USER2 });
    expect(other.status, JSON.stringify(other.body)).toBe(200);
  });
  it('devolver a página volta a rascunho e limpa a aprovação; passo inválido é recusado', async () => {
    const { t, id } = await readyPage();
    await call('approve', { pageId: id, step: 'enviar' }, { t });
    await call('approve', { pageId: id, step: 'aprovar' }, { t });
    expect((await call('approve', { pageId: id, step: 'devolver' }, { t })).status).toBe(200);
    expect(rows(t, 'studio_pages')[0]).toMatchObject({ status: 'rascunho', approved_by: null });
    expect((await call('approve', { pageId: id, step: 'xyz' }, { t })).body.error).toBe('step_invalid');
  });
  it('o endereço de página PUBLICADA muda só com redirecionamento 301 registrado', async () => {
    const { t, id } = await readyPage();
    const row = rows(t, 'studio_pages')[0]; row.status = 'publicada'; row.published_version = 1; row.public_url = `${ORIGIN}/advogado-criminalista/guarulhos/`; row.approved_by = USER;
    const r = await call('revise', { pageId: id, slugPath: 'advogado-criminalista/guarulhos-sp' }, { t });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.redirect_needed).toEqual({ from: '/advogado-criminalista/guarulhos/', to: '/advogado-criminalista/guarulhos-sp/' });
  });
});

describe('Estúdio: publicar (plugin, pacote estático)', () => {
  const approved = async (over: Record<string, unknown> = {}, t = world()) => {
    const r = await readyPage(t, over);
    await call('approve', { pageId: r.id, step: 'enviar' }, { t });
    const a = await call('approve', { pageId: r.id, step: 'aprovar' }, { t });
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    return r;
  };
  const pluginOk = (calls: Array<{ path: string; init: { method: string; body?: unknown } }> = []): NonNullable<Deps['plugin']> => async (_c, path, init) => { calls.push({ path, init }); return { success: true, id: 77, url: `${ORIGIN}/advogado-criminalista/guarulhos/`, path: 'advogado-criminalista/guarulhos', status: 'publish', created: true, completeness: { ran: true } }; };

  it('plugin: payload com endereço exato, hierarquia, SEM h1 no conteúdo, schema em grafo único, completude; marca publicada, entra na fila de indexação e emite eventos', async () => {
    const { t, id } = await approved();
    const calls: Array<{ path: string; init: { method: string; body?: unknown } }> = [];
    const fetchFn = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;
    t.index_keys.push({ project_id: P, host: 'aurora-advogados.example', key_value: 'abcdef1234567890', key_location: null });
    const r = await call('publish', { pageId: id }, { t, deps: { plugin: pluginOk(calls), fetchFn } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.published).toBe(true);
    const payload = calls[0].init.body as { content: string; content_hash: string; zica_ai_id: string; completeness: { approved_hash: string }; schema: { '@graph': Array<Record<string, unknown>> } } & Record<string, unknown>;
    expect(calls[0].path).toBe('pages');
    expect(payload).toMatchObject({ post_type: 'page', status: 'publish', slug: 'guarulhos', parent_path: 'advogado-criminalista', full_path: 'advogado-criminalista/guarulhos', canonical: `${ORIGIN}/advogado-criminalista/guarulhos/`, template: 'clean', language: 'pt-BR' });
    expect(payload.zica_ai_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.content).not.toMatch(/<h1/);
    expect(payload.completeness.approved_hash).toBe(payload.content_hash);
    expect(payload.schema['@graph'].map((n) => n['@type'])).toEqual(expect.arrayContaining(['LegalService', 'WebPage', 'Service', 'BreadcrumbList']));
    expect(rows(t, 'studio_pages')[0]).toMatchObject({ status: 'publicada', wp_post_id: 77, public_url: `${ORIGIN}/advogado-criminalista/guarulhos/`, published_version: 3 });
    expect(rows(t, 'studio_publications')[0]).toMatchObject({ status: 'ok', adapter: 'wordpress_plugin' });
    expect(rows(t, 'index_urls').some((u) => u.url === `${ORIGIN}/advogado-criminalista/guarulhos/` && u.source === 'manual')).toBe(true);
    expect(rows(t, 'index_submissions')[0]).toMatchObject({ engine: 'indexnow', status: 'aceita' });
    expect((r.body.indexation as Record<string, unknown>).indexnow).toBe('aceita');
    expect(rows(t, 'project_events').map((e) => e.kind)).toContain('estudio.pagina_publicada');
  });
  it('o que foi aprovado é o que é publicado: se o conteúdo mudar depois da aprovação, a publicação é recusada', async () => {
    const { t, id } = await approved();
    rows(t, 'studio_pages')[0].body_html = `${rows(t, 'studio_pages')[0].body_html}<p>Texto novo sem passar pela revisão.</p>`;
    const r = await call('publish', { pageId: id }, { t, deps: { plugin: pluginOk() } });
    expect(r.status).toBe(422);
    expect((r.body.reasons as string[]).join(' ')).toMatch(/mudou depois da aprovação/);
    expect(rows(t, 'studio_pages')[0].status).toBe('aprovada');
    expect(rows(t, 'studio_publications')[0]).toMatchObject({ status: 'recusada' });
  });
  it('o WordPress mudou o slug (sufixo -2): a publicação é recusada e a página NÃO vira publicada', async () => {
    const { t, id } = await approved();
    const plugin: NonNullable<Deps['plugin']> = async () => ({ success: true, id: 5, url: `${ORIGIN}/advogado-criminalista/guarulhos-2/`, path: 'advogado-criminalista/guarulhos-2', status: 'publish' });
    const r = await call('publish', { pageId: id }, { t, deps: { plugin } });
    expect(r.status).toBe(409);
    expect((r.body.reasons as string[]).join(' ')).toMatch(/alterou o endereço/);
    expect(rows(t, 'studio_pages')[0].status).toBe('aprovada');
  });
  it('destino "rascunho": envia ao WordPress como draft e mantém a página aprovada no Estúdio', async () => {
    const { t, id } = await approved();
    const calls: Array<{ path: string; init: { method: string; body?: unknown } }> = [];
    const r = await call('publish', { pageId: id, target: 'draft' }, { t, deps: { plugin: pluginOk(calls) } });
    expect(r.body).toMatchObject({ published: false, draft_sent: true });
    expect((calls[0].init.body as Record<string, unknown>).status).toBe('draft');
    expect(rows(t, 'studio_pages')[0].status).toBe('aprovada');
  });
  it('sem plugin disponível: 503, nada marcado como publicado; adaptador hospedado ainda não existe (só contrato)', async () => {
    const { t, id } = await approved();
    expect((await call('publish', { pageId: id }, { t })).body.error).toBe('plugin_unavailable');
    rows(t, 'studio_pages')[0].adapter = 'zica_hosted';
    const h = await call('publish', { pageId: id }, { t });
    expect(h.status).toBe(422);
    expect((h.body.reasons as string[]).join(' ')).toMatch(/não foi construído/);
  });
  it('limite de publicações por dia vem do perfil de regras', async () => {
    const t = world(); (t.projects[0].editorial_identity as Record<string, unknown>).studio_rules = { options: { publicacoes_por_dia: 1 } };
    const { id } = await approved({}, t);
    rows(t, 'studio_pages').push({ id: '00000000-0000-4000-8000-000000000999', project_id: P, organization_id: ORG, slug_path: 'x/y', published_at: new Date(NOW).toISOString(), status: 'publicada', type: 'pagina', body_html: '', title: '', doc: {} });
    const r = await call('publish', { pageId: id }, { t, deps: { plugin: pluginOk() } });
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('daily_limit');
  });
  it('páginas de porta: duas páginas locais quase iguais não publicam (o porquê e a proposta de consolidar vêm na resposta)', async () => {
    const { t } = await approved();
    const osasco = await readyPage(t, { query: 'advogado criminalista em Osasco', place: 'Osasco', slugPath: 'advogado-criminalista/osasco' });
    rows(t, 'studio_pages').find((p) => p.id === osasco.id)!.body_html = GOOD_BODY.replace(/Guarulhos/g, 'Osasco');
    const pg = rows(t, 'studio_pages').find((p) => p.id === osasco.id)!;
    pg.title = 'Advogado criminalista em Osasco: flagrante, custódia e plantão'; pg.meta_description = META.replace(/Guarulhos/g, 'Osasco'); pg.status = 'aprovada'; pg.approved_by = USER;
    const c = await call('check', { pageId: osasco.id }, { t });
    expect((c.body.quality as { doorway: { verdict: string; proposal: string } }).doorway.verdict).toBe('porta');
    pg.approved_hash = (c.body.quality as { content_hash: string }).content_hash;
    const r = await call('publish', { pageId: osasco.id }, { t, deps: { plugin: pluginOk() } });
    expect(r.status).toBe(422);
    const reasons = (r.body.reasons as string[] | undefined)?.join(' ') || '';
    expect(`${reasons} ${String(r.body.proposal || '')}`).toMatch(/doorway|porta|Consolide|obrigatórios/i);
  });
  it('site estático: a 1ª chamada gera o PACOTE (HTML, sitemap com data real, 301, 404 real, instruções, somas); só vira publicada quando a URL no ar confere', async () => {
    const t = world(); (t.projects[0] as Row).wordpress_url = null;
    const { id } = await approved({}, t);
    const pkgRes = await call('publish', { pageId: id }, { t });
    expect(pkgRes.status, JSON.stringify(pkgRes.body)).toBe(200);
    const pkg = pkgRes.body.package as { files: Array<{ path: string; content: string; sha256: string }>; manifest: { pages: unknown[] } };
    const paths = pkg.files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(['advogado-criminalista/guarulhos/index.html', 'sitemap-estudio.xml', 'redirects-estudio.htaccess', 'htaccess-404-real.txt', '404.html', 'INSTRUCOES.md']));
    const html = pkg.files.find((f) => f.path.endsWith('index.html'))!.content;
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/aurora-advogados\.example\/advogado-criminalista\/guarulhos\/">/);
    expect(html).toMatch(/application\/ld\+json/);
    expect(html).toMatch(/<h1>Advogado criminalista em Guarulhos<\/h1>/);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(pkg.files.find((f) => f.path === 'sitemap-estudio.xml')!.content).toMatch(/<lastmod>2026-11-20<\/lastmod>/);
    expect(pkg.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);
    expect(rows(t, 'studio_pages')[0].status).toBe('aprovada');
    expect(rows(t, 'studio_publications')[0]).toMatchObject({ status: 'pacote_gerado' });
    // soft-404: o site devolveu a página inicial (200) para o endereço: NÃO confere
    const home = vi.fn(async () => new Response('<html><link rel="canonical" href="https://aurora-advogados.example/"></html>', { status: 200 })) as unknown as typeof fetch;
    const soft = await call('publish', { pageId: id, confirmDeployed: true }, { t, deps: { fetchFn: home } });
    expect(soft.status).toBe(422);
    expect((soft.body.reasons as string[]).join(' ')).toMatch(/canonical/);
    expect(rows(t, 'studio_pages')[0].status).toBe('aprovada');
    const live = vi.fn(async () => new Response(html, { status: 200 })) as unknown as typeof fetch;
    const done = await call('publish', { pageId: id, confirmDeployed: true }, { t, deps: { fetchFn: live } });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(rows(t, 'studio_pages')[0]).toMatchObject({ status: 'publicada', public_url: `${ORIGIN}/advogado-criminalista/guarulhos/` });
    expect(rows(t, 'index_urls').some((u) => u.url === `${ORIGIN}/advogado-criminalista/guarulhos/`)).toBe(true);
  });
  it('despublicar: plugin confirma, status vira despublicada; pacote estático pede a confirmação da remoção', async () => {
    const { t, id } = await approved();
    await call('publish', { pageId: id }, { t, deps: { plugin: pluginOk() } });
    const calls: Array<{ path: string; init: { method: string; body?: unknown } }> = [];
    const r = await call('unpublish', { pageId: id }, { t, deps: { plugin: async (_c, path, init) => { calls.push({ path, init }); return { success: true }; } } });
    expect(r.status).toBe(200);
    expect(calls[0]).toMatchObject({ path: 'pages/status' });
    expect(rows(t, 'studio_pages')[0].status).toBe('despublicada');
    expect(rows(t, 'project_events').map((e) => e.kind)).toContain('estudio.pagina_despublicada');
    expect((await call('unpublish', { pageId: id }, { t })).body.error).toBe('transition_invalid');
  });
});

describe('Estúdio: imagens (política do projeto)', () => {
  const asset = { id: 'a1', user_id: USER, module_key: 'estudio_paginas', project_id: P, source_type: 'external_url', external_url: `${ORIGIN}/wp-content/uploads/advogado-criminalista-guarulhos.webp`, alt_text: 'Prédio comercial no centro de Guarulhos visto da calçada, de manhã', semantic_filename: 'advogado-criminalista-guarulhos.webp', semantic_tags: ['advogado', 'criminalista', 'guarulhos'], is_active: true, label: 'Prédio no centro', usage_count: 0 };
  const rpcImg: Record<string, RpcHandler> = { studio_optional_tables: () => ({ data: { index_urls: true, module_image_policies: true, module_image_assets: true }, error: null }) };
  it('seleciona do acervo por tema (padrão); sem imagem vira PENDÊNCIA, nunca imagem inventada; geração só com política permitindo e porta injetada', async () => {
    const t = world('owner', { module_image_assets: [asset as Row], module_image_policies: [] });
    const b = await readyPage(t);
    const fake = fakeAdmin(t, rpcImg);
    const run = (body: Record<string, unknown>, deps: Deps = {}) => handleStudioAction(fake.admin, { action: 'images', body: { projectId: P, pageId: b.id, ...body }, userId: USER, roleByOrg: memberRoles(t), deps: baseDeps(deps) });
    const r = await run({});
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const imgs = r.body.images as Array<{ slot: string; origin: string; alt: string; width: number; height: number; filename: string }>;
    expect(imgs.find((i) => i.slot === 'hero')).toMatchObject({ origin: 'acervo', width: 1200 });
    expect(imgs.find((i) => i.slot === 'og')).toMatchObject({ width: 1200, height: 630 });
    expect(r.body.generated).toBe(0);
    expect(rows(t, 'studio_page_assets').length).toBeGreaterThanOrEqual(2);
    // sem acervo: pendente
    t.module_image_assets.length = 0;
    const port = { generate: vi.fn(async () => ({ url: 'x', width: 1200, height: 675, bytes: 1, costMicros: 1 })) };
    const noPolicy = await run({ generate: true, scene: { sceneEn: 'A desk with documents', alt: 'Mesa de trabalho com documentos e uma caneta' } }, { image: async () => port });
    expect((noPolicy.body.images as Array<{ origin: string }>).every((i) => i.origin === 'pendente')).toBe(true);
    expect(port.generate).not.toHaveBeenCalled(); // a política do projeto não permite gerar
    expect((noPolicy.body.pendings as Array<{ reason: string }>)[0].reason).toMatch(/não permite gerar/);
    // política permite + porta: gera dentro do que a porta permitir
    t.module_image_policies.push({ user_id: USER, module_key: 'estudio_paginas', project_id: null, allow_ai_generation: true });
    const gen = await run({ generate: true, scene: { sceneEn: 'A desk with documents', alt: 'Mesa de trabalho com documentos e uma caneta' } }, { image: async () => port });
    expect(port.generate).toHaveBeenCalledTimes(1);
    expect(String((port.generate.mock.calls[0] as unknown as Array<{ prompt: string }>)[0].prompt)).toMatch(/NO identifiable real person.*NO text/s);
    expect(gen.body.generated).toBe(1); // og reaproveita a cena da principal
  });
});

describe('Estúdio: leitura, papéis, isolamento e portão engine', () => {
  it('list e detail: qualquer membro lê; detail traz prévia, SERP, trechos marcados de IA, versões, links e custo estimado; reader não escreve', async () => {
    const { t, id } = await readyPage();
    (t.organization_members as Array<{ user_id: string; role: string }>).find((m) => m.user_id === USER)!.role = 'member';
    const l = await call('list', {}, { t });
    expect(l.status).toBe(200);
    expect(l.body).toMatchObject({ total: 1, can_edit: false });
    expect((l.body.counts as Record<string, number>).rascunho).toBe(1);
    expect((l.body.profile_gaps as unknown[]).length).toBeGreaterThanOrEqual(0);
    expect(l.body.cost).toMatchObject({ capMicros: 7_000_000 });
    const d = await call('detail', { pageId: id }, { t });
    expect(d.status).toBe(200);
    expect(String(d.body.preview_html)).toMatch(/<!doctype html>/);
    expect(d.body.serp).toMatchObject({ title: TITLE });
    expect(Array.isArray(d.body.versions)).toBe(true);
    expect((d.body.quality as { ai: { score: number } }).ai.score).toBeGreaterThanOrEqual(0);
    expect(d.body.schema).toBeTruthy();
    for (const a of ['brief', 'generate', 'revise', 'check', 'plan_links', 'images', 'approve', 'publish', 'unpublish']) {
      const r = await call(a, { pageId: id, step: 'enviar', ...BRIEF }, { t });
      expect(r.status, a).toBe(403);
    }
  });
  it('isolamento: outra organização não vê nem altera páginas; id de outro projeto é 404', async () => {
    const { t, id } = await readyPage();
    const other = await call('detail', { pageId: id }, { t: { ...t, organization_members: [{ organization_id: OTHER, user_id: USER, role: 'owner', status: 'active' }] } });
    expect(other.status).toBe(403);
    const wrongProject = await call('detail', { projectId: P_OTHER, pageId: id }, { t });
    expect([403, 404]).toContain(wrongProject.status);
    expect((await call('detail', { pageId: '00000000-0000-4000-8000-0000000000ff' }, { t })).status).toBe(404);
    expect((await call('detail', {}, { t })).status).toBe(422);
  });
  it('ação desconhecida é recusada; o manifesto e o handler declaram as mesmas ações', async () => {
    expect((await call('apagar_tudo', {})).status).toBe(400);
    expect(STUDIO_ACTIONS).toEqual(['brief', 'generate', 'revise', 'check', 'plan_links', 'images', 'approve', 'publish', 'unpublish', 'list', 'detail']);
  });
  it('pelo portão engine: papel mínimo conferido no banco; generate/images são as únicas pagas e são negadas com o bloqueio global de gasto', async () => {
    const t = world('owner');
    const fake = fakeAdmin(t, RPCS);
    const deps: EngineDeps = { fetchFn: (async () => new Response('x')) as typeof fetch, lookupA: async () => ['93.184.216.34'], now: () => NOW, sleep: async () => undefined, speedApiKey: null, paidBlocked: true, spendGuard: async () => ({ allowed: false, status: 423, error: 'global_paid_services_blocked' }) };
    const viaEngine = (module: string, action: string, body: Record<string, unknown> = {}) => routeEngineRequest(fake.admin, { userId: USER, body: { module, action, projectId: P, ...body } }, deps);
    const brief = await viaEngine('estudio', 'brief', BRIEF);
    expect(brief.status).toBe(201);
    expect((await viaEngine('estudio', 'generate', { pageId: (brief.body.page as { id: string }).id })).status).toBe(423);
    expect((await viaEngine('estudio', 'images', { pageId: (brief.body.page as { id: string }).id })).status).toBe(423);
    expect((await viaEngine('estudio', 'list')).status).toBe(200);
    expect((await viaEngine('estudio', 'nao_existe')).status).toBe(400);
    const t2 = world('member'); const fake2 = fakeAdmin(t2, RPCS);
    const denied = await routeEngineRequest(fake2.admin, { userId: USER, body: { module: 'estudio', action: 'brief', projectId: P, ...BRIEF } }, deps);
    expect(denied.status).toBe(403);
  });
  it('erro inesperado vira 500 padronizado sem vazar detalhe', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = world(); const fake = fakeAdmin(t, RPCS);
    (fake.admin as { from: (n: string) => unknown }).from = ((orig) => (n: string) => { if (n === 'studio_pages') throw new Error('segredo-interno'); return orig(n); })((fake.admin as { from: (n: string) => unknown }).from) as never;
    const r = await handleStudioAction(fake.admin as never, { action: 'list', body: { projectId: P }, userId: USER, roleByOrg: memberRoles(t), deps: baseDeps() });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('segredo-interno');
    spy.mockRestore();
  });
});
