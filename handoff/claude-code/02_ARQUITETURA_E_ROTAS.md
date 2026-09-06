# Arquitetura e rotas

## Componentes

| Área | Local |
|---|---|
| SPA React/Vite | `src/` |
| Rotas | `src/App.tsx` |
| Supabase client/types | `src/integrations/supabase/` |
| Migrações e functions | `supabase/` |
| Orquestrador Node | `services/zica-orchestrator/` |
| WordPress | `wordpress/` e `public/wordpress-*` |
| Prompts existentes | `public/templates/system-prompt-*.md` |
| Documentação/auditorias | `docs/` |

## Rotas públicas

- `/auth`
- `/1470`, `/apoiadores`, `/apoiadores/avatar`, `/collab/:campaignSlug`

## Rotas autenticadas principais

- `/`, `/dashboard`, `/calendar`, `/academia`
- `/articles`, `/articles/new`, `/articles/bulk`, `/articles/:id`, `/articles/:id/edit`
- `/keywords/bulk` — entrada e planejamento editorial em massa
- `/authority-planner`, `/news-agents`, `/news-agents/new`, `/news-rewriter`
- `/projects`, `/internal-linking`, `/account`, `/integrations`, `/help`, `/ai-chat`
- `/electoral-campaign` e subrotas
- `/auditoria-gbp`, `/hiperlocal`

## Rotas administrativas

- `/wordpress-monitor`, `/queue-monitor`
- `/admin/ai-engine`, `/admin/prompts`, `/admin/queues`, `/admin/organizations`

Aliases e redirects continuam definidos em `src/App.tsx`; considere o arquivo como fonte canônica. Rotas WordPress/publicação estão presentes por legado e futuro, mas são proibidas no escopo atual.
