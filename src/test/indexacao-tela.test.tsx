import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ call: vi.fn() }));
// o portão de verdade (callEngine) roda; só a função de borda é simulada: erro do servidor chega como o Supabase entrega (Response no contexto)
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
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'Acme Tools', organization_id: '00000000-0000-4000-8000-0000000000a1' }], isLoading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import Indexation from '@/pages/Indexation';
import { EngineError } from '@/lib/engine-api';
import { ProjectTimeline } from '@/components/project-events/ProjectTimeline';
import { PT, EN, ES } from '@/lib/i18n/indexation-dict';

const P = '00000000-0000-4000-8000-0000000000b1';
const bucket = (key: string, label: string, urls: number, over: Record<string, number> = {}) => ({ key, label, urls, indexed: 0, not_indexed: 0, sent: 0, unknown: urls, problems: 0, ...over });
const overview = (over: Record<string, unknown> = {}) => ({
  project: { id: P, name: 'Acme Tools', domain: 'acme-tools.com' }, can_edit: true, can_admin: true,
  totals: { urls: 120, indexed: 50, not_indexed: 30, unknown: 40, sent: 20, with_problems: 7, in_sitemap: 100, outside_sitemap: 3, never_checked: 60 }, last_synced_at: '2026-11-19T10:00:00.000Z', truncated: false,
  coverage: {
    by_host: [bucket('acme-tools.com', 'acme-tools.com', 100, { indexed: 50, not_indexed: 30, unknown: 20 }), bucket('blog.acme-tools.com', 'blog.acme-tools.com', 20)],
    by_section: [bucket('acme-tools.com|blog', 'acme-tools.com/blog', 60)], by_lang: [bucket('en', 'en', 80), bucket('es', 'es', 40)], by_node: [bucket('sem_area', 'Sem área da taxonomia', 120)],
  },
  engines: [
    { key: 'google', label: 'Google', support: 'implementado', how: 'Consulta de estado.' }, { key: 'indexnow', label: 'IndexNow (Bing, Yandex, Naver, Seznam, Yep)', support: 'implementado', how: 'Aviso global.' },
    { key: 'baidu', label: 'Baidu', support: 'sem_api_gratuita_verificada', how: 'Sem API pública gratuita verificada pelo Zica.' },
  ],
  problems: { soft404: { count: 2, text: 'soft-404' } }, submissions: [{ id: 's1', engine: 'indexnow', host: 'acme-tools.com', urls_count: 20, status: 'aceita', response: { http_status: 200 }, created_at: '2026-11-18T10:00:00.000Z' }, { id: 's2', engine: 'google', host: null, urls_count: 50, status: 'aceita', response: {}, created_at: '2026-11-18T11:00:00.000Z' }],
  hygiene: [
    { key: 'https_forcado', ok: false, severity: 'alta', label: 'HTTP redireciona', text: '2 endereços abrem por HTTP sem redirecionar.', fix: 'Force o redirecionamento 301 de http para https.', evidence: { exemplos: ['http://acme-tools.com/shop/ -> 200'] }, applicable: true, checked_at: '2026-11-19T10:00:00.000Z' },
    { key: 'robots_existe', ok: true, severity: 'info', label: 'robots', text: 'Todos têm robots.txt.', fix: null, evidence: {}, applicable: true, checked_at: '2026-11-19T10:00:00.000Z' },
  ],
  blockers: [{ key: 'sem_google', text: 'O Google (Search Console) não está conectado.', action: 'Conecte em NEXUS · Motores & APIs.' }],
  connections: { google: { connected: false, property: null }, bing: { connected: false }, indexnow: { hosts: [{ host: 'acme-tools.com', key_ready: false }, { host: 'blog.acme-tools.com', key_ready: true }] } },
  quota: { google: { used_24h: 12, limit: 2000, per_minute: 600, verified: false } },
  notices: ['O Google não permite pedir indexação de páginas comuns por API (a Indexing API é só para vagas e transmissões ao vivo). Aqui o Google é somente consulta.', 'IndexNow avisa Bing, Yandex, Seznam, Naver e outros; não avisa o Google.'], ...over,
});
const emptyOverview = () => overview({ totals: { urls: 0, indexed: 0, not_indexed: 0, unknown: 0, sent: 0, with_problems: 0, in_sitemap: 0, outside_sitemap: 0, never_checked: 0 }, coverage: { by_host: [], by_section: [], by_lang: [], by_node: [] }, hygiene: [], submissions: [], blockers: [{ key: 'sem_inventario', text: 'Ainda não há inventário de URLs.', action: 'Clique em "Atualizar inventário".' }], last_synced_at: null });
const row = (i: number, over: Record<string, unknown> = {}) => ({ id: `r${i}`, url: `https://acme-tools.com/produtos/item-${i}/com-um-endereco-bem-longo-para-testar-quebra-de-linha-no-celular/`, host: 'acme-tools.com', section: 'produtos', source: 'sitemap', in_sitemap: true, impressions: 1200, http_status: 200, google: 'desconhecido', google_detail: null, sent: [], problems: [], last_checked_at: null, ...over });
const plan = () => ({ queue: [{ url_id: 'r1', url: 'https://acme-tools.com/alta/', host: 'acme-tools.com', score: 80, reasons: ['90.000 impressões no Google', 'está no sitemap'], google: 'desconhecido' }], total_queue: 12, excluded: { indexed: 50, blocked: 7 }, batches: { google_inspect: { urls: 12, url_ids: ['r1'] }, indexnow: [{ host: 'acme-tools.com', urls: 10, sample: [] }], bing: [] }, blocking: { erro_http: { count: 3, text: 'O site respondeu com erro (4xx/5xx).' } } });

