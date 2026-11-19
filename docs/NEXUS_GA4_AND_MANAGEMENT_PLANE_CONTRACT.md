# Contrato: Google Analytics 4 + plano de gerenciamento (gestor × cliente) — 13/11/2026

Estado: **proposto, em construção local**. Nada disto vai a produção sem autorização escrita do dono. Contexto do negócio: o dono usa as próprias empresas (RDM Advogados, Elas Tracy, Grupo SEO MKT, Conquista PRIME, Jurídico Explicado) como piloto; depois o sistema será **revendido**. O cliente terá acesso aos **dados dele** e poderá fazer **solicitações**; conectar fontes, trocar chaves, vincular ou atualizar plugin, execução paga e qualquer ajuste técnico avançado **só pela conta de gerenciamento (GESTOR)**.

Leia antes de codar: `docs/NEXUS_PROVIDERS_CONTRACT.md`, `docs/NEXUS_PROVIDERS_CONTRACT_ADENDO.md`, `docs/NEXUS_PROVIDERS.md`, `docs/NEXUS_SCHEMA_SYNC.md`, e o código de `supabase/functions/nexus-intelligence/index.ts`, `nexus-audit/index.ts`, `_shared/nexus-providers.ts`, `_shared/nexus-gsc.ts`, `_shared/nexus-search-sync.ts`, `_shared/nexus-audit.ts`, `_shared/request-auth.ts`, `organization-console/index.ts` (padrão de checagem de `app_role`), `src/pages/NexusProviders.tsx` e `src/components/nexus-providers/*`.

## Regras absolutas
1. **Nenhuma ação em produção.** Proibido: `apply_migration`, `deploy_edge_function`, `execute_sql` com DDL/DML, `delete_branch`, ssh/scp, push, merge, `supabase db push`. Consultas de leitura (select) ao projeto `ubahrbgaxrkjxklytobl` são permitidas só para conferir estrutura. Testes de SQL: use o que já existe em `scratchpad` (pg em memória) ou raciocínio sobre o SQL; se não der para executar, escreva "SQL não executado" no relatório.
2. Não commitar. Deixe as alterações no working tree. Nada de segredos em arquivos, logs ou testes (use valores sintéticos).
3. Nenhuma chamada paga. GA4 Data API é gratuita; a auditoria continua sem chamada paga e a lista branca de correções automáticas só ganha `analytics_sync`.
4. Não use `any` novo (o lint tem baseline de 456 `no-explicit-any`; não aumente). Rode o script de verificação do projeto (veja `package.json`; não invente comando) e os testes pertinentes; relate o que realmente rodou.
5. Preserve o estilo (comentários em português, `jsonb` e RLS como nos arquivos vizinhos). Nada de refatoração fora do escopo.

## A. Plano de gerenciamento (gestor × cliente)
**Definições.** *Gestor* = usuário com `app_metadata.app_role = 'ceo'` (mesmo critério de `public.is_ceo()` e de `organization-console`). *Org interna* = `organizations.kind = 'internal'` (hoje "CEO / Gestor", 8 projetos). *Org cliente* = `kind = 'client'` (hoje "Cliente Teste", sem projetos). *Membro* = linha ativa em `organization_members`.

**Capacidade `can_manage_technical(user, org)`** = gestor **ou** (org interna **e** papel `owner`/`admin`). Em org cliente, nem o `owner` do cliente passa.

**Ações técnicas (exigem `can_manage_technical`):** `store_credential`, `provider_credential_remove`, `execution_settings_set`, `provider_health_check` (grátis, mas é diagnóstico técnico), `search_performance_sync`, `ga4_sync`, `project_integrations_set`, e no `nexus-audit` o `apply_fix` e o `run` manual. Erro: HTTP 403 `{"error":"manager_required"}`.
**Leitura (qualquer membro ativo):** `providers_overview`, `search_performance`, `ga4_summary`, `content_performance`, `overview` da auditoria, `update_finding` (reconhecer/adiar), `requests_list`.
**Solicitações (qualquer membro ativo cria; só gestor atualiza):** `request_create`, `requests_list`, `request_update`.

