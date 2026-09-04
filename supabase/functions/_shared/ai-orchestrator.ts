import { getDirectivesForTask } from './behavioral-directives.ts';

export interface AIProvider {
  name: 'openai' | 'anthropic' | 'gemini';
  model: string;
  costPer1kTokens: number;
  maxTokens: number;
  strengths: string[];
}

export interface AIMessage {
  role: 'user' | 'system' | 'assistant' | 'model';
  content: string;
}

export interface AICallOptions {
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  preferredProvider?: string;
  prioritizeCost?: boolean;
  prioritizeQuality?: boolean;
  articleId?: string;
  correlationId?: string;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AICallResult {
  content: string;
  provider: 'openai' | 'anthropic' | 'gemini';
  model: string;
  usage: AIUsage;
}

type UsageSink = (entry: { taskType: TaskType; provider: AIProvider['name']; model: string; usage: AIUsage; options?: AICallOptions }) => Promise<void>;

export type TaskType =
  | 'article_generation'
  | 'seo_analysis'
  | 'title_generation'
  | 'meta_description'
  | 'content_editing'
  | 'content_review'
  | 'news_rewrite'
  | 'legal_review'
  | 'conversion_content'
  | 'strategy_planning'
  | 'image_generation'
  | 'geo_optimization'
  | 'aeo_analysis'
  | 'eeat_review'
  | 'share_of_model';

const OPENAI_TEXT = 'gpt-5.6-sol';
const CLAUDE_TEXT = 'claude-sonnet-4-6';
const OPENAI_IMAGE = 'gpt-image-2';

function p(name: AIProvider['name'], model: string, strengths: string[]): AIProvider {
  return { name, model, strengths, costPer1kTokens: 0, maxTokens: 128000 };
}

const AI_PROVIDERS: Record<string, AIProvider[]> = {
  article_generation: [p('openai', OPENAI_TEXT, ['long-form', 'instruction-following']), p('anthropic', CLAUDE_TEXT, ['long-form', 'nuanced'])],
  news_rewrite: [p('openai', OPENAI_TEXT, ['structured', 'news']), p('anthropic', CLAUDE_TEXT, ['careful', 'news'])],
  legal_review: [p('anthropic', CLAUDE_TEXT, ['legal', 'careful', 'ethical']), p('openai', OPENAI_TEXT, ['legal', 'structured'])],
  content_review: [p('anthropic', CLAUDE_TEXT, ['review', 'careful']), p('openai', OPENAI_TEXT, ['review', 'structured'])],
  content_editing: [p('anthropic', CLAUDE_TEXT, ['editing', 'nuanced']), p('openai', OPENAI_TEXT, ['editing', 'instruction-following'])],
  eeat_review: [p('anthropic', CLAUDE_TEXT, ['authority', 'trust']), p('openai', OPENAI_TEXT, ['structured'])],
  seo_analysis: [p('openai', OPENAI_TEXT, ['seo', 'structured']), p('anthropic', CLAUDE_TEXT, ['semantic'])],
  geo_optimization: [p('openai', OPENAI_TEXT, ['geo', 'structured']), p('anthropic', CLAUDE_TEXT, ['semantic'])],
  aeo_analysis: [p('openai', OPENAI_TEXT, ['aeo', 'structured']), p('anthropic', CLAUDE_TEXT, ['qa'])],
  title_generation: [p('openai', OPENAI_TEXT, ['creative']), p('anthropic', CLAUDE_TEXT, ['creative'])],
  meta_description: [p('openai', OPENAI_TEXT, ['precise']), p('anthropic', CLAUDE_TEXT, ['concise'])],
  conversion_content: [p('openai', OPENAI_TEXT, ['instruction-following']), p('anthropic', CLAUDE_TEXT, ['nuanced'])],
  strategy_planning: [p('anthropic', CLAUDE_TEXT, ['reasoning']), p('openai', OPENAI_TEXT, ['planning'])],
  share_of_model: [p('openai', OPENAI_TEXT, ['analysis']), p('anthropic', CLAUDE_TEXT, ['analysis'])],
  image_generation: [p('openai', OPENAI_IMAGE, ['image-generation'])],
};

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const providerCooldownUntil = new Map<string, number>();

function errorCooldownMs(message: string): number {
  const value = message.toLowerCase();
  if (value.includes('credit_balance_exhausted') || value.includes('insufficient_quota')) return 30 * 60 * 1000;
  if (value.includes('token_invalidated') || value.includes('invalid api key') || value.includes('401')) return 10 * 60 * 1000;
  if (value.includes('429')) return 60 * 1000;
  return 0;
}

function isCoolingDown(provider: string) {
  return (providerCooldownUntil.get(provider) || 0) > Date.now();
}

export class AIOrchestrator {
  private apiKeys: Record<string, string>;
  private platformKeys: Record<string, string>;
  private usageSink?: UsageSink;

  constructor() {
    const openaiKey = Deno.env.get('OPENAI_API_KEY') || '';
    this.apiKeys = {
      openai: openaiKey.startsWith('sk-') ? openaiKey : '',
      anthropic: Deno.env.get('ANTHROPIC_API_KEY') || '',
      gemini: Deno.env.get('GEMINI_API_KEY') || '',
    };
    this.platformKeys = { ...this.apiKeys };
  }

  setKeys(keys: { gemini?: string; openai?: string; anthropic?: string }) {
    if (keys.openai?.startsWith('sk-')) this.apiKeys.openai = keys.openai;
    if (keys.anthropic) this.apiKeys.anthropic = keys.anthropic;
    if (keys.gemini) this.apiKeys.gemini = keys.gemini;
  }

  setUsageSink(sink: UsageSink) {
    this.usageSink = sink;
  }

