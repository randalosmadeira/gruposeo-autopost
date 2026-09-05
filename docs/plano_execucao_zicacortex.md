# Plano de execução cronológico: ZICACORTEX e ZICA Posts

## Princípios vinculantes

- ZICA Posts e ZICACORTEX permanecem em repositórios, bancos, credenciais, filas, runtimes, portas e ciclos de release separados.
- Nenhuma promoção para produção ocorre antes de CI, testes direcionados, validação em staging, evidências e aprovação administrativa.
- Reprocessamento de artigos é idempotente. Registros com erro não são apagados.
- Falhas técnicas não são persistidas em campos editoriais. Permanecem em logs estruturados e campos operacionais sem segredos.
- Usuários legados e `case_forensic_pages` são preservados. Nenhum DROP está autorizado.

## Matriz de execução

| Fase | Sistema | Repositório | Ambiente inicial |
| --- | --- | --- | --- |
| 1 a 3 | ZICA Posts | `randalosmadeira/gruposeo-autopost` | branch isolada e staging |
| 4 | ZICACORTEX | `randalosmadeira/Zica-sistema-forense` | PR #10 e staging |

## 1. Desbloqueio operacional imediato do ZICA Posts

- [ ] Validar Anthropic no backend antes de defini-lo como provedor primário.
- [ ] Configurar Gemini somente por secret/Vault, nunca em código ou variável pública.
- [x] Implementar failover para 429, 5xx e timeout no orquestrador.
- [ ] Testar falha transitória do primário e sucesso do secundário.
- [ ] Identificar exatamente os 23 artigos em erro, sem exclusão.
- [ ] Reenfileirar com chave idempotente e lote controlado.
- [ ] Confirmar transição de erro para processamento e concluído.
- [ ] Verificar saúde dos quatro conectores WordPress.

## 2. Esteira de autocura

- [ ] Centralizar política de timeout, retry, backoff, jitter e circuit breaker.
- [ ] Manter observabilidade por correlation ID, provedor, tentativa e resultado, sem chaves ou conteúdo sensível.
- [ ] Agente Adão: container editorial de 880 px, normalização de Markdown, H2/H3 e imagens 16:9.
- [ ] Agente Lívia: meta-title entre 50 e 60 caracteres, meta-description entre 145 e 158 e resposta AEO nas primeiras 28 palavras.
- [ ] Gerar derivados para LinkedIn, Instagram, X, Newsletter e WhatsApp após o gate editorial.

## 3. SEO e distribuição

- [ ] Configurar clusters com um artigo pilar e três a cinco satélites.
- [ ] Validar links internos existentes antes de inserir novos.
- [ ] Ativar terceiro sentinela apenas com fontes permitidas, deduplicação e revisão.
- [ ] Confirmar arquivo IndexNow em cada domínio e submissão separada por host.
- [ ] Validar `sameAs` com entidades oficiais, sem duplicidade ou referência incorreta.

## 4. Núcleo jurídico ZICACORTEX

- [ ] Criar namespaces separados para biblioteca doutrinária e documentos do caso.
- [ ] Aplicar `tenant_id` em registros, índices, filas, armazenamento e recuperação vetorial.
- [ ] Testar negativamente acesso cruzado entre tenants.
- [ ] Implementar pipeline Material -> Processual -> Constitucional -> Doutrinário -> Pericial.
- [ ] Bloquear minuta final quando faltarem fatos, datas, cálculos ou documentos essenciais.
- [ ] Exibir `[ALERT_CARD]` com lacunas objetivas e ação humana requerida.
- [ ] Preservar usuários legados e `case_forensic_pages`.

## Gates de promoção

- [ ] Lint e typecheck.
- [ ] Testes unitários e de contrato.
- [ ] Testes de fila, retry, idempotência e dead letter.
- [ ] Auth, sessão, rotas, APIs, tenant e RLS.
- [ ] E2E autenticado em staging.
- [ ] Evidências de conectores, artigos reprocessados e comparação visual.
- [ ] Aprovação administrativa explícita.