let ov: unknown;
beforeEach(() => {
  api.call.mockReset(); ov = overview();
  try { localStorage.removeItem('zica-locale'); } catch { /* ok */ }
  api.call.mockImplementation(async (module: string, action: string, body: Record<string, unknown>) => {
    if (module === 'eventos') return { events: [{ id: 'e1', module: 'indexacao', kind: 'indexacao.enviada', subject: {}, payload: { count: 20 }, created_at: '2026-11-18T10:00:00.000Z', text: 'URLs enviadas a buscador (20)' }] };
    if (module !== 'indexacao') throw new Error(`módulo inesperado ${module}`);
    if (action === 'overview') return ov;
    if (action === 'plan') return plan();
    if (action === 'list') return { total: 2, page: 0, page_size: 50, rows: [row(1, { problems: ['soft404', 'fora_do_sitemap'], google: 'nao_indexada', google_detail: 'Crawled - currently not indexed' }), row(2, { sent: ['indexnow'] })] };
    if (action === 'inventory_sync') return { urls_total: 120, new: 5, updated: 3, removed_from_sitemap: 1, in_sitemap: 100, outside_sitemap: 3, rejected_foreign: 4, rejected_invalid: 0, http_normalized: 0, hosts: ['acme-tools.com'], sitemap_files: [], truncated: false, remaining_files: 0, warnings: ['Um sitemap falhou.'] };
    if (action === 'check_urls') return { checked: 40, failed: 1, problems: { soft404: { count: 2, text: 'Responde 200, mas é soft-404.', sample: [] } }, remaining_unchecked: 20, soft404_probes: 2, soft404_probes_skipped: 0 };
    if (action === 'google_inspect') return { connected: false, checked: 0, message: 'O Google (Search Console) não está conectado neste projeto. Nada foi consultado. Conecte em NEXUS · Motores & APIs.' };
    if (action === 'submit_indexnow') return { sent: 0, hosts: [{ host: 'acme-tools.com', sent: 0, pending: 10, reason: 'sem_chave', message: 'Não há chave do IndexNow cadastrada para acme-tools.com.' }], skipped_unchanged: 2, skipped_problem: 1 };
    if (action === 'bing_submit') return { connected: false, sent: 0, message: 'O Bing Webmaster não está conectado com uma chave de API nesta organização. Nada foi enviado.' };
    if (action === 'hygiene') return { items: [], failing: 3, by_severity: { alta: 1, media: 2, baixa: 0 }, newly_failing: 1, hosts: ['acme-tools.com'] };
    if (action === 'indexnow_key_save') return body.generate ? { host: body.host, key: 'abcdef0123456789abcdef0123456789', file_name: 'abcdef0123456789abcdef0123456789.txt', file_content: 'abcdef0123456789abcdef0123456789', file_url: 'https://acme-tools.com/abcdef0123456789abcdef0123456789.txt', saved: false } : { host: body.host, saved: true };
    throw new Error(`ação inesperada ${action}`);
  });
});
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Indexation /></MemoryRouter></QueryClientProvider>);
const calls = (action: string) => api.call.mock.calls.filter((c) => c[0] === 'indexacao' && c[1] === action).map((c) => c[2]);
const tab = (name: RegExp) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });

