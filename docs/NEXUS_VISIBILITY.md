# NEXUS · Visibilidade (Zica Visibility Index), bloco V1, backend

Estado: **construído localmente em 13/11/2026; nada foi publicado, nada foi commitado.** Contrato: `docs/NEXUS_V1_VISIBILITY_CONTRACT.md` (PARTE 1). Metodologia: `docs/nexus-rdm/ZICA_VISIBILITY_INTELLIGENCE_MASTER.md` (seções 1 a 3). Plano gestor × cliente: `docs/NEXUS_MANAGEMENT_PLANE.md`.

Arquivos: `supabase/migrations/20261113120000_nexus_visibility.sql`, `supabase/functions/_shared/nexus-zvi.ts` (matemática pura), `_shared/nexus-visibility.ts` (ações e envelopes, com o acesso a dados injetável; **arquivo extra além dos previstos no contrato**, para poder testar as ações sem rede), `supabase/functions/nexus-visibility/index.ts` (autenticação, portão de projeto e ligação ao Supabase), entrada `[functions.nexus-visibility] verify_jwt = true` em `supabase/config.toml`, testes `nexus-zvi_test.ts` e `nexus-visibility_test.ts`.

## Decisões onde o contrato era ambíguo (leia primeiro; sempre a opção mais restritiva para o cliente)

