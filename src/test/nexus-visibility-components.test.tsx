import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { CompetitorsView } from '@/components/nexus-visibility/CompetitorsTab';
import { EnginesView } from '@/components/nexus-visibility/EnginesTab';
import { MethodologyView } from '@/components/nexus-visibility/MethodologyTab';
import { OpportunitiesView } from '@/components/nexus-visibility/OpportunitiesTab';
import { OverviewView } from '@/components/nexus-visibility/OverviewTab';
import { QuestionsView, type QuestionsViewProps } from '@/components/nexus-visibility/QuestionsTab';
import { SourcesView } from '@/components/nexus-visibility/SourcesTab';
import {
  normalizeCompetitors, normalizeHistory, normalizeMethodology, normalizeOpportunities, normalizeOverview, normalizeQuestions, normalizeSources,
} from '@/lib/nexus-visibility';

beforeAll(() => {
  class RO { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
});
afterEach(() => { cleanup(); });

const wrap = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const noop = () => undefined;

const OVERVIEW = normalizeOverview({
  method: { version: 'zvi-1', label: 'Zica Visibility Index' }, period: { from: '2026-10-16', to: '2026-11-13' }, n_observations: 20,
  zvi: { value: 41.6, low: 30, high: 55, partial: true, missing: ['pm', 'rep'], confidence: 'alta' },
  indicators: { vr: { value: 0.35, low: 0.18, high: 0.57, n: 20 }, cr: { value: 0.2, n: 20 }, sov: { value: 0.4, n: 20 }, est: { value: 0.8, n: 6 }, pm: null, rep: null },
  previous: { zvi: 38, vr: 0.3, cr: 0.1 },
  by_engine: [{ engine: 'chatgpt', label: 'ChatGPT', vr: 0.3, cr: 0.1, n: 15 }, { engine: 'gemini', label: 'Gemini', vr: 0.5, cr: 0.2, n: 5 }],
  trend: [{ day: '2026-11-01', vr: 0.2, cr: 0.1, n: 4 }, { day: '2026-11-02', vr: 0.5, cr: 0, n: 2 }, { day: '2026-11-03', vr: 0.25, cr: 0.25, n: 4 }],
  changes: [{ kind: 'up', text: 'A visibilidade subiu no ChatGPT.' }],
  result: { ga4: { sessions: 100, ai_sessions: 7, key_events: 3 }, gsc: { clicks: 12, impressions: 340 } },
  generated_at: '2026-11-13T12:00:00Z',
});
const EMPTY = normalizeOverview({ n_observations: 0, zvi: { value: null, partial: true, missing: ['pm', 'rep'], confidence: 'sem_dados' }, indicators: { vr: { value: null, n: 0 } } });

describe('Painel', () => {
  const base = { loading: false, error: null, onRetry: noop };

  it('mostra os 3 números grandes, o selo parcial, a baixa confiança (n=20), variação, amostra e intervalo', () => {
    wrap(<OverviewView {...base} data={OVERVIEW} canManage={false} onRequest={noop} />);
    expect(screen.getByTestId('zvi-value')).toHaveTextContent('42');
    expect(screen.getByTestId('vr-value')).toHaveTextContent('35%');
    expect(screen.getByTestId('ai-value')).toHaveTextContent('7');
    const zvi = screen.getByTestId('tile-zvi');
    expect(within(zvi).getByText('Parcial')).toBeInTheDocument();
    // servidor disse "alta", mas n=20 < 30: a tela nunca é mais otimista
    expect(within(zvi).getByTestId('confidence-badge')).toHaveTextContent('Baixa confiança');
    expect(within(zvi).getByTestId('delta-label')).toHaveTextContent('+3,6 pts');
    expect(within(zvi).getByTestId('sample-line')).toHaveTextContent('20 observações');
    expect(within(zvi).getByTestId('sample-line')).toHaveTextContent('entre 30 e 55');
    expect(screen.getByTestId('zvi-partial-note')).toHaveTextContent('Posição de menção e Reputação');
    const vr = screen.getByTestId('tile-vr');
    expect(within(vr).getByTestId('delta-label')).toHaveTextContent('+5 p.p.');
    expect(within(vr).getByTestId('sample-line')).toHaveTextContent('entre 18% e 57%');
  });

  it('PM e REP aparecem como n/d, com o motivo, e nunca como número', () => {
    wrap(<OverviewView {...base} data={OVERVIEW} canManage={false} onRequest={noop} />);
    expect(screen.getByTestId('ind-pm-value')).toHaveTextContent('n/d');
    expect(screen.getByTestId('ind-rep-value')).toHaveTextContent('n/d');
    expect(within(screen.getByTestId('ind-pm')).getByText(/leitura automática/)).toBeInTheDocument();
  });

  it('mostra o que mudou e a faixa Visibilidade → Resultado com GSC e GA4, sem afirmar causalidade', () => {
    wrap(<OverviewView {...base} data={OVERVIEW} canManage={false} onRequest={noop} />);
    expect(screen.getByText('A visibilidade subiu no ChatGPT.')).toBeInTheDocument();
    expect(screen.getByTestId('result-gsc')).toHaveTextContent('12');
    expect(screen.getByTestId('result-ga4')).toHaveTextContent('100');
    expect(screen.getByText(/não provam que um causou o outro/i)).toBeInTheDocument();
    expect(screen.queryByText(/Solicitar ao gestor/)).toBeNull();
  });

  it('sem GA4/GSC: n/d honesto; cliente solicita, gestor abre as conexões', () => {
    const noResult = normalizeOverview({ ...{ n_observations: 20, zvi: { value: 40, partial: true, missing: [], confidence: 'baixa' }, indicators: { vr: { value: 0.3, low: 0.1, high: 0.5, n: 20 } } }, result: { ga4: null, gsc: null } });
    const onRequest = vi.fn();
    const { unmount } = wrap(<OverviewView {...base} data={noResult} canManage={false} onRequest={onRequest} />);
    expect(screen.getByTestId('ai-value')).toHaveTextContent('n/d');
    expect(screen.getByTestId('result-gsc')).toHaveTextContent('n/d');
    expect(screen.getAllByTestId('delta-none').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /Solicitar ao gestor/ })[0]);
    expect(onRequest).toHaveBeenCalledWith('connect_source', expect.stringContaining('Google Analytics'));
    unmount();
    wrap(<OverviewView {...base} data={noResult} canManage onRequest={onRequest} />);
    expect(screen.queryByRole('button', { name: /Solicitar ao gestor/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: /Conectar o Analytics|Abrir conexões/ }).length).toBeGreaterThan(0);
  });

  it('estado vazio orienta: cliente pede a coleta; gestor vai ao Observatório', () => {
    const onRequest = vi.fn();
    const { unmount } = wrap(<OverviewView {...base} data={EMPTY} canManage={false} onRequest={onRequest} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Ainda sem observações');
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Peça ao gestor');
    expect(screen.queryByTestId('zvi-value')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Pedir uma coleta ao gestor/ }));
    expect(onRequest).toHaveBeenCalledWith('new_observation_round', expect.any(String));
    unmount();
    wrap(<OverviewView {...base} data={EMPTY} canManage onRequest={onRequest} />);
    expect(screen.getByRole('link', { name: /Abrir o Observatório/ })).toHaveAttribute('href', '/nexus/observatorio');
  });

  it('carregando mostra esqueleto; erro mostra "Tentar de novo"', () => {
    const { unmount } = wrap(<OverviewView data={undefined} loading error={null} onRetry={noop} canManage={false} onRequest={noop} />);
    expect(screen.getByLabelText(/Carregando o painel/)).toHaveAttribute('aria-busy', 'true');
    unmount();
    const onRetry = vi.fn();
    wrap(<OverviewView data={undefined} loading={false} error={new Error('500')} onRetry={onRetry} canManage={false} onRequest={noop} />);
    expect(screen.getByRole('alert')).toHaveTextContent('servidor não respondeu');
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('variação com período anterior de amostra pequena é marcada como pouco confiável, mesmo com o atual grande', () => {
    const o = normalizeOverview({ n_observations: 120, zvi: { value: 50, low: 40, high: 60, partial: true, missing: [], confidence: 'alta' }, indicators: { vr: { value: 0.5, low: 0.4, high: 0.6, n: 120 } }, previous: { zvi: 40, vr: 0.3, cr: 0.1, n: 5 } });
    wrap(<OverviewView loading={false} error={null} onRetry={noop} data={o} canManage={false} onRequest={noop} />);
    expect(within(screen.getByTestId('tile-vr')).getByText('variação pouco confiável')).toBeInTheDocument();
    const o2 = normalizeOverview({ n_observations: 120, zvi: { value: 50, low: 40, high: 60, partial: true, missing: [], confidence: 'alta' }, indicators: { vr: { value: 0.5, low: 0.4, high: 0.6, n: 120 } }, previous: { zvi: 40, vr: 0.3, cr: 0.1, n: 90 } });
    cleanup();
    wrap(<OverviewView loading={false} error={null} onRetry={noop} data={o2} canManage={false} onRequest={noop} />);
    expect(screen.queryByText('variação pouco confiável')).toBeNull();
  });

  it('sem comparação: diz que não há período anterior em vez de inventar variação', () => {
    const o = normalizeOverview({ n_observations: 40, zvi: { value: 50, low: 40, high: 60, partial: true, missing: [], confidence: 'alta' }, indicators: { vr: { value: 0.5, low: 0.4, high: 0.6, n: 40 } } });
    wrap(<OverviewView loading={false} error={null} onRetry={noop} data={o} canManage={false} onRequest={noop} />);
    expect(screen.getAllByTestId('delta-none').length).toBeGreaterThan(0);
    expect(within(screen.getByTestId('tile-zvi')).getByTestId('confidence-badge')).toHaveTextContent('Confiança alta');
  });
});

