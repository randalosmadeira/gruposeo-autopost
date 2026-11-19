import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';
import { hiddenModules, type ModuleDecisionRow } from '@/lib/module-visibility';

type Db = { from: (table: string) => { select: (cols: string) => { eq: (col: string, value: boolean) => Promise<{ data: ModuleDecisionRow[] | null; error: unknown }> } } };

export const HIDDEN_MODULES_KEY = ['project-modules-disabled'] as const;

/** Módulos que somem do menu: desligados em TODOS os projetos da pessoa. Se a leitura falhar, nada some (o menu completo é o seguro). */
export function useHiddenModules(): ReadonlySet<string> {
  const { user } = useAuth();
  const { projects } = useProjects();
  const { data } = useQuery({
    queryKey: [...HIDDEN_MODULES_KEY, user?.id],
    enabled: !!user,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data: rows, error } = await (supabase as unknown as Db).from('project_modules').select('project_id,module_code,enabled').eq('enabled', false);
      if (error) throw error;
      return rows || [];
    },
  });
  const ids = (projects || []).map((p) => p.id).join(',');
  return useMemo(() => hiddenModules(ids ? ids.split(',') : [], data || []), [ids, data]);
}
