import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';

type UserSettings = Tables<'user_settings'>;
type UserSettingsUpdate = TablesUpdate<'user_settings'>;

export function useSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['settings', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as UserSettings | null;
    },
    enabled: !!user,
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Omit<UserSettingsUpdate, 'user_id'>) => {
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('user_settings')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({
        title: 'Configurações salvas!',
        description: 'Suas preferências foram atualizadas.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao salvar configurações',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Check if APIs are configured
  const apiStatus = {
    openai: !!settings?.openai_api_key,
    anthropic: !!settings?.anthropic_api_key,
    serper: !!settings?.serper_api_key,
  };

  return {
    settings,
    isLoading,
    error,
    apiStatus,
    updateSettings,
  };
}
