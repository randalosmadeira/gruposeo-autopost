---
name: zica-editorial-planning
description: Evolução do módulo de importação e planejamento editorial em massa, sem publicação real.
---

# Planejamento editorial em massa

Use `src/pages/BulkKeywordGenerator.tsx`, `src/lib/editorial-planning.ts`, `src/services/editorialPlanning.ts` e `supabase/migrations/20260906190000_editorial_mass_planning.sql` como fontes canônicas.

## Capacidades exigidas

- Entrada por texto, CSV e XLSX.
- Imagens JPEG, PNG e WebP em lote, até 15 MiB por arquivo.
- Fontes RSS por projeto.
- Projeto, portal, categoria, público, cidade, frequência e quantidade.
- Normalização, duplicidade no lote e duplicidade autoritativa no banco.
- Estimativa explícita de tokens/créditos e prévia antes de persistir.
- Fila auditável com estados e reprocessamento apenas da etapa falha.
- Chave de idempotência por tentativa lógica.

## Critérios

Não há publicação. `publication_enabled` permanece falso no banco. Não adicione transição para WordPress. Imagens só podem ser registradas após upload; se o registro falhar, remova o objeto recém-enviado. Replays idempotentes não podem duplicar planos.
