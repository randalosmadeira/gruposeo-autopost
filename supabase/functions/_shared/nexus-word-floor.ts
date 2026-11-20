/**
 * Tamanho do texto NÃO é regra fixa do sistema: quem define é o prompt / agente de IA do projeto (config.geo_word_band.min).
 * Sem valor configurado não há piso: nada é bloqueado automaticamente por quantidade de palavras.
 * (Antes de 20/11/2026 havia um piso global de 800 palavras que travava a geração em massa.)
 */
export const MIN_ARTICLE_WORDS = 0;
export function publicationWordMinimum(config?: Record<string, any>): number {
  const preferred = Number(config?.geo_word_band?.min);
  return Number.isFinite(preferred) && preferred > 0 ? Math.ceil(preferred) : MIN_ARTICLE_WORDS;
}
