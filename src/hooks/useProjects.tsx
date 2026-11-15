import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useNavigate } from 'react-router-dom';
import { useToast } from './use-toast';
import { retryQuery, withRetry } from '@/lib/supabase-retry';
import { applyProjectJsonMerge, mergeColumnsPresent } from '@/lib/json-merge';
import type { Json, Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type Project = Tables<'projects'> & { wordpress_credential_ref?: string | null };
type ProjectInsert = TablesInsert<'projects'>;
type ProjectUpdate = TablesUpdate<'projects'>;

export function useProjects() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
    onSuccess: (created) => {
      navigate(`/business-profile?project=${created.id}`);
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
    // editorial_identity existe no banco, mas ainda não nos tipos gerados do Supabase; declarado aqui para a fusão ser tipada.
    mutationFn: async ({ id, ...updates }: ProjectUpdate & { id: string; editorial_identity?: Json }) => {
      // commercial_info, social_links e editorial_identity são FUNDIDOS com o que já está no banco (nunca substituídos):
      // o que a tela não conhece (schema_profile, nexus_visual_policy, social_links.kwai/tiktok...) fica preservado.
      // Se a leitura da linha atual falhar, retryQuery lança e NADA é gravado (sem sobrescrever às cegas).
      const mergeColumns = mergeColumnsPresent(updates as Record<string, unknown>);
      let toSave: ProjectUpdate = updates;
      if (mergeColumns.length > 0) {
        const { data: current } = await retryQuery(() =>
          supabase
            .from('projects')
            .select(mergeColumns.join(','))
            .eq('id', id)
            .single()
        );
        toSave = applyProjectJsonMerge(updates, current as unknown as Record<string, unknown>) as ProjectUpdate;
      }
      const { data } = await retryQuery(() =>
        supabase
          .from('projects')
          .update(toSave)
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
