/** Contrato central do conector WordPress Zica Posts. */
export const PLUGIN_SOFTWARE_ID="zica-posts";
export const PLUGIN_NAME="Zica Posts";
export const PLUGIN_VERSION="3.10.2";
export const PLUGIN_MINIMUM_VERSION="3.10.2";
export const PLUGIN_RELEASED="2026-09-01";
export const PLUGIN_API_NAMESPACE="zica-posts/v1";
export const PLUGIN_COMPAT_NAMESPACES=["zica-ai/v1","cfrdm/v1"] as const;
export const PLUGIN_FEATURES=["authenticated_endpoints","article_publish","media_upload","modular_light_agent","persistent_outbox","hmac_sha256","nonce_replay_protection","content_hash_idempotency","correlation_ids","anti_echo_hub_sync","async_hub_webhook","exponential_retry","delegated_indexing","indexnow_batch_500","llms_txt","llms_full_txt","ai_txt","dynamic_sitemap","schema_jsonld","automatic_related_cards","frontend_card_styles","daily_1500_sao_paulo","physical_file_atomic_write","virtual_file_fallback","ai_crawler_robots_rules","legacy_api_compatibility","orchestrator_supabase_registry","bullmq_backpressure","sftp_atomic_dispatch","credential_refs","cdn_purge_optional","geo_semantic_discovery","structured_logs"] as const;
export const PLUGIN_PROMPT_BLOCK=`### Plugin WordPress — Zica Posts v${PLUGIN_VERSION}
Software ID: ${PLUGIN_SOFTWARE_ID}
Namespace canônico: /wp-json/${PLUGIN_API_NAMESPACE}/
Compatibilidade temporária: /wp-json/zica-ai/v1/ e /wp-json/cfrdm/v1/

- WordPress é agente leve; IA pesada não roda em save_post.
- Outbox persistente, HMAC, nonce, content hash e correlation ID protegem a esteira.
- Hub -> WordPress possui anti-eco; escrita inbound não retorna ao outbound outbox.
- Orchestrator pode assumir IndexNow para impedir submissão duplicada.
- Redis/BullMQ fornece backpressure, retry e dead-letter.
- Jobs carregam credential_ref e nunca chaves SSH/API brutas.
- SFTP usa arquivo temporário + rename, sem shell.
- llms.txt, llms-full.txt, ai.txt, manifest e sitemap possuem escrita atômica e fallback virtual.
- Google Indexing API não é usada para artigos comuns.
- Crawlers conhecidos podem ser permitidos sem desligar WAF.
- Scheduler das 15:00 America/Sao_Paulo existe no Orchestrator e como fallback WordPress.
- Não alterar automaticamente permalinks, blog_public, comentários, WAF ou cache global.
- Discovery não garante ingestão/citação por LLMs.`;