**Resposta de `providers_overview` passa a incluir:** `viewer: { role: 'manager'|'org_admin'|'client', can_manage_technical: boolean }`. Manter `viewer_is_admin` (valor = `can_manage_technical`) por compatibilidade. Para quem não gerencia, `providers_overview` **não** devolve `last_four`, `detail` de saúde nem `quota` com identificadores técnicos: devolve só `status` simplificado (`connected|attention|not_connected`), última atualização e métricas de uso agregadas.

**Tabela `public.nexus_client_requests`:** `id uuid pk default gen_random_uuid()`, `organization_id uuid not null`, `project_id uuid null`, `requested_by uuid not null`, `kind text check in ('connect_source','plugin_link','plugin_update','new_observation_round','report','access','other')`, `message text check (char_length between 3 and 1000)`, `status text default 'open' check in ('open','in_progress','done','rejected')`, `manager_note text check (<=1000)`, `created_at`, `updated_at`, `resolved_at`. RLS: membros leem as da própria organização (e o gestor lê todas via service role na função); escrita só `service_role`. Realtime. Limite: 20 solicitações abertas por organização (HTTP 429 `too_many_open_requests`). `request_update` aceita `status` e `managerNote`.

## B. GA4 (Google Analytics Data API)
**Provedor `ga4`** entra no catálogo (`FREE_HEALTH_PROVIDERS` inclui `ga4`, junto de gsc e bing_webmaster), ordem logo depois de `bing_webmaster`. Credencial: **o mesmo formato JSON de conta de serviço do `gsc`** (pode ser o mesmo arquivo; ainda assim guardada separada). Escopo OAuth `https://www.googleapis.com/auth/analytics.readonly`; reutilize o código de JWT RS256 de `_shared/nexus-gsc.ts` (extraia função comum se for pequeno e seguro, sem quebrar os testes existentes do GSC).
**ID da propriedade** por projeto em `projects.commercial_info.ga4_property_id` (somente dígitos, 5 a 15). Ação `project_integrations_set { projectId, ga4PropertyId?, gscProperty? }` (gestor) valida e grava no `commercial_info` sem apagar outras chaves. **Nunca compartilhar propriedade GA4 entre sites**: se o mesmo ID aparecer em dois projetos da organização, a ação recusa (`ga4_property_already_used`).
**Coleta (`_shared/nexus-ga4.ts`):** `POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport`. Dimensões `date`, `pagePath`, `sessionDefaultChannelGroup`, `sessionSource`; métricas `sessions`, `engagedSessions`, `screenPageViews`, `totalUsers`, `userEngagementDuration`, `keyEvents` (confirme os nomes na documentação oficial; se algum mudou, use o vigente e documente). Paginação (`limit` 100000, `offset`), janela 1 a 90 dias (padrão 28), no máximo 5 páginas. `is_ai` calculado no código para `sessionSource` conhecidos de assistentes (chatgpt.com, chat.openai.com, openai.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, claude.ai, you.com, phind.com, etc.), lista exportada e testada. Normalizar `pagePath` (sem query, máximo 1000 caracteres, `/` quando vazio); texto da fonte máximo 200.
**Tabela `public.nexus_analytics_daily`:** `id bigserial pk`, `organization_id`, `project_id` (fk, on delete cascade), `day date`, `page text default ''`, `channel text default ''`, `source text default ''`, `is_ai boolean default false`, `sessions int`, `engaged_sessions int`, `page_views int`, `users int`, `engagement_seconds numeric`, `key_events numeric`, `synced_at timestamptz default now()`, `unique(project_id, day, page, channel, source)`. RLS leitura por membro; escrita só `service_role`. Índice `(project_id, day)`.
**Sincronização:** ação `ga4_sync { projectId, days? }` (gestor) com a mesma disciplina de `syncSearchPerformance`: nunca lança, upsert idempotente em lotes de 500, devolve `{ property, from, to, rows_upserted, truncated, results }`, erros por código (`ga4_not_configured`, `ga4_property_required`, `ga4_forbidden` quando a conta de serviço não tem acesso à propriedade, `ga4_quota`, `ga4_unreachable`). O teste de saúde do `ga4` valida o token e, se houver propriedade conhecida, consulta `getMetadata` (gratuito).
**RPCs (security invoker, RLS vale):**
- `nexus_analytics_summary(p_project uuid, p_from date, p_to date)` → `{ period, totals{sessions,engaged_sessions,page_views,users,engagement_rate,avg_engagement_seconds,key_events}, daily[], top_pages[], by_channel[], ai_referrals{totals, by_source[]}, last_synced_at }`.
- `nexus_content_performance(p_project uuid, p_from date, p_to date)` → por **área** (`wordpress_article_index.topic_cluster`, onde `analysis_version = 1000` marca a classificação heurística): `{ areas: [{ area, articles, gsc{clicks,impressions,ctr,position}, ga4{sessions,engaged_sessions,key_events,ai_sessions}, top_pages: [{ url, title, gsc..., ga4... }] }], unmatched{ gsc_pages, ga4_pages }, notes }`. Junção por **caminho** da URL (host ignorado, barra final ignorada, minúsculas). Páginas sem correspondência no índice aparecem em `unmatched`, nunca descartadas em silêncio. Limite 10 páginas por área.
**Atualização do `nexus_providers_overview`:** incluir `ga4` no catálogo e estender os checks de provedor para `ga4`. Migração nova **`supabase/migrations/20261113100000_nexus_ga4_management.sql`** (idempotente; comentários de reversão), cobrindo: check de provedor, `nexus_providers_overview`, `nexus_client_requests`, `nexus_analytics_daily`, as duas RPCs.

