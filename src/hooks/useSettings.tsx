import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import type { TablesUpdate } from '@/integrations/supabase/types';

// Type for the secure view that doesn't expose API keys
interface UserSettingsSafe {
  id: string;
  user_id: string;
  default_language: string | null;
  default_tone: string | null;
  default_point_of_view: string | null;
  ai_provider: string | null;
  timezone: string | null;
  email_notifications: boolean | null;
  byok_enabled: boolean | null;
  title_model: string | null;
  content_model: string | null;
  image_model: string | null;
  default_ai_model: string | null;
  created_at: string;
  updated_at: string;
  // Boolean flags instead of actual API keys
  has_openai_key: boolean;
  has_anthropic_key: boolean;
  has_serper_key: boolean;
  has_gemini_key: boolean;
}

type UserSettingsUpdate = TablesUpdate<'user_settings'>;

export function useSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['settings', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      // Use the secure view that doesn't expose API keys
      const { data, error } = await supabase
        .from('user_settings_safe')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as UserSettingsSafe | null;
    },
    enabled: !!user,
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Omit<UserSettingsUpdate, 'user_id'>) => {
      if (!user) throw new Error('User not authenticated');
      
      // Updates go directly to the table (not the view)
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

  // Check if APIs are configured using boolean flags from secure view
  const apiStatus = {
    openai: settings?.has_openai_key ?? false,
    anthropic: settings?.has_anthropic_key ?? false,
    serper: settings?.has_serper_key ?? false,
    gemini: settings?.has_gemini_key ?? false,
  };

  return {
    settings,
    isLoading,
    error,
    apiStatus,
    updateSettings,
  };
}