1. **Observação feita com a conta logada do titular NÃO entra no índice.** Achado na leitura do banco: 7 das 20 observações válidas (todas as do Gemini) foram feitas com a conta Google do dono logada (`personalization_risk: true` / `session_state: logged_in_owner`), e a única "menção" de toda a base é uma delas, que o próprio observador anotou como "contaminada por personalização, NÃO vale como evidência de visibilidade pública". Se entrasse, o painel mostraria 1 menção em 20 (5%) onde o dado público é 0 em 13. Elas ficam fora de VR, CR, SoV, EST, fontes e concorrentes, mas continuam no histórico por pergunta, marcadas (`counted: false`, com nota), e a contagem aparece em `quality.excluded_personalization` e em `changes`. Também conta como personalização `session_state` que comece com `logged_in`. Não há parâmetro do corpo que reative.
2. **Flag de menção ausente = "não informado", fora do denominador.** O banco guarda `output.rdm_mentioned`/`output.rdm_cited` nas observações manuais e `output.mentioned`/`output.cited` nas de API; a RPC lê as duas formas (`nexus_vis_flag`). Sem nenhuma das duas, `mentioned = null`, a observação não entra e é contada em `quality.excluded_unmeasured`.
3. **EST (estabilidade) só conta grupos em que a marca apareceu ao menos uma vez.** Pela definição literal, uma marca nunca mencionada seria "perfeitamente estável" (EST = 1) e receberia 7,7 pontos de ZVI com 0% de visibilidade (isso apareceu nos testes com os dados reais). Ausência constante não é visibilidade. Escala: `EST = 1 − 2·desvio padrão` por grupo (pergunta × motor × mercado, mínimo 2 repetições), para ir de 0 a 1 (o máximo do desvio de um 0/1 é 0,5); média dos grupos. Hoje não há repetições, então EST é `n/d`.
4. **SoV só existe com concorrentes `tracked`** (cadastrados e aprovados). Sem eles, SoV = `null` (n/d) e entra em `missing`; não uso "100%" por falta de comparação. Conta no máximo 1 menção por concorrente por observação (por nome, por domínio do concorrente ou por citação do domínio dele).
5. **Intervalo do ZVI**: bootstrap com semente fixa (`20261113`, 1.000 reamostragens; 200 acima de 5.000 observações). EST entra como valor fixo no bootstrap (reamostrar com reposição duplicaria observações e criaria "repetições" artificiais). O intervalo sempre contém o valor pontual.
6. **Confiança**: `sem_dados` (n=0), `baixa` (n<30), `media` (30 a 99), `alta` (≥100). **Um índice parcial nunca passa de `media`**; como PM e REP não existem em V1, `alta` não aparece até o bloco V2.
7. **`missing[]`** usa os ids dos componentes: `vr`, `cr`, `sov`, `pm`, `rep`, `est`.
8. **Ranking**: com `n < 8` observações válidas, `rank` vem `null` e `insufficient_sample: true` (a lista continua ordenada por menções). Empate: mesma posição (1, 2, 2, 4), desempate de exibição por nome. `n` é o mesmo para todas as marcas (observações válidas do período).
9. **Sugestões de concorrentes** são calculadas na leitura (nada é gravado, nada a desfazer). Só entram nomes que parecem escritórios/advogados: saem a própria marca (variações registradas pelo observador + nome do projeto + domínio do site), redes sociais, portais, mídia, órgãos oficiais, domínios soltos (`xyz.com.br`) e anotações "fora do tema". O domínio é inferido quando o nome casa com o rótulo principal de um domínio citado (`Machado Meyer` ~ `machadomeyer.com.br`).
10. **Tipo de fonte**: as regras do contrato mais extensões marcadas em `SOURCE_TYPE_RULES` (`.leg.br`, `.def.br`, `.mp.br`, `.gov`, `.esteri.it`, `.europa.eu`, `gov.pt`/`gob.xx`/`gouv.xx`, rótulos com `embassy`/`consulate` → órgão oficial; rótulo terminando em `adv` com mais de 5 letras → escritório). Domínios de concorrentes (cadastrados ou inferidos) e o próprio site viram `escritorio` na tabela de fontes.
11. **Alvos de presença** (`targets`): fonte com ZSS ≥ 25, onde a marca não foi mencionada nem citada em nenhuma resposta que a cita, e que não é a própria, órgão oficial, escritório nem domínio de concorrente. Limite de 10. A fórmula do ZSS é a do contrato; "relevância" vale 1 para todo tema observado enquanto o cliente não definir temas-alvo (não diferencia fontes).
12. **Portão de projeto = o do restante do módulo**: dono do projeto (`projects.user_id`) E membro ativo da organização; o gestor (CEO) entra em qualquer projeto. Um membro que não criou o projeto recebe `403 project_forbidden` (limite já existente, citado em `NEXUS_MANAGEMENT_PLANE.md`). Escrita de concorrentes: `can_manage_technical`. Só usuário logado (chamada com credencial de serviço dá `403 interactive_owner_required`).
13. **`methodology` não exige projeto** (texto fixo, sem dado de ninguém); exige apenas JWT válido.
14. **`competitor_upsert` usa o nome como chave natural**: sem `id`, se já existe linha com o mesmo nome (sem diferenciar maiúsculas) no projeto, ela é atualizada (é o que "aprovar" uma sugestão faz); com `id`, renomear para um nome já usado por outra linha dá `409 competitor_name_taken`. `429 too_many_competitors` ao passar de 100 por projeto. Domínios chegam em qualquer forma (`https://www.X.com/p`) e são normalizados e deduplicados.
15. **Arrays de motores (`engines`) trazem o RÓTULO legível** ("ChatGPT", "Gemini", "Google (busca)"); onde há um campo de motor único (`by_engine[].engine`, `question_history.items[].engine`) vai o id da família (`chatgpt`, `gemini`, `claude`, `perplexity`, `copilot`, `google_aio`, `google_search`, `bing_search`, `brave_search`) mais um rótulo ao lado. `chatgpt`, `chatgpt_web` e `chatgpt_api` são a mesma família; `google_search` e `google_serp` também.

## O que há no banco hoje (leitura de 13/11/2026, projeto `ubahrbgaxrkjxklytobl`)

