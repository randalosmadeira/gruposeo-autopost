# Snapshot de produção — 12/11/2026

Estado observado no projeto Supabase `ubahrbgaxrkjxklytobl` e na VPS em 12/11/2026, trazido para o Git nesta branch
porque produção estava à frente de qualquer ref (`main` = ba348b9, 02/10; pilha NEXUS #130/#131/#132 instalada por SSH sem merge).

## Funções recuperadas de produção (não existiam em nenhum ref)

| Função | Versão prod | Origem do fonte | Observação |
|---|---|---|---|
| `rdm-manual-editorial` | 5 | `get_edge_function` | lote fixo de 13 pautas criminais; captura `fetch` antes do `installSpendLock()` (contorna o bloqueio global) |
| `rdm-manual-aditamentos` | 3 | `get_edge_function` | UUID do dono fixo no código; gpt-4.1-mini |
| `rdm-batch-discovery` | 1 | `get_edge_function` | discovery/refresh + indexnow/batch do lote; não paga |
| `nexus-review-import` | 6 | `get_edge_function` | inclui `_shared/nexus-review-import.ts` e `_shared/nexus-word-floor.ts` |

Arquivos `_shared` que divergiam da branch e foram alinhados à produção: `nexus-spend-lock.ts` (ganhou `wordpressConnectorAllowed`),
`publication-quality.ts` (exceção para aviso antifraude).

## Migrações recuperadas (`supabase_migrations.schema_migrations.statements`)

20261028215911 nexus_private_visual_cache · 20261028224612 nexus_news_thematic_visual_briefs · 20261028234352 nexus_review_import ·
20261110211340 rdm_manual_editorial · 20261110230129 rdm_manual_review_capacity · 20261110231337 rdm_manual_repair ·
20261111025540 rdm_manual_aditamentos · 20261111030807 rdm_aditamentos_available_model_budget.

## Atenção antes de qualquer `supabase db push`

As cinco migrações NEXUS da pilha #130–#132 estão no repositório com versões **diferentes** das aplicadas em produção
(repo 20261028153533/160955/185425/193229/194749 × prod 20261028155424/161012/191051/193528/194909).
Um `db push` tentaria reaplicá-las. Antes do primeiro deploy por CLI é obrigatório `supabase migration repair --status applied`
para as versões do repositório e `--status reverted` para as versões de produção, ou renomear os arquivos do repo para as versões de produção.

## O que continua fora do Git

- Frontend publicado `nexus-20261110-a13f1a1d15c0` (build; o fonte corresponde a esta pilha, mas o artefato exato não foi versionado).
- Conteúdo das tabelas (lotes RDM, observações manuais) — dados, não código.
