/**
 * AI Orchestrator - Multi-Provider System
 * 
 * Selects the best AI provider based on task type, cost, and availability.
 * Supports: Gemini (primary), OpenAI, Anthropic (when key available)
 * Includes automatic fallback chain.
 */

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
}

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
  | 'image_generation';

// Provider configurations per task type - ordered by preference
const AI_PROVIDERS: Record<string, AIProvider[]> = {
  article_generation: [
    { name: 'anthropic', model: 'claude-sonnet-4-5-20250929', costPer1kTokens: 0.003, maxTokens: 200000, strengths: ['creative', 'long-form', 'nuanced'] },
    { name: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005, maxTokens: 128000, strengths: ['versatile', 'instruction-following'] },
    { name: 'gemini', model: 'gemini-2.5-pro', costPer1kTokens: 0.00125, maxTokens: 1000000, strengths: ['cost-effective', 'large-context'] },
  ],
  seo_analysis: [
    { name: 'gemini', model: 'gemini-2.0-flash', costPer1kTokens: 0.0001, maxTokens: 1000000, strengths: ['fast', 'analytical', 'cost-effective'] },
    { name: 'openai', model: 'gpt-4o-mini', costPer1kTokens: 0.00015, maxTokens: 128000, strengths: ['fast', 'precise'] },
  ],
  title_generation: [
    { name: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005, maxTokens: 128000, strengths: ['creative', 'catchy'] },
    { name: 'gemini', model: 'gemini-2.0-flash', costPer1kTokens: 0.0001, maxTokens: 1000000, strengths: ['fast', 'cost-effective'] },
  ],
  meta_description: [
    { name: 'gemini', model: 'gemini-2.0-flash', costPer1kTokens: 0.0001, maxTokens: 1000000, strengths: ['fast', 'cost-effective'] },
    { name: 'openai', model: 'gpt-4o-mini', costPer1kTokens: 0.00015, maxTokens: 128000, strengths: ['precise'] },
  ],
  content_editing: [
    { name: 'anthropic', model: 'claude-sonnet-4-5-20250929', costPer1kTokens: 0.003, maxTokens: 200000, strengths: ['nuanced', 'careful'] },
    { name: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005, maxTokens: 128000, strengths: ['versatile'] },
    { name: 'gemini', model: 'gemini-2.5-pro', costPer1kTokens: 0.00125, maxTokens: 1000000, strengths: ['large-context'] },
  ],
  content_review: [
    { name: 'gemini', model: 'gemini-2.0-flash', costPer1kTokens: 0.0001, maxTokens: 1000000, strengths: ['fast', 'analytical'] },
    { name: 'openai', model: 'gpt-4o-mini', costPer1kTokens: 0.00015, maxTokens: 128000, strengths: ['precise'] },
  ],
  news_rewrite: [
    { name: 'gemini', model: 'gemini-2.0-flash', costPer1kTokens: 0.0001, maxTokens: 1000000, strengths: ['fast', 'cost-effective'] },
    { name: 'openai', model: 'gpt-4o-mini', costPer1kTokens: 0.00015, maxTokens: 128000, strengths: ['fast'] },
  ],
  legal_review: [
    { name: 'anthropic', model: 'claude-sonnet-4-5-20250929', costPer1kTokens: 0.003, maxTokens: 200000, strengths: ['nuanced', 'careful', 'ethical'] },
    { name: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005, maxTokens: 128000, strengths: ['versatile'] },
    { name: 'gemini', model: 'gemini-2.5-pro', costPer1kTokens: 0.00125, maxTokens: 1000000, strengths: ['large-context'] },
  ],
  conversion_content: [
    { name: 'anthropic', model: 'claude-sonnet-4-5-20250929', costPer1kTokens: 0.003, maxTokens: 200000, strengths: ['persuasive', 'nuanced'] },
    { name: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005, maxTokens: 128000, strengths: ['versatile'] },
    { name: 'gemini', model: 'gemini-2.5-pro', costPer1kTokens: 0.00125, maxTokens: 1000000, strengths: ['cost-effective'] },
  ],
  strategy_planning: [
    { name: 'gemini', model: 'gemini-2.5-pro', costPer1kTokens: 0.00125, maxTokens: 1000000, strengths: ['analytical', 'large-context'] },
    { name: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005, maxTokens: 128000, strengths: ['versatile'] },
  ],
  image_generation: [
    { name: 'openai', model: 'dall-e-3', costPer1kTokens: 0.04, maxTokens: 0, strengths: ['quality', 'prompt-following'] },
    { name: 'gemini', model: 'imagen-3.0-generate-002', costPer1kTokens: 0.02, maxTokens: 0, strengths: ['cost-effective'] },
  ],
};