- `nexus_operations`: 18 `ai_observation` + 2 `serp` bem-sucedidas (todas de 12/11, método `manual_product_ui`, repetição 1), 3 preparadas/falhas de observação e ~3.700 de revisão editorial (ignoradas). Motores gravados como `chatgpt`, `gemini`, `google_search` (fora da lista `OBSERVATION_ENGINES` do código; por isso a agrupo por família).
- `nexus_citations`: 89 linhas (57 ChatGPT, 15 Gemini, 17 Google), 1 própria (a contaminada). `nexus_competitor_mentions`: 37 linhas, **todas com `competitor_host` nulo**, com ruído do observador: o nome da própria marca, portais ("Jusbrasil (citado na AIO)"), redes ("Instagram: ..."), domínios soltos e "(…fora do tema)". A limpeza acima existe por causa disso.
- `nexus_prompts`: 0 (as palavras-chave saem dos textos das perguntas observadas; prompts cadastrados entram quando existirem). `nexus_search_performance`: 4 linhas. **`nexus_analytics_daily`, `nexus_client_requests` e a função `nexus_analytics_summary` não existem em produção** (a migração do GA4/gestão ainda não foi aplicada): `result.ga4` e `result.gsc` tratam função/tabela ausente como "sem dado" (`null`).
- Achado fora do meu escopo (não alterei): `public.nexus_observatory_summary` só lê `output.mentioned`/`output.cited`; as observações manuais gravam `rdm_mentioned`/`rdm_cited`, então o resumo antigo subconta menções. Os totais de citação (tabela `nexus_citations`) não são afetados.

**Resultado do cálculo sobre esses 20 registros** (executado com o módulo real; `overview`, 28 dias até 13/11): `n_observations = 13` (7 fora por personalização), VR 0% (Wilson 0% a 22,8%), CR 0% (0% a 22,8%), SoV `n/d`, EST `n/d`, PM e REP `null`, **ZVI 0,0 "parcial" (faltam sov, pm, rep, est), confiança `baixa`**. Por motor: ChatGPT n=11, Google (busca) n=2, Gemini n=0 (todas as observações dele são personalizadas). 41 fontes (23 órgãos oficiais, 12 escritórios, 1 portal agregador, 1 mídia, 4 outros), 6 alvos de presença (jusbrasil.com.br, g1.globo.com e portais jurídicos), 20 sugestões de concorrentes (Machado Meyer, Mattos Filho, TozziniFreire, Rizzardo, JLC...), 10 perguntas distintas (o teste truncou os textos em 30 caracteres).

## Metodologia aplicada (`zvi-1`)

| Item | Implementação |
|---|---|
| VR | menções ÷ observações válidas; Wilson 95% (`wilsonInterval`) |
| CR | observações com URL da marca citada (`output.cited` ou citação com `is_own`) ÷ válidas; Wilson 95% |
| SoV | menções da marca ÷ (menções da marca + menções de concorrentes `tracked`), 1 por observação |
| PM, REP | `null` (sem extração por modelo) |
| EST | decisão 3 |
| ZVI | `100 × Σ(peso·componente) ÷ Σ pesos disponíveis`; pesos 0,35 / 0,25 / 0,15 / 0,10 / 0,10 / 0,05; `P = clip(1/PM)`, `R = (REP+100)/200` |
| ZSS | `100 × (0,40 cobertura + 0,25 posição + 0,20 diversidade + 0,10 recência + 0,05 relevância)`; recência com meia-vida de 30 dias; cobertura = perguntas distintas da fonte ÷ perguntas distintas do período; diversidade = motores (famílias) que a citam ÷ motores observados; posição = média de 1/posição |

Tudo em `nexus-zvi.ts` (funções puras, sem relógio implícito). A versão do método (`METHOD_VERSION = 'zvi-1'`), `n` e intervalo aparecem em toda nota. Mudar pesos por segmento (zvi-1.1) está previsto no código (`computeZvi(ind, weights)`), mas não exposto em V1.

## Envelopes (POST `functions/v1/nexus-visibility`, JWT do usuário)

Corpo: `{ "action": "...", "projectId": "<uuid>", ... }`. Sempre devolve `generated_at` (ISO). Campos além do contrato estão marcados com `+`. Números: taxas e componentes em 0–1 com 4 casas, ZVI em 0–100 com 1 casa. `null` = não medido.

