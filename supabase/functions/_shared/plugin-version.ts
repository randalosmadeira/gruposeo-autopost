/**
 * Contrato central do conector WordPress Zica Posts.
 * Todas as Edge Functions devem preferir o namespace canônico e manter aliases legados apenas durante a migração.
 */

export const PLUGIN_SOFTWARE_ID = "zica-posts";
export const PLUGIN_NAME = "Zica Posts";
export const PLUGIN_VERSION = "3.10.0";
export const PLUGIN_MINIMUM_VERSION = "3.10.0";
export const PLUGIN_RELEASED = "2026-09-01";
export const PLUGIN_API_NAMESPACE = "zica-posts/v1";
export const PLUGIN_COMPAT_NAMESPACES = ["zica-ai/v1", "cfrdm/v1"] as const;

export const PLUGIN_FEATURES = [
  "authenticated_endpoints",
  "article_publish",
  "media_upload",
  "indexnow",
  "llms_txt",
  "llms_full_txt",
  "ai_txt",
  "dynamic_sitemap",
  "schema_jsonld",
  "automatic_related_cards",
  "card_position_controls",
  "daily_1500_sao_paulo",
  "realtime_publish_sync",
  "physical_file_atomic_write",
  "virtual_file_fallback",
  "ai_crawler_robots_rules",
  "legacy_api_compatibility",
  "meta_auditor",
  "internal_linking",
  "geo_semantic_discovery",
  "structured_logs",
] as const;

export const PLUGIN_PROMPT_BLOCK = `### Plugin WordPress — Zica Posts v${PLUGIN_VERSION}
Software ID: ${PLUGIN_SOFTWARE_ID}
Namespace canônico: /wp-json/${PLUGIN_API_NAMESPACE}/
Compatibilidade temporária: /wp-json/zica-ai/v1/ e /wp-json/cfrdm/v1/

Capacidades:
- Publicação e leitura de artigos por endpoints autenticados.
- Upload de mídia para publicação pela Zica.ai.
- Atualização de llms.txt, llms-full.txt, ai.txt, manifest JSON e sitemap próprio.
- Escrita física atômica quando a raiz WordPress é gravável, com fallback virtual sem interromper o site.
- IndexNow para submissão de URLs novas/alteradas aos mecanismos participantes.
- Sitemap com lastmod real para descoberta por buscadores e Search Console.
- Regras explícitas e auditáveis para crawlers de IA conhecidos no robots.txt.
- JSON-LD recebido da Zica.ai e fallback básico de Article quando Rank Math/Yoast não estiverem gerando Schema.
- Cards relacionados automáticos com posição configurável.
- Sincronização imediata após publicação/alteração e ciclo integral diário às 15:00 America/Sao_Paulo.

Regras técnicas:
- Não prometer indexação garantida em Google ou em LLMs; registrar submissão e confirmação como estados diferentes.
- Não usar o antigo endpoint de ping de sitemap do Google.
- Não usar Google Indexing API para artigos comuns fora dos tipos oficialmente elegíveis.
- Preferir /zica-posts/v1 e manter aliases legados somente para migração controlada.`;
