import { useCallback } from 'react';
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
  rss_feed_validation?: Record<string, unknown> | null;
  rss_feed_validated_at?: string | null;
  automation_mode?: 'manual' | 'assisted' | 'ai_95';
  last_ai_profile?: Record<string, any> | null;
  last_ai_confidence?: number | null;
  last_articles_found?: number;
  last_success_at?: string | null;
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
  automation_mode?: 'manual' | 'assisted' | 'ai_95';
  monitoring_frequency?: 'realtime' | 'hourly' | 'daily' | 'weekly';
  max_articles_per_day?: number;
  auto_publish?: boolean;
  is_active?: boolean;
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
  active_hours?: string[];
  active_days?: string[];
  publish_delay_minutes?: number;
  update_sitemap?: boolean;
  sitemap_priority?: number;
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function extractDomain(url: string): string {
  try { return new URL(normalizeUrl(url)).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function useMonitoredPortals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: portals, isLoading, error } = useQuery({
    queryKey: ['monitored-portals', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from('monitored_portals').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data as MonitoredPortal[];
    },
    enabled: !!user?.id,
  });

  const createPortal = useMutation({
    mutationFn: async (input: CreatePortalInput) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      if (!input.portal_name?.trim() || !input.portal_url?.trim()) throw new Error('Nome e URL do portal são obrigatórios');
      if ((input.automation_mode || 'ai_95') === 'ai_95' && !input.project_id) throw new Error('Selecione o projeto WordPress de destino para automação IA 95%');
      const portalUrl = normalizeUrl(input.portal_url);
      const { data, error } = await supabase.from('monitored_portals').insert({
        user_id: user.id,
        portal_name: input.portal_name.trim(),
        portal_url: portalUrl,
        portal_domain: extractDomain(portalUrl),
        project_id: input.project_id || null,
        rss_feed_url: input.rss_feed_url?.trim() || null,
        automation_mode: input.automation_mode || 'ai_95',
        niches: input.niches || [],
        preferred_keywords: input.preferred_keywords || [],
        excluded_keywords: input.excluded_keywords || [],
        article_length: input.article_length || 'medium',
        default_angle: input.default_angle || 'AUTO_SEMANTIC',
        custom_slug_prefix: input.custom_slug_prefix || null,
        auto_title: input.auto_title ?? true,
        auto_meta_description: input.auto_meta_description ?? true,
        preserve_original_seo: input.preserve_original_seo ?? false,
        seo_preservation_percent: input.seo_preservation_percent ?? 0,
        is_active: input.is_active ?? true,
        monitoring_frequency: input.monitoring_frequency || 'hourly',
        active_hours: input.active_hours || ['00:00', '23:59'],
        active_days: input.active_days || ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'],
        max_articles_per_day: input.max_articles_per_day ?? 5,
        auto_publish: input.auto_publish ?? true,
        publish_delay_minutes: input.publish_delay_minutes ?? 0,
        update_sitemap: input.update_sitemap ?? true,
        sitemap_priority: input.sitemap_priority ?? 0.8,
        next_check_at: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      return data as MonitoredPortal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitored-portals'] });
      toast({ title: 'Portal adicionado', description: 'RSS e parâmetros editoriais serão determinados e validados automaticamente.' });
    },
    onError: (error) => toast({ title: 'Erro ao adicionar portal', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' }),
  });

  const updatePortal = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MonitoredPortal> & { id: string }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      const { data, error } = await supabase.from('monitored_portals').update(updates).eq('id', id).eq('user_id', user.id).select().single();
      if (error) throw error;
      return data as MonitoredPortal;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitored-portals'] }),
    onError: (error) => toast({ title: 'Erro ao atualizar portal', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' }),
  });

  const deletePortal = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      const { error } = await supabase.from('monitored_portals').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitored-portals'] });
      toast({ title: 'Portal removido', description: 'O portal não será mais monitorado.' });
    },
    onError: (error) => toast({ title: 'Erro ao remover portal', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' }),
  });

  const toggleActive = useCallback(async (id: string, isActive: boolean) => {
    await updatePortal.mutateAsync({ id, is_active: isActive, next_check_at: isActive ? new Date().toISOString() : null });
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
