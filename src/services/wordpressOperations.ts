import { supabase } from '@/integrations/supabase/client';

export type WordPressOperationStatus = 'scheduled' | 'pending' | 'processing' | 'retry' | 'completed' | 'failed' | 'cancelled';

export interface WordPressOperation {
  id: string;
  user_id: string;
  project_id: string;
  article_id: string | null;
  operation_type: 'publish' | 'draft' | 'sync';
  status: WordPressOperationStatus;
  scheduled_at: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  result: Record<string, unknown> | null;
  correlation_id: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  articles?: { title?: string | null } | null;
  projects?: { name?: string | null } | null;
}

export interface WordPressQueueStats {
  scheduled: number;
  pending: number;
  processing: number;
  retry: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
  completed_last_hour: number;
  avg_attempts: number;
}

interface OperationResponse<T = unknown> {
  success: boolean;
  error?: string;
  code?: string;
  request_id?: string;
  data?: T;
  [key: string]: unknown;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<OperationResponse<T>>('wordpress-operations', { body });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(String(data?.error || 'Falha na operação WordPress'));
  return data as unknown as T;
}

export async function listWordPressOperations(projectId?: string, limit = 50) {
  const result = await invoke<{ success: true; items: WordPressOperation[] }>({
    action: 'list',
    projectId: projectId && projectId !== 'all' ? projectId : null,
    limit,
  });
  return result.items || [];
}

export async function getWordPressQueueStats(projectId?: string) {
  const result = await invoke<{ success: true; stats: WordPressQueueStats }>({
    action: 'stats',
    projectId: projectId && projectId !== 'all' ? projectId : null,
  });
  return result.stats;
}

export async function publishWordPressArticle(params: {
  articleId: string;
  projectId: string;
  publishStatus?: 'draft' | 'publish';
  scheduledAt?: string | null;
}) {
  return invoke<Record<string, unknown>>({ action: 'publish', ...params });
}

export async function scheduleWordPressArticle(params: {
  articleId: string;
  projectId: string;
  scheduledAt: string;
  publishStatus?: 'draft' | 'publish';
}) {
  return invoke<Record<string, unknown>>({ action: 'schedule', ...params });
}

export async function cancelWordPressSchedule(articleId: string) {
  return invoke<Record<string, unknown>>({ action: 'cancel_schedule', articleId });
}

export async function retryWordPressOperation(operationId: string) {
  return invoke<Record<string, unknown>>({ action: 'retry', operationId });
}

export async function cancelWordPressOperation(operationId: string) {
  return invoke<Record<string, unknown>>({ action: 'cancel', operationId });
}
