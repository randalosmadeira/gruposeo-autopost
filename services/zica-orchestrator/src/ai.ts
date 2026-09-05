import type { ArticlePayload } from './types.js';

type Provider = 'openai' | 'anthropic';

const TRANSIENT_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

class ProviderError extends Error {
  constructor(
    readonly provider: Provider,
    readonly status: number | null,
    readonly transient: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

function parseModelJson(text: string) {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as Partial<ArticlePayload>;
}

function configuredProviders(): Provider[] {
  const primary = (process.env.AI_PROVIDER || 'none').toLowerCase();
  if (primary === 'none') return [];
  if (primary !== 'openai' && primary !== 'anthropic') {
    throw new Error(`Unsupported AI_PROVIDER: ${primary}`);
  }

  const configuredFallback = (process.env.AI_FALLBACK_PROVIDER || '').toLowerCase();
  const fallback = configuredFallback || (primary === 'openai' ? 'anthropic' : 'openai');
  if (fallback !== 'openai' && fallback !== 'anthropic') {
    throw new Error(`Unsupported AI_FALLBACK_PROVIDER: ${fallback}`);
  }

  const providers: Provider[] = [primary];
  if (fallback !== primary) providers.push(fallback);
  return providers;
}

async function requestProvider(provider: Provider, prompt: string): Promise<string> {
  try {
    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new ProviderError(provider, null, true, 'provider_not_configured');
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5-mini', input: prompt }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new ProviderError(provider, response.status, TRANSIENT_HTTP_STATUSES.has(response.status), 'provider_request_failed');
      }
      const json = await response.json() as { output_text?: string };
      return json.output_text || '';
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new ProviderError(provider, null, true, 'provider_not_configured');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
        max_tokens: 8_000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new ProviderError(provider, response.status, TRANSIENT_HTTP_STATUSES.has(response.status), 'provider_request_failed');
    }
    const json = await response.json() as { content?: Array<{ type: string; text?: string }> };
    return json.content?.find(item => item.type === 'text')?.text || '';
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const transient = error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError');
    throw new ProviderError(provider, null, transient, transient ? 'provider_temporarily_unavailable' : 'provider_request_failed');
  }
}

export async function optimizeArticle(article: ArticlePayload): Promise<ArticlePayload> {
  const providers = configuredProviders();
  if (!providers.length) return article;

  const prompt = `Revise sem inventar fatos. Preserve nomes, datas, valores e citações. Melhore estrutura, resumo, semântica e GEO. Retorne SOMENTE JSON com title, content, excerpt e slug.\nINPUT:\n${JSON.stringify({ title: article.title, content: article.content, excerpt: article.excerpt, slug: article.slug })}`;
  let output = '';
  let lastFailure: ProviderError | null = null;

  for (const [index, provider] of providers.entries()) {
    try {
      output = await requestProvider(provider, prompt);
      console.info(JSON.stringify({ event: 'ai_provider_success', provider, fallback: index > 0 }));
      lastFailure = null;
      break;
    } catch (error) {
      const failure = error instanceof ProviderError
        ? error
        : new ProviderError(provider, null, false, 'provider_request_failed');
      lastFailure = failure;
      console.warn(JSON.stringify({
        event: 'ai_provider_failure',
        provider,
        status: failure.status,
        transient: failure.transient,
        fallback_available: failure.transient && index < providers.length - 1,
      }));
      if (!failure.transient || index === providers.length - 1) break;
    }
  }

  if (lastFailure) {
    throw new Error(`ai_generation_failed:${lastFailure.provider}:${lastFailure.status || 'network'}`);
  }

  const patch = parseModelJson(output);
  return {
    ...article,
    title: typeof patch.title === 'string' && patch.title ? patch.title : article.title,
    content: typeof patch.content === 'string' && patch.content ? patch.content : article.content,
    excerpt: typeof patch.excerpt === 'string' ? patch.excerpt : article.excerpt,
    slug: typeof patch.slug === 'string' && patch.slug ? patch.slug : article.slug,
  };
}
