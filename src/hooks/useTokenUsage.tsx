import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface TokenUsageLog {
  id: string;
  user_id: string;
  article_id: string | null;
  provider: 'openai' | 'gemini';
  model: string;
  operation: 'title' | 'content' | 'image' | 'outline' | 'secondary_keywords' | 'other';
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UsageSummary {
  totalTokens: number;
  totalCostUsd: number;
  totalRequests: number;
  byProvider: {
    openai: { tokens: number; cost: number; requests: number };
    gemini: { tokens: number; cost: number; requests: number };
  };
  byOperation: Record<string, { tokens: number; cost: number; requests: number }>;
  dailyUsage: Array<{
    date: string;
    tokens: number;
    cost: number;
    requests: number;
  }>;
}

export function useTokenUsage(days: number = 30) {
  const { user } = useAuth();

  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['token-usage', user?.id, days],
    queryFn: async () => {
      if (!user) return [];
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data, error } = await supabase
        .from('token_usage_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as TokenUsageLog[];
    },
    enabled: !!user,
    staleTime: 60 * 1000, // 1 minute
  });

  // Calculate summary statistics
  const summary: UsageSummary = logs?.reduce((acc, log) => {
    // Total
    acc.totalTokens += log.total_tokens;
    acc.totalCostUsd += Number(log.estimated_cost_usd);
    acc.totalRequests += 1;
    
    // By provider
    if (log.provider === 'openai') {
      acc.byProvider.openai.tokens += log.total_tokens;
      acc.byProvider.openai.cost += Number(log.estimated_cost_usd);
      acc.byProvider.openai.requests += 1;
    } else {
      acc.byProvider.gemini.tokens += log.total_tokens;
      acc.byProvider.gemini.cost += Number(log.estimated_cost_usd);
      acc.byProvider.gemini.requests += 1;
    }
    
    // By operation
    if (!acc.byOperation[log.operation]) {
      acc.byOperation[log.operation] = { tokens: 0, cost: 0, requests: 0 };
    }
    acc.byOperation[log.operation].tokens += log.total_tokens;
    acc.byOperation[log.operation].cost += Number(log.estimated_cost_usd);
    acc.byOperation[log.operation].requests += 1;
    
    // Daily usage
    const dateKey = log.created_at.split('T')[0];
    const dayEntry = acc.dailyUsage.find(d => d.date === dateKey);
    if (dayEntry) {
      dayEntry.tokens += log.total_tokens;
      dayEntry.cost += Number(log.estimated_cost_usd);
      dayEntry.requests += 1;
    } else {
      acc.dailyUsage.push({
        date: dateKey,
        tokens: log.total_tokens,
        cost: Number(log.estimated_cost_usd),
        requests: 1,
      });
    }
    
    return acc;
  }, {
    totalTokens: 0,
    totalCostUsd: 0,
    totalRequests: 0,
    byProvider: {
      openai: { tokens: 0, cost: 0, requests: 0 },
      gemini: { tokens: 0, cost: 0, requests: 0 },
    },
    byOperation: {},
    dailyUsage: [],
  } as UsageSummary) || {
    totalTokens: 0,
    totalCostUsd: 0,
    totalRequests: 0,
    byProvider: {
      openai: { tokens: 0, cost: 0, requests: 0 },
      gemini: { tokens: 0, cost: 0, requests: 0 },
    },
    byOperation: {},
    dailyUsage: [],
  };

  // Sort daily usage by date
  summary.dailyUsage.sort((a, b) => a.date.localeCompare(b.date));

  return {
    logs,
    summary,
    isLoading,
    error,
  };
}