describe('Indexação: tela', () => {
  it('chama o portão engine com module="indexacao" e mostra os avisos honestos do que o Google NÃO permite', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: /Quais páginas do seu site os buscadores já conhecem/ })).toBeTruthy();
    expect(api.call).toHaveBeenCalledWith('indexacao', 'overview', { projectId: P });
    const aside = screen.getByRole('complementary', { name: 'Avisos honestos' });
    expect(aside.textContent).toMatch(/não permite pedir indexação de páginas comuns/);
    expect(aside.textContent).toMatch(/IndexNow avisa Bing, Yandex/);
    expect(aside.textContent).toMatch(/não avisa o Google/);
  });
  it('cobertura: números por extenso, barras com texto acessível (não só cor) e agrupamento por site, seção, idioma e área', async () => {
    mount();
    const reg = await screen.findByRole('region', { name: 'Cobertura' });
    expect(reg.textContent).toMatch(/URLs no inventário.*120/);
    expect(reg.textContent).toMatch(/Indexadas \(Google\)50/);
    expect(reg.textContent).toMatch(/Não indexadas \(Google\)30/);
    expect(reg.textContent).toMatch(/Estado desconhecido40/);
    expect(within(reg).getByRole('img', { name: 'acme-tools.com: 50 indexadas, 30 não indexadas, 20 desconhecidas' })).toBeTruthy();
    expect(reg.textContent).toMatch(/50 indexadas · 30 não indexadas · 20 desconhecidas/);
    expect(reg.textContent).toMatch(/nada é presumido/);
    fireEvent.click(within(reg).getByRole('tab', { name: 'Por idioma' }));
    expect(reg.textContent).toMatch(/en80 URLs/);
    fireEvent.click(within(reg).getByRole('tab', { name: 'Por área da taxonomia' }));
    expect(reg.textContent).toMatch(/Sem área da taxonomia/);
  });
  it('sem dados: inventário vazio diz "sem dados" e orienta; botões que dependem do inventário ficam desligados', async () => {
    ov = emptyOverview();
    mount();
    expect((await screen.findByRole('region', { name: 'Cobertura' })).textContent).toMatch(/Sem dados: o inventário ainda está vazio/);
    expect(screen.getByText(/Ainda não há inventário de URLs/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Atualizar inventário' }) as HTMLButtonElement).disabled).toBe(false);
    for (const n of ['Verificar fatia', 'Consultar Google (somente leitura)', 'Enviar ao IndexNow', 'Enviar ao Bing']) expect((screen.getByRole('button', { name: n }) as HTMLButtonElement).disabled, n).toBe(true);
  });
  it('botões chamam as ações certas e mostram o resultado em português (Atualizar inventário, Verificar fatia, Consultar Google, IndexNow, Bing, higiene)', async () => {
    mount();
    await screen.findByRole('region', { name: 'Ações' });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar inventário' }));
    await waitFor(() => expect(calls('inventory_sync')).toHaveLength(1));
    const note = await screen.findByRole('status');
    expect(note.textContent).toMatch(/Inventário atualizado: 120 URL\(s\), 5 nova\(s\), 1 saíram do sitemap, 3 fora do sitemap/);
    expect(note.textContent).toMatch(/4 de outros sites foram ignoradas/);
    expect(note.textContent).toMatch(/Atenção: Um sitemap falhou/);
    fireEvent.click(screen.getByRole('button', { name: 'Verificar fatia' }));
    await waitFor(() => expect(calls('check_urls')).toEqual([{ projectId: P, limit: 40 }]));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/40 URL\(s\) verificada\(s\) no site\. 1 sem resposta\..*Responde 200, mas é soft-404.*Faltam 20 nunca verificadas/));
    fireEvent.click(screen.getByRole('button', { name: 'Consultar Google (somente leitura)' }));
    await waitFor(() => expect(calls('google_inspect')).toEqual([{ projectId: P, limit: 50, languageCode: 'pt-BR' }]));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Google \(Search Console\) não está conectado.*Nada foi consultado/));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao IndexNow' }));
    await waitFor(() => expect(calls('submit_indexnow')).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/0 URL\(s\) enviada\(s\) ao IndexNow.*2 já enviadas e sem mudança ficaram de fora.*Não há chave do IndexNow/));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao Bing' }));
    await waitFor(() => expect(calls('bing_submit')).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Bing Webmaster não está conectado/));
    fireEvent.click(screen.getByRole('button', { name: 'Verificar higiene' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/3 ponto\(s\) a corrigir \(1 de severidade alta\)/));
  });
  it('erro do servidor aparece traduzido; papel de leitura vê tudo mas os botões ficam desligados com o aviso', async () => {
    api.call.mockImplementationOnce(async () => { throw new EngineError('role_not_allowed'); });
    mount();
    expect((await screen.findByRole('alert')).textContent).toMatch(/permite ver, mas não alterar/);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('region', { name: 'Ações' })).toBeTruthy();
  });
  it('leitor: botões desligados e aviso; a chave do IndexNow não pode ser cadastrada', async () => {
    ov = overview({ can_edit: false, can_admin: false });
    mount();
    await screen.findByRole('region', { name: 'Ações' });
    expect((screen.getByRole('button', { name: 'Atualizar inventário' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Seu papel permite ver, mas não alterar.').length).toBeGreaterThan(0);
    tab(/Envios e chave/);
    expect(await screen.findByText('Só administradores e donos cadastram a chave.')).toBeTruthy();
  });
  it('fila "o que indexar primeiro": motivos, lotes por motor e o que está bloqueando', async () => {
    mount();
    await screen.findByRole('region', { name: 'Ações' });
    tab(/O que indexar primeiro/);
    const reg = await screen.findByRole('region', { name: 'O que indexar primeiro' });
    await waitFor(() => expect(reg.textContent).toMatch(/90\.000 impressões no Google/));
    expect(reg.textContent).toMatch(/12 na fila; 50 já indexadas e 7 com problema ficaram de fora/);
    expect(reg.textContent).toMatch(/12 URL\(s\) neste lote \(somente leitura\)/);
    expect(reg.textContent).toMatch(/acme-tools\.com: 10 URL\(s\)/);
    expect(reg.textContent).toMatch(/3: O site respondeu com erro/);
  });
  it('inventário filtrável: cartões (sem tabela), endereço longo quebra linha, problemas e estado do Google por extenso; filtro chama a lista com o filtro', async () => {
    const { container } = mount();
    await screen.findByRole('region', { name: 'Ações' });
    tab(/Inventário/);
    const reg = await screen.findByRole('region', { name: 'Inventário de URLs' });
    await waitFor(() => expect(reg.textContent).toMatch(/2 URL\(s\); página 1 de 1/));
    expect(container.querySelector('table')).toBeNull();
    expect(reg.textContent).toMatch(/Google: Não indexada \(Crawled - currently not indexed\)/);
    expect(reg.textContent).toMatch(/enviada: IndexNow/);
    expect(within(reg).getAllByText('soft-404').length).toBeGreaterThan(0);
    expect(within(reg).getAllByText('fora do sitemap').length).toBeGreaterThan(0);
    for (const a of container.querySelectorAll('a[href^="https://acme-tools.com/produtos"]')) expect(a.className).toMatch(/break-all/);
    fireEvent.change(within(reg).getByLabelText('Estado no Google'), { target: { value: 'nao_indexada' } });
    await waitFor(() => expect(calls('list').some((b) => (b as { state?: string }).state === 'nao_indexada')).toBe(true));
    fireEvent.change(within(reg).getByLabelText('Problema'), { target: { value: 'soft404' } });
    await waitFor(() => expect(calls('list').some((b) => (b as { problem?: string }).problem === 'soft404')).toBe(true));
  });
  it('higiene: o que falhou aparece com severidade, evidência e "Como corrigir"', async () => {
    mount();
    await screen.findByRole('region', { name: 'Ações' });
    tab(/Higiene/);
    const reg = await screen.findByRole('region', { name: 'Higiene de indexação' });
    expect(reg.textContent).toMatch(/1 ponto\(s\) a corrigir de 2 verificados/);
    expect(reg.textContent).toMatch(/Corrigir \(Alta\): HTTP redireciona para HTTPS em todas as seções/);
    expect(reg.textContent).toMatch(/Como corrigir:.*Force o redirecionamento 301/);
    expect(reg.textContent).toMatch(/Exemplos:.*http:\/\/acme-tools\.com\/shop\//);
    expect(reg.textContent).toMatch(/Em ordem: robots\.txt existe em cada site/);
  });
  it('envios e chave: conexões por extenso, cota do Google marcada como não confirmada, histórico (Google é "consulta"), gerar e cadastrar a chave', async () => {
    mount();
    await screen.findByRole('region', { name: 'Ações' });
    tab(/Envios e chave/);
    const conn = await screen.findByRole('region', { name: 'Conexões' });
    expect(conn.textContent).toMatch(/Google \(Search Console\): sem conexão/);
    expect(conn.textContent).toMatch(/Bing Webmaster \(chave de API\): sem conexão/);
    expect(conn.textContent).toMatch(/12 de 2\.000 por site.*não confirmada por chamada real/);
    const hist = screen.getByRole('region', { name: 'Histórico de envios e consultas' });
    expect(hist.textContent).toMatch(/IndexNow · acme-tools\.com.*20 URL\(s\) aceita\(s\)/);
    expect(hist.textContent).toMatch(/Google \(consulta\).*50 consulta\(s\) ao Search Console/);
    const key = screen.getByRole('region', { name: 'Chave do IndexNow' });
    expect(key.textContent).toMatch(/acme-tools\.com: sem chave/);
    expect(key.textContent).toMatch(/blog\.acme-tools\.com: chave cadastrada/);
    fireEvent.click(within(key).getByRole('button', { name: 'Gerar chave' }));
    await waitFor(() => expect(calls('indexnow_key_save')).toEqual([{ projectId: P, host: 'acme-tools.com', generate: true }]));
    expect((await within(key).findByRole('status')).textContent).toMatch(/Chave sugerida para acme-tools\.com: abcdef0123456789abcdef0123456789.*Crie o arquivo abcdef0123456789abcdef0123456789\.txt/);
    fireEvent.change(within(key).getByLabelText(/Chave \(8 a 128/), { target: { value: 'abcdef0123456789abcdef0123456789' } });
    fireEvent.click(within(key).getByRole('button', { name: 'Cadastrar chave' }));
    await waitFor(() => expect(calls('indexnow_key_save')[1]).toEqual({ projectId: P, host: 'acme-tools.com', key: 'abcdef0123456789abcdef0123456789' }));
  });
  it('buscadores: o catálogo marca Baidu como "sem API pública gratuita verificada" em vez de fingir suporte', async () => {
    mount();
    await screen.findByRole('region', { name: 'Ações' });
    tab(/Buscadores/);
    const reg = await screen.findByRole('region', { name: /Mecanismos de busca/ });
    expect(reg.textContent).toMatch(/BaiduSem API pública gratuita verificada/);
    expect(reg.textContent).toMatch(/IndexNow \(Bing, Yandex, Naver, Seznam, Yep\)Implementado/);
  });
  it('linha do tempo do projeto: cartão reutilizável lê o módulo "eventos" do portão', async () => {
    mount();
    await screen.findByRole('region', { name: 'Ações' });
    tab(/Linha do tempo/);
    const reg = await screen.findByRole('region', { name: 'Linha do tempo do projeto' });
    await waitFor(() => expect(reg.textContent).toMatch(/URLs enviadas a buscador \(20\)/));
    expect(api.call).toHaveBeenCalledWith('eventos', 'list', { projectId: P, eventModule: undefined, limit: 30 });
  });
  it('cartão da linha do tempo sozinho (sem a tela): pt-BR por padrão e "sem dados" quando vazio', async () => {
    api.call.mockImplementation(async () => ({ events: [] }));
    render(<QueryClientProvider client={new QueryClient()}><ProjectTimeline projectId={P} /></QueryClientProvider>);
    expect(await screen.findByText(/Sem dados: nenhum fato foi registrado/)).toBeTruthy();
  });
  it('mobile (400 px): nada que force rolagem horizontal da página (sem tabela, endereços quebram linha, colunas empilham e o contêiner tem largura máxima)', async () => {
    const { container } = mount();
    await screen.findByRole('region', { name: 'Ações' });
    expect(container.querySelector('table')).toBeNull();
    expect(container.innerHTML).not.toMatch(/min-w-\[|[ "]w-\[\d{3,}px\]/);
    expect(container.firstElementChild!.className).toMatch(/max-w-7xl/);
    expect(container.firstElementChild!.className).toMatch(/px-4/);
    for (const g of container.querySelectorAll('dl')) expect(g.className).toMatch(/grid-cols-2/);
  });
});

describe('Indexação: idiomas da tela (pt-BR primeiro, en e es prontos)', () => {
  it('pt-BR é o padrão (não adivinha pelo navegador); trocar para English e Español traduz a tela, lembra a escolha e a consulta ao Google leva o idioma', async () => {
    mount();
    await screen.findByRole('heading', { name: /Quais páginas do seu site/ });
    fireEvent.change(screen.getByLabelText('Idioma da tela'), { target: { value: 'en' } });
    expect(await screen.findByRole('heading', { name: /Which pages of your site do search engines already know/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update inventory' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Coverage' }).textContent).toMatch(/URLs in inventory/);
    expect(screen.getByRole('complementary', { name: 'Honest notes' }).textContent).toMatch(/does not notify Google/);
    expect(localStorage.getItem('zica-locale')).toBe('en');
    fireEvent.click(screen.getByRole('button', { name: 'Look up Google (read-only)' }));
    await waitFor(() => expect(calls('google_inspect')).toEqual([{ projectId: P, limit: 50, languageCode: 'en' }]));
    fireEvent.change(screen.getByLabelText('Screen language'), { target: { value: 'es' } });
    expect(await screen.findByRole('heading', { name: /¿Qué páginas de su sitio ya conocen los buscadores/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Actualizar inventario' })).toBeTruthy();
  });
  it('a escolha lembrada vale na próxima abertura', async () => {
    localStorage.setItem('zica-locale', 'es');
    mount();
    expect(await screen.findByRole('heading', { name: /¿Qué páginas de su sitio/ })).toBeTruthy();
  });
  it('en e es têm as mesmas chaves do pt-BR (sem chave sobrando); o que falta cai no pt-BR e nunca aparece a chave crua', () => {
    for (const [name, d] of [['en', EN], ['es', ES]] as const) {
      const extra = Object.keys(d).filter((k) => !(k in PT));
      expect(extra, `${name} com chave que não existe no pt-BR`).toEqual([]);
      const missing = Object.keys(PT).filter((k) => !(k in d));
      expect(missing, `${name} sem tradução`).toEqual([]);
    }
  });
});
