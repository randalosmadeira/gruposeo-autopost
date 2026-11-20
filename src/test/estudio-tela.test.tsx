import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: async (_fn: string, o: { body: { module: string; action: string } & Record<string, unknown> }) => {
        const { module, action, ...rest } = o.body;
        try { return { data: await api.call(module, action, rest), error: null }; } catch (e) {
          const err = e as { code?: string; detail?: Record<string, unknown> };
          return { data: null, error: { context: new Response(JSON.stringify({ error: err.code || 'request_failed', ...(err.detail || {}) }), { status: 403 }) } };
        }
      },
    },
  },
}));
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'Aurora Advogados', organization_id: '00000000-0000-4000-8000-0000000000a1' }], isLoading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import PageStudio from '@/pages/PageStudio';
import { EngineError } from '@/lib/engine-api';
import { studioErrorMessage } from '@/lib/studio-api';
import { PT, EN, ES } from '@/lib/i18n/studio-dict';

const P = '00000000-0000-4000-8000-0000000000b1';
const PAGE_ID = '00000000-0000-4000-8000-0000000000d1';

const summary = (over: Record<string, unknown> = {}) => ({ id: PAGE_ID, type: 'local', status: 'rascunho', title: 'Advogado criminalista em Guarulhos', slug_path: 'advogado-criminalista/guarulhos', url: null, language: 'pt-BR', place: 'Guarulhos', version: 3, quality_score: 82, ai_score: 18, pending_count: 2, adapter: 'wordpress_plugin', updated_at: '2026-11-20T12:00:00.000Z', live: false, ...over });
const list = (over: Record<string, unknown> = {}) => ({
  project: { id: P, name: 'Aurora Advogados', domain: 'aurora-advogados.example' }, can_edit: true, total: 1, page: 0, page_size: 30, counts: { rascunho: 1, em_revisao: 0, aprovada: 0, publicada: 0, despublicada: 0 }, pages: [summary()],
  options: { batch_limit: 5, daily_publish_limit: 10, require_distinct_approver: false, max_ai_steps: 8, step_max_tokens: 1400, benchmark_top_n: 10, rewrite_rounds: 2, created_in_24h: 2 }, rules_layers: ['padrao_editavel'],
  capabilities: { ai: false, images: false, plugin: true, radar: false, serp_local: true, observatory: true, taxonomy: true, focuses: false },
  profile_gaps: [{ key: 'autor', label: 'Autor real com credencial', where: 'Projeto: editorial_identity.studio_profile.authors' }], cost: { perPageMicros: { text: 120_000, images: 0, total: 120_000 }, pagesPerDayWithinCap: 58, capMicros: 7_000_000, extraMicros: 2_200_000, note: 'x' },
  adapters: ['wordpress_plugin', 'site_manifest', 'zica_hosted'], types: ['pagina', 'landing', 'hub', 'servico', 'local', 'guia', 'comparativo'], origin: 'https://aurora-advogados.example', base_path: '', ...over,
});
const brief = () => ({
  query: 'advogado criminalista em Guarulhos', type: 'local', radarSource: 'serp_local', notes: ['Só temas e estrutura dos concorrentes entram no briefing.'],
  pendings: [{ id: 'radar_so_titulos', kind: 'radar', label: 'Profundidade do benchmark', reason: 'Só há posição e título dos concorrentes.' }],
  intent: { recommendedType: 'guia', dominant: 'guia', mix: { guia: 50, servico: 50 }, evidence: [], rationale: '50% dos resultados que vencem hoje são "guia"; também aparecem video.', extraSurfaces: ['video'] },
  benchmark: { n: 2, depth: 'so_titulos', medianWords: null, p75Words: null, schemaPrevalence: {}, mediaShare: { images: 0, videos: 50 }, medianAgeDays: null, pages: [{ position: 1, host: 'concorrente-a.example', title: 'Advogado criminal em Guarulhos', words: null }], topEntities: [], socialSummary: { identities: 0, topFormats: [], medianPostsPerMonth: null } },
  gaps: { theyCoverWeDont: [{ topic: 'Fiança: quando cabe', kind: 'topico', coveredBy: 3, of: 4 }], nobodyCovers: [{ topic: 'Quem avisa a família?', source: 'taxonomia' }], weCoverTheyDont: [], basis: 'so_titulos' },
  angles: [{ id: 'fato:f1', kind: 'especificidade_local', angle: 'Usar o fato de campo (orgao): A 1ª Delegacia recebe os presos.', proof: ['Polícia Civil: https://www.policiacivil.sp.gov.br/'], status: 'pronto', missing: null, gapTopics: [] }, { id: 'caso', kind: 'caso_real', angle: 'Caso real autorizado', proof: [], status: 'pendente', missing: 'Uma pessoa precisa fornecer e autorizar.', gapTopics: [] }],
  surfaces: [{ kind: 'pagina', title: 'Página (local)', status: 'planejado', prerequisites: [], notes: 'x' }, { kind: 'video', title: 'Vídeo curto com roteiro', status: 'pendente', prerequisites: ['Uma pessoa real grava'], notes: 'prioridade alta' }],
  goals: { linkedToRadar: false, goals: [{ key: 'posicao', label: 'Posição na busca', current: null, target: 'entrar no top 10', source: 'sem placar do Radar', status: 'pendente' }] },
  citedSources: { total: 3, matched: 'consulta', byHost: [{ host: 'jusbrasil.com.br', kind: 'diretorio', count: 3, share: 100, engines: ['chatgpt'], ownedByUs: false }], own: { count: 0, share: 0 }, presenceTargets: [{ host: 'jusbrasil.com.br', kind: 'diretorio', why: 'Citado 3 vez(es).', action: 'Conferir o cadastro do negócio neste diretório.' }], notes: [] },
  outline: [{ level: 2, heading: 'Fiança: quando cabe', purpose: '3 de 4 concorrentes cobrem e nós não', from: 'lacuna' }],
});
const gate = (id: string, status: string, over: Record<string, unknown> = {}) => ({ id, label: `Portão ${id}`, level: 'exigir', status, note: `nota ${id}`, fix: status === 'ok' ? null : `corrija ${id}`, details: status === 'falha' ? [`detalhe ${id}`] : [], ...over });
const quality = (over: Record<string, unknown> = {}) => ({
  generated_at: '2026-11-20T12:00:00.000Z', content_hash: 'a'.repeat(64), score: 74, complete: false, blocking: ['canonical'], warnings: ['images'], ok: 20, active: 27, pendings: ['endereço do fórum'],
  results: [gate('images', 'aviso', { level: 'recomendar' }), gate('words', 'ok'), gate('canonical', 'falha'), gate('hreflang', 'info')],
  ai: { score: 62, coverage: 'completa', words: 300, metrics: { sentenceCv: 0.21, specificityPer100: 0.4 }, findings: [{ code: 'no_mundo_atual', label: 'Fórmula de contexto genérico ("no mundo atual")', excerpt: 'No mundo atual', paragraph: 0, severity: 3, fix: 'Comece pelo fato concreto.' }] },
  doorway: { verdict: 'porta', uniquePct: 31, maxSimilarity: 0.9, mostSimilar: { label: 'Osasco', similarity: 0.9 }, reasons: ['Só 31% do texto é próprio.'], proposal: 'Consolide em uma página regional.' },
  invention: [{ code: 'numero_sem_origem', severity: 'bloqueia', excerpt: '4.500 casos', why: 'Número que não consta dos dados.' }], ...over,
});
const detail = (over: Record<string, unknown> = {}, pageOver: Record<string, unknown> = {}) => ({
  page: { ...summary(), query: 'advogado criminalista em Guarulhos', subject: 'Advogado criminalista', host: 'aurora-advogados.example', base_path: '', h1: 'Advogado criminalista em Guarulhos', meta_description: 'Meta atual da página.', body_html: '<p>No mundo atual, vale destacar.</p>', public_url: null, approved_by: null, approved_at: null, last_error: null, content_hash: 'a'.repeat(64), approved_hash: null, published_version: null, ...pageOver },
  doc: { faq: [], sources: [], links: [], images: [{ slot: 'hero', origin: 'pendente', url: '', alt: '', width: 1200, height: 675, format: 'webp', filename: 'advogado-criminalista-guarulhos.webp' }], fieldFacts: [], author: null, noindex: false, inboundSuggested: [] },
  brief: brief(), quality: quality(), marked_html: '<p><mark data-ai="x">No mundo atual</mark>, vale destacar.</p>', serp: { title: 'Advogado criminalista em Guarulhos', url: 'https://aurora-advogados.example/advogado-criminalista/guarulhos/', display_url: 'aurora-advogados.example › advogado-criminalista › guarulhos', description: 'Meta atual da página.' },
  preview_html: '<!doctype html><html><body><h1>x</h1></body></html>', schema: null, schema_notes: [], versions: [{ version: 3, title: 't', reason: 'revisão humana', created_at: '2026-11-20T12:00:00.000Z', content_hash: 'a'.repeat(64) }],
  links: [{ direction: 'saida', kind: 'interno', url: 'https://aurora-advogados.example/advogado-criminalista/', anchor: 'Advogado criminalista', reason: 'hub (página-mãe na hierarquia)', verified: null }, { direction: 'saida', kind: 'externo', url: 'https://atos.cnj.jus.br/atos/detalhar/2234', anchor: 'Resolução 213/2015 do CNJ', reason: 'fonte oficial', verified: true }, { direction: 'entrada', kind: 'interno', url: 'https://aurora-advogados.example/advogado-criminalista/', anchor: '', reason: 'o hub deve apontar para a página filha', verified: null }],
  assets: [], publications: [], profile_gaps: [], pipeline: { stage: 'edicao', done: false, stopped: { reason: 'teto', message: 'Teto diário de gasto atingido' }, sections: [{ id: 'resposta', heading: null, status: 'ok', reason: null }, { id: 's1', heading: 'Fiança', status: 'teto', reason: 'Teto' }] },
  can_edit: true, cost: list().cost, rules: { layers: ['padrao_editavel'], options: list().options, gates: { title_unique: { level: 'exigir', value: 35, max: 70, source: 'padrao_editavel' }, meta_description: { level: 'exigir', value: 110, max: 170, source: 'padrao_editavel' } } }, ...over,
});

