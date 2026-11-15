import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { applyProjectJsonMerge, asJsonObject, mergeColumnsPresent, mergeJsonObject, PROJECT_JSON_MERGE_COLUMNS } from '@/lib/json-merge';

// Estrutura copiada do que existe hoje nos projetos reais (só as chaves; conteúdo fictício), para provar que nada se perde.
const realShapeCommercial = {
  email: 'contato@exemplo.com.br', phone: '', address: '', whatsapp: '+5511999990000',
  google_maps_url: '', default_cta_url: 'https://exemplo.com.br/contato', default_cta_text: 'Fale com a equipe',
  schema_profile: {
    id: 'https://exemplo.com.br/#organization', type: 'LegalService', name: 'Exemplo',
    sameAs: ['https://www.instagram.com/exemplo/'], address: { addressLocality: 'São Paulo', addressRegion: 'SP' },
  },
};
const realShapeEditorial = {
  author_bio: 'Bio', author_name: 'Redação', primary_geo: 'São Paulo', target_audience: 'Empresas',
  nexus_visual_policy: { mode: 'photo_only', forbid: ['stock'] },
};
const realShapeSocial = { instagram: 'a', linkedin: 'b', youtube: 'c', facebook: 'd', twitter: 'e', kwai: 'f', tiktok: 'g' };

describe('mergeJsonObject (regra pura)', () => {
  it('preserva schema_profile, nexus_visual_policy, kwai e tiktok quando a tela grava só os campos que conhece', () => {
    // exatamente o que ProjectsList.handleSave envia
    const commercial = mergeJsonObject(realShapeCommercial, { phone: '1133334444', whatsapp: '+5511999990000', email: 'x@y.com', address: 'Rua A', google_maps_url: '', default_cta_text: 'T', default_cta_url: 'U' });
    expect(commercial.schema_profile).toEqual(realShapeCommercial.schema_profile);
    expect(commercial.phone).toBe('1133334444');
    const editorial = mergeJsonObject(realShapeEditorial, { target_audience: 'Novo', primary_geo: 'Rio', author_name: 'N', author_bio: 'B' });
    expect(editorial.nexus_visual_policy).toEqual(realShapeEditorial.nexus_visual_policy);
    expect(editorial.target_audience).toBe('Novo');
    const social = mergeJsonObject(realShapeSocial, { instagram: 'novo', linkedin: 'b', youtube: 'c', facebook: 'd', twitter: 'e' });
    expect(social.kwai).toBe('f');
    expect(social.tiktok).toBe('g');
    expect(social.instagram).toBe('novo');
  });

  it('o patch vence nas chaves que traz, inclusive texto vazio (limpar um campo é permitido)', () => {
    expect(mergeJsonObject({ a: '1', b: '2' }, { a: '' })).toEqual({ a: '', b: '2' });
  });

  it('base nula, lista, texto ou número vira objeto vazio; patch inválido não apaga nada', () => {
    expect(mergeJsonObject(null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeJsonObject([1, 2], { a: 1 })).toEqual({ a: 1 });
    expect(mergeJsonObject('x', { a: 1 })).toEqual({ a: 1 });
    expect(mergeJsonObject({ a: 1 }, null)).toEqual({ a: 1 });
    expect(mergeJsonObject({ a: 1 }, [9])).toEqual({ a: 1 });
    expect(asJsonObject(undefined)).toEqual({});
  });

  it('não altera os argumentos', () => {
    const base = { a: { x: 1 } };
    const patch = { b: 2 };
    const out = mergeJsonObject(base, patch);
    expect(base).toEqual({ a: { x: 1 } });
    expect(patch).toEqual({ b: 2 });
    expect(out).not.toBe(base);
  });
});

describe('applyProjectJsonMerge e mergeColumnsPresent', () => {
  it('só as três colunas entram na fusão; undefined significa "não mexer"; null conta como presente mas não apaga', () => {
    expect([...PROJECT_JSON_MERGE_COLUMNS]).toEqual(['commercial_info', 'social_links', 'editorial_identity']);
    expect(mergeColumnsPresent({ name: 'a' })).toEqual([]);
    expect(mergeColumnsPresent({ commercial_info: undefined, social_links: null })).toEqual(['social_links']);
    const out = applyProjectJsonMerge({ name: 'N', social_links: null }, { social_links: realShapeSocial });
    expect(out.social_links).toEqual(realShapeSocial);
    expect(out.name).toBe('N');
  });

  it('sem linha atual, o resultado é o próprio patch (comportamento antigo só para linha inexistente)', () => {
    expect(applyProjectJsonMerge({ commercial_info: { a: 1 } }, null)).toEqual({ commercial_info: { a: 1 } });
  });

  it('outras colunas passam intactas e a entrada não é alterada', () => {
    const input = { description: 'd', editorial_identity: { primary_geo: 'SP' } };
    const out = applyProjectJsonMerge(input, { editorial_identity: realShapeEditorial });
    expect(out.description).toBe('d');
    expect(out.editorial_identity).toMatchObject({ primary_geo: 'SP', nexus_visual_policy: realShapeEditorial.nexus_visual_policy });
    expect(input.editorial_identity).toEqual({ primary_geo: 'SP' });
  });
});

// ---- hook completo, com Supabase simulado: lê a linha atual, funde e só então grava ----
const h = vi.hoisted(() => {
  const calls: Array<{ op: string; table: string; columns?: string; payload?: unknown; id?: string }> = [];
  const state = { current: {} as Record<string, unknown>, readError: null as null | { message: string }, updated: null as null | Record<string, unknown> };
  const from = vi.fn((table: string) => {
    let mode = 'select';
    let columns = '*';
    let payload: unknown;
    let id = '';
    const chain: Record<string, unknown> = {
      select(cols?: string) { if (mode === 'select') columns = cols ?? '*'; return chain; },
      update(p: unknown) { mode = 'update'; payload = p; return chain; },
      eq(_c: string, v: string) { id = v; return chain; },
      order() { return Promise.resolve({ data: [], error: null }); },
      single() {
        calls.push({ op: mode, table, columns, payload, id });
        if (mode === 'select') {
          return Promise.resolve(state.readError ? { data: null, error: state.readError } : { data: state.current, error: null });
        }
        state.updated = payload as Record<string, unknown>;
        return Promise.resolve({ data: { id, ...(payload as object) }, error: null });
      },
    };
    return chain;
  });
  return { calls, state, from };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: h.from } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { useProjects } from '@/hooks/useProjects';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const W = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
  );
  return W;
}