**Período**: `from`/`to` (`YYYY-MM-DD`, UTC, inclusivos; padrão últimos 28 dias terminando hoje; máximo 366 dias), senão `400 period_invalid`. Máximo de 20.000 observações por consulta (as mais recentes); se passar, `truncated: true`.

`overview` (+ `engine?` id ou nome bruto, `topic?`):
```json
{ "method": {"version":"zvi-1","label":"..."}, "period": {"from":"","to":""}, "n_observations": 13,
  "zvi": {"value": 0.0, "low": 0.0, "high": 0.0, "partial": true, "missing": ["sov","pm","rep","est"], "confidence": "baixa"},
  "indicators": {"vr":{"value":0,"low":0,"high":0.2281,"n":13}, "cr":{"value":0,"low":0,"high":0.2281,"n":13},
                 "sov":{"value":null,"n":0}, "est":{"value":null,"n":0}, "pm": null, "rep": null},
  "previous": {"zvi": 11.7, "vr": 0.2, "cr": 0, "n": 10} | null,
  "by_engine": [{"engine":"chatgpt","label":"ChatGPT","vr":0,"cr":0,"n":11}],
  "trend": [{"day":"2026-11-12","vr":0,"cr":0,"n":13}],
  "changes": [{"kind":"visibilidade_subiu","text":"..."}],
  "result": {"ga4": {"sessions":0,"ai_sessions":0,"key_events":0} | null, "gsc": {"clicks":0,"impressions":0} | null},
  "viewer": {"role":"client","can_manage_technical":false},   // + (também em `competitors`); só serve para RESTRINGIR a tela, a regra real é do servidor
  "quality": {"observations_total":20,"excluded_personalization":7,"excluded_unmeasured":0},   // +
  "truncated": false, "generated_at": "..." }
```
`indicators.cr` tem `low`/`high` (+). `previous` é o período imediatamente anterior, de mesmo tamanho; `null` se não houver observação válida nele. `by_engine` inclui motores com observações só fora do índice, com `n: 0` e taxas `null`. `changes[].kind` ∈ `sem_observacoes`, `sem_comparacao`, `visibilidade_subiu|caiu|estavel`, `fontes_novas`, `primeira_citacao`, `observacoes_desconsideradas`. `result.ga4` só existe se o GA4 já sincronizou; `result.gsc` só com linhas no período.

`sources` (`type?` ∈ `orgao_oficial|portal_agregador|midia|escritorio|diretorio|rede_social|academico|outro`, `limit?` ≤ 200, padrão 50):
`{ method, sources:[{host,type,zss,coverage,position,diversity,recency,relevance,citations,queries,engines:["ChatGPT"],is_own,last_seen,brand_present+}], targets:[{host,type,zss,why}], total+, n_observations+, truncated, generated_at }`. `position` é o componente 0–1 do ZSS (média de 1/posição), não a posição.

`competitors`:
`{ method, tracked:[{id,name,domains,kind,vr,sov,mentions,n,insufficient_sample}], suggested:[{name,domain|null,mentions,engines:["ChatGPT"],reason,kind+}], own:{name+,vr,sov,n,mentions+}, ranking:[{rank|null,name,is_own,vr,sov,n,mentions+,insufficient_sample}], ignored+:[{id,name,domains,kind}] (só para o gestor; vazio para o cliente), min_rank_n+:8, n_observations+, truncated, generated_at }`.

`competitor_upsert` (`id?`, `name`, `domains` array, `kind` ∈ `escritorio|advogado_individual|portal|outro`, `status` ∈ `suggested|tracked|ignored`) → `{ competitor:{id,name,domains,kind,status,source,created_at,updated_at}, generated_at }`. `competitor_remove` (`id`) → `{ ok: true, generated_at }`. Só `can_manage_technical`.

`questions` (`topic?`, `intent?`, `limit?` ≤ 200 padrão 50, `offset?`):
`{ total, questions:[{query,topic,intent,observations,n+,vr,cr,last_observed_at,engines:["ChatGPT"]}], n_observations+, truncated, generated_at }`. `observations` = todas as do período; `n` = as que entram no índice; `vr`/`cr` `null` se `n = 0`. Mais recentes primeiro.

