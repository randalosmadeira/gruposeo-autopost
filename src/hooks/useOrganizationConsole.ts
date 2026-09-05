import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CommercialPlanSummary {
  id: string;
  name: string;
  project_limit: number | null;
  article_limit_monthly: number | null;
  brand_asset_limit: number;
  byok_allowed: boolean;
  copilot_allowed: boolean;
}

export interface OrganizationSummary {
  organization_id: string;
  role: string;
  organizations: { id: string; name: string; slug: string; status: string; kind: string };
  organization_subscriptions: Array<{
    plan_id: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    commercial_plans: CommercialPlanSummary;
  }>;
}

interface MyConsoleResponse {
  success: boolean;
  membership: OrganizationSummary;
  usage: { projects: number; articles: number; brand_assets: number };
  byok: { provider: string; secret_last_four: string; status: string; updated_at: string } | null;
}

export interface ManagedOrganization {
  id: string;
  name: string;
  slug: string;
  status: string;
  kind: string;
  created_at: string;
  projects_used: number;
  articles_used: number;
  active_jobs: number;
  organization_subscriptions: Array<{
    plan_id: string;
    status: string;
    current_period_end: string;
    commercial_plans: { name: string; project_limit: number | null; article_limit_monthly: number | null };
  }>;
}

async function invokeConsole<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<T>('organization-console', { body });
  if (error) throw error;
  return data;
}

export function useOrganizationConsole() {
  return useQuery({
    queryKey: ['organization-console', 'me'],
    queryFn: () => invokeConsole<MyConsoleResponse>({ action: 'my_summary' }),
    staleTime: 60_000,
  });
}

export function useManagedOrganizations(enabled: boolean) {
  return useQuery({
    queryKey: ['organization-console', 'admin'],
    queryFn: () => invokeConsole<{ success: boolean; organizations: ManagedOrganization[] }>({ action: 'admin_summary' }),
    enabled,
    staleTime: 30_000,
  });
}

export function useOpenAIByok() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['organization-console', 'me'] });
  const setKey = useMutation({
    mutationFn: ({ organizationId, secret }: { organizationId: string; secret: string }) => invokeConsole({ action: 'set_openai_byok', organization_id: organizationId, secret }),
    onSuccess: refresh,
  });
  const deleteKey = useMutation({
    mutationFn: (organizationId: string) => invokeConsole({ action: 'delete_openai_byok', organization_id: organizationId }),
    onSuccess: refresh,
  });
  return { setKey, deleteKey };
}
