import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';

const api = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() }, from: vi.fn() } }));
vi.mock('@/lib/auto-optimize-api', async (orig) => ({ ...(await orig<typeof import('@/lib/auto-optimize-api')>()), callAutoOptimize: api.call }));

import { AutoPilotPanel } from '@/components/articles/editor/AutoPilotPanel';
import { AISEOAnalysisPanel } from '@/components/articles/editor/AISEOAnalysisPanel';
import { useAutoPilot } from '@/hooks/useAutoPilot';
import { AutoOptimizeError, autoOptimizeMessage } from '@/lib/auto-optimize-api';
import { calculateReadability } from '@/lib/maa-utils';

const ART = '00000000-0000-4000-8000-0000000000d1';
const PROJ = '00000000-0000-4000-8000-0000000000b1';
const usd = (v: number) => Math.round(v * 1_000_000);

const rules = [
  { id: 'flesch', label: 'Legibilidade (fórmula do idioma do artigo)', level: 'exigir', value: 60, max: 70, source: 'padrao_editavel' },
  { id: 'internal_links', label: 'Links internos', level: 'exigir', value: 8, max: null, source: 'prompt' },
  { id: 'words', label: 'Quantidade de palavras', level: 'recomendar', value: 1200, max: 1800, source: 'artigo' },
  { id: 'breadcrumb', label: 'Trilha de navegação (breadcrumb)', level: 'desligado', value: null, max: null, source: 'projeto' },
];
const state = (over: Record<string, unknown> = {}) => ({
  article: { id: ART, project_id: PROJ, status: 'ready', hash: 'h' }, role: 'editor', can_write: true, can_admin: false,
  auto: false, apply_without_review: false, plugin_gate: 'avisar', rules, rules_layers: ['padrao_editavel', 'prompt'],
  language: { tag: 'pt-BR', source: 'configurado', formula: { id: 'flesch_pt', label: 'Flesch adaptado ao português (Martins et al., 1996)', status: 'documentada' } },
  last_run: null, last_report: null, proposal: null,
  spend: { cap_usd_micros: usd(7), used_usd_micros: usd(1.4), pct: 20, state: 'livre', remaining_usd_micros: usd(5.6) },
  pilot_today_usd_micros: usd(0.0123), pilot_cost_is_estimate: true, ...over,
});
const report = (over: Record<string, unknown> = {}) => ({
  article_id: ART, unchanged: false, partial: false, language: { tag: 'pt-BR', source: 'configurado', formula: 'flesch_pt' }, before: { score: 41, failing: ['flesch'] }, after: { score: 63, failing: [] },
  applied: [
    { id: 'no_markdown_tables', kind: 'deterministico', label: 'Tabelas em markdown cru viraram tabelas HTML', count: 2 },
    { id: 'flesch', kind: 'ia', label: 'Legibilidade de um trecho', count: 1, costMicros: 4200 },
  ],
  pending: [{ id: 'faq', label: 'faq', kind: 'humano', reason: 'Sem seção de perguntas frequentes. O piloto não inventa perguntas e respostas.' }, { id: 'compliance', label: 'Conformidade', kind: 'conformidade', reason: 'O pacote do segmento apontou 1 aviso.' }],
  steps: [{ id: 'deterministico', kind: 'deterministico', status: 'aplicado', costMicros: 0 }], cost_usd_micros: 4200, cost_is_estimate: true, stopped: null,
  compliance: { pack: 'juridico_oab', mode: 'aviso', warnings: [{ code: 'x', label: 'Promessa de resultado' }] }, generated_at: '2026-11-20T12:00:00.000Z', ...over,
});
const job = (over: Record<string, unknown> = {}) => ({ v: 1, working: { title: 't', content: '<p>x</p>', excerpt: '' }, originalHash: 'h', applied: [], pending: [], steps: [], attempted: [], touchedUnits: [], aiUsed: 0, costMicros: 0, deterministicDone: false, stopped: null, done: false, compliance: [], schema: null, ...over });
const progress = (over: Record<string, unknown> = {}) => ({ done: false, ai_used: 0, ai_max: 6, cost_usd_micros: 0, next: ['Correções que não gastam IA'], stopped: null, step_max_tokens: 1800, ...over });

function Harness({ onApplied }: { onApplied?: (f: { title: string; content: string; excerpt: string }) => void }) {
  const pilot = useAutoPilot(ART, onApplied);
  return <AutoPilotPanel pilot={pilot} />;
}
const mount = (node: JSX.Element = <Harness />) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>);
const answer = (st: Record<string, unknown>, extra: Record<string, (b: Record<string, unknown>) => unknown> = {}) => {
  api.call.mockImplementation(async (action: string, body: Record<string, unknown>) => {
    if (extra[action]) return extra[action](body);
    if (action === 'get') return st;
    throw new Error(`não simulado: ${action}`);
  });
};