## C. Auditoria contínua (nexus-audit)
Regras novas em `_shared/nexus-audit.ts` (puras, com testes): `ga4.not_connected` (improvement, alta se o projeto tem GSC conectado), `ga4.property_missing` (corrective: credencial ativa mas projeto sem `ga4_property_id`), `ga4.sync_stale` (corrective, > 48 h), `ga4.no_data` (improvement), `content.internal_links_low` (improvement: projeto cujo índice tem média de links internos por conteúdo < 2, com a média e o total de conteúdos como evidência), `content.area_unclassified_high` (info: > 20% do índice `nao-classificado`). `FIX_TYPES` ganha `analytics_sync`; a correção automática só roda para `provider_health_check`, `search_performance_sync`, `analytics_sync`, `plugin_discovery_refresh`, `open_route`. `apply_fix` e `run` passam a exigir `can_manage_technical`; `update_finding` continua para qualquer membro. Nas organizações cliente, as regras de sistema (`security.*`, `runtime.*`) ficam ocultas na resposta de `overview` (continuam rodando para o gestor).

## D. Frontend (`/nexus/motores`)
- `canManage = overview.viewer.can_manage_technical`. **Visão cliente** (`canManage=false`): sem botões Conectar/Trocar chave/Remover, sem painel de execução paga, sem ativação guiada técnica, sem botão "Corrigir", sem últimos 4 dígitos; vê status simples dos motores, **Analytics**, **Tráfego de busca**, **Desempenho por área**, **Auditoria (apenas leitura e reconhecer/adiar)** e a aba **Solicitações**, com botão "Solicitar" por provedor e um formulário (tipo + mensagem).
- **Visão gestor:** tudo como hoje, mais o formulário de ID GA4/propriedade GSC por projeto, a caixa de entrada de solicitações (filtrar por status, responder, marcar em andamento/concluída/recusada) e o cartão GA4 na ativação guiada (reaproveita o JSON do GSC).
- **Aba Analytics (nova):** KPIs (sessões, engajamento, eventos-chave, usuários, tráfego de IA), série diária, canais, **fontes de IA**, top páginas; e **"Desempenho por área"**: tabela por área com artigos, cliques/impressões/posição (GSC) e sessões/engajamento/eventos-chave (GA4), ordenável, com as 10 melhores páginas por área e o aviso "classificação por palavras-chave, não revisão jurídica" quando `analysis_version=1000`. Estados vazios claros ("ainda sem dados: peça ao gestor para conectar").
- Acessibilidade e responsividade como o resto do módulo; sem alerta de cor apenas; textos em português.
- Tipos em `src/types/nexus-providers.ts` (e novo `src/types/nexus-analytics.ts`), cliente em `src/lib/`, hooks em `src/hooks/`, componentes em `src/components/nexus-providers/`.

