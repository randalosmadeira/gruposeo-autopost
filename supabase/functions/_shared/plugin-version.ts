/**
 * Contrato central do conector WordPress Zica Posts.
 */
export const PLUGIN_SOFTWARE_ID = "zica-posts";
export const PLUGIN_NAME = "Zica Posts";
export const PLUGIN_VERSION = "3.10.1";
export const PLUGIN_MINIMUM_VERSION = "3.10.1";
export const PLUGIN_RELEASED = "2026-09-01";
export const PLUGIN_API_NAMESPACE = "zica-posts/v1";
export const PLUGIN_COMPAT_NAMESPACES = ["zica-ai/v1", "cfrdm/v1"] as const;

export const PLUGIN_FEATURES = [
  "authenticated_endpoints",
  "article_publish",
  "media_upload",
  "persistent_outbox",
  "hmac_sha256",
  "nonce_replay_protection",
  "content_hash_idempotency",
  "correlation_ids",
  "async_hub_webhook",
  "exponential_retry",
  "indexnow_batch_500",
  "llms_txt",
  "llms_full_txt",
  "ai_txt",
  "dynamic_sitemap",
  "schema_jsonld",
  "automatic_related_cards",
  "card_position_controls",
  "daily_1500_sao_paulo",
  "physical_file_atomic_write",
  "virtual_file_fallback",
  "ai_crawler_robots_rules",
  "legacy_api_compatibility",
  "geo_semantic_discovery",
  "structured_logs",
] as const;

export const PLUGIN_PROMPT_BLOCK = `### Plugin WordPress — Zica Posts v${PLUGIN_VERSION}
Software ID: ${PLUGIN_SOFTWARE_ID}
Namespace canônico: /wp-json/${PLUGIN_API_NAMESPACE}/
Compatibilidade temporária: /wp-json/zica-ai/v1/ e /wp-json/cfrdm/v1/

Arquitetura:
- WordPress atua como agente leve; não executa IA pesada durante save_post.
- Publicações/alterações geram outbox persistente e são processadas fora da requisição HTTP.
- Chamadas Hub -> WordPress podem usar HMAC SHA-256, timestamp, nonce e correlation ID.
- Content hash oferece idempotência e reduz loops de sincronização.
- Webhook para o Zica Orchestrator possui retry exponencial.
- IndexNow é enviado em lotes; resposta de submissão nunca é tratada como confirmação de indexação.
- llms.txt, llms-full.txt, ai.txt, manifest e sitemap têm escrita física atômica e fallback virtual.
- Sitemap usa lastmod real; Google Indexing API não é usada para artigos comuns.
- Crawlers conhecidos podem ser explicitamente autorizados, sem desativar WAF global.
- Cards relacionados e posição são configuráveis.
- Reconciliação integral às 15:00 America/Sao_Paulo permanece como fallback WordPress.

Regras:
- Não alterar automaticamente permalinks, blog_public, comentários, WAF ou cache global.
- Não prometer ingestão/citação por LLMs.
- Preferir /zica-posts/v1 e manter aliases legados apenas para migração.`;
