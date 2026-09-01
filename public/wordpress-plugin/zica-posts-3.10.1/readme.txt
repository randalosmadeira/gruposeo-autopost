=== Zica Posts ===
Contributors: zica-ai
Tags: seo, geo, llms, indexnow, schema, wordpress, automation
Requires at least: 5.8
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 3.10.1
License: GPLv2 or later

Agente WordPress leve e oficial da Zica.ai para distribuição de conteúdo, discovery por buscadores e sistemas de IA compatíveis, Schema, IndexNow em lote e integração assíncrona com o futuro Zica Orchestrator.

== 3.10.1 ==

* Outbox persistente para eventos de publicação e atualização.
* HMAC SHA-256 com timestamp e nonce para chamadas Hub -> WordPress.
* Proteção contra replay e idempotência por content hash/correlation ID.
* Webhook assíncrono para orquestrador externo com retry exponencial.
* IndexNow em lotes de até 500 URLs por request interno.
* llms.txt, llms-full.txt, ai.txt, manifest e sitemap com escrita atômica e fallback virtual.
* Regras configuráveis para crawlers conhecidos, incluindo OAI-SearchBot.
* Cache-Control limitado a arquivos públicos de discovery.
* JSON-LD dinâmico sem duplicação quando Rank Math/Yoast já fornecem Schema.
* Cards automáticos relacionados e controles de posição.
* Reconciliação diária às 15:00 no fuso America/Sao_Paulo.
* Painel administrativo Neural Cortex.

== Segurança ==

A versão 3.10.1 não altera automaticamente permalinks, comentários, blog_public, WAF, Cloudflare ou cache global. Essas configurações são auditadas e devem permanecer sob controle do administrador da infraestrutura.

A Google Indexing API não é usada para artigos comuns. Para páginas normais, o plugin usa sitemap/lastmod e IndexNow apenas para mecanismos participantes.