// Gemini API
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OPENAI_API_BASE = "https://api.openai.com/v1";
const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1";

export class AIOrchestrator {
  private apiKeys: Record<string, string>;

  constructor() {
    this.apiKeys = {
      openai: Deno.env.get('OPENAI_API_KEY') || '',
      anthropic: Deno.env.get('ANTHROPIC_API_KEY') || '',
      gemini: Deno.env.get('GEMINI_API_KEY') || '',
    };
  }

  /** Check which providers are available */
  getAvailableProviders(): string[] {
    return Object.entries(this.apiKeys)
      .filter(([_, key]) => !!key)
      .map(([name]) => name);
  }

  /** Select the best available provider for a task */
  selectProvider(taskType: TaskType, preferences?: Partial<AICallOptions>): AIProvider | null {
    const providers = AI_PROVIDERS[taskType] || AI_PROVIDERS['article_generation'];
    const available = providers.filter(p => !!this.apiKeys[p.name]);
    
    if (available.length === 0) return null;

    // If user preferred a specific provider and it's available, use it
    if (preferences?.preferredProvider) {
      const preferred = available.find(p => p.name === preferences.preferredProvider);
      if (preferred) return preferred;
    }

    // Sort by cost if prioritizing cost
    if (preferences?.prioritizeCost) {
      return available.sort((a, b) => a.costPer1kTokens - b.costPer1kTokens)[0];
    }

    // Default: use the first available (ordered by quality preference)
    return available[0];
  }

