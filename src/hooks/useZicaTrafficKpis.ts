import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

type ArticleMetricRow = {
  status: string | null;
  indexing_status: string | null;
  indexing_submitted_at: string | null;
  indexed_confirmed_at: string | null;
  llm_visibility_score: number | null;
  semantic_authority_score: number | null;
  traffic_wave_status: string | null;
};

export type ZicaTrafficKpis = {
  totalWaves: number;
  published: number;
  activeWaves: number;
  indexingSubmitted: number;
  indexingConfirmed: number;
  avgLlmVisibility: number | null;
  avgSemanticAuthority: number | null;
  llmAuditedArticles: number;
};

const average = (values: number[]) => {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

export function useZicaTrafficKpis() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['zica-traffic-kpis', user?.id],
    enabled: !!user?.id,
    staleTime: 20_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ZicaTrafficKpis> => {
      if (!user?.id) {
        return {
          totalWaves: 0,
          published: 0,
          activeWaves: 0,
          indexingSubmitted: 0,
          indexingConfirmed: 0,
          avgLlmVisibility: null,
          avgSemanticAuthority: null,
          llmAuditedArticles: 0,
        };
      }

      // `as any` is intentional until generated Supabase types include the new
      // observability columns added by the Zica.ai neural metrics migration.
      const { data, error } = await (supabase as any)
        .from('articles')
        .select(
          'status,indexing_status,indexing_submitted_at,indexed_confirmed_at,llm_visibility_score,semantic_authority_score,traffic_wave_status',
        )
        .eq('user_id', user.id);

      if (error) throw error;

      const rows = (data || []) as ArticleMetricRow[];
      const llmScores = rows
        .map((row) => row.llm_visibility_score)
        .filter((value): value is number => typeof value === 'number');
      const semanticScores = rows
        .map((row) => row.semantic_authority_score)
        .filter((value): value is number => typeof value === 'number');

      return {
        totalWaves: rows.length,
        published: rows.filter((row) => row.status === 'published').length,
        activeWaves: rows.filter((row) => row.traffic_wave_status === 'active').length,
        indexingSubmitted: rows.filter(
          (row) => row.indexing_status === 'submitted' || !!row.indexing_submitted_at,
        ).length,
        indexingConfirmed: rows.filter(
          (row) => row.indexing_status === 'confirmed' || !!row.indexed_confirmed_at,
        ).length,
        avgLlmVisibility: average(llmScores),
        avgSemanticAuthority: average(semanticScores),
        llmAuditedArticles: rows.filter(
          (row) => typeof row.llm_visibility_score === 'number' || typeof row.semantic_authority_score === 'number',
        ).length,
      };
    },
  });
}
