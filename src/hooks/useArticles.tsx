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
          *,
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
  });

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
