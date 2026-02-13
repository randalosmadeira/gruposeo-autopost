import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import { retryQuery, withRetry } from '@/lib/supabase-retry';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type Project = Tables<'projects'>;
type ProjectInsert = TablesInsert<'projects'>;
type ProjectUpdate = TablesUpdate<'projects'>;

export function useProjects() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await retryQuery(() =>
        supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false })
      );
      return data as Project[];
    },
    enabled: !!user,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  const createProject = useMutation({
    mutationFn: async (project: Omit<ProjectInsert, 'user_id'>) => {
      if (!user) throw new Error('User not authenticated');
      
      const { data } = await retryQuery(() =>
        supabase
          .from('projects')
          .insert({ ...project, user_id: user.id })
          .select()
          .single()
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({
        title: 'Projeto criado!',
        description: 'Seu novo projeto foi criado com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar projeto',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateProject = useMutation({
    mutationFn: async ({ id, ...updates }: ProjectUpdate & { id: string }) => {
      const { data } = await retryQuery(() =>
        supabase
          .from('projects')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({
        title: 'Projeto atualizado!',
        description: 'As alterações foram salvas.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar projeto',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      await withRetry(async () => {
        const { error } = await supabase
          .from('projects')
          .delete()
          .eq('id', id);
        if (error) throw error;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({
        title: 'Projeto excluído',
        description: 'O projeto foi removido.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir projeto',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    projects: projects ?? [],
    isLoading,
    error,
    createProject,
    updateProject,
    deleteProject,
  };
}
