/**
 * Canonical list of AI/search crawler user-agents allowed by Zica Posts sites.
 *
 * This list MUST stay identical to the `ai_bots()` array in
 * `public/wordpress-plugin/zica-posts/includes/class-zica-posts-discovery.php`.
 * The two are maintained by different engineers (PHP plugin vs. TypeScript
 * edge functions) with no shared build step, so if you add/remove a bot here,
 * mirror the change there too (and vice-versa) — see that file's `ai_bots()`
 * for the PHP source of truth.
 */
export const AI_CRAWLER_BOTS: string[] = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "anthropic-ai",
  "Google-Extended",
  "Googlebot",
  "Googlebot-Image",
  "Googlebot-Video",
  "Bingbot",
  "Applebot",
  "Applebot-Extended",
  "DuckAssistBot",
  "CCBot",
  "cohere-ai",
  "meta-externalagent",
];
