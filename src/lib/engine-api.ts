/** Cliente do portão único dos módulos (função de borda `engine`): { module, action, ...corpo }. Os erros chegam com `error` (código) e `message` (português). */
import { supabase } from '@/integrations/supabase/client';

export class EngineError extends Error {
  constructor(public code: string, public detail?: Record<string, unknown> | null) { super(code); }
  /** Mensagem pronta em português que o servidor mandou (quando existe). */
  get serverMessage(): string | undefined { return typeof this.detail?.message === 'string' ? this.detail.message : undefined; }
}

export async function callEngine<T>(module: string, action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('engine', { body: { module, action, ...body } });
  if (error) {
    let payload: ({ error?: string } & Record<string, unknown>) | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new EngineError(payload?.error || 'request_failed', payload);
  }
  return data as T;
}

export interface ProjectEvent { id: string; module: string; kind: string; subject: Record<string, unknown>; payload: Record<string, unknown>; created_at: string; text: string }
/** Linha do tempo do projeto (barramento project_events). */
export const listProjectEvents = (projectId: string, opts: { module?: string; limit?: number } = {}) =>
  callEngine<{ events: ProjectEvent[] }>('eventos', 'list', { projectId, eventModule: opts.module, limit: opts.limit ?? 30 });
