import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  role: 'owner',
  selectResult: { data: { compliance_mode: 'strict' } as { compliance_mode?: unknown } | null, error: null as { message?: string } | null },
  updateResult: { data: [{ compliance_mode: 'off' }] as Array<{ compliance_mode?: unknown }> | null, error: null as { message?: string } | null },
  updateValues: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(table === 'organizations' ? h.selectResult : { data: null, error: null }) }) }),
      update: (values: Record<string, unknown>) => { h.updateValues(values); return { eq: () => ({ select: () => Promise.resolve(h.updateResult) }) }; },
    }),
  },
}));
vi.mock('@/hooks/useOrganizationConsole', () => ({
  useOrganizationConsole: () => ({ isLoading: false, data: { membership: { organization_id: 'org-1', role: h.role } } }),
}));

import { useComplianceMode } from '@/hooks/useComplianceMode';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  h.role = 'owner';
  h.selectResult = { data: { compliance_mode: 'strict' }, error: null };
  h.updateResult = { data: [{ compliance_mode: 'off' }], error: null };
  h.updateValues.mockReset();
});

describe('useComplianceMode', () => {
  it('lê o modo da organização', async () => {
    const { result } = renderHook(() => useComplianceMode(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.mode).toBe('strict'));
    expect(result.current.canChange).toBe(true);
  });

  it('erro de leitura (ex.: migração ainda não aplicada) cai em advisory', async () => {
    h.selectResult = { data: null, error: { message: 'column organizations.compliance_mode does not exist' } };
    const { result } = renderHook(() => useComplianceMode(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mode).toBe('advisory');
  });

  it('só owner e admin aparecem como podendo alterar', async () => {
    h.role = 'editor';
    const { result } = renderHook(() => useComplianceMode(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canChange).toBe(false);
  });

  it('grava só compliance_mode e atualiza o valor em cache', async () => {
    const { result } = renderHook(() => useComplianceMode(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.mode).toBe('strict'));
    await act(async () => { await result.current.setMode.mutateAsync('off'); });
    expect(h.updateValues).toHaveBeenCalledWith({ compliance_mode: 'off' });
    await waitFor(() => expect(result.current.mode).toBe('off'));
  });

  it('nenhuma linha alterada (política de UPDATE recusou) vira erro claro, não sucesso silencioso', async () => {
    h.updateResult = { data: [], error: null };
    const { result } = renderHook(() => useComplianceMode(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await expect(result.current.setMode.mutateAsync('off')).rejects.toThrow(/dono ou o administrador/);
  });
});
