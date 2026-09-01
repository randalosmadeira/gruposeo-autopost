# Zica Posts 3.10.1 — Hardening & Neural Distribution

Esta release mantém a arquitetura leve do WordPress e prepara integração industrial com o futuro Zica Orchestrator.

## Objetivos
- Outbox persistente de eventos WordPress.
- Idempotência por hash de conteúdo e correlation ID.
- HMAC SHA-256 com timestamp e nonce para chamadas Hub -> WordPress.
- Supressão de loops de sincronização.
- Batching IndexNow por domínio.
- Robots e arquivos de discovery configuráveis sem tornar o site globalmente permissivo por padrão.
- Cache-Control limitado a recursos públicos de discovery.
- Webhook assíncrono para Orchestrator.
- Telemetria e status de entrega.
- Identidade visual Neural Cortex na página do plugin.

## Não implementado por segurança
- Alteração automática de permalink, comentários ou blog_public.
- Cache-Control público global.
- Google Indexing API para artigos comuns.
- Bypass de WAF baseado apenas em User-Agent.
- Escrita SFTP interpolando comandos shell.

## Contrato
- Software ID: `zica-posts`
- Versão: `3.10.1`
- Namespace canônico: `/wp-json/zica-posts/v1/`
- Aliases temporários: `/wp-json/zica-ai/v1/` e `/wp-json/cfrdm/v1/`
