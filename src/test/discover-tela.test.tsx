import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { parsePage, type SiteMapResult } from '../../supabase/functions/_shared/profile-discover-core';
import { synthesize, type Discovery } from '../../supabase/functions/_shared/profile-discover-synth';

const api = vi.hoisted(() => ({ callProfile: vi.fn(), runDiscovery: vi.fn(), update: vi.fn(), insert: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'Exemplo', domain: 'exemplo.com.br' }, { id: '00000000-0000-4000-8000-0000000000b2', name: 'Sem site', domain: null }], isLoading: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ update: () => ({ eq: api.update }), insert: () => ({ select: () => ({ single: api.insert }) }) }), functions: { invoke: vi.fn() } } }));
vi.mock('@/lib/profile-api', async (orig) => ({ ...(await orig<typeof import('@/lib/profile-api')>()), callProfile: api.callProfile }));
vi.mock('@/lib/discover-api', async (orig) => ({ ...(await orig<typeof import('@/lib/discover-api')>()), runDiscovery: api.runDiscovery }));
vi.mock('@/components/profile/ProfileChat', () => ({ ProfileChat: (p: { suggestions?: string[]; seed?: { text: string } }) => <div data-testid="chat">chat:{p.suggestions?.length}:{p.seed?.text}</div> }));

import { DiscoverRunning, DiscoverStart } from '@/components/discover/DiscoverFlow';
import { DiscoverReview, type Selection } from '@/components/discover/DiscoverReview';
import DiscoverBusiness from '@/pages/DiscoverBusiness';

const P = '00000000-0000-4000-8000-0000000000b1';
const html = `<!doctype html><html lang="pt-BR"><head><title>Souza Advogados | Advocacia</title><meta name="description" content="Escritório de advocacia criminal e do consumidor em São Paulo, com atendimento humanizado e especialistas."><meta property="og:site_name" content="Souza Advogados"></head><body><nav><a href="/criminal">Direito Criminal</a><a href="/consumidor">Direito do Consumidor</a></nav><h1>Advocacia</h1><p>${'Advogado criminalista e direito do consumidor em São Paulo e Guarulhos. Defesa criminal, habeas corpus, golpe do Pix. '.repeat(8)}</p><a href="https://www.instagram.com/souza/">ig</a></body></html>`;
const home = parsePage(html, 'https://exemplo.com.br/', { status: 200, ttfbMs: 90, bytes: html.length });
const mapOk = (over: Partial<SiteMapResult> = {}): SiteMapResult => ({
  version: 'd1', homeKind: 'site', origin: 'https://exemplo.com.br', host: 'exemplo.com.br', registrable: 'exemplo.com.br', home, homeError: null,
  robots: { found: true, sitemaps: [], disallowAll: false, aiBots: {} }, llms: { found: false, url: 'https://exemplo.com.br/llms.txt' },
  sitemap: { found: true, files: [{ url: 'https://exemplo.com.br/sitemap.xml', kind: 'paginas', count: 8 }], urls: 8, truncated: false, sections: [{ section: 'blog', count: 5, latest: '2026-10-01', sample: [] }], hosts: {}, newest: '2026-10-01', withLastmod: 5, postUrls: 5 },
  candidates: [], subdomains: ['exemplo.com.br'], elapsedMs: 900, ...over,
});
const discovery = (): Discovery => synthesize(mapOk(), [], 0, Date.UTC(2026, 10, 16));
const unpublished = (): Discovery => synthesize(mapOk({ home: null, homeKind: 'listagem', homeError: 'O endereço mostra só a listagem de arquivos do servidor: não há site publicado nele.' }), [], 0, Date.UTC(2026, 10, 16));

const payload = (strategy: Record<string, string> = {}) => ({
  project: { id: P, name: 'Exemplo', domain: 'exemplo.com.br', organization_id: 'o1' }, role: 'owner', can_write: true, can_private: false, can_modules: true,
  strategy: { data: strategy, version: 3, status: 'incomplete' }, legacy_strategy: {}, extended: { version: 2, sections: {}, status: 'draft', completeness: 0, updated_at: null, confirmed_at: null },
  private: null, snapshots: [], modules: { catalog: [], decisions: [] },
});

