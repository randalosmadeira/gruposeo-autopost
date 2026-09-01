# Zica Orchestrator 3.10.2

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
