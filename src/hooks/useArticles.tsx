import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type Article = Tables<'articles'>;
type ArticleInsert = TablesInsert<'articles'>;
type ArticleUpdate = TablesUpdate<'articles'>;

export function useArticles(projectId?: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: articles, isLoading, error } = useQuery({
    queryKey: ['articles', user?.id, projectId],
    queryFn: async () => {
      if (!user) return [];
      
      let query = supabase
        .from('articles')
        .select(`
          id,
          keyword,
          title,
          status,
          type,
          slug,
          excerpt,
          featured_image_url,
          seo_score,
          word_count,
          project_id,
          published_at,
          published_url,
          scheduled_at,
          secondary_keywords,
          config,
          error_message,
          emotional_trigger,
          emotional_confidence,
          created_at,
          updated_at,
          user_id,
          projects (
            id,
            name,
            domain
          )
        `)
        .order('created_at', { ascending: false });
      
      if (projectId) {
        query = query.eq('project_id', projectId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    // Refetch frequently to catch status changes instantly
    refetchInterval: 3000, // Every 3 seconds
    staleTime: 1000, // Consider data stale after 1 second
  });

  // Real-time subscription for instant updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('articles-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'articles',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Invalidate queries to refetch data on realtime update
          queryClient.invalidateQueries({ queryKey: ['articles'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const createArticle = useMutation({
    mutationFn: async (article: Omit<ArticleInsert, 'user_id'>) => {
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('articles')
        .insert({ ...article, user_id: user.id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      toast({
        title: 'Artigo criado!',
        description: 'O artigo foi salvo como rascunho.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar artigo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateArticle = useMutation({
    mutationFn: async ({ id, ...updates }: ArticleUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('articles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      toast({
        title: 'Artigo atualizado!',
        description: 'As alterações foram salvas.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar artigo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteArticle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('articles')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      toast({
        title: 'Artigo excluído',
        description: 'O artigo foi removido.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir artigo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Stats for dashboard
  const stats = {
    total: articles?.length ?? 0,
    published: articles?.filter(a => a.status === 'published').length ?? 0,
    ready: articles?.filter(a => a.status === 'ready').length ?? 0,
    draft: articles?.filter(a => a.status === 'draft').length ?? 0,
  };

  return {
    articles: articles ?? [],
    isLoading,
    error,
    stats,
    createArticle,
    updateArticle,
    deleteArticle,
  };
}

export function useArticle(id: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['article', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select(`
          *,
          projects (
            id,
            name,
            domain
          )
        `)
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!id,
  });
}