function Harness({ d, current = {}, canWrite = true, onAsk = () => undefined }: { d: Discovery; current?: Record<string, string>; canWrite?: boolean; onAsk?: (t?: string) => void }) {
  const [sel, setSel] = useState<Selection>({ accepted: Object.fromEntries(d.inferences.map((i) => [i.key, i.confidence !== 'baixa'])), edits: {} });
  return <><DiscoverReview discovery={d} current={current} selection={sel} onSelection={setSel} canWrite={canWrite} busy={false} onReanalyze={() => undefined} onAskZica={onAsk} /><output data-testid="sel">{JSON.stringify(sel)}</output></>;
}
const mount = (ui: React.ReactElement, url = '/descobrir') => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter></QueryClientProvider>);

beforeEach(() => { localStorage.clear(); api.callProfile.mockReset(); api.runDiscovery.mockReset(); api.update.mockReset(); api.insert.mockReset(); });

describe('descoberta: tela de entrada', () => {
  it('pede só o endereço: aceita colar com https, www e caminho e entrega o domínio limpo', () => {
    const onStart = vi.fn();
    mount(<DiscoverStart busy={false} projects={[]} onStart={onStart} onPickProject={() => undefined} />);
    const btn = screen.getByRole('button', { name: /Analisar meu site/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Endereço do site/), { target: { value: 'https://WWW.Exemplo.com.br/blog?x=1' } });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);
    expect(onStart).toHaveBeenCalledWith('www.exemplo.com.br');
  });

  it('endereço inválido mostra o aviso em português e não inicia', () => {
    const onStart = vi.fn();
    mount(<DiscoverStart busy={false} projects={[]} onStart={onStart} onPickProject={() => undefined} />);
    const input = screen.getByLabelText(/Endereço do site/);
    fireEvent.change(input, { target: { value: 'isso nao e site' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toMatch(/não parece um site/);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('oferece reanalisar projetos que já têm site (e só esses) e o formulário manual como saída', () => {
    const pick = vi.fn();
    mount(<DiscoverStart busy={false} projects={[{ id: 'a', name: 'RDM Advogados', domain: 'rdmadvogados.com.br' }, { id: 'b', name: 'Sem site', domain: null }]} onStart={() => undefined} onPickProject={pick} />);
    fireEvent.click(screen.getByRole('button', { name: /RDM Advogados/ }));
    expect(pick).toHaveBeenCalledWith('a');
    expect(screen.queryByRole('button', { name: /Sem site/ })).toBeNull();
    expect(screen.getByRole('link', { name: /formulário completo/ }).getAttribute('href')).toBe('/business-profile');
  });

  it('andamento mostra etapas, contadores e permite cancelar', () => {
    const cancel = vi.fn();
    mount(<DiscoverRunning host="exemplo.com.br" progress={{ phase: 'paginas', done: 6, total: 12, message: 'Lendo as páginas (6 de 12)…', pagesRead: 7, sitemapUrls: 40 }} onCancel={cancel} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByText('40')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cancel).toHaveBeenCalled();
  });
});

describe('descoberta: revisão do que foi encontrado', () => {
  it('mostra o que foi achado, a confiança, a evidência e permite marcar/desmarcar item', () => {
    mount(<Harness d={discovery()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Souza Advogados');
    expect(screen.getAllByText('Certeza alta').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/De onde tirei isto/).length).toBeGreaterThan(3);
    const box = screen.getByLabelText('Usar "Segmento" no perfil') as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(JSON.parse(screen.getByTestId('sel').textContent || '{}').accepted.seg).toBe(false);
    expect(screen.getByText('Oportunidades')).toBeTruthy();
    expect(screen.getByText('Saúde técnica')).toBeTruthy();
  });

  it('avisa quando o item substitui algo que já está no perfil e deixa editar o valor', () => {
    mount(<Harness d={discovery()} current={{ seg: 'Medicina' }} />);
    const row = screen.getByLabelText('Usar "Segmento" no perfil').closest('li') as HTMLElement;
    expect(within(row).getByText(/Hoje no perfil: “Medicina”/)).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: /Editar/ }));
    fireEvent.click(within(row).getByRole('button', { name: 'Odontologia' })); // campo oficial do perfil: escolhe outra opção
    const sel = JSON.parse(screen.getByTestId('sel').textContent || '{}');
    expect(sel.edits.seg).toBe('Odontologia');
    expect(within(row).getByText('editado por você')).toBeTruthy();
  });

  it('sem permissão de escrita, nada pode ser marcado nem editado', () => {
    mount(<Harness d={discovery()} canWrite={false} />);
    expect((screen.getByLabelText('Usar "Segmento" no perfil') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
  });

  it('endereço sem site publicado explica o motivo e leva ao conceito com a Zica (sem inventar perfil)', () => {
    const ask = vi.fn();
    mount(<Harness d={unpublished()} onAsk={ask} />);
    expect(screen.getByText(/ainda não tem site publicado/)).toBeTruthy();
    expect(screen.queryByText('Oportunidades')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Montar o conceito com a Zica/ }));
    expect(ask).toHaveBeenCalled();
    expect(screen.queryByLabelText('Usar "Segmento" no perfil')).toBeNull(); // nenhum item marcável: só lacunas
  });
});

describe('descoberta: página completa', () => {
  it('projeto com site: lê, mostra o resultado e só grava no perfil o que o cliente confirmou', async () => {
    api.callProfile.mockImplementation(async (action: string) => (action === 'profile_load' ? payload() : { ...payload({ businessName: 'Souza Advogados' }), extended: { ...payload().extended, version: 4 } }));
    api.runDiscovery.mockImplementation(async (_id: string, _site: string | undefined, onProgress: (p: unknown) => void) => { onProgress({ phase: 'mapa', done: 0, total: 1, message: 'x', pagesRead: 0, sitemapUrls: 0 }); return discovery(); });
    mount(<DiscoverBusiness />, `/descobrir?project=${P}&auto=1`);
    await screen.findByText('Raio-X do negócio');
    expect(api.runDiscovery).toHaveBeenCalledWith(P, undefined, expect.any(Function), expect.anything());
    // desmarca o segmento e confirma o resto
    const seg = await screen.findByLabelText('Usar "Segmento" no perfil');
    await waitFor(() => expect((seg as HTMLInputElement).checked).toBe(true));
    fireEvent.click(seg);
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar \d+ no perfil/ }));
    await waitFor(() => expect(api.callProfile).toHaveBeenCalledWith('profile_save', expect.anything()));
    const call = api.callProfile.mock.calls.find((c) => c[0] === 'profile_save') as [string, { projectId: string; changes: Record<string, unknown>; expected: Record<string, number> }];
    expect(call[1].projectId).toBe(P);
    expect(call[1].expected).toEqual({ strategy: 3, extended: 2, private: 0 });
    expect(call[1].changes.businessName).toBe('Souza Advogados');
    expect('seg' in call[1].changes).toBe(false); // o que o cliente desmarcou não é gravado
    expect(Object.keys(call[1].changes).every((k) => k !== 'audience' && k !== 'tom' && k !== 'entityType')).toBe(true); // palpites (baixa confiança) não vêm marcados
    expect((await screen.findAllByText(/Perfil montado e salvo/)).length).toBeGreaterThan(0);
  });

  it('já tendo uma descoberta guardada neste navegador, mostra na hora sem ler o site de novo', async () => {
    api.callProfile.mockResolvedValue(payload());
    localStorage.setItem(`zica:descoberta:v1:${P}`, JSON.stringify(discovery()));
    mount(<DiscoverBusiness />, `/descobrir?project=${P}`);
    await screen.findByText('Raio-X do negócio');
    expect(api.runDiscovery).not.toHaveBeenCalled();
  });

  it('item que já existe no perfil e é diferente NÃO vem marcado (não apaga nada sem o clique)', async () => {
    api.callProfile.mockResolvedValue(payload({ businessName: 'Nome antigo' }));
    localStorage.setItem(`zica:descoberta:v1:${P}`, JSON.stringify(discovery()));
    mount(<DiscoverBusiness />, `/descobrir?project=${P}`);
    const box = await screen.findByLabelText('Usar "Nome da empresa ou do profissional" no perfil');
    await waitFor(() => expect(api.callProfile).toHaveBeenCalled());
    expect((box as HTMLInputElement).checked).toBe(false);
  });

  it('se o servidor recusar a gravação, o clique SEMPRE dá retorno: mensagem e campos recusados na barra', async () => {
    const { ProfileError } = await import('@/lib/profile-api');
    api.callProfile.mockImplementation(async (action: string) => { if (action === 'profile_load') return payload(); throw new ProfileError('validation_failed', { regions: 'too_long' }); });
    localStorage.setItem(`zica:descoberta:v1:${P}`, JSON.stringify(discovery()));
    mount(<DiscoverBusiness />, `/descobrir?project=${P}`);
    const btn = await screen.findByRole('button', { name: /Confirmar \d+ no perfil/ });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getAllByRole('alert').map((n) => n.textContent).join(' | ')).toMatch(/Alguns campos precisam de ajuste/));
    expect(screen.getAllByRole('alert').map((n) => n.textContent).join(' | ')).toMatch(/Cidades|regiões|Bairros/i);
    expect(screen.queryByText(/Perfil montado e salvo/)).toBeNull();
    // e o botão continua disponível para tentar de novo
    expect((screen.getByRole('button', { name: /Confirmar \d+ no perfil/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('depois de salvar, a barra vira confirmação (não some) e oferece os próximos passos', async () => {
    api.callProfile.mockImplementation(async (action: string) => (action === 'profile_load' ? payload() : { ...payload({ businessName: 'Souza Advogados' }), extended: { ...payload().extended, version: 4 } }));
    localStorage.setItem(`zica:descoberta:v1:${P}`, JSON.stringify(discovery()));
    mount(<DiscoverBusiness />, `/descobrir?project=${P}`);
    const btn = await screen.findByRole('button', { name: /Confirmar \d+ no perfil/ });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getAllByText(/Perfil salvo \(versão 4\)/).length).toBeGreaterThan(0));
    expect(screen.getByRole('link', { name: 'Abrir o perfil' }).getAttribute('href')).toBe(`/projects/${P}/perfil`);
    expect(screen.queryByRole('button', { name: /Confirmar \d+ no perfil/ })).toBeNull();
  });

  describe('proteção contra substituir o que o cliente já escreveu', () => {
    const abrir = async (strategy: Record<string, string>) => {
      api.callProfile.mockImplementation(async (action: string) => (action === 'profile_load' ? payload(strategy) : { ...payload({ ...strategy, businessName: 'Souza Advogados' }), extended: { ...payload().extended, version: 4 } }));
      localStorage.setItem(`zica:descoberta:v1:${P}`, JSON.stringify(discovery()));
      mount(<DiscoverBusiness />, `/descobrir?project=${P}`);
      await screen.findByLabelText('Usar "Nome da empresa ou do profissional" no perfil');
      await waitFor(() => expect(api.callProfile).toHaveBeenCalled());
    };
    const box = (label: string) => screen.getByLabelText(`Usar "${label}" no perfil`) as HTMLInputElement;
    const avisoSubstitui = () => screen.queryAllByRole('note').some((n) => /vão substituir texto que você já tem/.test(n.textContent || ''));

    it('"Marcar todos" marca só o que preenche vazio ou já confere e NUNCA o que trocaria um texto existente', async () => {
      await abrir({ businessName: 'Nome antigo', offer: 'Oferta que o cliente escreveu' });
      await waitFor(() => expect(box('Segmento').checked).toBe(true));
      fireEvent.click(screen.getByRole('button', { name: /Marcar todos/ }));
      expect(box('Nome da empresa ou do profissional').checked).toBe(false); // trocaria "Nome antigo"
      expect(box('O que a empresa faz, em uma frase').checked).toBe(false); // trocaria a oferta
      expect(box('Segmento').checked).toBe(true); // campo vazio
      expect(box('Tipo').checked).toBe(false); // palpite (baixa confiança): "todos" ignora, mesmo preenchendo vazio
      const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      const sugestoes = boxes.filter((c) => /Sugestão/.test(c.closest('li')?.textContent || ''));
      expect(sugestoes.length).toBeGreaterThan(0);
      expect(sugestoes.every((c) => !c.checked)).toBe(true); // nenhum palpite entra no "todos"
      expect(avisoSubstitui()).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: /Confirmar \d+ no perfil$/ }));
      await waitFor(() => expect(api.callProfile).toHaveBeenCalledWith('profile_save', expect.anything()));
      const changes = (api.callProfile.mock.calls.find((c) => c[0] === 'profile_save')?.[1] as { changes: Record<string, unknown> }).changes;
      expect('businessName' in changes).toBe(false);
      expect('offer' in changes).toBe(false);
    });

    it('marcar à mão um item que substitui exige confirmação mostrando antes e depois; "Voltar" não grava', async () => {
      await abrir({ businessName: 'Nome antigo' });
      fireEvent.click(box('Nome da empresa ou do profissional'));
      expect(avisoSubstitui()).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: /Confirmar \d+ no perfil \(1 substituem\)/ }));
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByRole('heading', { name: /substituir 1 texto/ })).toBeTruthy();
      expect(within(dialog).getByText('Nome antigo', { exact: false })).toBeTruthy();
      expect(within(dialog).getByText('Souza Advogados', { exact: false })).toBeTruthy();
      expect(api.callProfile.mock.calls.some((c) => c[0] === 'profile_save')).toBe(false);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar e revisar' }));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(api.callProfile.mock.calls.some((c) => c[0] === 'profile_save')).toBe(false);
    });

    it('só grava a substituição depois do "Sim, substituir"', async () => {
      await abrir({ businessName: 'Nome antigo' });
      fireEvent.click(box('Nome da empresa ou do profissional'));
      fireEvent.click(screen.getByRole('button', { name: /Confirmar \d+ no perfil \(1 substituem\)/ }));
      fireEvent.click(await screen.findByRole('button', { name: /Sim, substituir 1 texto/ }));
      await waitFor(() => expect(api.callProfile).toHaveBeenCalledWith('profile_save', expect.anything()));
      const changes = (api.callProfile.mock.calls.find((c) => c[0] === 'profile_save')?.[1] as { changes: Record<string, unknown> }).changes;
      expect(changes.businessName).toBe('Souza Advogados');
    });

    it('"Desmarcar os que substituem" fecha o aviso e tira só essas substituições; mexer na seleção cancela a confirmação', async () => {
      await abrir({ businessName: 'Nome antigo' });
      fireEvent.click(box('Nome da empresa ou do profissional'));
      fireEvent.click(screen.getByRole('button', { name: /Confirmar \d+ no perfil \(1 substituem\)/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'Desmarcar os que substituem' }));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(box('Nome da empresa ou do profissional').checked).toBe(false);
      expect(box('Segmento').checked).toBe(true);
      expect(api.callProfile.mock.calls.some((c) => c[0] === 'profile_save')).toBe(false);
      // aviso aberto e a pessoa muda a seleção: o aviso some (o que seria confirmado já não é o que está marcado)
      fireEvent.click(box('Nome da empresa ou do profissional'));
      fireEvent.click(screen.getByRole('button', { name: /Confirmar \d+ no perfil \(1 substituem\)/ }));
      await screen.findByRole('alertdialog');
      fireEvent.click(box('Segmento'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    });
  });

  it('falha de leitura do site aparece em português e volta ao início', async () => {
    api.callProfile.mockResolvedValue(payload());
    api.runDiscovery.mockRejectedValue(Object.assign(new Error('discover_operation_failed'), { code: 'discover_operation_failed' }));
    mount(<DiscoverBusiness />, `/descobrir?project=${P}&auto=1`);
    expect((await screen.findByRole('alert')).textContent).toMatch(/não conseguiu terminar|Não foi possível ler/);
    expect(screen.getByRole('button', { name: /Analisar meu site/ })).toBeTruthy();
  });
});