afterEach(() => { api.call.mockReset(); });

describe('Piloto Automático (tela): estado, custo, regras e chave "automático"', () => {
  it('mostra idioma e fórmula, custo do piloto no dia, uso do teto (US$ e %) e de onde vem cada regra', async () => {
    answer(state());
    mount();
    expect(await screen.findByText(/Piloto automático/)).toBeTruthy();
    const cost = await screen.findByTestId('autopilot-cost');
    expect(within(cost).getByText('US$ 0,01')).toBeTruthy();
    expect(cost.textContent).toMatch(/US\$ 1,40 de US\$ 7,00 \(20%\)/);
    expect(cost.textContent).toMatch(/estimativa/);
    expect(screen.getByTestId('autopilot-language').textContent).toMatch(/pt-BR.*Flesch adaptado ao português/);
    fireEvent.click(screen.getByLabelText('Ver as regras usadas'));
    const list = await screen.findByTestId('autopilot-rules');
    expect(list.textContent).toMatch(/Links internos[\s\S]*exigir 8 · definido no prompt do agente/);
    expect(list.textContent).toMatch(/Quantidade de palavras[\s\S]*recomendar 1200–1800 · definido no artigo/);
    expect(list.textContent).toMatch(/Legibilidade[\s\S]*padrão editável/);
    expect(list.textContent).toMatch(/não são regras fixas do sistema: quem define são o prompt e o agente/);
  });

  it('liga e desliga o automático pelo projeto (chama set_auto com o projeto do artigo); desligado explica o que acontece', async () => {
    answer(state(), { set_auto: () => ({ saved: true }) });
    mount();
    const sw = await screen.findByLabelText('Automático ligado neste projeto');
    expect(screen.getByText(/Desligado: o piloto só roda quando você clicar/)).toBeTruthy();
    fireEvent.click(sw);
    await waitFor(() => expect(api.call).toHaveBeenCalledWith('set_auto', { projectId: PROJ, auto: true }));
  });

  it('só dono/administrador vê "aplicar sem revisão" e "segurar no WordPress"; leitor não roda nada', async () => {
    answer(state({ can_admin: true }), { set_auto: () => ({ saved: true }) });
    const view = mount();
    fireEvent.click(await screen.findByLabelText('Ver as regras usadas'));
    fireEvent.click(await screen.findByLabelText('Segurar como rascunho no WordPress'));
    await waitFor(() => expect(api.call).toHaveBeenCalledWith('set_auto', { projectId: PROJ, plugin_gate: 'exigir' }));
    expect(screen.getByLabelText('Aplicar sem revisão')).toBeTruthy();
    view.unmount();
    answer(state({ can_write: false, role: 'viewer' }));
    mount();
    const botao = await screen.findByRole('button', { name: /Otimizar e Corrigir/ });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/permite ver o piloto, mas não rodá-lo/)).toBeTruthy();
    expect((screen.getByLabelText('Automático ligado neste projeto') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText('Aplicar sem revisão')).toBeNull();
  });

  it('idioma sem fórmula e teto sem leitura são ditos com clareza (nada de nota zero nem de número inventado)', async () => {
    answer(state({ language: { tag: 'fi', source: 'configurado', formula: null }, spend: null }));
    mount();
    expect(await screen.findByText(/sem fórmula de legibilidade para este idioma/)).toBeTruthy();
    expect(screen.getByText(/Não consegui ler o teto de hoje agora/)).toBeTruthy();
  });

  it('erro de leitura vira mensagem em português', async () => {
    api.call.mockRejectedValue(new AutoOptimizeError('organization_membership_required'));
    mount();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Você não faz parte da organização/);
    expect(autoOptimizeMessage(new AutoOptimizeError('daily_cap_reached'))).toMatch(/teto diário/);
    expect(autoOptimizeMessage(new Error('qualquer'))).toMatch(/Tente de novo/);
  });
});

