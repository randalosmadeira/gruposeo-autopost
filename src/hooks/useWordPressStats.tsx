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
      // Get project details
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', targetProjectId)
        .single();

      if (projectError) throw projectError;

      if (!project.wordpress_url || !project.wordpress_username || !project.wordpress_app_password) {
        throw new Error('WordPress credentials not configured');
      }

      // Fetch stats from WordPress REST API
      const wpUrl = project.wordpress_url.replace(/\/$/, '');
      const auth = btoa(`${project.wordpress_username}:${project.wordpress_app_password}`);

      // Fetch posts count by status
      const [publishedRes, draftRes, pendingRes, commentsRes] = await Promise.all([
        fetch(`${wpUrl}/wp-json/wp/v2/posts?status=publish&per_page=1`, {
          headers: { 'Authorization': `Basic ${auth}` }
        }),
        fetch(`${wpUrl}/wp-json/wp/v2/posts?status=draft&per_page=1`, {
          headers: { 'Authorization': `Basic ${auth}` }
        }),
        fetch(`${wpUrl}/wp-json/wp/v2/posts?status=pending&per_page=1`, {
          headers: { 'Authorization': `Basic ${auth}` }
        }),
        fetch(`${wpUrl}/wp-json/wp/v2/comments?per_page=1`, {
          headers: { 'Authorization': `Basic ${auth}` }
        })
      ]);

      const publishedTotal = parseInt(publishedRes.headers.get('X-WP-Total') || '0');
      const draftTotal = parseInt(draftRes.headers.get('X-WP-Total') || '0');
      const pendingTotal = parseInt(pendingRes.headers.get('X-WP-Total') || '0');
      const commentsTotal = parseInt(commentsRes.headers.get('X-WP-Total') || '0');

      const statsData = {
        project_id: targetProjectId,
        user_id: user!.id,
        total_articles: publishedTotal + draftTotal + pendingTotal,
        published_articles: publishedTotal,
        draft_articles: draftTotal,
        pending_articles: pendingTotal,
        total_comments: commentsTotal,
        last_sync_at: new Date().toISOString(),
      };

      // Upsert stats
      const { data: existingStats } = await supabase
        .from('wordpress_stats')
        .select('id')
        .eq('project_id', targetProjectId)
        .maybeSingle();

      if (existingStats) {
        const { error } = await supabase
          .from('wordpress_stats')
          .update(statsData)
          .eq('id', existingStats.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('wordpress_stats')
          .insert(statsData);
        if (error) throw error;
      }

      return statsData;
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
