import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NexusGapBrief } from '@/components/article-generator/NexusGapBrief';
import { gapKey } from '@/lib/nexus-observatory';
import type { NexusObservatorySummary } from '@/types/nexus-observatory';

const state = vi.hoisted(() => ({
  data: undefined as unknown, isLoading: false, error: null as Error | null,
}));
vi.mock('@/hooks/useNexusObservatory', () => ({
  useObservatorySummary: () => ({ data: state.data, isLoading: state.isLoading, error: state.error }),
}));

const base: NexusObservatorySummary = {
  period: { from: '2026-10-13', to: '2026-11-12' },
  totals: { operations: 0, valid: 0, mention_rate: null, citation_rate: null, own_citations: 0, competitor_mentions: 0, share_of_voice: null },
  by_engine: [], by_country: [], by_topic: [], trend: [], top_competitors: [], own_urls: [],
  signals: { ai_bot_hits: 0, ai_referrals: 0, search_referrals: 0, by_agent: [], by_path: [], last_batch_at: null },
};
const gapA = { topic: 'custodia', intent: 'international', query: 'Custódia internacional de menor', country: 'us', engines_missing: ['chatgpt_web'], competitors: ['CNJ', 'Mattos Filho'] };
const gapB = { topic: 'habeas-corpus', intent: 'informational', query: 'Como funciona o habeas corpus', country: 'br', engines_missing: ['gemini_web'], competitors: [] };

function mount(onAdd = vi.fn(), url = '/articles/bulk', projectId: string | null = 'p1', existing: string[] = []) {
  render(<MemoryRouter initialEntries={[url]}><NexusGapBrief projectId={projectId ?? undefined} existingKeywords={existing} onAdd={onAdd} /></MemoryRouter>);
  return onAdd;
}

afterEach(() => { cleanup(); state.data = undefined; state.isLoading = false; state.error = null; });

describe('NexusGapBrief', () => {
  it('mostra estado vazio sem lacunas', () => {
    state.data = base;
    mount();
    expect(screen.getByText(/Nenhuma lacuna observada no período/)).toBeTruthy();
    expect(screen.queryByText('Adicionar como pauta')).toBeNull();
  });

  it('não renderiza sem projeto', () => {
    mount(vi.fn(), '/articles/bulk', null);
    expect(screen.queryByTestId('nexus-gap-brief')).toBeNull();
  });

  it('lista 2 lacunas com concorrentes e motores sem citação', () => {
    state.data = { ...base, gaps: [gapA, gapB] };
    mount();
    expect(screen.getAllByRole('button', { name: 'Adicionar como pauta' })).toHaveLength(2);
    expect(screen.getByText(/Concorrentes observados: CNJ, Mattos Filho/)).toBeTruthy();
    expect(screen.getByText(/sem citação em: ChatGPT \(produto\)/)).toBeTruthy();
  });

  it('clique adiciona a pauta pelo callback e desabilita o botão', () => {
    state.data = { ...base, gaps: [gapA, gapB] };
    const onAdd = mount();
    fireEvent.click(screen.getAllByRole('button', { name: 'Adicionar como pauta' })[0]);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{
      keyword: 'custodia', title: 'Custódia internacional de menor',
      nexusGap: { query: 'Custódia internacional de menor', country: 'us', engines_missing: ['chatgpt_web'] },
    }]);
    expect(screen.getByRole('button', { name: 'Pauta adicionada' })).toHaveProperty('disabled', true);
  });

  it('pré-seleciona pelas chaves de ?nexusGaps= e adiciona só as selecionadas', () => {
    state.data = { ...base, gaps: [gapA, gapB] };
    const onAdd = mount(vi.fn(), `/articles/bulk?nexusGaps=${gapKey(gapB)}`);
    const box = screen.getByRole('checkbox', { name: 'Selecionar lacuna habeas-corpus' });
    expect(box.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Adicionar 1 selecionada/ }));
    expect(onAdd.mock.calls[0][0].map((p: { keyword: string }) => p.keyword)).toEqual(['habeas corpus']);
  });

  it('não repete pauta que já está na lista', () => {
    state.data = { ...base, gaps: [gapA] };
    mount(vi.fn(), '/articles/bulk', 'p1', ['Custodia']);
    expect(screen.getByRole('button', { name: 'Pauta adicionada' })).toHaveProperty('disabled', true);
  });

  it('erro de leitura não quebra o gerador', () => {
    state.error = new Error('falhou');
    mount();
    expect(screen.getByRole('alert').textContent).toMatch(/gerador continua funcionando/);
  });
});
