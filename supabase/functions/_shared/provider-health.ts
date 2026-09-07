export type ProviderName = "openai" | "gemini" | "anthropic" | "serper";
export type ProviderStatus = "operational" | "not_configured" | "invalid_key" |
  "insufficient_credit" | "rate_limited" | "unavailable" | "timeout" | "unverified";

export const PROVIDER_CAPABILITIES: Record<ProviderName, string[]> = {
  gemini: ["Títulos", "Textos", "Imagens"],
  openai: ["Títulos", "Textos", "Imagens", "Revisão"],
  anthropic: ["Textos", "Revisão", "Fallback"],
  serper: ["Pesquisa Google", "SEO", "Concorrência"],
};

export function classifyProviderFailure(status: number, body = ""): ProviderStatus {
  const normalized = body.toLowerCase();
  const creditMarkers = [
    "insufficient_quota", "insufficient credit", "credit balance", "billing",
    "payment_required", "quota exceeded", "resource_exhausted",
  ];
  if (status === 402 || creditMarkers.some((marker) => normalized.includes(marker))) {
    return "insufficient_credit";
  }
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "unavailable";
}

export function safeStatusMessage(status: ProviderStatus): string {
  const messages: Record<ProviderStatus, string> = {
    operational: "Conexão operacional",
    not_configured: "Chave não configurada",
    invalid_key: "Chave inválida ou sem permissão",
    insufficient_credit: "Créditos insuficientes ou faturamento bloqueado",
    rate_limited: "Limite temporário de requisições atingido",
    unavailable: "Provedor temporariamente indisponível",
    timeout: "Tempo de conexão esgotado",
    unverified: "Configurada, aguardando teste funcional",
  };
  return messages[status];
}
