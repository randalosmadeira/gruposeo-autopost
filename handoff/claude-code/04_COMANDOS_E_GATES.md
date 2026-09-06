# Comandos e gates

## Bootstrap

```bash
npm ci
npm test
npm run build
```

O serviço separado possui seu próprio `package.json` em `services/zica-orchestrator/`.

## Inspeção obrigatória

```bash
git status --short --branch
git log -5 --oneline
git diff --check
```

## Testes do módulo

```bash
npx vitest run src/test/editorial-planning.test.ts src/test/editorial-planning-migration.test.ts
npm test
npm run build
```

## Gate de segurança

- Nenhuma credencial versionada.
- Nenhum destino real acionado.
- Nenhuma migração remota aplicada sem autorização.
- Todas as tabelas novas com RLS.
- Toda função privilegiada revisada quanto a `search_path`, autenticação, autorização e grants.
- Toda mutação com tenant/projeto, idempotência e auditoria.
- Rollback/compensação documentados.

## Git

O ambiente de origem não confirmou o push. No destino, verifique o remoto e compare o commit antes de tentar enviar qualquer coisa. Não force push.