let L: ReturnType<typeof list>;
let D: ReturnType<typeof detail>;
beforeEach(() => {
  api.call.mockReset(); L = list(); D = detail();
  try { localStorage.removeItem('zica-locale'); } catch { /* ok */ }
  api.call.mockImplementation(async (module: string, action: string, body: Record<string, unknown>) => {
    if (module === 'eventos') return { events: [{ id: 'e1', module: 'estudio', kind: 'estudio.pagina_gerada', subject: {}, payload: { count: 4 }, created_at: '2026-11-20T10:00:00.000Z', text: 'Rascunho de página gerado (4)' }] };
    if (module !== 'estudio') throw new Error(`módulo inesperado ${module}`);
    if (action === 'list') return L;
    if (action === 'detail') return D;
    if (action === 'brief') return { page: summary({ version: 1 }), brief: brief(), slug: { ok: true }, pendings: [], profile_gaps: [] };
    if (action === 'revise') return { page: summary({ version: 4 }), quality: quality(), redirect_needed: null };
    if (action === 'generate') return { page: summary({ version: 4 }), quality: quality(), pendings: [], pipeline: { stopped: null, ai_used: 0, cost_usd_micros: 0, ai_available: false, done: true } };
    if (action === 'check') return { quality: quality(), links_verified: 0 };
    if (action === 'approve') return { page: summary({ status: 'em_revisao' }) };
    if (action === 'publish') return { published: false, package: { files: [{ path: 'advogado-criminalista/guarulhos/index.html', content: '<html></html>', sha256: 'b'.repeat(64), bytes: 13 }, { path: 'sitemap-estudio.xml', content: '<urlset/>', sha256: 'c'.repeat(64), bytes: 9 }], manifest: {}, warnings: ['aviso do pacote'], instructions: '# Como publicar\n1. Backup' }, next_step: 'x' };
    throw new Error(`ação inesperada ${action}`);
  });
});
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><PageStudio /></MemoryRouter></QueryClientProvider>);
const calls = (action: string) => api.call.mock.calls.filter((c) => c[0] === 'estudio' && c[1] === action).map((c) => c[2]);
const tab = (name: RegExp) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
const openPage = async () => { mount(); fireEvent.click(await screen.findByRole('button', { name: 'Abrir' })); await screen.findByRole('button', { name: 'Voltar à lista' }); };

