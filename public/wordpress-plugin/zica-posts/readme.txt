=== Zica Posts ===
Contributors: zica-ai
Tags: seo, geo, llms, indexnow, schema, wordpress, automation, queue
Requires at least: 5.8
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 3.11.0
License: GPLv2 or later

Agente WordPress leve oficial da Zica.ai. Publica, registra eventos duráveis, serve discovery files e conversa com o Zica Orchestrator sem executar IA pesada durante save_post.

== 3.11.0 ==

* Auditoria pós-publicação e após novas edições.
* Autocorreção conservadora de símbolos Markdown e caracteres invisíveis no título, preservando revisão anterior.
* Impressão digital de título e conteúdo para advertência de possíveis duplicidades.
* Painel administrativo com atalhos para editar, corrigir com segurança e mover para a lixeira.
* Exclusão permanente somente após envio à lixeira, mediante permissão, nonce e confirmação explícita.
* Nenhuma duplicidade é removida automaticamente.

== 3.10.2 ==

* Arquitetura modular: Auth, Discovery, Outbox, REST, Cards e Admin separados.
* Correção anti-eco: atualizações Hub -> WordPress não retornam ao outbound outbox.
* Delegação explícita de IndexNow ao Orchestrator para evitar submissões duplicadas.
* Outbox persistente com idempotência por content hash, correlation ID e retry exponencial.
* HMAC SHA-256 com timestamp e nonce no canal Hub -> WordPress.
* Webhook Hub exige HTTPS público; redirects são desabilitados no POST do outbox.
* Discovery: llms.txt, llms-full.txt, ai.txt, manifest JSON e sitemap com lastmod.
* Escrita física atômica com fallback virtual.
* IndexNow em batch; aceite de submissão não é tratado como confirmação de indexação.
* Endpoint autenticado de artigo completo para workers externos.
* Cards relacionados agora carregam stylesheet público próprio, responsivo.
* Reconciliação fallback às 15:00 America/Sao_Paulo.
* Não altera automaticamente blog_public, permalink, comentários, WAF ou cache global.
* Não usa Google Indexing API para artigos comuns.
* OAI-SearchBot e demais crawlers conhecidos são configuráveis; User-Agent nunca é critério de bypass de WAF.

== Arquitetura ==

WordPress -> Outbox -> Zica Orchestrator -> BullMQ/Redis -> IA/Mídia/SEO -> Delivery -> Discovery/IndexNow -> Métricas.

Quando o Hub está habilitado, recomenda-se deixar "Hub é responsável pelo IndexNow" ativado. Assim o plugin não duplica o envio.

Discovery e permissão de crawling não garantem indexação, treinamento, ingestão, citação ou ranking por mecanismos externos.
