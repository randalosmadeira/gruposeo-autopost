# Zica Orchestrator 3.11.0

Camada externa do Zica.ai para retirar IA, mídia, backpressure e distribuição do request PHP do WordPress.

Execute dois processos: API `node dist/server.js` e Worker `node dist/worker.js`. O API recebe `/webhooks/wordpress` com HMAC; o worker executa BullMQ, IA opcional, delivery, IndexNow batching, CDN purge opcional e reconciliador das 15:00 em `America/Sao_Paulo`.

## Segurança
- Redis recebe `credential_ref`, nunca chaves SSH/API brutas.
- Segredos são resolvidos por adapter de vault; o adapter inicial usa `ZICA_CREDENTIALS_JSON` e deve ser substituído por Secret Manager em produção.
- SFTP não executa shell: upload temporário + rename.
- URLs privadas/locais são recusadas.
- WAF não é alterado e User-Agent não é usado como autorização.
- Google Indexing API não é usada para artigos comuns.

Queues: `zica:content` e `zica:index-flush`. URLs IndexNow ficam em Redis Sets por target, sem `KEYS`.

Targets e event ledger ficam no Supabase em `zica_orchestrator_targets` e `zica_orchestrator_events`, guardando somente referências de credenciais.

O worker usa concorrência 5 e limitador 20 jobs/10s, ajustáveis após observabilidade de CPU/MySQL/quota. Às 15h de São Paulo usa lock Redis diário para enfileirar reconciliação por target; WP-Cron permanece como fallback.

## Apoiadores 1470 (pipeline VPS v8)

`POST /supporter-avatar/dispatch` recebe `{requestId, jobId, dispatchToken}` da Edge Function pública, valida o hash do token no job e enfileira em `zica-supporter-avatar`. O worker faz uma chamada de visão (seleção), uma geração `gpt-image-2` 1024x1536 sem texto, renderiza os três formatos com sharp + identidade vetorial (`src/supporter-avatar/brand-1470.ts`, `render.ts`) e um QA advisory. Nenhum selo é desenhado na imagem. Env opcionais: `OPENAI_IMAGE_MODEL`, `OPENAI_VISION_MODEL`, `SUPPORTER_AVATAR_IMAGE_QUALITY` (low|medium|high), `SUPPORTER_AVATAR_CONCURRENCY`.

Modelo de imagem: padrão `gpt-image-2.5-sunburst` (comparativo real de 2026-09-25 com a mesma foto: sunburst 28 s / fidelidade 90; gpt-image-2 83 s / 90; 2.5-flare ~20 s por geração mas precisou de 3 para chegar a 95; gpt-image-1 trocou roupa e inventou texto). Reversível por env `OPENAI_IMAGE_MODEL`. Override por pedido: `supporter_avatar_requests.provider_preference = 'openai:gpt-image-1'` (allowlist em `IMAGE_MODEL_ALLOWLIST`); o modelo usado fica em `supporter_avatar_outputs.model`.
