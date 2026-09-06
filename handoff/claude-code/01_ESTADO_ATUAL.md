# Estado atual verificado

Data do handoff: 2026-09-06.

| Item | Estado |
|---|---|
| Repositório | `randalosmadeira/gruposeo-autopost` |
| Branch local | `feature/editorial-mass-planning` |
| Commit funcional | `e5d3589f4db289bb48362f2e6d6d5fcc25017ed4` |
| Push remoto | Não confirmado; faltaram credenciais no ambiente de origem |
| Migração editorial | Criada, não aplicada remotamente |
| Publicação real | Suspensa/proibida nesta fase |
| Testes no ponto de origem | 140 aprovados |
| Build no ponto de origem | Aprovado |
| Lint global | Aproximadamente 390 erros preexistentes |

## Implementação entregue

- `src/pages/BulkKeywordGenerator.tsx`: fluxo de entrada, configuração, prévia e criação do plano.
- `src/lib/editorial-planning.ts`: normalização, duplicidade local, estimativa e idempotência.
- `src/services/editorialPlanning.ts`: RPC, upload/registro de imagens e compensação básica.
- `supabase/migrations/20260906190000_editorial_mass_planning.sql`: planos, itens, RSS, ativos, auditoria, RLS, RPCs, Storage e bloqueio de publicação.
- `src/test/editorial-planning.test.ts` e `src/test/editorial-planning-migration.test.ts`: cobertura inicial.

## Lacunas a auditar antes de produção

- Aplicação real da migração e advisors não foram executados.
- Testes de banco/RLS contra instância local ou de staging ainda são necessários.
- Validar atomicidade e semântica de replay quando uploads sucedem após RPC idempotente.
- Validar experiência e limites de arquivos grandes/lotes grandes.
- Confirmar política de retenção, descarte e reprocessamento de imagens com falha.
- Definir workers futuros para estados após `queued`, sem publicar.
- Reduzir dívida de lint por escopo, sem reescrita ampla.

## Rollback

O commit pode ser revertido como unidade antes de qualquer migração remota. Após aplicação em staging/produção, criar migração de rollback compatível em vez de editar a migração histórica. Preservar dados de auditoria e exportá-los antes de remover tabelas.
