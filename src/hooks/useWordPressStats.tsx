import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface WordPressStats {
  id: string;
  project_id: string;
  user_id: string;
  total_articles: number;
  published_articles: number;
  draft_articles: number;
  pending_articles: number;
  synced_articles: number;
  sync_errors: number;
  last_sync_at: string | null;
  articles_needing_attention: number;
  missing_featured_images: number;
  seo_issues: number;
  broken_links: number;
  total_internal_links: number;
  articles_without_links: number;
  total_comments: number;
  pending_comments: number;
  approved_comments: number;
  publishing_trend: { date: string; count: number }[];
  auto_corrections_applied: number;
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function useWordPressStats(projectId?: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['wordpress-stats', projectId],
    queryFn: async () => {
      if (!user || !projectId) return null;

      const { data, error } = await supabase
        .from('wordpress_stats')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error) throw error;
      
      // Parse publishing_trend from JSONB
      if (data) {
        return {
          ...data,
          publishing_trend: Array.isArray(data.publishing_trend) 
            ? data.publishing_trend 
            : []
        } as WordPressStats;
      }
      
      return null;
    },
    enabled: !!user && !!projectId,
  });

  const { data: allStats, isLoading: allLoading } = useQuery({
    queryKey: ['wordpress-stats-all'],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('wordpress_stats')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      return (data || []).map(stat => ({
        ...stat,
        publishing_trend: Array.isArray(stat.publishing_trend) 
          ? stat.publishing_trend 
          : []
      })) as WordPressStats[];
    },
    enabled: !!user,
  });

  const syncMutation = useMutation({
    mutationFn: async (targetProjectId: string) => {
      // S1: a senha do WordPress não chega mais ao navegador, então a leitura direta
      // (navegador -> WordPress com a senha) foi desligada. As estatísticas chegam pelo plugin
      // Zica Posts (função sync-wordpress-stats), que as envia sozinho.
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id,wordpress_url,wordpress_username,wordpress_has_credential')
        .eq('id', targetProjectId)
        .single();

      if (projectError) throw projectError;

      if (!project.wordpress_url || !project.wordpress_username || !project.wordpress_has_credential) {
        throw new Error('As credenciais do WordPress ainda não foram configuradas neste projeto.');
      }

      throw new Error(
        'A atualização manual pelo navegador foi desligada por segurança (a senha do WordPress não sai mais do servidor). ' +
        'As estatísticas chegam sozinhas pelo plugin Zica Posts; use "Sincronizar" no painel do plugin dentro do WordPress.'
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wordpress-stats'] });
      queryClient.invalidateQueries({ queryKey: ['wordpress-stats-all'] });
      toast({
        title: 'Sincronização concluída',
        description: 'Estatísticas do WordPress atualizadas com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro na sincronização',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    stats,
    allStats: allStats || [],
    isLoading,
    allLoading,
    refetch,
    syncStats: syncMutation.mutate,
    isSyncing: syncMutation.isPending,
  };
}