describe('Piloto Automático (tela): execução passo a passo com progresso real', () => {
  it('start, depois um step por vez (cada um mostrado na lista), depois finish: relatório com aplicado e pendências humanas', async () => {
    const order: string[] = [];
    let stepN = 0;
    answer(state(), {
      start: () => { order.push('start'); return { job: job(), progress: progress() }; },
      step: () => {
        order.push('step'); stepN++;
        if (stepN === 1) return { job: job({ deterministicDone: true, steps: [{ id: 'deterministico', kind: 'deterministico', status: 'aplicado', costMicros: 0, detail: '2 correção(ões) sem IA' }] }), progress: progress({ next: ['Legibilidade de um trecho'] }) };
        return { job: job({ deterministicDone: true, done: true, aiUsed: 1, costMicros: 4200, steps: [{ id: 'deterministico', kind: 'deterministico', status: 'aplicado', costMicros: 0 }, { id: 'readability', kind: 'ia', status: 'aplicado', costMicros: 4200, detail: 'trecho reescrito para ler melhor' }] }), progress: progress({ done: true, ai_used: 1, cost_usd_micros: 4200, next: [] }) };
      },
      finish: () => { order.push('finish'); return { report: report(), proposal: 'pending_review' }; },
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Otimizar e Corrigir/ }));
    const steps = await screen.findByTestId('autopilot-steps');
    await waitFor(() => expect(screen.getByTestId('autopilot-report')).toBeTruthy());
    expect(order).toEqual(['start', 'step', 'step', 'finish']);
    expect(steps.textContent).toMatch(/Lendo o artigo e as regras do projeto/);
    expect(steps.textContent).toMatch(/Correções que não gastam IA/);
    expect(steps.textContent).toMatch(/Legibilidade de um trecho/);
    expect(steps.textContent).toMatch(/trecho reescrito para ler melhor/);
    const rep = screen.getByTestId('autopilot-report');
    expect(rep.textContent).toMatch(/Nota 41 → 63/);
    expect(rep.textContent).toMatch(/Aplicado automaticamente \(2\)/);
    expect(rep.textContent).toMatch(/Tabelas em markdown cru viraram tabelas HTML \(2\) · sem IA/);
    expect(rep.textContent).toMatch(/Legibilidade de um trecho · IA/);
    expect(rep.textContent).toMatch(/Pendências para uma pessoa \(2\)/);
    expect(rep.textContent).toMatch(/precisa de uma pessoa[\s\S]*não inventa perguntas e respostas/);
    expect(rep.textContent).toMatch(/Conformidade \(juridico_oab, modo aviso\): Promessa de resultado/);
    expect(rep.textContent).toMatch(/US\$ 0,0042/);
  });

  it('teto diário bateu: o painel avisa que o piloto parou, que o texto ficou como estava e lista o que faltou', async () => {
    answer(state(), {
      start: () => ({ job: job(), progress: progress() }),
      step: () => ({ job: job({ deterministicDone: true, done: true, stopped: { reason: 'teto', message: 'Teto diário de gasto com IA atingido: US$ 7,00 gastos hoje de US$ 7,00.' }, steps: [{ id: 'readability', kind: 'ia', status: 'teto', costMicros: 0, detail: 'Teto diário de gasto com IA atingido.' }] }), progress: progress({ done: true, stopped: { reason: 'teto', message: 'x' } }) }),
      finish: () => ({ report: report({ partial: true, applied: [], pending: [{ id: 'flesch', label: 'Legibilidade de um trecho', kind: 'teto', reason: 'O teto diário de gasto com IA foi atingido antes deste passo.' }], stopped: { reason: 'teto', message: 'Teto diário de gasto com IA atingido: US$ 7,00 gastos hoje de US$ 7,00.' } }), proposal: 'pending_review' }),
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Otimizar e Corrigir/ }));
    const aviso = await screen.findByTestId('autopilot-cap-stop');
    expect(aviso.textContent).toMatch(/O teto diário de gasto bateu e o piloto parou/);
    expect(aviso.textContent).toMatch(/texto do artigo continua como estava/);
    expect(screen.getByTestId('autopilot-report').textContent).toMatch(/parou no teto diário/);
  });

  it('falha de rede no meio mostra mensagem em português e deixa tentar de novo', async () => {
    answer(state(), { start: () => { throw new AutoOptimizeError('article_changed_reload'); } });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Otimizar e Corrigir/ }));
    expect((await screen.findByText(/foi editado enquanto o piloto trabalhava/)).textContent).toBeTruthy();
    expect((screen.getByRole('button', { name: /Otimizar e Corrigir/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Piloto Automático (tela): rascunho de revisão', () => {
  const comRascunho = (over: Record<string, unknown> = {}) => state({ proposal: { status: 'pending_review', at: '2026-11-20T12:00:00.000Z', stale: false, ...over } });

  it('mostra o rascunho aguardando revisão; "Aplicar" busca o texto, aplica e entrega ao editor; avisa que precisa aprovar de novo', async () => {
    const onApplied = vi.fn();
    answer(comRascunho(), { get_proposal: () => ({ proposal: { title: 'Novo título', content: '<p>texto novo</p>', excerpt: 'nova meta' } }), apply: () => ({ applied: true }) });
    mount(<Harness onApplied={onApplied} />);
    const caixa = await screen.findByTestId('autopilot-proposal');
    expect(caixa.textContent).toMatch(/O texto do artigo ainda não mudou/);
    expect(caixa.textContent).toMatch(/revisão e a aprovação para publicar valem de novo/);
    fireEvent.click(within(caixa).getByRole('button', { name: 'Aplicar no artigo' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith({ title: 'Novo título', content: '<p>texto novo</p>', excerpt: 'nova meta' }));
    expect(api.call.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['get_proposal', 'apply']));
  });

  it('rascunho velho (artigo editado depois) bloqueia o "Aplicar"; "Descartar" chama discard', async () => {
    answer(comRascunho({ stale: true }), { discard: () => ({ discarded: true }) });
    mount();
    const caixa = await screen.findByTestId('autopilot-proposal');
    expect((within(caixa).getByRole('button', { name: 'Aplicar no artigo' }) as HTMLButtonElement).disabled).toBe(true);
    expect(caixa.textContent).toMatch(/editado depois desta análise/);
    fireEvent.click(within(caixa).getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(api.call).toHaveBeenCalledWith('discard', { articleId: ART }));
  });
});

describe('Piloto Automático (tela): integração com o editor e celular', () => {
  it('"Otimizar e Corrigir" do editor agora chama o piloto (start), não mais a função antiga de otimização única', async () => {
    answer(state(), { start: () => { throw new AutoOptimizeError('ai_unavailable'); } });
    mount(<AISEOAnalysisPanel articleId={ART} title="t" keyword="k" />);
    const botoes = await screen.findAllByRole('button', { name: /Otimizar e Corrigir/ });
    fireEvent.click(botoes[botoes.length - 1]);
    await waitFor(() => expect(api.call).toHaveBeenCalledWith('start', { articleId: ART }));
    const src = readFileSync('src/components/articles/editor/AISEOAnalysisPanel.tsx', 'utf8');
    expect(src).not.toMatch(/mode:\s*'optimize'/);
    expect(src).toContain('useAutoPilot');
  });

  it('celular (400px): o painel não fixa largura, quebra texto longo e não rola na horizontal', () => {
    const src = readFileSync('src/components/articles/editor/AutoPilotPanel.tsx', 'utf8');
    expect(src).toContain('w-full min-w-0 overflow-hidden');
    expect(src).toContain('break-words');
    expect(src).not.toMatch(/\bw-\[\d+px\]|\bmin-w-\[|\bwidth:\s*\d+px|whitespace-nowrap/);
    expect(src).toMatch(/flex-wrap/);
  });

  it('legibilidade do painel de pontuação: fórmula do idioma, nunca zero por idioma sem fórmula, mínimo vem do projeto', () => {
    const pt = calculateReadability('A prescrição é o prazo que a lei estabelece para que o credor cobre uma dívida. Depois desse prazo, o devedor pode se defender. O juiz deve reconhecer a prescrição quando ela for alegada pela parte interessada.');
    expect(pt.scored).toBe(true);
    expect(pt.fleschScore).toBeGreaterThan(20);
    expect(pt.formula?.id).toBe('flesch_pt');
    const en = calculateReadability('Running shoes are designed to absorb impact and keep your feet stable. You should pick a pair that fits your stride and your budget. However, the best choice depends on where you run and how often you train in a week.');
    expect(en.formula?.id).toBe('flesch_en');
    const fi = calculateReadability('Tämä on suomenkielinen teksti, jota järjestelmä ei tunne. Lauseet ovat lyhyitä ja selkeitä. Silti kaava puuttuu.', { language: 'fi' });
    expect(fi).toMatchObject({ fleschScore: null, scored: false, isEasyToRead: true, level: 'Sem fórmula para este idioma' });
    expect(calculateReadability('texto em português com frases curtas. Outra frase simples aqui.', { language: 'pt', minimum: 90, target: 95 }).isEasyToRead).toBe(false);
    const panel = readFileSync('src/components/articles/editor/SEOScorePanel.tsx', 'utf8');
    expect(panel).not.toMatch(/mínimo: 60|abaixo do mínimo \(60\)|fleschScore < 60|>= 800/);
  });
});
