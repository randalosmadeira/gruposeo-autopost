import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface NewsAgent {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  topics: string[];
  keywords: string[];
  rss_feeds: string[] | null;
  is_active: boolean;
  search_internal_links: boolean;
  cite_sources_inline: boolean;
  cite_sources_footer: boolean;
  auto_publish: boolean;
  post_type: string;
  language: string;
  country: string;
  articles_generated: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateNewsAgentInput {
  name: string;
  project_id?: string;
  topics: string[];
  keywords?: string[];
  rss_feeds?: string[];
  search_internal_links?: boolean;
  cite_sources_inline?: boolean;
  cite_sources_footer?: boolean;
  auto_publish?: boolean;
  post_type?: string;
  language?: string;
  country?: string;
}

export interface UpdateNewsAgentInput extends Partial<CreateNewsAgentInput> {
  id: string;
  is_active?: boolean;
}

export function useNewsAgents() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: agents, isLoading, error } = useQuery({
    queryKey: ['news-agents', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('news_agents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as NewsAgent[];
    },
    enabled: !!user?.id,
  });

  const createAgent = useMutation({
    mutationFn: async (input: CreateNewsAgentInput) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('news_agents')
        .insert({
          ...input,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as NewsAgent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-agents'] });
      toast({
        title: 'Agente criado!',
        description: 'O agente de notícias foi configurado com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar agente',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateAgent = useMutation({
    mutationFn: async ({ id, ...input }: UpdateNewsAgentInput) => {
      const { data, error } = await supabase
        .from('news_agents')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as NewsAgent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-agents'] });
      toast({
        title: 'Agente atualizado!',
        description: 'As configurações foram salvas.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar agente',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteAgent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('news_agents')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-agents'] });
      toast({
        title: 'Agente removido',
        description: 'O agente foi excluído com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir agente',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const toggleAgent = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('news_agents')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as NewsAgent;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['news-agents'] });
      toast({
        title: data.is_active ? 'Agente ativado' : 'Agente pausado',
        description: data.is_active 
          ? 'O agente está monitorando notícias.' 
          : 'O agente foi pausado.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao alterar status',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Stats
  const activeAgentsCount = agents?.filter(a => a.is_active).length || 0;
  const totalArticles = agents?.reduce((sum, a) => sum + (a.articles_generated || 0), 0) || 0;

  return {
    agents,
    isLoading,
    error,
    createAgent,
    updateAgent,
    deleteAgent,
    toggleAgent,
    activeAgentsCount,
    totalArticles,
  };
}
