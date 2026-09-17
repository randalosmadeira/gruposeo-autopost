# Auditoria de agentes de IA, tokens e código morto - 2026-09-16

Auditoria de leitura completa do repositório (produto, backend, tokens/custos,
identidade visual). Remediação aplicada em 2026-09-17 na branch
`fix/auditoria-2026-09-16-remediacao`.

## Causa raiz

1. Commit `764c765` (e `5649643`/`cfb80da`, `gpt-engineer-app[bot]`,
   2026-08-22) apagou 3.419 linhas de lógica real em 9 arquivos e deixou
   stubs de 17 linhas citando um `instrucoes.md` que nunca existiu no repo.
   `ai-chat`, `gbp-audit`, `generate-secondary-keywords`,
   `generate-authority-plan`, `news-agent` e `auto-publish-article` ficaram
   sem nenhuma chamada de IA.
2. `token_usage_logs` teve suas policies de RLS removidas em
   `20260905195700_enforce_admin_only_technical_controls.sql` e nunca
   recriadas - a tela "Consumo de Tokens" sempre retornava vazia.
3. `byok-resolver.ts` gravava `estimated_cost_usd: 0` sempre, com
   `cost_pending_pricing_resolution: true` nunca resolvido; `organization_id`
   em `token_usage_logs` só tinha um backfill único (sem trigger), então toda
   linha inserida depois de 05/09 ficava com organização nula e
   `organization_usage_ledger` nunca recebia consumo de IA.
4. Três functions (`electoral-content-variations`, `generate-supporter-avatar`,
   `electoral-editorial-action`) tinham `gpt-5.6-sol`/`gpt-5.4-mini`
   hardcoded - nomes internos do runtime Codex, não identificadores válidos
   de API pública (`ai-orchestrator.ts` já documentava isso, mas a correção
   não tinha sido replicada).
5. `electoral-content-variations` lia chave de API só de `user_settings`, sem
   fallback ao Vault - desde a política de chave única (2026-09-07) essa
   coluna está sempre vazia, então a função sempre retornava 503.

## Correções

- Modelos inválidos trocados por `gpt-4o-mini`/`gpt-4o`; as 4 functions com
  resolução de chave própria passaram a usar `byok-resolver.ts`
  (`fetchUserKeys`), o mesmo caminho que `generate-article` já usa.
- `ai-chat` e `gbp-audit` restaurados a partir do commit pai do wipe,
  adaptados à arquitetura atual (`orchestrator.callStream` não existe mais -
  substituído por `callWithMeta` com um stream SSE de um único chunk).
- `generate-secondary-keywords`, `generate-authority-plan`, `news-agent` e
  `auto-publish-article` (zero chamadores hoje, confirmado por busca no
  frontend/cron) retornam `410 endpoint_retired` em vez de fingir sucesso.
- `ANTHROPIC_ECONOMY_MODEL` (existia mas nunca era referenciado) passou a
  ser usado em `title_generation`/`meta_description`.
- `generate-article` ganhou limite de tamanho em `sourcesContext`/
  `customInstructions` (mesmo padrão de `rewrite-news`/`analyze-url-content`).
- Migração `20260917010000_token_cost_governance.sql`: recria as policies de
  `token_usage_logs` (dono + membro da organização), cria
  `model_pricing_catalog` com os modelos reais do orquestrador, e dois
  triggers (`trg_price_token_usage_log`, `trg_ledger_token_usage_log`) que
  calculam custo real e espelham cada linha em `organization_usage_ledger`.
- `src/test/zica-stability-regression.test.ts` e
  `src/test/token-cost-governance.test.ts` travam essas correções.

## Fora de escopo (decisão explícita)

- Reserva prévia de cota por token em `usage_quota_reservations` (o `CHECK`
  de `metric` nem aceita esses valores hoje) - fica para uma rodada futura;
  esta correção só resolve visibilidade do que já foi gasto.
- Pipeline de 4 agentes (`_shared/agents/agent-pipeline.ts`) permanece
  desligado do `generate-article` padrão; entra como modo opcional, não
  substitui a geração hoje.
