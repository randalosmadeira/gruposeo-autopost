export type ProviderHealthStatus = 'operational' | 'not_configured' | 'invalid_key' |
  'insufficient_credit' | 'rate_limited' | 'unavailable' | 'timeout' | 'unverified';

export interface ProviderHealth {
  user_id: string;
  provider: 'gemini' | 'openai' | 'anthropic' | 'serper';
  configured: boolean;
  status: ProviderHealthStatus;
  latency_ms: number | null;
  capabilities: string[];
  checked_at: string;
}

export const providerLabels: Record<ProviderHealth['provider'], string> = {
  gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic (Claude)', serper: 'Serper',
};

export const statusLabels: Record<ProviderHealthStatus, string> = {
  operational: 'Operacional', not_configured: 'Não configurada', invalid_key: 'Chave inválida',
  insufficient_credit: 'Sem crédito', rate_limited: 'Limite temporário', unavailable: 'Indisponível',
  timeout: 'Sem resposta', unverified: 'Aguardando teste',
};
