# Zica.IA / Zica Posts — instruções para Claude Code

Leia primeiro `handoff/claude-code/00_PROMPT_MESTRE.md` e `handoff/claude-code/01_ESTADO_ATUAL.md`.

## Missão atual

Continuar o sistema a partir do commit `e5d3589f4db289bb48362f2e6d6d5fcc25017ed4`, priorizando o módulo de entrada e planejamento editorial em massa. Não publicar conteúdo real nesta fase.

## Regras invioláveis

- Preserve isolamento por `organization_id` e `project_id`, RLS, autorização por papel e menor privilégio.
- Toda mutação distribuída precisa de idempotência, auditoria, compensação/rollback e estado observável.
- Nunca exponha `service_role`, tokens, senhas, chaves ou conteúdo de `.env`.
- Não aplique migrações remotas, faça deploy, publique no WordPress, opere cPanel ou altere infraestrutura sem autorização explícita.
- Não afirme que testes, build, migração ou deploy passaram sem executar e registrar evidência.
- Antes de editar, inspecione o código real e mantenha patches pequenos e reversíveis.
- Não apague nem sobrescreva mudanças do usuário.

## Fluxo obrigatório

1. Rode `git status --short --branch` e confirme o commit-base.
2. Leia `package.json`, `src/App.tsx`, a área tocada e os testes relacionados.
3. Para Supabase, leia as migrações anteriores e valide RLS, funções privilegiadas, grants e Storage.
4. Implemente um microbloco por vez.
5. Rode testes direcionados, depois `npm test` e `npm run build`.
6. Registre limitações reais. O lint global possui dívida técnica preexistente; não esconda isso.

## Limite de publicação

Trate publicação como `DENY` por padrão. O planejamento pode chegar a `review`, `queued`, `processing`, `draft_ready`, `completed`, `partial`, `failed` ou `cancelled` conforme o modelo existente, mas nenhum fluxo novo pode enviar conteúdo a WordPress ou a um portal público nesta fase.

## Skills e agentes

As instruções portáveis ficam em `.claude/skills/` e os papéis especializados em `.claude/agents/`. Eles são auxiliares; este arquivo e os documentos de handoff têm precedência.
