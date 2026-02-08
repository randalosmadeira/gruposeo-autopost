import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface MonitoredPortal {
  id: string;
  user_id: string;
  project_id: string | null;
  portal_name: string;
  portal_url: string;
  portal_domain: string;
  rss_feed_url: string | null;
  niches: string[];
  preferred_keywords: string[];
  excluded_keywords: string[];
  article_length: 'short' | 'medium' | 'long';
  default_angle: string | null;
  custom_slug_prefix: string | null;
  auto_title: boolean;
  auto_meta_description: boolean;
  preserve_original_seo: boolean;
  seo_preservation_percent: number;
  is_active: boolean;
  monitoring_frequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  active_hours: string[];
  active_days: string[];
  max_articles_per_day: number;
  next_check_at: string | null;
  auto_publish: boolean;
  publish_delay_minutes: number;
  update_sitemap: boolean;
  sitemap_priority: number;
  articles_generated: number;
  last_check_at: string | null;
  last_article_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePortalInput {
  portal_name: string;
  portal_url: string;
  project_id?: string;
  rss_feed_url?: string;
  niches?: string[];
  preferred_keywords?: string[];
  excluded_keywords?: string[];
  article_length?: 'short' | 'medium' | 'long';
  default_angle?: string;
  custom_slug_prefix?: string;
  auto_title?: boolean;
  auto_meta_description?: boolean;
  preserve_original_seo?: boolean;
  seo_preservation_percent?: number;
  is_active?: boolean;
  monitoring_frequency?: 'realtime' | 'hourly' | 'daily' | 'weekly';
  active_hours?: string[];
  active_days?: string[];
  max_articles_per_day?: number;
  auto_publish?: boolean;
  publish_delay_minutes?: number;
  update_sitemap?: boolean;
  sitemap_priority?: number;
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function useMonitoredPortals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: portals, isLoading, error } = useQuery({
    queryKey: ['monitored-portals', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('monitored_portals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as MonitoredPortal[];
    },
    enabled: !!user?.id,
  });

  const createPortal = useMutation({
    mutationFn: async (input: CreatePortalInput) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const portal_domain = extractDomain(input.portal_url);

      const { data, error } = await supabase
        .from('monitored_portals')
        .insert({
          user_id: user.id,
          portal_name: input.portal_name,
          portal_url: input.portal_url.startsWith('http') ? input.portal_url : `https://${input.portal_url}`,
          portal_domain,
          project_id: input.project_id || null,
          rss_feed_url: input.rss_feed_url || null,
          niches: input.niches || [],
          preferred_keywords: input.preferred_keywords || [],
          excluded_keywords: input.excluded_keywords || [],
          article_length: input.article_length || 'medium',
          default_angle: input.default_angle || null,
          custom_slug_prefix: input.custom_slug_prefix || null,
          auto_title: input.auto_title ?? true,
          auto_meta_description: input.auto_meta_description ?? true,
          preserve_original_seo: input.preserve_original_seo ?? true,
          seo_preservation_percent: input.seo_preservation_percent ?? 95,
          is_active: input.is_active ?? true,
          monitoring_frequency: input.monitoring_frequency || 'hourly',
          active_hours: input.active_hours || ['00:00', '23:59'],
          active_days: input.active_days || ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'],
          max_articles_per_day: input.max_articles_per_day ?? 5,
          auto_publish: input.auto_publish ?? false,
          publish_delay_minutes: input.publish_delay_minutes ?? 0,
          update_sitemap: input.update_sitemap ?? true,
          sitemap_priority: input.sitemap_priority ?? 0.8,
        })
        .select()
        .single();

      if (error) throw error;
      return data as MonitoredPortal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitored-portals'] });
      toast({
        title: 'Portal adicionado!',
        description: 'O portal será monitorado automaticamente.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao adicionar portal',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const updatePortal = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MonitoredPortal> & { id: string }) => {
      const { data, error } = await supabase
        .from('monitored_portals')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as MonitoredPortal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitored-portals'] });
      toast({
        title: 'Portal atualizado!',
        description: 'As configurações foram salvas.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar portal',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const deletePortal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('monitored_portals')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitored-portals'] });
      toast({
        title: 'Portal removido',
        description: 'O portal não será mais monitorado.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao remover portal',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const toggleActive = useCallback(async (id: string, isActive: boolean) => {
    await updatePortal.mutateAsync({ id, is_active: isActive });
  }, [updatePortal]);

  return {
    portals: portals || [],
    isLoading,
    error,
    createPortal: createPortal.mutateAsync,
    updatePortal: updatePortal.mutateAsync,
    deletePortal: deletePortal.mutateAsync,
    toggleActive,
    isCreating: createPortal.isPending,
    isUpdating: updatePortal.isPending,
    isDeleting: deletePortal.isPending,
  };
}
