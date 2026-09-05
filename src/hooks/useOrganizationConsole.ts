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
  active?: boolean;
  price_cents: number | null;
  currency: string;
  billing_cycle: BillingCycle;
  overage_policy: OveragePolicy;
  overage_unit_cents: number | null;
  overage_grace_articles: number;
}

export type BillingCycle = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type OveragePolicy = 'block' | 'per_article' | 'package';
export type OrganizationRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'campaign_manager';

export interface OrganizationOperatingPolicy {
  price_cents: number | null;
  currency: string;
  billing_cycle: BillingCycle;
  project_limit_override: number | null;
  article_limit_monthly_override: number | null;
  overage_policy: OveragePolicy;
  overage_unit_cents: number | null;
  overage_grace_articles: number;
  publication_approval_required: boolean;
  publisher_roles: OrganizationRole[];
  approver_roles: OrganizationRole[];
  allow_automated_publish: boolean;
  version: number;
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
    commercial_plans: CommercialPlanSummary;
  }>;
  organization_operating_policies: OrganizationOperatingPolicy[];
}

export interface AdminSummaryResponse {
  success: boolean;
  organizations: ManagedOrganization[];
  plans: CommercialPlanSummary[];
}

export interface BusinessConfigResponse {
  success: boolean;
  organization: {
    id: string; name: string; slug: string; status: string; kind: string;
    organization_subscriptions: Array<{ plan_id: string; status: string; current_period_start: string; current_period_end: string }> | Record<string, unknown>;
    organization_operating_policies: OrganizationOperatingPolicy[] | OrganizationOperatingPolicy;
  };
  plans: CommercialPlanSummary[];
  versions: Array<{ version: number; changed_at: string; changed_by: string | null }>;
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
    queryFn: () => invokeConsole<AdminSummaryResponse>({ action: 'admin_summary' }),
    enabled,
    staleTime: 30_000,
  });
}

export function useBusinessConfig(organizationId: string | null) {
  return useQuery({
    queryKey: ['organization-console', 'business-config', organizationId],
    queryFn: () => invokeConsole<BusinessConfigResponse>({ action: 'business_config', organization_id: organizationId }),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });
}

export function useCommercialPolicyMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['organization-console'] });
  const updatePlan = useMutation({ mutationFn: (payload: Record<string, unknown>) => invokeConsole({ action: 'update_plan_terms', ...payload }), onSuccess: refresh });
  const updateOrganization = useMutation({ mutationFn: (payload: Record<string, unknown>) => invokeConsole({ action: 'update_organization_policy', ...payload }), onSuccess: refresh });
  return { updatePlan, updateOrganization };
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
