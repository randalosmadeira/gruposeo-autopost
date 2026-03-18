/**
 * AI Orchestrator v5.0 - GEO/AEO Multi-Provider System
 * 
 * Supports: Gemini (primary), OpenAI, Anthropic (when key available)
 * NEW: geo_optimization, aeo_analysis, eeat_review task types
 * Upgraded models: gemini-2.5-pro, gpt-4o, claude-sonnet-4-5
 * v5.1: Behavioral Directives injection (PDF Gabarito) em 100% das chamadas
 */

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
  | 'image_generation'
  | 'geo_optimization'
  | 'aeo_analysis'
  | 'eeat_review'
  | 'share_of_model';

// Provider configurations per task type - ordered by preference
const AI_PROVIDERS: Record<string, AIProvider[]> = {
  article_generation: [
    { name: 'gemini', model: 'gemini-2.5-pro', costPer1kTokens: 0.00125, maxTokens: 1000000, strengths: ['deep-reasoning', 'long-form', 'geo-optimized'] },
    { name: 'gemini', model: 'gemini-2.5-flash', costPer1kTokens: 0.0005, maxTokens: 1000000, strengths: ['fast', 'creative', 'long-form'] },
    { name: 'anthropic', model: 'claude-sonnet-4-5-20250929', costPer1kTokens: 0.003, maxTokens: 200000, strengths: ['creative', 'long-form', 'nuanced'] },
    { name: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005, maxTokens: 128000, strengths: ['versatile', 'instruction-following'] },
  ],
  geo_optimization: [
    { name: 'gemini', model: 'gemini-2.5-pro', costPer1kTokens: 0.00125, maxTokens: 1000000, strengths: ['deep-reasoning', 'semantic-analysis', 'geo-signals'] },
    { name: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005, maxTokens: 128000, strengths: ['structured-output', 'precision'] },
    { name: 'anthropic', model: 'claude-sonnet-4-5-20250929', costPer1kTokens: 0.003, maxTokens: 200000, strengths: ['nuanced', 'eeat-analysis'] },
  ],
  aeo_analysis: [
    { name: 'gemini', model: 'gemini-2.5-pro', costPer1kTokens: 0.00125, maxTokens: 1000000, strengths: ['answer-engine-optimization', 'snippet-detection'] },
    { name: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005, maxTokens: 128000, strengths: ['qa-extraction', 'structured'] },
  ],
  eeat_review: [
    { name: 'anthropic', model: 'claude-sonnet-4-5-20250929', costPer1kTokens: 0.003, maxTokens: 200000, strengths: ['nuanced', 'authority-detection', 'trust-analysis'] },
    { name: 'gemini', model: 'gemini-2.5-pro', costPer1kTokens: 0.00125, maxTokens: 1000000, strengths: ['deep-reasoning'] },
  ],
  share_of_model: [
    { name: 'gemini', model: 'gemini-2.5-flash', costPer1kTokens: 0.0005, maxTokens: 1000000, strengths: ['fast', 'cost-effective', 'brand-detection'] },
    { name: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005, maxTokens: 128000, strengths: ['precision'] },
  ],
  seo_analysis: [
    { name: 'gemini', model: 'gemini-2.5-flash', costPer1kTokens: 0.0005, maxTokens: 1000000, strengths: ['fast', 'analytical', 'cost-effective'] },
    { name: 'openai', model: 'gpt-4o-mini', costPer1kTokens: 0.00015, maxTokens: 128000, strengths: ['fast', 'precise'] },
  ],
  title_generation: [
    { name: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005, maxTokens: 128000, strengths: ['creative', 'catchy'] },
    { name: 'gemini', model: 'gemini-2.5-flash', costPer1kTokens: 0.0005, maxTokens: 1000000, strengths: ['fast', 'cost-effective'] },
  ],
  meta_description: [
    { name: 'gemini', model: 'gemini-2.5-flash', costPer1kTokens: 0.0005, maxTokens: 1000000, strengths: ['fast', 'cost-effective'] },
    { name: 'openai', model: 'gpt-4o-mini', costPer1kTokens: 0.00015, maxTokens: 128000, strengths: ['precise'] },
  ],
  content_editing: [
    { name: 'gemini', model: 'gemini-2.5-pro', costPer1kTokens: 0.00125, maxTokens: 1000000, strengths: ['deep-reasoning', 'large-context', 'geo-optimized'] },
    { name: 'anthropic', model: 'claude-sonnet-4-5-20250929', costPer1kTokens: 0.003, maxTokens: 200000, strengths: ['nuanced', 'careful'] },
    { name: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005, maxTokens: 128000, strengths: ['versatile'] },
  ],
  content_review: [
    { name: 'gemini', model: 'gemini-2.5-flash', costPer1kTokens: 0.0005, maxTokens: 1000000, strengths: ['fast', 'analytical'] },
    { name: 'openai', model: 'gpt-4o-mini', costPer1kTokens: 0.00015, maxTokens: 128000, strengths: ['precise'] },
  ],
  news_rewrite: [
    { name: 'gemini', model: 'gemini-2.5-flash', costPer1kTokens: 0.0005, maxTokens: 1000000, strengths: ['fast', 'cost-effective'] },
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
  private platformKeys: Record<string, string>;

  constructor() {
    const openaiKey = Deno.env.get('OPENAI_API_KEY') || '';
    const validOpenaiKey = openaiKey.startsWith('sk-') ? openaiKey : '';
    
    this.apiKeys = {
      openai: validOpenaiKey,
      anthropic: Deno.env.get('ANTHROPIC_API_KEY') || '',
      gemini: Deno.env.get('GEMINI_API_KEY') || '',
    };
    
    this.platformKeys = { ...this.apiKeys };
    
    if (openaiKey && !validOpenaiKey) {
      console.warn('[AIOrchestrator] OPENAI_API_KEY ignorada - não é uma chave OpenAI válida (deve começar com sk-)');
    }
  }

  setKeys(keys: { gemini?: string; openai?: string; anthropic?: string }) {
    if (keys.gemini) this.apiKeys.gemini = keys.gemini;
    if (keys.openai) {
      if (keys.openai.startsWith('sk-')) {
        this.apiKeys.openai = keys.openai;
      } else {
        console.warn('[AIOrchestrator] BYOK OpenAI key ignorada - não começa com sk-');
      }
    }
    if (keys.anthropic) this.apiKeys.anthropic = keys.anthropic;
  }

  getAvailableProviders(): string[] {
    const available = new Set<string>();
    for (const [name, key] of Object.entries(this.apiKeys)) {
      if (key) available.add(name);
    }
    for (const [name, key] of Object.entries(this.platformKeys)) {
      if (key) available.add(name);
    }
    return [...available];
  }

  selectProvider(taskType: TaskType, preferences?: Partial<AICallOptions>): AIProvider | null {
    const providers = AI_PROVIDERS[taskType] || AI_PROVIDERS['article_generation'];
    const availableNames = this.getAvailableProviders();
    const available = providers.filter(p => availableNames.includes(p.name));
    
    if (available.length === 0) return null;

    if (preferences?.preferredProvider) {
      const preferred = available.find(p => p.name === preferences.preferredProvider);
      if (preferred) return preferred;
    }

    if (preferences?.prioritizeCost) {
      return available.sort((a, b) => a.costPer1kTokens - b.costPer1kTokens)[0];
    }

    return available[0];
  }

  private getKeysForProvider(providerName: string): string[] {
    const keys: string[] = [];
    const byokKey = this.apiKeys[providerName];
    const platformKey = this.platformKeys[providerName];
    
    if (byokKey) keys.push(byokKey);
    if (platformKey && platformKey !== byokKey) keys.push(platformKey);
    
    return keys;
  }

  private injectDirectives(taskType: TaskType, messages: AIMessage[]): AIMessage[] {
    const directives = getDirectivesForTask(taskType);
    const hasSystemMsg = messages.some(m => m.role === 'system');
    
    if (hasSystemMsg) {
      // Prepend directives to existing system message
      return messages.map(m => 
        m.role === 'system' 
          ? { ...m, content: `${directives}\n\n---\n\n${m.content}` }
          : m
      );
    }
    
    // Add as new system message at the beginning
    return [{ role: 'system' as const, content: directives }, ...messages];
  }

  async call(taskType: TaskType, messages: AIMessage[], options?: AICallOptions): Promise<string> {
    // Inject behavioral directives into all AI calls
    const enrichedMessages = this.injectDirectives(taskType, messages);
    
    const providers = AI_PROVIDERS[taskType] || AI_PROVIDERS['article_generation'];
    const availableNames = this.getAvailableProviders();
    const available = providers.filter(p => availableNames.includes(p.name));

    if (available.length === 0) {
      throw new Error('Nenhum provedor de IA disponível. Configure GEMINI_API_KEY, OPENAI_API_KEY ou ANTHROPIC_API_KEY.');
    }

    let orderedProviders = [...available];
    if (options?.preferredProvider) {
      const preferredIdx = orderedProviders.findIndex(p => p.name === options.preferredProvider);
      if (preferredIdx > 0) {
        const [preferred] = orderedProviders.splice(preferredIdx, 1);
        orderedProviders.unshift(preferred);
      }
    }

    if (options?.prioritizeCost) {
      orderedProviders.sort((a, b) => a.costPer1kTokens - b.costPer1kTokens);
    }

    // Deduplicate by model name (avoid retrying same model with same key)
    const seenModels = new Set<string>();
    orderedProviders = orderedProviders.filter(p => {
      const key = `${p.name}:${p.model}`;
      if (seenModels.has(key)) return false;
      seenModels.add(key);
      return true;
    });

    let lastError: Error | null = null;
    for (const provider of orderedProviders) {
      const keys = this.getKeysForProvider(provider.name);
      
      for (let i = 0; i < keys.length; i++) {
        const keyLabel = i === 0 ? 'BYOK' : 'platform';
        try {
          console.log(`[AIOrchestrator] Tentando ${provider.name} (${provider.model}, ${keyLabel}) para ${taskType}...`);
          const result = await this.callProviderWithKey(provider, keys[i], enrichedMessages, options);
          console.log(`[AIOrchestrator] Sucesso com ${provider.name} (${keyLabel})`);
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(`[AIOrchestrator] Falha ${provider.name} (${keyLabel}): ${lastError.message.slice(0, 100)}. Tentando próximo...`);
        }
      }
    }

    throw lastError || new Error('Todos os provedores falharam');
  }

  private async callProviderWithKey(provider: AIProvider, apiKey: string, messages: AIMessage[], options?: AICallOptions): Promise<string> {
    switch (provider.name) {
      case 'gemini':
        return this.callGemini(provider.model, messages, options, apiKey);
      case 'openai':
        return this.callOpenAI(provider.model, messages, options, apiKey);
      case 'anthropic':
        return this.callAnthropic(provider.model, messages, options, apiKey);
      default:
        throw new Error(`Provedor não suportado: ${provider.name}`);
    }
  }

  private async callProvider(provider: AIProvider, messages: AIMessage[], options?: AICallOptions): Promise<string> {
    return this.callProviderWithKey(provider, this.apiKeys[provider.name] || this.platformKeys[provider.name], messages, options);
  }

  private async callGemini(model: string, messages: AIMessage[], options?: AICallOptions, apiKey?: string): Promise<string> {
    const key = apiKey || this.apiKeys.gemini || this.platformKeys.gemini;
    if (!key) throw new Error('GEMINI_API_KEY não configurada');

    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const requestBody: Record<string, unknown> = {
      contents: otherMessages.map(m => ({
        role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 65536,
        temperature: options?.temperature ?? 0.7,
      },
    };

    if (systemMessages.length > 0) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessages.map(m => m.content).join('\n\n') }],
      };
    }

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${key}`;
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
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = data.candidates?.[0]?.finishReason;
    
    if (finishReason === 'MAX_TOKENS') {
      console.warn(`[AIOrchestrator] Gemini ${model} response truncated (MAX_TOKENS). Output length: ${text.length} chars`);
      (globalThis as any).__lastFinishReason = 'MAX_TOKENS';
    } else {
      (globalThis as any).__lastFinishReason = finishReason || 'STOP';
    }
    
    if (!text) {
      const blockReason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason;
      throw new Error(`Gemini retornou resposta vazia. Reason: ${blockReason || 'unknown'}. Prompt pode ter sido bloqueado.`);
    }
    
    return text;
  }

  private async callOpenAI(model: string, messages: AIMessage[], options?: AICallOptions, apiKey?: string): Promise<string> {
    const key = apiKey || this.apiKeys.openai || this.platformKeys.openai;
    if (!key) throw new Error('OPENAI_API_KEY não configurada');

    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({
          role: m.role === 'model' ? 'assistant' : m.role,
          content: m.content,
        })),
        max_tokens: options?.maxTokens || 16384,
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

  private async callAnthropic(model: string, messages: AIMessage[], options?: AICallOptions, apiKey?: string): Promise<string> {
    const key = apiKey || this.apiKeys.anthropic || this.platformKeys.anthropic;
    if (!key) throw new Error('ANTHROPIC_API_KEY não configurada');

    const systemMsg = messages.find(m => m.role === 'system');
    const otherMsgs = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': key,
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

  async callStream(taskType: TaskType, messages: AIMessage[], options?: AICallOptions): Promise<Response> {
    // Inject behavioral directives into streaming calls too
    const enrichedMessages = this.injectDirectives(taskType, messages);
    
    const provider = this.selectProvider(taskType, options);
    if (!provider) {
      throw new Error('Nenhum provedor de IA disponível para streaming.');
    }

    const keys = this.getKeysForProvider(provider.name);
    
    for (let i = 0; i < keys.length; i++) {
      try {
        if (provider.name === 'gemini') {
          return await this.streamGemini(provider.model, enrichedMessages, options, keys[i]);
        } else if (provider.name === 'openai') {
          return await this.streamOpenAI(provider.model, enrichedMessages, options, keys[i]);
        }
      } catch (e) {
        console.warn(`[AIOrchestrator] Stream fallback ${i + 1}/${keys.length}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
      }
    }

    const text = await this.call(taskType, messages, options);
    const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
    return new Response(new TextEncoder().encode(sseData), {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  private async streamGemini(model: string, messages: AIMessage[], options?: AICallOptions, apiKey?: string): Promise<Response> {
    const key = apiKey || this.apiKeys.gemini || this.platformKeys.gemini;
    if (!key) throw new Error('GEMINI_API_KEY não configurada');

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

    const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini stream error ${response.status}: ${errorText.slice(0, 200)}`);
    }

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

  private async streamOpenAI(model: string, messages: AIMessage[], options?: AICallOptions, apiKey?: string): Promise<Response> {
    const key = apiKey || this.apiKeys.openai || this.platformKeys.openai;
    if (!key) throw new Error('OPENAI_API_KEY não configurada');

    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
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

    const availableNames = this.getAvailableProviders();
    for (const [name, tasks] of Object.entries(providerTasks)) {
      status[name] = { available: availableNames.includes(name), tasks };
    }
    return status;
  }
}

// Factory - creates fresh instance each call to avoid BYOK key leakage between requests
export function getOrchestrator(): AIOrchestrator {
  return new AIOrchestrator();
}
