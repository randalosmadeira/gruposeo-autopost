# NEXUS · Plano de gerenciamento (gestor × cliente)

Estado: **construído localmente em 13/11/2026; nada foi publicado.** Contrato: `docs/NEXUS_GA4_AND_MANAGEMENT_PLANE_CONTRACT.md` (seção A, C e G). Documentos relacionados: `docs/NEXUS_PROVIDERS.md`, `docs/NEXUS_GA4.md`.

A regra de negócio: o **cliente** vê os **dados dele** e faz **solicitações**. Conectar fontes, trocar chaves, vincular ou atualizar plugin, execução paga e qualquer ajuste técnico avançado são **só do gestor** (a conta de gerenciamento). A regra vale **no servidor** (Edge Function e banco), não só na tela.

## Decisões tomadas onde o contrato era ambíguo (leia primeiro)

Em cada ponto escolhi a opção **mais restritiva para o cliente**. Se algo aqui não for o que você quer, é uma linha de ajuste.

1. **`kind` da organização e as chaves de integração estavam abertos pela API REST (achado, corrigido na migração).** Hoje o papel `authenticated` tem `UPDATE` na coluna `organizations.kind` e a política `organizations_admin_update` deixa o dono/admin de uma organização atualizá-la: um cliente poderia virar "interno" e ganhar as ações técnicas. Do mesmo modo `projects_org_update` deixa owner/admin/editor gravar `projects.commercial_info` direto (inclusive `ga4_property_id`). A migração `20261113100000` fecha os dois no banco com gatilhos (`nexus_guard_org_kind` e `nexus_guard_project_integrations`) e a função `public.nexus_can_manage_technical(org)`. A Edge Function (service role) passa; migrações e manutenção (`postgres`) passam; o gestor (`app_role = 'ceo'`) passa. Reversão: comentário no topo da migração.
2. **Ações técnicas além da lista do contrato.** `signals_key_create`, `signals_key_rotate` (vincular o plugin) e `homepage_schema_sync` (alterar o schema público da homepage pelo plugin) passam a exigir `can_manage_technical`; antes bastava ser dono/admin de qualquer organização. O contrato fala em "vincular ou atualizar plugin" e "ajuste técnico avançado". **Atualização de 13/11/2026 (decisão do dono):** a **coleta paga** passa a exigir a conta de gerenciamento: em `execute`, operações `serp` e `ai_observation` aplicam a regra `execute_collection` (403 `manager_required`, `executed:false`, antes de qualquer reserva de orçamento ou chamada ao provedor). A revisão editorial (`editorial_review`), que também passa por `execute`, **não** é afetada. `prepare*`, `initialize`, `status`, `observatory`, `record_conversion` e demais seguem como antes; o portão de custo (`executionGate`) continua por organização. Chamadas de serviço (automação) não passam por essa regra.
3. **O gestor opera projetos de organizações clientes sem ser dono do projeto** (e sem ser membro), **apenas** nas ações de Motores & APIs (`MANAGER_PROJECT_ACTIONS` em `_shared/nexus-management.ts`). Sem isso o gestor não conseguiria conectar nada para um cliente (o portão de projeto exige `projects.user_id = usuário`). Para o cofre de credenciais o gestor também passa a ser aceito como ator (`private.nexus_is_manager`, lê `auth.users.raw_app_meta_data.app_role`). `user_metadata` nunca vale (o usuário pode editá-lo).
4. **`request_update` só pelo gestor (CEO)**, não por dono/admin de organização interna ("só gestor atualiza"). `requests_list`: o gestor vê **todas** as organizações; os demais, só a própria (o contrato diz "as organizações que gerencia"; para o CEO isso é todas). Cada item do gestor ganha `organization_name` e `project_name`.
5. **"Solicitações abertas" = `open` + `in_progress`** (o contrato não diz). Limite de 20 por organização, **atômico** (trava consultiva por organização no banco), HTTP 429 `too_many_open_requests`.
6. **Regras de sistema ocultas para quem não gerencia.** O contrato fala em "organizações cliente"; ocultei `security.*` e `runtime.*` para **todo** visualizador sem `can_manage_technical` (cliente e membros sem papel de admin da organização interna). Além disso, para quem não gerencia o `overview` da auditoria devolve os achados **sem `fix_action`** e com `evidence` reduzida a uma lista segura (nada de últimos 4 dígitos, códigos HTTP, `last_fix`). `update_finding` continua para qualquer membro (reconhecer/adiar), mas regra de sistema vira 404 para quem não a enxerga.
7. **Visão do cliente em `providers_overview`.** Mesmo formato, campos técnicos nulos/zerados: `credential.last_four/status/updated_at = null`, `health.last = null`, sem latência, `score = null`, `enabled = false`, `program` zerado (sem orçamento). Acrescentei `simple_status` (`connected | attention | not_connected`) e `updated_at` (última atualização) e o `status` vira um valor grosso (`healthy | degraded | not_configured | manual`). A resposta traz `viewer: { role, can_manage_technical }` e `viewer_is_admin` (= `can_manage_technical`). `role` ∈ `manager | org_admin | client`.
8. **`viewer` no `overview` da auditoria** é `{ role, can_manage_technical }` (o contrato pede só `can_manage_technical`; `role` é a mais).
9. **Tipo de organização desconhecido ou nulo = cliente** (só `kind = 'internal'` conta como interna). O banco hoje só aceita `internal` e `client`.
10. **ID GA4: unicidade por organização**, como no contrato (não global); a checagem é atômica no banco. Aceito só dígitos (5 a 15), sem o prefixo `properties/`. Propriedade GSC: `sc-domain:host` ou URL `https://…`/`http://…` sem credenciais e sem espaços.
11. **GA4: duas coletas por sincronização, não uma.** O contrato pede um relatório com `pagePath`; somar linhas por página conta a mesma sessão várias vezes (uma sessão que passa por 3 páginas aparece 3 vezes). Por isso há uma coleta **do site** (sem `pagePath`, `page = ''`) para totais, série diária, canais e fontes de IA, e uma **por página** (`page <> ''`) para o ranking e o desempenho por área. A tabela e a unicidade são as do contrato. Detalhes em `docs/NEXUS_GA4.md`.
12. **`ga4` fica na categoria `search_truth`** do catálogo (não criei uma categoria nova que o frontend ainda não conhece). Nas regras de auditoria, `provider.check_failed` do GA4 é `high` (GSC/Bing seguem `critical`) e `provider.unused_30d` ignora o GA4 (consumido por sincronização).
13. **Erros do `ga4_sync`:** HTTP 409 (`ga4_not_configured`, `ga4_property_required`), 403 (`ga4_forbidden`), 429 (`ga4_quota`), 502 (demais). O corpo é `{ error, result }` com o `result` completo; sucesso é `{ result }`. Atenção: `403 ga4_forbidden` (Google recusou a propriedade) é diferente de `403 manager_required` (sem permissão no sistema): o código no campo `error` distingue.
14. **Auditoria sincroniza o GA4** sozinha (12 h com janela de 7 dias; 90 dias uma vez por semana, no mesmo teto de 4 sincronizações por execução) e o teste de saúde do `ga4` roda como os dos outros gratuitos. É leitura gratuita; a lista branca de correções ganhou só `analytics_sync`.
15. **`content_performance`:** `unmatched.gsc_pages` e `unmatched.ga4_pages` são `{ count, items }` (total e até 50 itens com métricas) para servir tanto a quem quer só a contagem quanto a quem quer a lista; acrescentei `analysis_version` (1000 quando há classificação heurística), `classification` e `heuristic_articles` por área. Só entram artigos publicados do índice, um por caminho (o de menor `wp_post_id`); `top_pages` lista só páginas com algum tráfego.

