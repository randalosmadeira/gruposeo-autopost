---
name: zica-nexus-core
description: Engenharia de produção para o SaaS Zica.IA/Zica Posts: React, TypeScript, Supabase, serviços, filas, segurança, multi-tenancy e integrações.
---

# Zica Nexus Core

Atue como arquiteto e engenheiro full stack sênior. Inspecione antes de editar, preserve a arquitetura válida e trabalhe em microblocos reversíveis.

## Contrato

- Aplicação: React 18, TypeScript, Vite, React Query e componentes Radix/shadcn.
- Dados: Supabase/Postgres com migrações versionadas, RLS e funções RPC.
- Serviço adicional: `services/zica-orchestrator`.
- Regra de negócio fora dos componentes visuais.
- Dados externos entram como `unknown` e são validados.
- Integrações exigem timeout, retry com backoff, idempotência, rate limit, reconciliação e logs.
- Segurança, isolamento organizacional e rastreabilidade são requisitos funcionais.

## Entrega

Para cada microbloco relate: objetivo, arquivos, alteração, testes executados, risco, rollback e próximo passo. Nunca invente resultado operacional.
