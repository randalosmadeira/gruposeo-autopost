import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useAdminAccess() {
  const { user, loading: authLoading } = useAuth();
  const query = useQuery({
    queryKey: ['access', 'is-ceo', user?.id],
    enabled: Boolean(user?.id) && !authLoading,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_ceo');
      if (error) throw error;
      return data === true;
    },
  });

  return {
    isAdmin: query.data === true,
    loading: authLoading || (Boolean(user?.id) && query.isLoading),
    error: query.error,
  };
}