describe('IAs e buscadores', () => {
  it('um cartão por motor com VR, CR, amostra e baixa confiança; clicar filtra o motor', () => {
    const onSelect = vi.fn();
    wrap(<EnginesView data={OVERVIEW} loading={false} error={null} onRetry={noop} canManage={false} engine="" onSelectEngine={onSelect} onRequest={noop} />);
    expect(screen.getByTestId('engine-chatgpt-vr')).toHaveTextContent('30%');
    expect(screen.getByTestId('engine-gemini-cr')).toHaveTextContent('20%');
    expect(screen.getAllByTestId('confidence-badge')[0]).toHaveTextContent('Baixa confiança');
    fireEvent.click(screen.getByTestId('engine-gemini'));
    expect(onSelect).toHaveBeenCalledWith('gemini');
  });
  it('estado vazio útil', () => {
    wrap(<EnginesView data={EMPTY} loading={false} error={null} onRetry={noop} canManage={false} engine="" onSelectEngine={noop} onRequest={noop} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Ainda sem observações por IA');
  });
});

describe('Concorrentes', () => {
  const data = normalizeCompetitors({
    tracked: [{ id: 'c1', name: 'Alfa Advogados', domains: ['alfa.adv.br'], kind: 'escritorio', vr: 0.2, sov: 0.1, mentions: 4, n: 3, insufficient_sample: true }],
    suggested: [{ name: 'Beta Advocacia', domain: 'beta.adv.br', mentions: 6, engines: ['chatgpt'], reason: 'Citado em 6 respostas' }],
    own: { vr: 0.35, sov: 0.5, n: 20 },
    ranking: [
      { rank: 1, name: 'Sua Marca', is_own: true, vr: 0.35, sov: 0.5, n: 20, insufficient_sample: false },
      { rank: null, name: 'Alfa Advogados', is_own: false, vr: 0.2, sov: 0.1, n: 3, insufficient_sample: true },
    ],
  });
  const common = { data, loading: false, error: null, onRetry: noop };

  it('ranking destaca a marca e marca "amostra insuficiente" sem posição', () => {
    wrap(<CompetitorsView {...common} canManage={false} onSave={vi.fn()} onRemove={vi.fn()} onRequest={noop} />);
    const own = screen.getByTestId('ranking-own');
    expect(own).toHaveTextContent('Sua marca');
    expect(own).toHaveTextContent('35%');
    const row = screen.getByTestId('ranking-row');
    expect(within(row).getByText('Amostra insuficiente')).toBeInTheDocument();
    expect(within(row).getByLabelText('Sem posição')).toBeInTheDocument();
  });

  it('só um com amostra? Ranking de ninguém: avisa que faltam observações', () => {
    const insuff = normalizeCompetitors({ ranking: [{ rank: null, name: 'Sua Marca', is_own: true, vr: 0.1, n: 3, insufficient_sample: true }] });
    wrap(<CompetitorsView data={insuff} loading={false} error={null} onRetry={noop} canManage={false} onSave={vi.fn()} onRemove={vi.fn()} onRequest={noop} />);
    expect(screen.getByTestId('ranking-insufficient')).toHaveTextContent('pelo menos 8 observações');
  });

  it('CLIENTE: só leitura. Sem formulário, sem remover, sem aprovar; "Solicitar" abre o pedido', () => {
    const onRequest = vi.fn(); const onSave = vi.fn(); const onRemove = vi.fn();
    wrap(<CompetitorsView {...common} canManage={false} onSave={onSave} onRemove={onRemove} onRequest={onRequest} />);
    expect(screen.queryByRole('form', { name: /Acompanhar um concorrente/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remover/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar' }));
    expect(onRequest).toHaveBeenCalledWith('other', expect.stringContaining('Beta Advocacia'));
    expect(onSave).not.toHaveBeenCalled(); expect(onRemove).not.toHaveBeenCalled();
  });

  it('GESTOR: aprova a sugestão, ignora, cadastra com validação e remove com confirmação', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined); const onRemove = vi.fn().mockResolvedValue(undefined);
    wrap(<CompetitorsView {...common} canManage onSave={onSave} onRemove={onRemove} onRequest={noop} />);

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'Beta Advocacia', domains: ['beta.adv.br'], kind: 'escritorio', status: 'tracked' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }));
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Beta Advocacia', status: 'ignored' })));

    // validação do formulário: nome curto e domínio inválido não chegam ao servidor
    onSave.mockClear();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/Endereços do site/), { target: { value: 'sem ponto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Acompanhar' }));
    expect(await screen.findByText(/mínimo 2 letras/)).toBeInTheDocument();
    expect(screen.getByText(/Não entendi/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Gama Advogados' } });
    fireEvent.change(screen.getByLabelText(/Endereços do site/), { target: { value: 'https://www.GAMA.com.br/x, gama.adv.br' } });
    fireEvent.click(screen.getByRole('button', { name: 'Acompanhar' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'Gama Advogados', domains: ['gama.com.br', 'gama.adv.br'], kind: 'escritorio', status: 'tracked' }));

    fireEvent.click(screen.getByRole('button', { name: 'Remover Alfa Advogados' }));
    expect(onRemove).not.toHaveBeenCalled(); // pede confirmação antes
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('c1'));
  });

  it('erro do servidor no cadastro aparece em linguagem simples (409)', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('409'));
    wrap(<CompetitorsView {...common} canManage onSave={onSave} onRemove={vi.fn()} onRequest={noop} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Alfa Advogados' } });
    fireEvent.click(screen.getByRole('button', { name: 'Acompanhar' }));
    expect(await screen.findByText(/Já existe um concorrente/)).toBeInTheDocument();
  });

  it('sem nenhum dado: estado vazio que orienta cada papel', () => {
    const none = normalizeCompetitors(undefined);
    const { unmount } = wrap(<CompetitorsView data={none} loading={false} error={null} onRetry={noop} canManage={false} onSave={vi.fn()} onRemove={vi.fn()} onRequest={noop} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Ainda sem dados de concorrentes');
    unmount();
    wrap(<CompetitorsView data={none} loading={false} error={null} onRetry={noop} canManage onSave={vi.fn()} onRemove={vi.fn()} onRequest={noop} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Cadastre os concorrentes');
  });
});