## E. Testes e documentação
- Backend: testes unitários de `nexus-ga4.ts` (normalização, `is_ai`, paginação, erros), da capacidade `can_manage_technical` (gestor, owner de org interna, owner de org cliente, membro), das regras novas e de `reconcileFindings` com elas.
- Frontend: testes das telas Visão cliente × Visão gestor (nenhum campo de chave para cliente), Analytics e Solicitações.
- Docs: `docs/NEXUS_GA4.md` (roteiro de ativação do dono, erros comuns, o que é medido), `docs/NEXUS_MANAGEMENT_PLANE.md` (matriz de ações por papel, como testar com "CEO / Gestor" e "Cliente Teste", como o cliente solicita), atualização de `docs/NEXUS_PROVIDERS.md` (catálogo com `ga4`).

## F. Critérios de aceite
1. Org cliente (mesmo `owner`) não conclui nenhuma ação técnica pela API (403 `manager_required`) nem vê campos técnicos na tela; org interna e gestor conseguem.
2. `ga4_sync` com credencial sintética e `fetch` simulado grava linhas idempotentes (reexecutar não duplica) e nunca lança.
3. `nexus_content_performance` junta GSC e GA4 por caminho e lista o que ficou sem correspondência.
4. A auditoria nunca faz chamada paga; `analytics_sync` está na lista branca e é a única adição.
5. Typecheck/lint (sem novos `any`) e testes verdes; relatório diz o que rodou e o que não rodou.

## G. Envelopes das ações (nexus-intelligence, POST com `projectId` como nas ações atuais)
| Ação | Corpo (além de `action` e `projectId`) | Resposta 200 |
|---|---|---|
| `ga4_sync` | `days?` (1–90) | `{ result: { property, from, to, rows_upserted, truncated, results:[{source:'ga4',ok,rows_upserted,error?}] } }` |
| `ga4_summary` | `from?`, `to?` (YYYY-MM-DD) | `{ summary: <saída de nexus_analytics_summary> }` |
| `content_performance` | `from?`, `to?` | `{ performance: <saída de nexus_content_performance> }` |
| `project_integrations_set` | `ga4PropertyId?`, `gscProperty?` (string vazia = remover) | `{ integrations: { ga4_property_id: string\|null, gsc_property: string\|null } }` |
| `project_integrations_get` | (nenhum) | `{ integrations: { ga4_property_id, gsc_property } }` (qualquer membro; booleanos `configured` no lugar do valor para quem não gerencia: `{ ga4_configured, gsc_configured }`) |
| `request_create` | `kind`, `message` | `{ request }` |
| `requests_list` | `status?` | `{ requests: [...] }` (gestor vê as de todas as organizações que gerencia; membro, só as da própria) |
| `request_update` | `id`, `status?`, `managerNote?` | `{ request }` |
Erros: `{ error: <código> }` com 400/403/404/409/429 como no restante do módulo; 403 `manager_required` para ação técnica de quem não gerencia. Em `nexus-audit`: `overview` ganha `viewer: { can_manage_technical }`; `run` e `apply_fix` devolvem 403 `manager_required` quando negados.