describe('Estúdio: lista e avisos', () => {
  it('chama o portão com module="estudio"; mostra avisos honestos (nunca inventa, aprovação humana, custo é estimativa), lacunas do Perfil e o que está ligado', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: /Páginas que buscadores, IAs e pessoas entendem/ })).toBeTruthy();
    expect(api.call).toHaveBeenCalledWith('estudio', 'list', { projectId: P });
    const aside = screen.getByRole('complementary', { name: 'Avisos honestos' });
    expect(aside.textContent).toMatch(/nunca inventa fato, endereço, telefone, depoimento/);
    expect(aside.textContent).toMatch(/Nada é publicado sem a aprovação de uma pessoa/);
    expect(aside.textContent).toMatch(/ESTIMATIVA/);
    expect(await screen.findByText('Autor real com credencial')).toBeTruthy();
    expect(screen.getByText(/IA do projeto: não disponível/)).toBeTruthy();
    expect(screen.getByText(/Plugin do WordPress: ligado/)).toBeTruthy();
  });
  it('cartão da página: estado, tipo, qualidade, nota de IA, pendências, versão; trava de páginas em massa visível', async () => {
    mount();
    const li = (await screen.findByText('Advogado criminalista em Guarulhos')).closest('li')!;
    expect(li.textContent).toMatch(/Rascunho/);
    expect(li.textContent).toMatch(/Local/);
    expect(li.textContent).toMatch(/qualidade 82/);
    expect(li.textContent).toMatch(/IA 18/);
    expect(li.textContent).toMatch(/2 pendência\(s\)/);
    expect(li.textContent).toMatch(/v3/);
    expect(screen.getByText(/2 de 5 páginas novas nas últimas 24 h/)).toBeTruthy();
  });
  it('filtros chamam o servidor; lista vazia orienta; erro mostra "tentar de novo"', async () => {
    mount();
    await screen.findByText('Advogado criminalista em Guarulhos');
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'publicada' } });
    await waitFor(() => expect(calls('list').some((c) => (c as Record<string, unknown>).status === 'publicada')).toBe(true));
  });
  it('lista vazia e erro', async () => {
    L = list({ total: 0, pages: [], counts: { rascunho: 0, em_revisao: 0, aprovada: 0, publicada: 0, despublicada: 0 } });
    mount();
    expect(await screen.findByText(/Ainda não há páginas/)).toBeTruthy();
    api.call.mockReset();
    api.call.mockImplementation(async () => { throw Object.assign(new Error('x'), { code: 'organization_membership_required', detail: {} }); });
  });
});