describe('useProjects.updateProject: fusão central', () => {
  beforeEach(() => {
    h.calls.length = 0;
    h.state.current = { commercial_info: realShapeCommercial, editorial_identity: realShapeEditorial, social_links: realShapeSocial };
    h.state.readError = null;
    h.state.updated = null;
  });
  afterEach(() => cleanup());

  it('o card de /projects não apaga mais schema_profile, nexus_visual_policy, kwai e tiktok', async () => {
    const { result } = renderHook(() => useProjects(), { wrapper: wrapper() });
    await result.current.updateProject.mutateAsync({
      id: 'p1',
      name: 'Blog',
      commercial_info: { phone: '1', whatsapp: '2', email: '3', address: '4', google_maps_url: '', default_cta_text: 'T', default_cta_url: 'U' },
      social_links: { instagram: 'i', linkedin: 'l', youtube: 'y', facebook: 'f', twitter: 't' },
      editorial_identity: { target_audience: 'a', primary_geo: 'g', author_name: 'n', author_bio: 'b' },
    });
    const saved = h.state.updated as Record<string, Record<string, unknown>>;
    expect(saved.commercial_info.schema_profile).toEqual(realShapeCommercial.schema_profile);
    expect(saved.editorial_identity.nexus_visual_policy).toEqual(realShapeEditorial.nexus_visual_policy);
    expect(saved.social_links.kwai).toBe('f');
    expect(saved.social_links.tiktok).toBe('g');
    expect(saved.commercial_info.phone).toBe('1');
    expect(saved.name).toBe('Blog');
    // ordem: primeiro lê só as três colunas, depois grava
    expect(h.calls.map((c) => c.op)).toEqual(['select', 'update']);
    expect(h.calls[0].columns).toBe('commercial_info,social_links,editorial_identity');
  });

  it('atualização sem as colunas JSON não faz leitura extra', async () => {
    const { result } = renderHook(() => useProjects(), { wrapper: wrapper() });
    await result.current.updateProject.mutateAsync({ id: 'p1', description: 'nova' });
    expect(h.calls.map((c) => c.op)).toEqual(['update']);
    expect(h.state.updated).toEqual({ description: 'nova' });
  });

  it('se a leitura da linha atual falhar, NADA é gravado', async () => {
    h.state.readError = { message: 'permission denied' };
    const { result } = renderHook(() => useProjects(), { wrapper: wrapper() });
    await expect(result.current.updateProject.mutateAsync({ id: 'p1', commercial_info: { phone: '1' } })).rejects.toBeTruthy();
    await waitFor(() => expect(result.current.updateProject.isError).toBe(true));
    expect(h.calls.map((c) => c.op)).toEqual(['select']);
    expect(h.state.updated).toBeNull();
  });
});