## Quem pode o quê

`can_manage_technical(usuário, organização)` = **gestor** (`app_metadata.app_role = 'ceo'`) **ou** (organização `kind = 'internal'` **e** papel `owner`/`admin`, ou dono registrado em `organizations.owner_user_id`). Em organização cliente, **nem o owner** passa.

| Ação (`nexus-intelligence`) | Gestor | Dono/admin de org interna | Membro / dono de org cliente |
|---|---|---|---|
| `store_credential`, `provider_credential_remove` | sim | sim | **403 `manager_required`** |
| `execution_settings_set` | sim | sim | **403** |
| `provider_health_check` (grátis ou com custo) | sim | sim | **403** |
| `search_performance_sync`, `ga4_sync` | sim | sim | **403** |
| `project_integrations_set` (ID GA4 / propriedade GSC) | sim | sim | **403** |
| `signals_key_create`, `signals_key_rotate`, `homepage_schema_sync` | sim | sim | **403** |
| `providers_overview` | completo | completo | só status simplificado (sem chave, sem detalhe, sem orçamento) |
| `search_performance`, `ga4_summary`, `content_performance` | sim | sim | sim |
| `project_integrations_get` | valores | valores | só `ga4_configured` / `gsc_configured` |
| `request_create`, `requests_list` | sim (todas as orgs) | sim (só a própria) | sim (só a própria) |
| `request_update` | **sim** | **403** | **403** |

