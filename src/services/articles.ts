import { supabase } from '@/integrations/supabase/client';

export type ArticleLoadErrorCode = 'INVALID_ID' | 'NOT_FOUND' | 'TIMEOUT' | 'TECHNICAL';

export class ArticleLoadError extends Error {
  code: ArticleLoadErrorCode;
  cause?: unknown;

  constructor(code: ArticleLoadErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ArticleLoadError';
    this.code = code;
    this.cause = cause;
  }
}

export function isValidUuid(value?: string | null): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getArticleById<T = Record<string, unknown>>(id: string, timeoutMs = 12_000): Promise<T> {
  if (!isValidUuid(id)) {
    throw new ArticleLoadError('INVALID_ID', 'Identificador de artigo inválido.');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('id', id)
      .abortSignal(controller.signal)
      .maybeSingle();

    if (timedOut || controller.signal.aborted) {
      throw new ArticleLoadError('TIMEOUT', 'O servidor excedeu o tempo máximo de resposta.');
    }
    if (error) {
      throw new ArticleLoadError('TECHNICAL', 'Falha técnica ao consultar o artigo.', error);
    }
    if (!data) {
      throw new ArticleLoadError('NOT_FOUND', 'Artigo não encontrado.');
    }
    return data as T;
  } catch (error) {
    if (error instanceof ArticleLoadError) throw error;
    if (timedOut || controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new ArticleLoadError('TIMEOUT', 'O servidor excedeu o tempo máximo de resposta.', error);
    }
    throw new ArticleLoadError('TECHNICAL', 'Falha técnica ao carregar o artigo.', error);
  } finally {
    window.clearTimeout(timeout);
  }
}
