import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationConsole } from '@/hooks/useOrganizationConsole';
import { DEFAULT_COMPLIANCE_MODE, normalizeComplianceMode, type ComplianceMode } from '@/lib/compliance-mode';

// `organizations` ainda não consta nos tipos gerados do Supabase; o contrato mínimo usado aqui fica explícito.
type OrganizationsTable = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: () => PromiseLike<{ data: { compliance_mode?: unknown } | null; error: { message?: string } | null }>;
    };
  };
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => {
      select: (columns: string) => PromiseLike<{ data: Array<{ compliance_mode?: unknown }> | null; error: { message?: string } | null }>;
    };
  };
};

const organizations = () => (supabase as unknown as { from: (table: string) => OrganizationsTable }).from('organizations');

export const COMPLIANCE_MODE_QUERY_KEY = 'compliance-mode';

/**
 * Modo de conformidade da organização do usuário. Enquanto carrega, em erro ou com a migração ainda não
 * aplicada, o valor é o padrão 'advisory' (nunca bloqueia). `canChange` é só conveniência de tela: quem
 * decide é a política de UPDATE de `organizations` (owner/admin).
 */
export function useComplianceMode() {
  const queryClient = useQueryClient();
  const { data: consoleData, isLoading: consoleLoading } = useOrganizationConsole();
  const organizationId = consoleData?.membership?.organization_id ?? null;
  const role = consoleData?.membership?.role ?? '';

  const query = useQuery({
    queryKey: [COMPLIANCE_MODE_QUERY_KEY, organizationId],
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    queryFn: async (): Promise<ComplianceMode> => {
      const { data, error } = await organizations().select('compliance_mode').eq('id', organizationId as string).maybeSingle();
      if (error) return DEFAULT_COMPLIANCE_MODE;
      return normalizeComplianceMode(data?.compliance_mode);
    },
  });

  const setMode = useMutation({
    mutationFn: async (next: ComplianceMode) => {
      const { data, error } = await organizations().update({ compliance_mode: next }).eq('id', organizationId as string).select('compliance_mode');
      if (error) throw new Error(error.message || 'Não foi possível salvar o modo de verificação.');
      // A política de UPDATE filtra em silêncio quem não é owner/admin: nenhuma linha alterada.
      if (!data?.length) throw new Error('Apenas o dono ou o administrador da organização pode alterar este modo.');
      return normalizeComplianceMode(data[0]?.compliance_mode);
    },
    onSuccess: (saved) => queryClient.setQueryData([COMPLIANCE_MODE_QUERY_KEY, organizationId], saved),
  });

  return {
    mode: query.data ?? DEFAULT_COMPLIANCE_MODE,
    isLoading: consoleLoading || (Boolean(organizationId) && query.isLoading),
    organizationId,
    canChange: ['owner', 'admin'].includes(role),
    setMode,
  };
}
