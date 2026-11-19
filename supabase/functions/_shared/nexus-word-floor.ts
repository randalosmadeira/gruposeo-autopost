/** Global article minimum. Project preferences may increase, never lower it. */
export const MIN_ARTICLE_WORDS = 800;
export function publicationWordMinimum(config?: Record<string, any>): number {
  const preferred = Number(config?.geo_word_band?.min);
  return Number.isFinite(preferred) && preferred > 0
    ? Math.max(MIN_ARTICLE_WORDS, Math.ceil(preferred))
    : MIN_ARTICLE_WORDS;
}