  /** Call AI with automatic provider selection and fallback */
  async call(taskType: TaskType, messages: AIMessage[], options?: AICallOptions): Promise<string> {
    const providers = AI_PROVIDERS[taskType] || AI_PROVIDERS['article_generation'];
    const available = providers.filter(p => !!this.apiKeys[p.name]);

    if (available.length === 0) {
      throw new Error('Nenhum provedor de IA disponível. Configure GEMINI_API_KEY, OPENAI_API_KEY ou ANTHROPIC_API_KEY.');
    }

    // Try preferred provider first if specified
    let orderedProviders = [...available];
    if (options?.preferredProvider) {
      const preferredIdx = orderedProviders.findIndex(p => p.name === options.preferredProvider);
      if (preferredIdx > 0) {
        const [preferred] = orderedProviders.splice(preferredIdx, 1);
        orderedProviders.unshift(preferred);
      }
    }

    // Sort by cost if prioritizing
    if (options?.prioritizeCost) {
      orderedProviders.sort((a, b) => a.costPer1kTokens - b.costPer1kTokens);
    }

    // Try each provider with fallback
    let lastError: Error | null = null;
    for (const provider of orderedProviders) {
      try {
        console.log(`[AIOrchestrator] Tentando ${provider.name} (${provider.model}) para ${taskType}...`);
        const result = await this.callProvider(provider, messages, options);
        console.log(`[AIOrchestrator] Sucesso com ${provider.name}`);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[AIOrchestrator] Falha com ${provider.name}: ${lastError.message}. Tentando próximo...`);
      }
    }

    throw lastError || new Error('Todos os provedores falharam');
  }

  /** Call a specific provider */
  private async callProvider(provider: AIProvider, messages: AIMessage[], options?: AICallOptions): Promise<string> {
    switch (provider.name) {
      case 'gemini':
        return this.callGemini(provider.model, messages, options);
      case 'openai':
        return this.callOpenAI(provider.model, messages, options);
      case 'anthropic':
        return this.callAnthropic(provider.model, messages, options);
      default:
        throw new Error(`Provedor não suportado: ${provider.name}`);
    }
  }

  /** Call Gemini API */
  private async callGemini(model: string, messages: AIMessage[], options?: AICallOptions): Promise<string> {
    const apiKey = this.apiKeys.gemini;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const requestBody: Record<string, unknown> = {
      contents: otherMessages.map(m => ({
        role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 8192,
        temperature: options?.temperature ?? 0.7,
      },
    };

    if (systemMessages.length > 0) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessages.map(m => m.content).join('\n\n') }],
      };
    }

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini ${model} error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /** Call OpenAI API */
  private async callOpenAI(model: string, messages: AIMessage[], options?: AICallOptions): Promise<string> {
    const apiKey = this.apiKeys.openai;
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');

    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({
          role: m.role === 'model' ? 'assistant' : m.role,
          content: m.content,
        })),
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI ${model} error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /** Call Anthropic (Claude) API */
  private async callAnthropic(model: string, messages: AIMessage[], options?: AICallOptions): Promise<string> {
    const apiKey = this.apiKeys.anthropic;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada');

    const systemMsg = messages.find(m => m.role === 'system');
    const otherMsgs = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens || 4096,
        system: systemMsg?.content || '',
        messages: otherMsgs.map(m => ({
          role: m.role === 'model' ? 'assistant' : (m.role === 'assistant' ? 'assistant' : 'user'),
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic ${model} error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  /** Stream call - uses Gemini stream with fallback to non-stream */
  async callStream(taskType: TaskType, messages: AIMessage[], options?: AICallOptions): Promise<Response> {
    // For streaming, prefer Gemini (native SSE support) then OpenAI
    const provider = this.selectProvider(taskType, options);
    if (!provider) {
      throw new Error('Nenhum provedor de IA disponível para streaming.');
    }

    if (provider.name === 'gemini') {
      return this.streamGemini(provider.model, messages, options);
    } else if (provider.name === 'openai') {
      return this.streamOpenAI(provider.model, messages, options);
    }

    // Fallback: non-streaming response wrapped as SSE
    const text = await this.callProvider(provider, messages, options);
    const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
    return new Response(new TextEncoder().encode(sseData), {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  /** Stream via Gemini */
  private async streamGemini(model: string, messages: AIMessage[], options?: AICallOptions): Promise<Response> {
    const apiKey = this.apiKeys.gemini;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const requestBody: Record<string, unknown> = {
      contents: otherMessages.map(m => ({
        role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 8192,
        temperature: options?.temperature ?? 0.7,
      },
    };

    if (systemMessages.length > 0) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessages.map(m => m.content).join('\n\n') }],
      };
    }

    const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini stream error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    // Transform Gemini SSE to OpenAI-compatible format
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (content) {
                controller.enqueue(new TextEncoder().encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content }, index: 0 }] })}\n\n`
                ));
              }
              if (data.candidates?.[0]?.finishReason) {
                controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
              }
            } catch {
              controller.enqueue(chunk);
            }
          }
        }
      },
    });

    return new Response(response.body?.pipeThrough(transformStream), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  /** Stream via OpenAI */
  private async streamOpenAI(model: string, messages: AIMessage[], options?: AICallOptions): Promise<Response> {
    const apiKey = this.apiKeys.openai;
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');

    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({
          role: m.role === 'model' ? 'assistant' : m.role,
          content: m.content,
        })),
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI stream error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    return new Response(response.body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  /** Get status of all providers */
  getProvidersStatus(): Record<string, { available: boolean; tasks: string[] }> {
    const status: Record<string, { available: boolean; tasks: string[] }> = {};
    
    const providerTasks: Record<string, string[]> = { gemini: [], openai: [], anthropic: [] };
    for (const [task, providers] of Object.entries(AI_PROVIDERS)) {
      for (const p of providers) {
        if (!providerTasks[p.name].includes(task)) {
          providerTasks[p.name].push(task);
        }
      }
    }

    for (const [name, tasks] of Object.entries(providerTasks)) {
      status[name] = { available: !!this.apiKeys[name], tasks };
    }
    return status;
  }
}

// Singleton instance
let orchestratorInstance: AIOrchestrator | null = null;

export function getOrchestrator(): AIOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AIOrchestrator();
  }
  return orchestratorInstance;
}
