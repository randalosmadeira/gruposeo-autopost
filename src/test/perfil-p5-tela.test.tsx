import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ModuleEffectPreview, ProfilePayload } from '@/lib/profile-api';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/components/profile/ProfileAnalysis', () => ({ ProfileAnalysis: () => null }));

import { ModulesStep } from '@/components/profile/ProfileExtras';

const catalog = [
  { code: 'dashboard', name: 'Painel', description: 'Visão geral', route: '/dashboard', core: true, default_enabled: true, sort: 10 },
  { code: 'news_agents', name: 'Agentes de notícias', description: 'Captação', route: '/news-agents', core: false, default_enabled: false, sort: 160 },
  { code: 'articles', name: 'Artigos', description: 'Edição', route: '/articles', core: false, default_enabled: true, sort: 100 },
];
type Decision = ProfilePayload['modules']['decisions'][number];
function payload(decisions: Decision[] = [], over: Partial<ProfilePayload> = {}): ProfilePayload {
  return {
    project: { id: 'p', name: 'Blog', domain: null, organization_id: 'o' }, role: 'owner', can_write: true, can_private: true, can_modules: true,
    strategy: { data: {}, version: 0, status: 'draft' }, legacy_strategy: {},
    extended: { version: 0, sections: {}, status: 'draft', completeness: 0, updated_at: null, confirmed_at: null },
    private: null, snapshots: [], modules: { catalog, decisions }, ...over,
  };
}
const decision = (over: Partial<Decision>): Decision => ({ module_code: 'news_agents', enabled: false, reason: null, recommendation: null, recommendation_reason: null, decided_at: '2026-11-16T01:00:00Z', ...over });

function mount(p: ProfilePayload, preview: (code: string) => Promise<ModuleEffectPreview[]>, onDecide = vi.fn(), busy = false) {
  render(<ModulesStep payload={p} busy={busy} onDecide={onDecide} onPreview={preview} />);
  return onDecide;
}
afterEach(cleanup);

describe('módulos (P5)', () => {
  it('explica o efeito real: pausa rotinas neste projeto, nada apagado, sem decisão continua como está', () => {
    mount(payload(), async () => []);
    const note = screen.getByRole('note');
    expect(note.textContent).toMatch(/pausa as rotinas dele neste projeto/);
    expect(note.textContent).toMatch(/Nada é apagado/);
    expect(note.textContent).toMatch(/sem decisão registrada continua como está/i);
    expect(screen.getAllByText(/Sem decisão registrada \(padrão do sistema: (ligado|desligado)\)/).length).toBe(3);
  });

  it('desligar mostra o que será pausado e SÓ envia depois de confirmar', async () => {
    const preview = vi.fn(async () => [{ table: 'news_agents', label: 'Agentes de notícias', active: 2 }]);
    const onDecide = mount(payload([decision({ module_code: 'articles', enabled: true })]), preview);
    fireEvent.change(screen.getByLabelText('Motivo para Artigos (opcional)'), { target: { value: 'não usamos' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Artigos' }));
    const box = await screen.findByRole('alertdialog');
    await waitFor(() => expect(within(box).getByText(/2 agente\(s\) de notícias/)).toBeTruthy());
    expect(preview).toHaveBeenCalledWith('articles');
    expect(onDecide).not.toHaveBeenCalled();
    fireEvent.click(within(box).getByRole('button', { name: 'Confirmar desligamento' }));
    expect(onDecide).toHaveBeenCalledWith('articles', false, 'não usamos');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('cancelar não envia nada e fecha a confirmação', async () => {
    const onDecide = mount(payload(), async () => [{ table: 'news_agents', label: 'x', active: 1 }]);
    fireEvent.click(screen.getByRole('switch', { name: 'Artigos' }));
    const box = await screen.findByRole('alertdialog');
    fireEvent.click(within(box).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('módulo sem rotina ativa avisa que só registra a decisão', async () => {
    mount(payload(), async () => [{ table: 'news_agents', label: 'x', active: 0 }]);
    fireEvent.click(screen.getByRole('switch', { name: 'Artigos' }));
    expect(await screen.findByText(/não tem nenhuma rotina ativa neste projeto/)).toBeTruthy();
  });

  it('prévia que falha não deixa desligar às cegas: avisa que nada mudou', async () => {
    const onDecide = mount(payload(), async () => { throw new Error('x'); });
    fireEvent.click(screen.getByRole('switch', { name: 'Artigos' }));
    expect(await screen.findByText(/Não foi possível conferir o que seria pausado agora\. Nada foi alterado\./)).toBeTruthy();
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('religar envia direto e mostra o que está pausado enquanto desligado', () => {
    const onDecide = mount(payload([decision({ paused: { news_agents: 2, rss_schedules: 1 } })]), async () => []);
    expect(screen.getByText(/Pausado neste projeto:/).parentElement?.textContent).toMatch(/2 agente\(s\) de notícias, 1 agenda\(s\) de RSS/);
    fireEvent.click(screen.getByRole('switch', { name: 'Agentes de notícias' }));
    expect(onDecide).toHaveBeenCalledWith('news_agents', true, '');
  });

  it('módulo nuclear e papel sem permissão não têm interruptor ativo', () => {
    mount(payload(), async () => []);
    expect((screen.getByRole('switch', { name: /^Painel/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    mount(payload([], { can_modules: false, role: 'editor' }), async () => []);
    expect((screen.getByRole('switch', { name: 'Artigos' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('note').textContent).toMatch(/Só dono e administrador decidem/);
  });
});
