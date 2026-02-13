/**
 * Retry wrapper with exponential backoff for Supabase operations.
 * Retries on transient network/timeout errors only.
 */

const TRANSIENT_PATTERNS = [
  'Failed to fetch',
  'NetworkError',
  'ECONNREFUSED',
  'timeout',
  'Connection terminated',
  'fetch failed',
  'AbortError',
  'net::ERR_',
  'ERR_FAILED',
  'Load failed',
  'network',
  'CORS',
  'TypeError: Load failed',
];

function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_PATTERNS.some(p => message.toLowerCase().includes(p.toLowerCase()));
}

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !isTransientError(error)) {
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      console.warn(`[retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(jitter)}ms...`);
      await new Promise(resolve => setTimeout(resolve, jitter));
    }
  }

  throw lastError;
}

/**
 * Wraps a Supabase query result and retries on transient errors.
 * Usage: const data = await retryQuery(() => supabase.from('table').select('*'));
 */
export async function retryQuery<T>(
  queryFn: () => PromiseLike<{ data: T; error: any }>,
  options?: RetryOptions
): Promise<{ data: T; error: null }> {
  return withRetry(async () => {
    const result = await queryFn();
    if (result.error) throw result.error;
    return { data: result.data, error: null };
  }, options);
}