describe('Fontes', () => {
  const data = normalizeSources({
    sources: [
      { host: 'g1.globo.com', type: 'midia', zss: 71.4, coverage: 0.5, position: 0.6, diversity: 0.66, recency: 0.9, relevance: 0.3, citations: 9, queries: 5, engines: ['chatgpt', 'gemini'], last_seen: '2026-11-12T10:00:00Z' },
      { host: 'rdm.adv.br', type: 'escritorio', zss: 33, citations: 2, queries: 2, engines: ['gemini'], is_own: true },
    ],
    targets: [{ host: 'jusbrasil.com.br', type: 'portal_agregador', zss: 80, why: 'Citada em 8 respostas e a marca não aparece' }],
  });

  it('tabela ordenada por nota, tipo, nº de IAs, seu site e alvos de presença', () => {
    wrap(<SourcesView data={data} loading={false} error={null} onRetry={noop} canManage={false} type="" onTypeChange={noop} onRequest={noop} />);
    const rows = screen.getAllByTestId('source-row');
    expect(rows[0]).toHaveTextContent('g1.globo.com');
    expect(rows[0]).toHaveTextContent('Mídia');
    expect(rows[0]).toHaveTextContent('2 IAs');
    expect(within(rows[0]).getByTestId('zss-value')).toHaveTextContent('71');
    expect(rows[1]).toHaveTextContent('Seu site');
    expect(rows[1]).toHaveTextContent('1 IA');
    expect(screen.getByTestId('target')).toHaveTextContent('jusbrasil.com.br');
  });

  it('abrir uma fonte mostra como a nota é formada (5 componentes com pesos)', async () => {
    wrap(<SourcesView data={data} loading={false} error={null} onRetry={noop} canManage={false} type="" onTypeChange={noop} onRequest={noop} />);
    fireEvent.click(screen.getAllByTestId('source-row')[0]);
    const list = await screen.findByRole('list', { name: 'Como a nota é formada' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(list).toHaveTextContent('Cobertura');
    expect(list).toHaveTextContent('peso 40%');
    expect(list).toHaveTextContent('50%');
  });

  it('vazio e erro', () => {
    const { unmount } = wrap(<SourcesView data={normalizeSources(null)} loading={false} error={null} onRetry={noop} canManage={false} type="" onTypeChange={noop} onRequest={noop} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Ainda sem fontes citadas');
    unmount();
    const onRetry = vi.fn();
    wrap(<SourcesView data={undefined} loading={false} error={new Error('429')} onRetry={onRetry} canManage={false} type="" onTypeChange={noop} onRequest={noop} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Muitas consultas');
  });
});

describe('Perguntas', () => {
  const questions = normalizeQuestions({
    total: 60,
    questions: [{ query: 'Como contestar uma multa de trânsito?', topic: 'transito', intent: 'informational', observations: 6, vr: 0.5, cr: 0.17, last_observed_at: '2026-11-12T10:00:00Z', engines: ['chatgpt', 'gemini'] }],
  });
  const history = normalizeHistory({ query: 'Como contestar uma multa de trânsito?', items: [
    { observed_at: '2026-11-12T10:00:00Z', engine: 'chatgpt', mentioned: true, cited: true, position: 2, brands: ['RDM Advogados'], sources: [{ host: 'rdm.adv.br', url: 'https://rdm.adv.br/multa' }, { host: 'ruim.com', url: 'javascript:alert(1)' }], response_excerpt: 'Você pode recorrer em 30 dias.\n<script>alert(1)</script>' },
    { observed_at: '2026-11-11T10:00:00Z', engine: 'gemini', mentioned: false, cited: false, response_excerpt: null },
  ] });
  const props = (over: Partial<QuestionsViewProps> = {}): QuestionsViewProps => ({
    data: questions, loading: false, error: null, onRetry: noop, canManage: false,
    keywords: [{ term: 'multa', prompts: 4, observations: 9, vr: 0.4 }],
    topic: '', topics: ['transito'], onTopic: noop, intent: '', intents: ['informational'], onIntent: noop,
    page: 0, onPage: noop, onOpen: noop, onCloseHistory: noop,
    history: { query: null, data: undefined, loading: false, error: null, onRetry: noop },
    onRequest: noop, ...over,
  });

  it('tabela com VR, CR, observações, paginação e termos mais frequentes', () => {
    const onPage = vi.fn(); const onOpen = vi.fn();
    wrap(<QuestionsView {...props({ onPage, onOpen })} />);
    const row = screen.getByTestId('question-row');
    expect(row).toHaveTextContent('Como contestar uma multa de trânsito?');
    expect(row).toHaveTextContent('50%');
    expect(row).toHaveTextContent('17%');
    expect(screen.getByTestId('questions-range')).toHaveTextContent('1–1 de 60');
    expect(screen.getByTestId('keyword')).toHaveTextContent('multa');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(onPage).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledWith('Como contestar uma multa de trânsito?');
  });

  it('painel lateral: histórico por dia com a resposta registrada, links só http(s) e texto nunca interpretado', async () => {
    wrap(<QuestionsView {...props({ history: { query: 'Como contestar uma multa de trânsito?', data: history, loading: false, error: null, onRetry: noop } })} />);
    const items = await screen.findAllByTestId('history-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('ChatGPT');
    expect(items[0]).toHaveTextContent('Mencionou a marca');
    expect(items[0]).toHaveTextContent('Citou o seu site');
    expect(items[0]).toHaveTextContent('Posição 2');
    expect(items[0]).toHaveTextContent('RDM Advogados');
    const resp = within(items[0]).getByTestId('history-response');
    expect(resp.textContent).toContain('Você pode recorrer em 30 dias.');
    expect(resp.textContent).toContain('<script>alert(1)</script>');
    expect(resp.querySelector('script')).toBeNull();
    const links = within(items[0]).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://rdm.adv.br/multa');
    expect(links[0]).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(items[0]).getByText('ruim.com')).toBeInTheDocument();
    expect(items[1]).toHaveTextContent('Não mencionou a marca');
    expect(items[1]).toHaveTextContent('não foi guardado');
  });

  it('vazio com filtro e sem filtro', () => {
    const none = normalizeQuestions({ total: 0, questions: [] });
    const { unmount } = wrap(<QuestionsView {...props({ data: none, keywords: [] })} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Ainda sem perguntas observadas');
    unmount();
    wrap(<QuestionsView {...props({ data: none, keywords: [], topic: 'transito' })} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Nenhuma pergunta com esses filtros');
  });
});

describe('Oportunidades', () => {
  const items = normalizeOpportunities({ items: [
    { kind: 'pergunta_sem_marca', title: 'Pergunta sem a marca', detail: 'A IA responde sem citar você.', priority: 'alta', evidence: { query: 'Como recorrer?', observations: 5 } },
    { kind: 'fonte_alvo', title: 'Ganhar presença no JusBrasil', priority: 'baixa', evidence: { host: 'jusbrasil.com.br', zss: 80 } },
  ] });
  it('lista priorizada com evidência; cliente solicita, gestor não vê o botão', () => {
    const onRequest = vi.fn();
    const { unmount } = wrap(<OpportunitiesView items={items} loading={false} error={null} onRetry={noop} canManage={false} onRequest={onRequest} />);
    const cards = screen.getAllByTestId('opportunity');
    expect(cards[0]).toHaveTextContent('Prioridade alta');
    expect(cards[0]).toHaveTextContent('Como recorrer?');
    expect(cards[1]).toHaveTextContent('Prioridade baixa');
    fireEvent.click(within(cards[0]).getByRole('button', { name: /Solicitar ao gestor/ }));
    expect(onRequest).toHaveBeenCalledWith('other', expect.stringContaining('Pergunta sem a marca'));
    unmount();
    wrap(<OpportunitiesView items={items} loading={false} error={null} onRetry={noop} canManage onRequest={onRequest} />);
    expect(screen.queryByRole('button', { name: /Solicitar ao gestor/ })).toBeNull();
  });
  it('vazio', () => {
    wrap(<OpportunitiesView items={[]} loading={false} error={null} onRetry={noop} canManage={false} onRequest={noop} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Nenhuma oportunidade por enquanto');
  });
});

describe('Como calculamos', () => {
  it('mostra versão, os 6 componentes com pesos, o que é n/d e por quê, e a redistribuição', () => {
    wrap(<MethodologyView method={normalizeMethodology(undefined)} loading={false} error={null} onRetry={noop} overview={OVERVIEW} />);
    expect(screen.getByText('Método zvi-1')).toBeInTheDocument();
    expect(within(screen.getByTestId('method-components')).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByTestId('method-vr')).toHaveTextContent('Peso 35%');
    expect(screen.getByTestId('method-vr')).toHaveTextContent('Medido');
    expect(screen.getByTestId('method-pm')).toHaveTextContent('n/d agora');
    expect(screen.getByTestId('method-rep')).toHaveTextContent('leitura automática');
    // pesos medidos 0,35+0,25+0,15+0,05 = 0,80 -> VR 35/80 = 44%
    expect(screen.getByTestId('method-partial')).toHaveTextContent('35% → 44%');
    expect(screen.getByText(/descrição padrão do método zvi-1/)).toBeInTheDocument();
  });
});