`question_history` (`query` exato, `engine?`, `limit?` ≤ 100 padrão 50):
`{ query, items:[{observed_at,engine,engine_label+,country,mentioned:true|false|null,cited,position|null,brands:[...],sources:[{host,url}],response_excerpt|null,counted+,note+|null}], generated_at }`. `position` = melhor posição de uma citação própria; `brands` = a marca (se mencionada) e os concorrentes citados, sem duplicar; `mentioned: null` = "a observação não informa". Sem histórico: `items: []` (200).

`keywords`: `{ keywords:[{term,prompts,observations,vr,valid+}], n_prompts+, truncated, generated_at }` (termos de 1 a 3 palavras; stopwords em português, com um conjunto mínimo de inglês/espanhol e das palavras de instrução do roteiro de coleta; "São Paulo" é um termo; termos contidos em outro mais longo com as mesmas perguntas são omitidos; até 100).

`opportunities`: `{ items:[{kind:"pergunta_sem_marca|fonte_alvo|concorrente_a_frente",title,detail,priority:"alta|media|baixa",evidence:{...}}], n_observations+, truncated, generated_at }`. Determinístico, sem texto gerado por IA. `concorrente_a_frente` só com ≥ 8 observações e concorrente `tracked` com VR maior que o da marca.

`methodology`: `{ version, label+, components:[{id,label,weight,description}], notes:[...], source_index+:{name,weights,half_life_days}, generated_at }`.

**Erros** (`{ "error": "<código>" }`): 400 `invalid_json`, `unsupported_action`, `project_required`, `period_invalid`, `engine_invalid`, `topic_invalid`, `intent_invalid`, `type_invalid`, `limit_invalid`, `offset_invalid`, `query_required`, `id_invalid`, `name_invalid`, `domains_invalid`, `kind_invalid`, `status_invalid`, `competitor_invalid`; 401 do gateway/`resolveRequestActor`; 403 `manager_required`, `project_forbidden`, `organization_membership_required`, `interactive_owner_required`; 404 `competitor_not_found`; 409 `competitor_name_taken`; 429 `too_many_competitors`; 503 `visibility_not_ready` (migração ainda não aplicada); 500 `operation_failed` (sem detalhe interno).

## Quem pode o quê

| Ação | Gestor (CEO) | Dono/admin de org interna | Membro / dono de org cliente |
|---|---|---|---|
| leitura (`overview`, `sources`, `competitors`, `questions`, `question_history`, `keywords`, `opportunities`) | sim (qualquer projeto) | sim (portão de projeto) | sim (portão de projeto) |
| `competitor_upsert`, `competitor_remove` | sim | sim | **403 `manager_required`** |
| lista `ignored` em `competitors` | vê | vê | vazia |

O cliente não recebe nada técnico: sem ids de operação, observador, caminho de evidência, `created_by`, chaves, custo ou execução (testado). A rotina de solicitação do cliente ("Solicitar") é a que já existe (`request_create` em `nexus-intelligence`); esta função não a duplica.

## Banco (migração `20261113120000_nexus_visibility.sql`)

- `public.nexus_competitors` conforme o contrato (`name` 2–160 sem espaços nas pontas, `domains` até 10 normalizados e sem repetição, `kind`, `status` padrão `suggested`, `source` padrão `manual`, único por `(project_id, lower(name))`). Gatilho: confere organização × projeto, limite de 100 por projeto (trava consultiva) e `updated_at`. RLS: membro lê (sem a coluna `created_by`, por grant de coluna); escrita só `service_role`.
- `public.nexus_vis_flag`, `public.nexus_visibility_observations` (um `jsonb` com observações + citações + concorrentes, sem o teto de 1.000 linhas do PostgREST), `public.nexus_visibility_history`. Só `service_role` executa; a Edge Function é o portão de acesso.
- Idempotente (reaplicada duas vezes sem erro). **Reversão** no cabeçalho do arquivo.
- Não semeia sugestões (decisão: calcular na leitura).

