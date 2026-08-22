# Plano de Limpeza Final e Implementação da v5.0

Este plano visa concluir a remoção total de vestígios do sistema de prompts legado e preparar a plataforma para operar exclusivamente sob as novas diretrizes da **unidade ADV (RDM Advogados)** descritas no arquivo `agentes-conteudo-v5-atualizados-2.md` e `instrucoes-2.md`.

## Ações Realizadas

- [x] Criação da página inicial (`src/pages/index.tsx`) com o texto solicitado.
- [x] Atualização da navegação (`src/App.tsx` e `src/components/layout/Sidebar.tsx`).
- [x] Limpeza das Edge Functions (`generate-article`, `rewrite-news`, `ai-chat`, etc.) para placeholders limpos.
- [x] Limpeza das regras compartilhadas (`_shared/behavioral-directives.ts` e `_shared/seo-prompt-builder.ts`).
- [x] Esvaziamento de templates padrão na UI (`src/pages/Hiperlocal.tsx`).

## Próximos Passos

### 1. Ajuste do Texto Visual Solicitado
- Atualizar `src/pages/index.tsx` para refletir o texto exato solicitado pelo usuário: *"Leia o arquivo instrucoes.md em anexo e siga as instruções. Analise também os demais arquivos anexados."*

### 2. Implementação do "Portão" e Declaração de Unidade (v5.0)
- Configurar as Edge Functions para exigir a **Declaração de Unidade (ADV)** antes de qualquer geração, conforme o **BLOCO 00 — PORTÃO** da v5.0.
- Implementar as restrições do **Provimento 205/2021 da OAB** (sem promessa de resultados, sem superlativos).

### 3. Atualização das Regras de Originalidade e GEO
- Ajustar os validadores para a nova regra de **40% de originalidade** (antes era 25%).
- Unificar a reescrita de título para **80% de originalidade**.
- Implementar a regra de **Frontloading**: primeira frase com no máximo 30 palavras.

### 4. Gestão de Dados Jurídicos
- Adicionar obrigatoriedade da tag `[VERIFICAR]` para dados jurídicos incertos.

## Detalhes Técnicos

- **Frontend**: O componente `Index` em `src/pages/index.tsx` será atualizado.
- **Backend (Edge Functions)**:
    - `supabase/functions/generate-article/index.ts`: Integrar o portão OAB e as novas métricas de originalidade.
    - `supabase/functions/rewrite-news/index.ts`: Atualizar para o padrão v5.0.
- **Shared**:
    - `supabase/functions/_shared/behavioral-directives.ts`: Injetar o BLOCO 00 e as novas diretrizes da v5.0.