| Ação (`nexus-audit`) | Gestor | Dono/admin de org interna | Membro / dono de org cliente |
|---|---|---|---|
| `overview` | tudo | tudo | sem `security.*`/`runtime.*`, sem `fix_action`, evidência reduzida |
| `run` (Auditar agora) | sim | sim | **403 `manager_required`** |
| `apply_fix` | sim | sim | **403 `manager_required`** |
| `update_finding` (reconhecer/adiar) | sim | sim | sim (não em regra de sistema) |

Limite conhecido que **já existia**: o portão de projeto exige que o usuário seja o **dono do projeto** (`projects.user_id`) e membro ativo da organização. Um membro do cliente que não criou o projeto recebe `403 project_forbidden`. O gestor tem a exceção da decisão 3.

## Como testar com "CEO / Gestor" e "Cliente Teste"

Hoje existem 2 organizações: **CEO / Gestor** (`kind = internal`, 8 projetos) e **Cliente Teste** (`kind = client`, sem projetos). Para testar o cliente é preciso um projeto na organização cliente criado por um usuário do cliente (o portão de projeto exige o dono).

1. Entre como **cliente** (dono de "Cliente Teste", sem `app_role = 'ceo'` em `app_metadata`) e abra `/nexus/motores` com um projeto do cliente. Esperado: sem botões Conectar/Trocar chave/Remover, sem painel de execução paga, sem últimos 4 dígitos, sem "Corrigir"; com Analytics, Tráfego de busca, Desempenho por área, auditoria em leitura e a aba **Solicitações**.
2. Pela API (o corpo vai para `functions/v1/nexus-intelligence` com o JWT do cliente), qualquer ação técnica deve responder `403 {"error":"manager_required"}`:
   `{"action":"store_credential","projectId":"<id>","provider":"gsc","secret":"…"}`, `{"action":"ga4_sync","projectId":"<id>"}`, `{"action":"project_integrations_set","projectId":"<id>","ga4PropertyId":"123456789"}`, `{"action":"provider_health_check","projectId":"<id>"}`.
   `nexus-audit`: `{"action":"run","projectId":"<id>"}` e `{"action":"apply_fix","id":"<achado>"}` também dão 403.
3. Entre como **gestor** (usuário com `app_metadata.app_role = 'ceo'`) e use o mesmo projeto do cliente: tudo passa (decisão 3). Conecte o GA4, informe o ID da propriedade (`project_integrations_set`) e rode `ga4_sync`.
4. Entre como **dono da organização interna** (não CEO): as ações técnicas passam nos projetos dele; `request_update` dá 403.
5. No banco (leitura): `select kind, count(*) from organizations group by kind;` deve mostrar `client` e `internal`. Tentativa de um cliente trocar o próprio `kind` (ou gravar `commercial_info.ga4_property_id`) direto pelo PostgREST deve falhar com `manager_required_to_change_organization_kind` / `manager_required_for_integrations`.