## Como testar

```
npx -y deno test --no-lock --node-modules-dir=none supabase/functions/_shared/nexus-zvi_test.ts supabase/functions/_shared/nexus-visibility_test.ts
npx -y deno check --no-lock --node-modules-dir=none supabase/functions/nexus-visibility/index.ts
npx eslint supabase/functions/_shared/nexus-zvi.ts supabase/functions/_shared/nexus-visibility.ts supabase/functions/nexus-visibility/index.ts
```
SQL em PGlite: harness `sqltest_visibility.mjs` (aplica o Observatório REAL e esta migração, duas vezes, e exercita tabela, RLS, grants, flags, janela, filtros, teto, histórico e cascata com dados na forma de produção). Depois de publicar, testar com o JWT de um **cliente** (esperado `403 manager_required` em `competitor_upsert`) e com o do gestor, em `overview` de um projeto com observações.

## Ordem de publicação segura

1. **Primeiro a migração de gestão/GA4 (`20261113100000`) e a de conformidade (`20261113110000`), já planejadas no bloco anterior.** Motivo: em produção as travas de banco contra um cliente virar "interno" (`organizations.kind`) ainda não existem; sem elas, o dono de uma organização cliente poderia se promover pela API REST e passar no `can_manage_technical` desta função (escrever concorrentes). A leitura não depende delas.
2. **Aplicar `20261113120000_nexus_visibility.sql`** (só depende do Observatório, já em produção; é idempotente e aditiva).
3. **Publicar a função `nexus-visibility`** (junto de `supabase/config.toml`). Se a função subir antes da migração, ela responde `503 visibility_not_ready` (não quebra nada).
4. Publicar o frontend por último. Verificar: `select to_regclass('public.nexus_competitors')`, uma chamada `overview` com o JWT do gestor e outra `competitor_upsert` com o JWT de um cliente (403).
Reversão: derrubar a função e executar o bloco de reversão da migração (só afeta objetos novos).

## Riscos e o que falta

- **Dado muito pequeno e viesado**: 13 observações, só 3 motores, sem repetições, perguntas do próprio observador. O painel é honesto (parcial, baixa confiança), mas os números ainda não dizem "visibilidade do mercado". V2 (coleta diária, repetições, extração de PM/REP) é o que muda isso.
- **Cliente que não criou o projeto** recebe `project_forbidden` (portão herdado). Para revender, falta permitir leitura a qualquer membro ativo (decisão de produto).
- **Observações de Gemini logado** estão todas fora; o observador precisa refazê-las em sessão anônima/API para o Gemini entrar no índice.
- **Motores fora da lista `OBSERVATION_ENGINES`** (`chatgpt`, `gemini`, `google_search`) são aceitos por família aqui, mas o importador (`normalizeObservation`) não os aceitaria hoje: alinhar quando a coleta for automatizada.
- **Ruído nas menções de concorrentes** (anotações do observador) é tratado por heurística de nome; sugestões podem errar o tipo (ex.: "Jessé Conrado" sai como escritório). O gestor corrige ao aprovar.
- **Desempenho**: a RPC varre as operações do projeto e agrega até 20.000 observações em um `jsonb`; adequado para centenas/milhares. Acima disso, mover agregações para SQL ou materializar por dia. O cálculo do bootstrap roda no Edge (1.000 reamostragens com até 20.000 observações levam de décimos de segundo a poucos segundos; usa 200 reamostragens acima de 5.000).
- **Não executado**: nada rodou em Postgres real nem na Edge Function real (Deno Deploy); a migração e as RPCs foram validadas em PGlite com tabelas de apoio simuladas e o Observatório real; o handler HTTP (autenticação, portão de projeto, `makeStore`) tem só checagem de tipos (`deno check`) e nenhum teste de execução; as ações foram testadas com um store simulado. Chamadas reais a `nexus_search_performance_summary`/`nexus_analytics_summary` não foram feitas.
