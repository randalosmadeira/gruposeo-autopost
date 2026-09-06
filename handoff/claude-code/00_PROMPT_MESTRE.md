# Prompt mestre de continuidade — Zica.IA / Zica Posts

Cole o bloco abaixo em uma nova sessão do Claude Code aberta na raiz deste repositório.

```text
Você assumirá a continuidade técnica do Zica.IA / Zica Posts no repositório randalosmadeira/gruposeo-autopost.

Antes de qualquer alteração:
1. Leia integralmente CLAUDE.md.
2. Leia todos os arquivos em handoff/claude-code/.
3. Leia as skills em .claude/skills/ e selecione somente as aplicáveis.
4. Leia os agentes em .claude/agents/; use-os apenas quando as tarefas forem independentes e não editarem os mesmos arquivos.
5. Execute git status --short --branch e git log -5 --oneline.
6. Confirme que o commit e5d3589f4db289bb48362f2e6d6d5fcc25017ed4 ou um descendente está presente.

Objetivo imediato: prosseguir exclusivamente no módulo de entrada e planejamento editorial em massa. Consolidar importação de palavras-chave por texto, CSV e XLSX; upload de imagens em lote; fontes RSS; seleção de projeto, portal, categoria, público, cidade, frequência e quantidade; detecção de duplicidade; estimativa de consumo; prévia; fila com estados; auditoria; e reprocessamento por etapa.

Restrições absolutas desta fase:
- Não publicar conteúdos reais.
- Não operar cPanel, navegador, WordPress ou deployment.
- Não aplicar migrações no Supabase remoto sem autorização explícita.
- Não usar nem exibir senhas, tokens, service_role ou segredos.
- Preservar organização/projeto em toda leitura e mutação.
- Exigir RLS, autorização por papel, idempotência e auditoria.
- Em operações parciais, usar compensação/rollback e registrar falhas.
- Não afirmar que algo passou sem executar o comando correspondente.

Estado herdado: o commit e5d3589 implementa a primeira versão segura do planejamento em massa. A migração 20260906190000_editorial_mass_planning.sql existe no repositório, mas não foi aplicada remotamente. A suíte tinha 140 testes aprovados e o build passou no ambiente de origem. O lint global tinha cerca de 390 erros preexistentes; diferencie regressões novas da dívida antiga. O push do commit não foi confirmado porque o ambiente de origem não tinha credenciais Git.

Modo de trabalho:
- Inspecione antes de modificar.
- Proponha o próximo microbloco com critério de aceite.
- Faça patch mínimo e reversível.
- Adicione testes.
- Rode testes direcionados, npm test e npm run build.
- Relate OUTCOME, EVIDENCE, CHANGES, VALIDATION, REMAINING_RISKS e NEXT.

Primeira tarefa: audite a implementação do commit e5d3589, confirme o estado atual sem publicar/aplicar nada e apresente um plano curto para fechar lacunas de produção do módulo de planejamento editorial em massa. Só então implemente o primeiro microbloco autorizado pelo escopo.
```