describe('Estúdio: nova página (briefing a partir de Foco, nó e território)', () => {
  it('envia o briefing com tipo, idioma, lugar, fatos de campo COM fonte e fontes oficiais; abre o briefing de superação', async () => {
    mount();
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Nova página' }), { button: 0, ctrlKey: false });
    fireEvent.change(await screen.findByLabelText(/Busca ou assunto que a página responde/), { target: { value: 'advogado criminalista em Guarulhos' } });
    fireEvent.change(screen.getByLabelText(/Tipo \(vazio/), { target: { value: 'local' } });
    fireEvent.change(screen.getByLabelText('Idioma da página (BCP 47)'), { target: { value: 'pt-BR' } });
    fireEvent.change(screen.getByLabelText('Lugar (opcional)'), { target: { value: 'Guarulhos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar fato' }));
    fireEvent.change(screen.getByLabelText('O fato'), { target: { value: 'A 1ª Delegacia recebe os presos em flagrante.' } });
    fireEvent.change(screen.getByLabelText('Endereço (https) da fonte'), { target: { value: 'https://www.policiacivil.sp.gov.br/' } });
    fireEvent.click(screen.getByLabelText('aprovado'));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar fonte' }));
    fireEvent.change(screen.getByLabelText('https://…'), { target: { value: 'https://atos.cnj.jus.br/atos/detalhar/2234' } });
    fireEvent.change(screen.getAllByLabelText('Nome da fonte')[1], { target: { value: 'CNJ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar briefing' }));
    await waitFor(() => expect(calls('brief')).toHaveLength(1));
    const b = calls('brief')[0] as { fieldFacts: Array<Record<string, unknown>>; sources?: Array<Record<string, unknown>> } & Record<string, unknown>;
    expect(b).toMatchObject({ projectId: P, query: 'advogado criminalista em Guarulhos', type: 'local', language: 'pt-BR', place: 'Guarulhos', adapter: 'wordpress_plugin' });
    expect(b.fieldFacts[0]).toMatchObject({ text: 'A 1ª Delegacia recebe os presos em flagrante.', source_url: 'https://www.policiacivil.sp.gov.br/', approved: true });
    expect(b.sources?.[0]).toMatchObject({ url: 'https://atos.cnj.jus.br/atos/detalhar/2234' });
    expect(await screen.findByRole('heading', { name: 'Briefing de superação' })).toBeTruthy();
  });
});

describe('Estúdio: Briefing de Superação', () => {
  it('mostra as 6 partes e o mapa de fontes citadas pelas IAs, com pendências e o aviso de que o texto dos concorrentes nunca é copiado', async () => {
    await openPage();
    const reg = screen.getByRole('region', { name: 'Briefing de superação' });
    for (const h of [/1\. O que vence hoje/, /2\. As melhores páginas/, /3\. Lacunas/, /4\. O que dizer de diferente/, /5\. Pacote de superfícies/, /6\. Metas e acompanhamento/, /Fontes citadas pelas IAs: onde precisamos aparecer/]) expect(within(reg).getByRole('heading', { name: h })).toBeTruthy();
    expect(reg.textContent).toMatch(/Fonte: SERP do planejador de mercado \(só posição e título\)/);
    expect(reg.textContent).toMatch(/nunca é copiado/);
    expect(reg.textContent).toMatch(/Fiança: quando cabe/);
    expect(reg.textContent).toMatch(/Ninguém cobre bem \(oportunidade\)/);
    expect(reg.textContent).toMatch(/Prova: Polícia Civil/);
    expect(reg.textContent).toMatch(/Falta: Uma pessoa precisa fornecer e autorizar/);
    expect(reg.textContent).toMatch(/Só posição e título: palavras, schema e mídia dependem do Radar/);
    expect(reg.textContent).toMatch(/jusbrasil\.com\.br.*diretorio/);
    expect(reg.textContent).toMatch(/Conferir o cadastro do negócio neste diretório/);
    expect(reg.textContent).toMatch(/Pendências do briefing/);
  });
});

describe('Estúdio: editor, geração e pré-visualização', () => {
  it('editar habilita salvar; salvar chama revise com os campos; contador de caracteres e faixa do perfil de regras', async () => {
    await openPage();
    tab(/^Editor$/);
    const save = await screen.findByRole('button', { name: 'Salvar revisão' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Título \(SEO\)/), { target: { value: 'Novo título da página para a busca' } });
    expect(screen.getByLabelText(/Título \(SEO\)/).closest('div')!.textContent).toMatch(/\(35–70\)/);
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(calls('revise')).toHaveLength(1));
    expect(calls('revise')[0]).toMatchObject({ projectId: P, pageId: PAGE_ID, title: 'Novo título da página para a busca', bodyHtml: '<p>No mundo atual, vale destacar.</p>', slugPath: 'advogado-criminalista/guarulhos' });
    expect(await screen.findByText(/Revisão salva \(v4\)/)).toBeTruthy();
  });
  it('gerar sem IA avisa que o rascunho virou pendências; geração parada no teto mostra o motivo e que o que saiu foi guardado', async () => {
    await openPage();
    tab(/^Editor$/);
    expect(await screen.findByText(/A geração parou: Teto diário de gasto atingido/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Gerar rascunho/ }));
    await waitFor(() => expect(calls('generate')).toHaveLength(1));
    expect(calls('generate')[0]).toMatchObject({ pageId: PAGE_ID, restart: false });
    expect(await screen.findByText(/IA indisponível neste ambiente/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Recomeçar do zero' }));
    await waitFor(() => expect(calls('generate')).toHaveLength(2));
    expect(calls('generate')[1]).toMatchObject({ restart: true });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar com fontes (HEAD/200)' }));
    await waitFor(() => expect(calls('check').some((c) => (c as Record<string, unknown>).verifyLinks === true)).toBe(true));
  });
  it('pré-visualização em iframe ISOLADO (sandbox) no computador e no celular (375 px dentro de um contêiner que rola, sem rolar a página); SERP e resposta que uma IA pode citar', async () => {
    await openPage();
    tab(/^Editor$/);
    const frame = (await screen.findByTitle('Pré-visualização')) as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('<!doctype html>');
    expect(frame.parentElement!.className).toMatch(/overflow-x-auto/);
    fireEvent.click(screen.getByRole('button', { name: 'Celular' }));
    expect(frame.style.width).toBe('375px');
    fireEvent.click(screen.getByRole('button', { name: 'Computador' }));
    expect(frame.style.width).toBe('100%');
    expect(screen.getByText('aurora-advogados.example › advogado-criminalista › guarulhos')).toBeTruthy();
    expect(screen.getAllByText(/No mundo atual, vale destacar\./).length).toBeGreaterThan(0);
  });
  it('papel só de leitura: campos e botões desligados, com o aviso', async () => {
    D = detail({ can_edit: false });
    await openPage();
    tab(/^Editor$/);
    expect(await screen.findByText('Seu papel permite ver, mas não alterar.')).toBeTruthy();
    expect((screen.getByLabelText(/Título \(SEO\)/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Gerar rascunho/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Estúdio: completude técnica, anti-IA, links, imagens', () => {
  it('portões: reprovados primeiro, com nota, detalhes e COMO CORRIGIR; página de porta e dados sem origem em alerta; pendências no texto', async () => {
    await openPage();
    tab(/^Completude técnica$/);
    const reg = await screen.findByRole('region', { name: 'Portões técnicos' });
    expect(reg.textContent).toMatch(/Nota de completude 74\/100/);
    expect(reg.textContent).toMatch(/1 obrigatório\(s\) reprovado\(s\)/);
    const items = within(reg).getAllByRole('listitem').filter((li) => /Portão /.test(li.textContent || ''));
    expect(items[0].textContent).toMatch(/Portão canonical/);
    expect(items[0].textContent).toMatch(/falha/);
    expect(items[0].textContent).toMatch(/Como corrigir: corrija canonical/);
    expect(items[0].textContent).toMatch(/detalhe canonical/);
    expect(items[1].textContent).toMatch(/Portão images/);
    expect(reg.textContent).toMatch(/Páginas de porta/);
    expect(reg.textContent).toMatch(/Consolide em uma página regional/);
    expect(reg.textContent).toMatch(/Dados sem origem/);
    expect(reg.textContent).toMatch(/4\.500 casos/);
    expect(reg.textContent).toMatch(/endereço do fórum/);
    expect(within(reg).getAllByRole('alert').length).toBe(2);
  });
  it('anti-IA: nota, achados com o trecho e a correção; texto marcado só em iframe isolado', async () => {
    await openPage();
    tab(/^Anti-IA$/);
    const reg = await screen.findByRole('region', { name: 'Detector de padrões de IA' });
    expect(reg.textContent).toMatch(/Nota 62\/100 \(0 = soa humano\)/);
    expect(reg.textContent).toMatch(/Fórmula de contexto genérico/);
    expect(reg.textContent).toMatch(/Comece pelo fato concreto/);
    expect(reg.textContent).toMatch(/não prova autoria/);
    const frame = within(reg).getByTitle('Trechos marcados no texto') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('<mark data-ai="x">');
  });
  it('links: internos, externos (verificado ou não) e links de entrada sugeridos; planejar chama o servidor com ou sem verificação', async () => {
    await openPage();
    tab(/^Links$/);
    const reg = await screen.findByRole('region', { name: 'Plano de links' });
    expect(reg.textContent).toMatch(/hub \(página-mãe na hierarquia\)/);
    expect(reg.textContent).toMatch(/Resolução 213\/2015 do CNJ/);
    expect(reg.textContent).toMatch(/fonte oficial; verificado/);
    expect(reg.textContent).toMatch(/o hub deve apontar para a página filha/);
    api.call.mockImplementation(async (m: string, a: string) => (m === 'eventos' ? { events: [] } : a === 'plan_links' ? { links: [], inbound: [], missing: { internal: 1, external: 0 }, rejected_external: [] } : a === 'detail' ? D : L));
    fireEvent.click(within(reg).getByRole('button', { name: 'Planejar e verificar fontes' }));
    await waitFor(() => expect(calls('plan_links').some((c) => (c as Record<string, unknown>).verifyLinks === true)).toBe(true));
    expect(await screen.findByText(/Faltam 1 internos e 0 externos/)).toBeTruthy();
  });
  it('imagens: slot pendente é pendência; gerar fica desligado sem a capacidade e sem cena+alt; regras (sem rosto inventado, sem lugar falso)', async () => {
    await openPage();
    tab(/^Imagens$/);
    const reg = await screen.findByRole('region', { name: /Imagens \(minimalistas e realistas\)/ });
    expect(reg.textContent).toMatch(/Sem rosto de pessoa real inventado, sem lugar ou endereço falso/);
    expect(reg.textContent).toMatch(/hero · pendente · 1200×675 · webp/);
    expect((within(reg).getByRole('button', { name: /Gerar \(política do projeto \+ teto\)/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(reg.textContent).toMatch(/Geração de imagem: não disponível/);
    fireEvent.click(within(reg).getByRole('button', { name: 'Selecionar do acervo' }));
    await waitFor(() => expect(calls('images')).toHaveLength(1));
  });
});

describe('Estúdio: aprovar e publicar (humano obrigatório)', () => {
  it('rascunho: só "enviar para revisão"; sem botão de publicar; em revisão: aprovar e devolver; aprovada com plugin: publicar e enviar como rascunho', async () => {
    await openPage();
    tab(/^Aprovar e publicar$/);
    const reg = await screen.findByRole('region', { name: 'Aprovar e publicar' });
    expect(within(reg).getByRole('button', { name: 'Enviar para revisão' })).toBeTruthy();
    expect(within(reg).queryByRole('button', { name: 'Publicar' })).toBeNull();
    expect(reg.textContent).toMatch(/Só página aprovada por uma pessoa pode ser publicada/);
    expect(reg.textContent).toMatch(/exatamente o que é publicado/);
    fireEvent.click(within(reg).getByRole('button', { name: 'Enviar para revisão' }));
    await waitFor(() => expect(calls('approve')).toHaveLength(1));
    expect(calls('approve')[0]).toMatchObject({ pageId: PAGE_ID, step: 'enviar' });
  });
  it('em revisão mostra aprovar/devolver; aprovada mostra publicar; pacote estático lista arquivos, avisos, baixar e instruções; hospedada pela Zica avisa que não existe', async () => {
    D = detail({}, { status: 'em_revisao' });
    await openPage(); tab(/^Aprovar e publicar$/);
    const reg = await screen.findByRole('region', { name: 'Aprovar e publicar' });
    expect(within(reg).getByRole('button', { name: 'Aprovar (sou eu quem aprova)' })).toBeTruthy();
    expect(within(reg).getByRole('button', { name: 'Devolver para ajustes' })).toBeTruthy();
    expect(within(reg).queryByRole('button', { name: 'Publicar' })).toBeNull();
  });
  it('aprovada (plugin): botões de publicar; (estático): gera pacote e mostra arquivos; (hospedada): aviso', async () => {
    D = detail({}, { status: 'aprovada', approved_at: '2026-11-20T12:00:00.000Z', approved_hash: 'a'.repeat(64) });
    await openPage(); tab(/^Aprovar e publicar$/);
    const reg = await screen.findByRole('region', { name: 'Aprovar e publicar' });
    expect(within(reg).getByRole('button', { name: 'Publicar' })).toBeTruthy();
    expect(within(reg).getByRole('button', { name: 'Enviar como rascunho ao WordPress' })).toBeTruthy();
    expect(reg.textContent).toMatch(/Conteúdo aprovado \(hash\) aaaaaaaaaaaaaaaa/);
  });
  it('pacote estático e adaptador hospedado', async () => {
    D = detail({}, { status: 'aprovada', adapter: 'site_manifest', approved_at: '2026-11-20T12:00:00.000Z' });
    const { unmount } = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><PageStudio /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }));
    await screen.findByRole('button', { name: 'Voltar à lista' }); tab(/^Aprovar e publicar$/);
    let reg = await screen.findByRole('region', { name: 'Aprovar e publicar' });
    fireEvent.click(within(reg).getByRole('button', { name: 'Gerar pacote para o site estático' }));
    await waitFor(() => expect(calls('publish')).toHaveLength(1));
    expect(await screen.findByText('2 arquivos no pacote')).toBeTruthy();
    expect(screen.getByText('aviso do pacote')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Baixar index.html' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Instruções do pacote' }));
    expect(screen.getByText(/Como publicar/)).toBeTruthy();
    expect(within(reg).getByRole('button', { name: 'Já subi o pacote: confirmar no ar' })).toBeTruthy();
    unmount();
    D = detail({}, { status: 'aprovada', adapter: 'zica_hosted' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }));
    await screen.findByRole('button', { name: 'Voltar à lista' }); tab(/^Aprovar e publicar$/);
    reg = await screen.findByRole('region', { name: 'Aprovar e publicar' });
    expect(reg.textContent).toMatch(/ainda não foi construído/);
    expect(within(reg).queryByRole('button', { name: 'Publicar' })).toBeNull();
  });
});

describe('Estúdio: idioma, 400 px e erros', () => {
  it('idioma da tela troca rótulos; chave ausente em en/es cai no pt-BR (nunca aparece a chave); dicionários só têm chaves que existem', async () => {
    mount();
    await screen.findByText('Advogado criminalista em Guarulhos');
    fireEvent.change(screen.getByLabelText('Idioma da tela'), { target: { value: 'en' } });
    expect(await screen.findByRole('heading', { name: /Pages that search engines, AIs and people understand/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'New page' })).toBeTruthy();
    expect(screen.getByText('Page Studio')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Screen language'), { target: { value: 'es' } });
    expect(await screen.findByRole('tab', { name: 'Nueva página' })).toBeTruthy();
    for (const k of Object.keys(EN)) expect(Object.keys(PT), `en: ${k}`).toContain(k);
    for (const k of Object.keys(ES)) expect(Object.keys(PT), `es: ${k}`).toContain(k);
    expect(screen.queryByText(/^(tab|ed|brief|pub|q|ai|ln|im|new|list|cap|gaps|honest)\.[a-z]/)).toBeNull();
  });
  it('400 px: sem largura fixa maior que a tela fora de contêiner com rolagem; tabelas e iframe dentro de overflow-x-auto; textos longos quebram', async () => {
    await openPage();
    const root = screen.getByRole('heading', { level: 1 }).closest('div')!;
    expect(root.className).toMatch(/w-full/); expect(root.className).toMatch(/px-4/);
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[style]'))) {
      const w = el.style.width; const min = el.style.minWidth;
      if (w && /px$/.test(w) && parseInt(w, 10) > 400) throw new Error(`largura fixa ${w}`);
      if (min && parseInt(min, 10) > 380) expect(el.parentElement!.className, 'contêiner do elemento largo').toMatch(/overflow-x-auto/);
    }
    for (const t of Array.from(root.querySelectorAll('table'))) expect(t.parentElement!.className).toMatch(/overflow-x-auto/);
    expect(root.innerHTML).not.toMatch(/min-w-\[(?:[4-9]\d\d|\d{4})px\]/);
  });
  it('erro do servidor vira mensagem em português; erros conhecidos têm texto próprio; "tentar de novo" volta a chamar', async () => {
    api.call.mockReset();
    api.call.mockImplementation(async (m: string) => { if (m === 'eventos') return { events: [] }; throw Object.assign(new Error('x'), { code: 'global_paid_services_blocked', detail: {} }); });
    mount();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/Serviços pagos estão bloqueados globalmente/);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(api.call.mock.calls.filter((c) => c[1] === 'list').length).toBeGreaterThan(1));
    expect(studioErrorMessage(new EngineError('batch_limit', null))).toMatch(/Limite de páginas novas por lote/);
    expect(studioErrorMessage(new EngineError('approval_blocked', { reasons: ['Falta X.', 'Falta Y.'] }))).toMatch(/ainda não pode ser aprovada\. Falta X\. Falta Y\./);
    expect(studioErrorMessage(new Error('qualquer'))).toBe('Não foi possível concluir agora. Tente de novo.');
  });
});
