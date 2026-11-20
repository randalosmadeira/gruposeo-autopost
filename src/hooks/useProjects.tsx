import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useNavigate } from 'react-router-dom';
import { useToast } from './use-toast';
import { retryQuery } from '@/lib/supabase-retry';
import { PROJECT_COLUMNS, type ProjectLifecycleStatus } from '@/lib/project-columns';
import { callLifecycle, lifecycleErrorMessage } from '@/lib/project-center-api';
import { applyProjectJsonMerge, mergeColumnsPresent } from '@/lib/json-merge';
import type { Json, Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type Project = Tables<'projects'> & {
  wordpress_credential_ref?: string | null; wordpress_connector_mode?: string | null;
  /** Ciclo de vida (Central de Projetos). Ausente = 'ativo' (migração ainda não aplicada). */
  lifecycle_status?: ProjectLifecycleStatus; archived_at?: string | null; paused_reason?: string | null;
};
type Lifecycle = { lifecycle_status: ProjectLifecycleStatus; archived_at: string | null; paused_reason: string | null };

/** Lê o ciclo de vida à parte: se a migração ainda não existe (ou a leitura falha), todos os projetos contam como ativos. */
async function fetchLifecycle(): Promise<Map<string, Lifecycle>> {
  const out = new Map<string, Lifecycle>();
  try {
    const res = (await supabase.from('projects').select('id,lifecycle_status,archived_at,paused_reason' as never)) as unknown as { data?: Array<Lifecycle & { id: string }>; error?: unknown };
    if (res?.error || !Array.isArray(res?.data)) return out;
    for (const r of res.data) out.set(r.id, { lifecycle_status: r.lifecycle_status === 'arquivado' || r.lifecycle_status === 'pausado' ? r.lifecycle_status : 'ativo', archived_at: r.archived_at ?? null, paused_reason: r.paused_reason ?? null });
  } catch { /* sem a migração: tudo ativo */ }
  return out;
}
type ProjectInsert = TablesInsert<'projects'>;
type ProjectUpdate = TablesUpdate<'projects'>;

/** `includeArchived`: por padrão os projetos arquivados ficam de fora de listas e seletores. */
export function useProjects(options: { includeArchived?: boolean } = {}) {
  const includeArchived = options.includeArchived === true;
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
          .select(PROJECT_COLUMNS)
          .order('created_at', { ascending: false })
      );
      const lifecycle = await fetchLifecycle();
      return (data as unknown as Project[]).map((p) => ({ ...p, ...(lifecycle.get(p.id) ?? { lifecycle_status: 'ativo' as const, archived_at: null, paused_reason: null }) }));
    },
    enabled: !!user,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  // Mesma referência enquanto os dados não mudam (várias telas usam `projects` como dependência de efeito).
  const visibleProjects = useMemo(() => (projects ?? []).filter((p) => includeArchived || p.lifecycle_status !== 'arquivado'), [projects, includeArchived]);

  const createProject = useMutation({
    mutationFn: async (project: Omit<ProjectInsert, 'user_id'>) => {
      if (!user) throw new Error('User not authenticated');
      
      const { data } = await retryQuery(() =>
        supabase
          .from('projects')
          .insert({ ...project, user_id: user.id })
          .select(PROJECT_COLUMNS)
          .single()
      );
      return data as unknown as Project;
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
          .select(PROJECT_COLUMNS)
          .single()
      );
      return data as unknown as Project;
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

  // Nunca mais excluir direto: arquivar é reversível (Restaurar na Central de Projetos); a exclusão definitiva só passa pela Central.
  const archiveProject = useMutation({
    mutationFn: async (id: string) => callLifecycle<{ lifecycle_status: string }>('archive', { projectId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-center'] });
      toast({
        title: 'Projeto arquivado',
        description: 'Ele saiu das listas, mas nada foi apagado. Restaure ou exclua definitivamente na Central de Projetos.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Não consegui arquivar o projeto',
        description: lifecycleErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  return {
    projects: visibleProjects,
    isLoading,
    error,
    createProject,
    updateProject,
    archiveProject,
  };
}