Testes automáticos que cobrem isto (sem rede e sem banco real): `supabase/functions/_shared/nexus-management_test.ts` (capacidade, política, visão do cliente, solicitações, integrações), `nexus-audit_test.ts`, `nexus-providers_test.ts`, `nexus-ga4_test.ts`.

## Como o cliente solicita

1. Aba **Solicitações** (ou o botão **Solicitar** do provedor): escolhe o **tipo** e escreve a **mensagem** (3 a 1000 caracteres).
2. Tipos: `connect_source` (conectar fonte), `plugin_link` (vincular plugin), `plugin_update` (atualizar plugin), `new_observation_round` (nova rodada de observação), `report` (relatório), `access` (acesso), `other`.
3. API: `{"action":"request_create","projectId":"<id>","kind":"connect_source","message":"Conectar o GA4 do site"}` devolve `{ request }` (`status: "open"`). Limite de 20 abertas por organização (`429 too_many_open_requests`).
4. O cliente acompanha em `requests_list` (`status` opcional: `open | in_progress | done | rejected`) e lê a `manager_note` (resposta do gestor).

## Como o gestor responde

- `requests_list` (sem `status` para ver tudo): vem de todas as organizações, com `organization_name` e `project_name`.
- `request_update`: `{"action":"request_update","projectId":"<qualquer projeto do gestor>","id":"<solicitação>","status":"in_progress|done|rejected|open","managerNote":"texto até 1000"}`. `done` e `rejected` gravam `resolved_at`; voltar a `open`/`in_progress` limpa. Texto vazio em `managerNote` apaga a nota. Sem `status` nem `managerNote`: `400 nothing_to_update`. Id inexistente: `404 request_not_found`.
- Quem resolve a solicitação faz a ação técnica correspondente com as ações da tabela acima (por exemplo, `project_integrations_set` e `ga4_sync` para uma solicitação `connect_source`).

## Onde cada regra é imposta

- **Edge Function** `nexus-intelligence`: política por ação (`checkActionPolicy`), capacidade (`loadViewer`; o gestor vem de `auth.admin.getUserById`, nunca de campo enviado pelo cliente), redação da visão do cliente.
- **Edge Function** `nexus-audit`: `run`/`apply_fix` exigem `can_manage_technical`; `overview` e `update_finding` redigem para quem não gerencia.
- **Banco:** RLS de leitura por membro nas tabelas novas; escrita só `service_role`; funções do cofre aceitam o gestor como ator; criação de solicitação e gravação das integrações em funções atômicas só de `service_role`; gatilhos que impedem o cliente de contornar a API (`projects.commercial_info` e `organizations.kind`).

## Riscos conhecidos

- **Coleta paga:** travada para o gestor (ver decisão 2). Consequência: uma operação preparada por um cliente só pode ser executada pelo próprio autor se ele for gestor; o gestor prepara e executa as rodadas pelo cliente. Demais ações fora da matriz seguem como antes (dono do projeto + portão de custo da organização).
- **Membros que não criaram o projeto** recebem `project_forbidden` (comportamento antigo). Para revender, vale permitir membros ativos da organização nas leituras (decisão de produto).
- **Quem tem papel `admin` na organização interna** passa nas ações técnicas dessa organização. Se a organização interna tiver membros que você não considera "gestor", ajuste os papéis.
- O gatilho de `organizations.kind` só deixa o CEO mudar o tipo; qualquer outro fluxo que mude `kind` com um usuário comum (não há hoje) passa a falhar.
- Não pude executar a migração em Postgres real aqui (ver o relatório de testes): ela foi validada em PGlite com tabelas de apoio simuladas.