  getAvailableProviders(): string[] {
    const available = new Set<string>();
    for (const [name, key] of Object.entries(this.apiKeys)) if (key) available.add(name);
    for (const [name, key] of Object.entries(this.platformKeys)) if (key) available.add(name);
    return [...available];
  }

  selectProvider(taskType: TaskType, preferences?: Partial<AICallOptions>): AIProvider | null {
    const providers = AI_PROVIDERS[taskType] || AI_PROVIDERS.article_generation;
    const names = this.getAvailableProviders();
    const available = providers.filter((provider) => names.includes(provider.name) && !isCoolingDown(provider.name));
    if (!available.length) return null;
    if (preferences?.preferredProvider) return available.find((provider) => provider.name === preferences.preferredProvider) || available[0];
    return available[0];
  }

  private getKeysForProvider(providerName: string): string[] {
    const keys: string[] = [];
    const byok = this.apiKeys[providerName];
    const platform = this.platformKeys[providerName];
    if (byok) keys.push(byok);
    if (platform && platform !== byok) keys.push(platform);
    return keys;
  }

  private injectDirectives(taskType: TaskType, messages: AIMessage[]): AIMessage[] {
    const directives = getDirectivesForTask(taskType);
    const hasSystem = messages.some((message) => message.role === 'system');
    if (hasSystem) return messages.map((message) => message.role === 'system' ? { ...message, content: `${directives}\n\n---\n\n${message.content}` } : message);
    return [{ role: 'system', content: directives }, ...messages];
  }

  async call(taskType: TaskType, messages: AIMessage[], options?: AICallOptions): Promise<string> {
    return (await this.callWithMeta(taskType, messages, options)).content;
  }

  async callWithMeta(taskType: TaskType, messages: AIMessage[], options?: AICallOptions): Promise<AICallResult> {
    const enriched = this.injectDirectives(taskType, messages);
    const names = this.getAvailableProviders();
    let providers = (AI_PROVIDERS[taskType] || AI_PROVIDERS.article_generation)
      .filter((provider) => names.includes(provider.name) && !isCoolingDown(provider.name));
    if (options?.preferredProvider) providers = [...providers].sort((a, b) => Number(b.name === options.preferredProvider) - Number(a.name === options.preferredProvider));
    if (!providers.length) throw new Error('Nenhum provedor OpenAI/Claude disponível para esta tarefa.');

    let lastError: Error | null = null;
    for (const provider of providers) {
      for (const key of this.getKeysForProvider(provider.name)) {
        try {
          const result = await this.callProvider(provider, key, enriched, options);
          if (this.usageSink) {
            await this.usageSink({ taskType, provider: provider.name, model: provider.model, usage: result.usage, options }).catch((error) => {
              console.error(`[AIOrchestrator] Falha não bloqueante ao registrar consumo: ${error instanceof Error ? error.message : String(error)}`);
            });
          }
          return { content: result.content, provider: provider.name, model: provider.model, usage: result.usage };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const cooldown = errorCooldownMs(lastError.message);
          if (cooldown) providerCooldownUntil.set(provider.name, Date.now() + cooldown);
          console.warn(`[AIOrchestrator] ${provider.name}/${provider.model} falhou: ${lastError.message.slice(0, 180)}`);
        }
      }
    }
    throw lastError || new Error('Todos os provedores falharam.');
  }

  private async callProvider(provider: AIProvider, key: string, messages: AIMessage[], options?: AICallOptions): Promise<{ content: string; usage: AIUsage }> {
    if (provider.name === 'openai') return this.callOpenAI(provider.model, key, messages, options);
    if (provider.name === 'anthropic') return this.callAnthropic(provider.model, key, messages, options);
    return this.callGemini(provider.model, key, messages, options);
  }

  private async callOpenAI(model: string, key: string, messages: AIMessage[], options?: AICallOptions): Promise<{ content: string; usage: AIUsage }> {
    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: messages.map((m) => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content })), max_tokens: options?.maxTokens || 16384, temperature: options?.temperature ?? 0.45 }),
      signal: AbortSignal.timeout(90000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content || '';
    if (!content) throw new Error('OpenAI retornou resposta vazia.');
    return { content, usage: { inputTokens: Number(data?.usage?.prompt_tokens || data?.usage?.input_tokens || 0), outputTokens: Number(data?.usage?.completion_tokens || data?.usage?.output_tokens || 0) } };
  }

  private async callAnthropic(model: string, key: string, messages: AIMessage[], options?: AICallOptions): Promise<{ content: string; usage: AIUsage }> {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const conversation = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user', content: m.content }));
    const response = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: options?.maxTokens || 16384, system, messages: conversation }),
      signal: AbortSignal.timeout(90000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Anthropic HTTP ${response.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    const content = data?.content?.map((part: { text?: string }) => part.text || '').join('') || '';
    if (!content) throw new Error('Claude retornou resposta vazia.');
    return { content, usage: { inputTokens: Number(data?.usage?.input_tokens || 0), outputTokens: Number(data?.usage?.output_tokens || 0) } };
  }

  private async callGemini(model: string, key: string, messages: AIMessage[], options?: AICallOptions): Promise<{ content: string; usage: AIUsage }> {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const body: Record<string, unknown> = { contents, generationConfig: { maxOutputTokens: options?.maxTokens || 16384, temperature: options?.temperature ?? 0.45 } };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
    const text = await response.text();
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!content) throw new Error('Gemini retornou resposta vazia.');
    return { content, usage: { inputTokens: Number(data?.usageMetadata?.promptTokenCount || 0), outputTokens: Number(data?.usageMetadata?.candidatesTokenCount || 0) } };
  }
}

export function getOrchestrator(): AIOrchestrator {
  return new AIOrchestrator();
}
