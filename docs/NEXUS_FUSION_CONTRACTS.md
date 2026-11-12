# NEXUS × Gerador em massa — contratos da fusão (12/11/2026)

Branch: `nexus-fusion-2026-11-12` (base: pilha NEXUS #130–#132 + snapshot de produção, commit c42b752).
Objetivo: transformar o Zica.ai Posts de gerador de conteúdo em motor de tráfego orgânico com medição de
visibilidade em IA/busca (Observatório), realimentação do gerador em massa (lacunas → pautas), e coleta de sinais
em qualquer site (plugin WordPress v3.16 + snippet universal `zica-signals.js`).

Regras que valem para todo o trabalho:

- Nada é implantado. Trabalho só no repositório. Nenhuma chamada paga. `PAID_SERVICES_BLOCKED` continua `true`.
- Multi-tenant: tudo com `organization_id` + `project_id`; RLS por `public.is_organization_member(organization_id)`.
- Segredos só em Vault/opções do WordPress; nunca no frontend, no snippet público, em logs ou commits.
- Código em TypeScript estrito; textos de interface em português do Brasil.
- Cada bloco entrega testes que rodam de verdade: `npx vitest run <arquivo>`, `deno test` para `_shared/*_test.ts`,
  `php -l` para PHP. Não declarar verificação que não rodou.
- Linguagem de produto: "observado", "não encontrado na amostra" (nunca "posição zero"), "submissão recebida ≠ indexação".

## 1. Modelo de dados (migração `supabase/migrations/20261112120000_nexus_observatory.sql`)

Todas as tabelas: `enable row level security`, `revoke all ... from public, anon, authenticated`, `grant select to authenticated`
com policy `using (public.is_organization_member(organization_id))`, `grant all to service_role`. Índices em `(project_id, observed_at)`
ou equivalente. Funções em `private` com `security invoker set search_path=''` quando possível.

### 1.1 `nexus_prompt_sets`
| coluna | tipo | regra |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| organization_id, project_id, user_id | uuid not null | FKs organizations/projects/auth.users |
| name | text not null | 1–120 |
| description | text | |
| markets | jsonb not null default '[]' | array de `{country:'br',language:'pt-BR',city?:string}`; country ISO-2 minúsculo |
| engines | text[] not null default '{}' | valores do enum de motores (1.6) |
| cadence | text check in ('manual','weekly','daily') default 'manual' | |
| status | text check in ('active','paused') default 'active' | |
| created_at, updated_at | timestamptz | trigger de updated_at |

### 1.2 `nexus_prompts`
id, prompt_set_id fk (cascade), organization_id, project_id, `topic text not null`, `intent text check in ('informational','discovery','transactional','international','branded')`,
`query text not null` (≤ 500), `branded boolean default false`, `position int default 0`, `active boolean default true`, created_at.
`unique (prompt_set_id, query, intent)`.

### 1.3 `nexus_citations` (derivada de `nexus_operations`)
id bigserial pk, organization_id, project_id, `operation_id uuid fk nexus_operations on delete cascade`, `engine text`, `country text`, `language text`,
`query text`, `topic text`, `intent text`, `url text not null`, `host text not null` (sem `www.`), `is_own boolean not null`, `position int`,
`title text`, `observed_at timestamptz not null`. Índices `(project_id, observed_at)`, `(project_id, host)`, `(operation_id)`.

### 1.4 `nexus_competitor_mentions` (derivada)
id bigserial, organization_id, project_id, operation_id fk cascade, engine, country, query, topic, intent,
`competitor_name text not null`, `competitor_host text`, `source text check in ('citation','mention','map_pack','organic')`, observed_at.

### 1.5 Fan-out: `private.nexus_fanout_observation()` trigger `after insert or update of status, output on public.nexus_operations`
Quando `new.status='succeeded'` e `new.kind in ('ai_observation','serp')`:
1. `delete from nexus_citations/nexus_competitor_mentions where operation_id=new.id` (idempotente);
2. engine = `coalesce(new.input->>'engine', case new.kind when 'serp' then 'google_serp' else 'chatgpt_api' end)`;
   country/language/query/topic/intent vêm de `new.input`; observed_at = `coalesce((new.output->>'collected_at')::timestamptz,(new.input->>'observed_at')::timestamptz,new.updated_at)`;
3. citações: `new.output->'citations'` (array de `{url,title}` ou strings) e, para serp, `new.output->'organic'` (`{position,url,title}`);
   `is_own` = host (sem www) igual ao host do projeto (`projects.wordpress_url` ou `domain`) ou presente em `new.input->'own_hosts'`;
4. concorrentes: `new.output->'competitors'` (array de strings ou `{name,host,source}`); default source `'mention'`.
Nunca lança erro para fora (captura exceção e registra `raise warning`) para não travar o gravador da operação.
Backfill no fim da migração: `update nexus_operations set updated_at=updated_at where status='succeeded' and kind in ('ai_observation','serp')`.

### 1.6 Enum de motores (texto, validado em código, não em constraint)
`chatgpt_web` (produto, manual) · `chatgpt_api` (OpenAI Responses + web_search) · `gemini_web` · `gemini_api` (grounding) ·
`claude_web` · `claude_api` (web_search tool) · `perplexity_web` · `perplexity_api` · `copilot_web` · `google_aio` · `google_serp` (Serper) · `bing_serp`.
Sufixo `_web` = observação manual em produto; `_api` = coletor automatizável.

### 1.7 `nexus_site_keys`
`project_id uuid pk fk projects`, organization_id, `site_id text unique not null` (12 chars `[a-z0-9]`), `secret_sha256 text not null`,
`allowed_origins text[] not null default '{}'` (origens `https://host` sem barra), `created_at`, `rotated_at`, `last_batch_at`.
Segredo em claro só no retorno da ação que o cria/rotaciona; nunca gravado.

### 1.8 `nexus_site_signals`
id bigserial, organization_id, project_id, `site_host text`, `day date`, `kind text check in ('ai_bot_hit','ai_referral','search_referral','human_pageview')`,
`agent text` (ex.: `GPTBot`, `PerplexityBot`, `chatgpt.com`, `perplexity.ai`, `google`), `path text` (≤ 200, sem query string), `hits int not null default 0`,
`unique (project_id, site_host, day, kind, agent, path)`.

### 1.9 `nexus_signal_batches`
`site_id text`, `batch_id text`, `received_at timestamptz default now()`, `events int`, pk `(site_id, batch_id)`. Dedupe de lotes; limpeza > 30 dias por `pg_cron` NÃO é criada agora (documentar).

### 1.10 RPCs (`security definer`, `set search_path=''`, `revoke from public/anon/authenticated`, `grant execute to service_role`)
- `private.nexus_record_signals(p_site_id text, p_batch_id text, p_events jsonb) returns jsonb` → resolve project/org por `site_id`;
  se `batch_id` já existe devolve `{duplicate:true}`; senão upsert incrementando `hits` (cap 500 eventos; `hits` ≤ 100000); atualiza `last_batch_at`.
- `public.nexus_observatory_summary(p_project uuid, p_from date, p_to date) returns jsonb` — `security invoker` (usa RLS do chamador), chamado via `supabase.rpc`:
```json
{
 "period":{"from":"2026-10-13","to":"2026-11-12"},
 "totals":{"operations":21,"valid":17,"mention_rate":0,"citation_rate":0,"own_citations":0,"competitor_mentions":34,"share_of_voice":0},
 "by_engine":[{"engine":"chatgpt_web","valid":7,"mentioned":0,"cited":0}],
 "by_country":[{"country":"br","valid":9,"mentioned":0,"cited":0}],
 "by_topic":[{"topic":"custodia","intent":"international","valid":4,"mentioned":0,"cited":0,"competitors":["CNJ","Defensoria"]}],
 "trend":[{"day":"2026-11-12","valid":17,"mentioned":0,"cited":0}],
 "top_competitors":[{"name":"Fernandes & Magalhães","host":null,"mentions":3,"engines":["chatgpt_web","gemini_web"]}],
 "own_urls":[{"url":"https://rdmadvogados.com.br/...","citations":1,"engines":["chatgpt_api"]}],
 "gaps":[{"topic":"custodia","intent":"international","query":"...","country":"us","engines_missing":["chatgpt_web"],"competitors":["CNJ"]}],
 "signals":{"ai_bot_hits":0,"ai_referrals":0,"search_referrals":0,"by_agent":[{"kind":"ai_bot_hit","agent":"GPTBot","hits":0}],"by_path":[{"path":"/blog/x","kind":"ai_referral","hits":0}],"last_batch_at":null}
}
```
  `valid` = operações `succeeded`; `mention_rate`/`citation_rate` = razão sobre `valid` (null quando valid=0); `share_of_voice` = own_citations / (own_citations + competitor_mentions) (null se 0).
  `gaps` = prompts/consultas observadas no período em que `cited=false` em todos os motores, ordenadas por nº de concorrentes.

## 2. Edge function `nexus-intelligence` — ações novas (`supabase/functions/nexus-intelligence/index.ts`)
Mesma autenticação/escopo das ações existentes (usuário, membro ativo da org, projeto do usuário). Body sempre `{action, projectId, ...}`.

| action | entrada | saída | efeito |
|---|---|---|---|
| `observatory` | `from?`, `to?` (ISO date; default 30 dias) | o JSON de 1.10 | leitura |
| `prompt_sets` | — | `{sets:[{...set, prompts:[...]}]}` | leitura |
| `prompt_set_upsert` | `set:{id?,name,description?,markets,engines,cadence,status}` | `{set}` | grava |
| `prompt_upsert` | `prompt:{id?,prompt_set_id,topic,intent,query,branded?,position?,active?}` | `{prompt}` | grava |
| `prompt_delete` | `promptId` | `{success:true}` | apaga |
| `import_observation` | `observation:{engine,engine_surface?,country,language,query,topic,intent,branded?,rdm_mentioned,rdm_cited,citations:[{url,title?}],competitors:[string|{name,host?,source?}],answer_excerpt?,note?,observed_at,evidence_path?,observer?,session_state?}` | `{operation:{id}}` | insere `nexus_operations` kind `ai_observation` (ou `serp` para `google_serp`/`bing_serp`), `status='succeeded'`, `reserved_usd_micros=0`, `request_key='manual:<engine>:<sha256(query) 12 hex>:<country>:<observed_at YYYY-MM-DD>'`, `input.method='manual_product_ui'`, `input.method_version='manual-1.1'`, `output` com `mentioned`, `cited`, `citations`, `competitors`, `answer_excerpt`, `collected_at`. `on conflict (organization_id, request_key) do update set output=excluded.output, updated_at=now()`. |
| `prepare_prompt_run` | `promptSetId`, `engines?` | `{prepared:n, skipped:n, executed:false}` | para cada prompt ativo × mercado × motor `_api` do set, insere `nexus_operations` `status='prepared'`, `request_key='run:<set>:<prompt>:<engine>:<country>:<YYYY-MM-DD>'`, `input` com `engine`, `query`, `country`, `language`, `city`, `topic`, `intent`, `variants` (nome do negócio/hosts do projeto), `branded`, `repetition:1`, `method_version`. Nunca executa. |
| `signals_key_create` | `allowedOrigins?:string[]` | `{site_id, secret, endpoint, snippet}` | gera `site_id` + segredo (32 bytes hex), grava sha256; `secret` só nesta resposta; se o projeto é plugin-mode (`isPluginModeProject`), tenta `pluginRequest(base,key,'signals/configure',{site_id,secret,endpoint})` e devolve `plugin_configured:boolean` |
| `signals_key_rotate` | — | idem | rotaciona |
| `signals_status` | — | `{site_id, allowed_origins, last_batch_at, totals_30d}` | leitura (sem segredo) |

`execute` (existente) ganha roteamento por `input.engine`: `google_serp`→Serper (atual), `chatgpt_api`→OpenAI Responses (atual),
`gemini_api`→`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` com `tools:[{google_search:{}}]` e leitura de
`candidates[0].groundingMetadata.groundingChunks[].web.uri/title`; `claude_api`→`POST https://api.anthropic.com/v1/messages` com `tools:[{type:'web_search_20250305',name:'web_search',user_location:{type:'approximate',country}}]`
e citações em `content[].citations[].url`; `perplexity_api`→`POST https://api.perplexity.ai/search` com `{query, country}` e `results[].url`.
Provider da credencial: `serper|openai|gemini|anthropic|perplexity` (adicionar `perplexity` ao check constraint de `organization_provider_credentials` se existir).
Parsers puros em `_shared/nexus-intelligence.ts`: `parseGeminiObservation`, `parseClaudeObservation`, `parsePerplexityObservation` (mesma saída de `parseAiObservation`), com `_shared/nexus-intelligence_test.ts` (Deno) cobrindo os quatro formatos com fixtures mínimas.
Execução continua bloqueada por `PAID_SERVICES_BLOCKED`/orçamento 0: o código deve compilar e os parsers passar nos testes; nenhuma chamada real.

## 3. Edge function pública `zica-signals` (`supabase/functions/zica-signals/index.ts`, `verify_jwt=false` em `supabase/config.toml` se o repo usa; senão documentar)
- `POST` apenas; body ≤ 64 KB; `Content-Type: application/json`.
- **Modo servidor** (plugin, worker, shipper): headers `X-Zica-Site`, `X-Zica-Timestamp` (unix s, |skew| ≤ 300), `X-Zica-Nonce` (≥ 16 chars),
  `X-Zica-Signature` = `hex(hmac_sha256(secret, timestamp + "\n" + nonce + "\n" + sha256hex(rawBody)))` (idêntico ao `sign_body` do plugin).
  Body `{site_host, batch_id, events:[{day:'YYYY-MM-DD', kind, agent, path, hits}]}` (≤ 500). Verifica assinatura em tempo constante contra o segredo resolvido por `site_id`
  (o segredo em claro NÃO está no banco; portanto o servidor guarda `secret_sha256` apenas para... **não serve para HMAC**. Decisão: guardar o segredo em Vault
  `nexus_site_<site_id>` via `vault.create_secret`, e `secret_sha256` só para exibir "configurado". A RPC `private.nexus_site_secret(p_site_id)` (service_role) devolve o segredo em claro para a função.)
  Resposta `200 {accepted:n, duplicate:boolean}`; `401` assinatura inválida; `409` skew; `413` tamanho.
- **Modo navegador** (snippet): body `{site_id, kind:'ai_referral'|'search_referral'|'human_pageview', agent, path}`; exige header `Origin` cuja origem esteja em `allowed_origins`
  (ou, se vazio, cujo host seja igual ao host do projeto); `hits` fixo = 1; responde `204` com CORS da origem; `403` origem não permitida. `batch_id` = `web:<sha256(origin+day+path+agent+kind)>` NÃO é usado para dedupe (eventos web são contagens).
  Limite simples: body ≤ 1 KB, `path` ≤ 200, `agent` dentro da lista conhecida (senão `other`).
- Sem chamadas externas. `installSpendLock()` instalado por coerência.
- Testes Deno para o verificador HMAC (`_shared/zica-signals.ts` + `_shared/zica-signals_test.ts`): assinatura válida, inválida, skew, lote duplicado (mock).

## 4. Snippet universal `public/zica-signals.js` (copiado também para `public/wordpress-plugin/zica-posts/assets/zica-signals.js`)
- IIFE ES5-compatível, ≤ 3 KB minificável, sem dependências, sem cookies, sem PII, sem fingerprint. Lê `data-site`, `data-endpoint`, `data-all` (opcional) do próprio `<script>` ou `window.ZICA_SIGNALS={site,endpoint,all}`.
- Classificação por `document.referrer` + `utm_source`/`ref`:
  - `ai_referral`: chatgpt.com, chat.openai.com, openai.com, perplexity.ai, gemini.google.com, bard.google.com, copilot.microsoft.com, claude.ai, you.com, poe.com, meta.ai, grok.com, x.ai, duckduckgo.com (quando `ia=chat`), bing.com (quando path começa com `/chat` ou `/copilot`), utm_source ∈ {chatgpt.com, perplexity, gemini, copilot, claude};
  - `search_referral`: google.*, bing.com, duckduckgo.com, yahoo.*, yandex.*, ecosia.org, baidu.com;
  - `human_pageview` só quando `data-all="1"`.
- Envia uma única vez por carregamento via `navigator.sendBeacon` (fallback `fetch keepalive`), `path = location.pathname` (sem query/hash).
- Respeita `navigator.doNotTrack === '1'`? **Não envia nada** nesse caso (documentar).

## 5. Plugin WordPress `zica-posts` v3.16.0 (`public/wordpress-plugin/zica-posts/`)
- Bump: `zica-posts.php` (header + `ZICA_POSTS_VERSION`), `version.json` (features + `ai_signals_server_side`, `ai_signals_beacon`, `signals_hub_flush`), `readme.txt` changelog,
  `supabase/functions/_shared/plugin-version.ts` (`PLUGIN_VERSION`, `PLUGIN_RELEASED`, `PLUGIN_FEATURES`), e `scripts/build-wordpress-downloads.mjs` se listar versões.
- Novo `includes/class-zica-posts-signals.php` (`ZICA_Posts_Signals`), carregado no bootstrap e instanciado com `$auth` e `$discovery`:
  - `template_redirect` (prioridade -90): se `zica_posts_signals_enabled==='1'`, detecta UA em `$discovery->ai_bots()` → `ai_bot_hit`; detecta `HTTP_REFERER`/`utm_source` com a mesma tabela do snippet → `ai_referral`/`search_referral`; incrementa buffer `zica_posts_signals_buffer` (option autoload false; chave `day|kind|agent|path`; máx. 2000 chaves; path ≤ 200 sem query). Nunca registra IP, UA completo, cookies ou usuário logado (`is_user_logged_in()` → ignora).
  - `wp_enqueue_scripts`: enfileira `assets/zica-signals.js` com `data-site`/`data-endpoint` quando `zica_posts_signals_site_id` e `zica_posts_signals_endpoint` existem (`wp_script_add_data`/filtro `script_loader_tag` para atributos; `defer`).
  - Cron `zica_posts_signals_flush` (horário, `ZICA_POSTS_TZ`): monta `{site_host, batch_id: wp_generate_uuid4(), events}`, assina com `hash_hmac('sha256', ts."\n".nonce."\n".hash('sha256',$body), $secret)` (reusar/estender `ZICA_Posts_Auth::sign_body` com segredo parametrizável), `wp_remote_post` para `zica_posts_signals_endpoint` (deve ser https e host terminar em `.supabase.co` ou igual ao host configurado em `zica_posts_hub_webhook_url`), timeout 15; 2xx → limpa buffer e grava `zica_posts_signals_last_flush`; erro → mantém buffer e grava `zica_posts_signals_last_error`.
  - REST (em `class-zica-posts-rest.php`, mesma auth por API key): `GET /signals/status` → `{enabled, site_id, endpoint_host, buffer_keys, buffer_hits, last_flush, last_error}`; `POST /signals/configure` `{site_id, secret, endpoint}` → valida formato e grava options (segredo nunca devolvido); `POST /signals/flush` → força flush.
  - Admin (`class-zica-posts-admin.php`): bloco "Sinais de IA" com totais do buffer, último envio e toggle; sem exibir segredo.
- `php -l` em todos os PHP alterados. Atualizar o `tests/` do plugin se houver harness.

## 6. Integrações para sites fora do WordPress (`integrations/zica-signals/`)
- `README.md` (pt-BR): o que é medido, o que o snippet NÃO vê (robôs de IA não executam JS → precisa de servidor), passo a passo para HTML estático, Next.js (`app/layout.tsx` com `<Script strategy="afterInteractive">`), Nuxt, Webflow/Wix/Framer/Shopify (custom code), Google Tag Manager (tag HTML personalizada).
- `cloudflare-worker/worker.js` + `wrangler.toml.example`: passa a requisição adiante; se UA ∈ lista de bots de IA, agrega em memória por isolate e envia lote assinado a cada 60 s via `ctx.waitUntil` (segredo em `env.ZICA_SIGNALS_SECRET`).
- `node/zica-signals-middleware.js`: middleware Express/Fastify-agnóstico (função `(req,res,next)`), buffer em memória, flush por intervalo, mesma assinatura.
- `log-shipper/zica_signals_shipper.py`: lê access log (nginx/Apache combined), agrega dia×kind×agent×path, assina e envia; `--dry-run` imprime o lote.
Todos usam a mesma tabela de UAs/referrers (manter uma lista canônica em `integrations/zica-signals/signals-catalog.json` e gerar/copiar para o snippet, plugin e worker).

## 7. Frontend (`src/`)
- Rota `/nexus/observatorio` → `src/pages/NexusObservatory.tsx` (lazy, dentro do `Layout`); Sidebar: item `{ label: 'NEXUS · Observatório', icon: Radar, href: '/nexus/observatorio' }` logo após "NEXUS · Inteligência".
- Hook `src/hooks/useNexusObservatory.ts`: react-query, chaves `['nexus-observatory', projectId, from, to]`; wrappers para todas as ações da seção 2 via `supabase.functions.invoke('nexus-intelligence', {body})`; trata `423`/`402` como "bloqueado" e nunca como erro genérico.
- Página, seções na ordem: (1) filtros: projeto (`useProjects`), período (7/30/90 dias, custom), motor, país; (2) KPIs: Observações válidas · Taxa de menção · Taxa de citação · Share of voice · Visitas vindas de IA (30 d) · Acessos de robôs de IA (30 d), cada tile com rodapé "observado em N operações"/"sem dados"; (3) gráficos recharts: tendência diária (área, mention vs cited), motor × país (tabela-matriz com células coloridas por taxa), concorrentes (barras horizontais top 10), robôs de IA por agente (barras), visitas de IA por origem (barras) e por página (tabela); (4) tabela "URLs próprias citadas"; (5) "Lacunas" (lista com tópico, consulta, país, motores sem citação, concorrentes) e botão "Levar para o gerador em massa" → navega para `/articles/bulk?nexusGaps=<chaves>` (o gerador em massa de artigos; `/keywords/bulk` é o gerador de palavras-chave); (6) "Conjuntos de prompts": CRUD inline (nome, mercados, motores, cadência) e prompts (tópico, intenção, consulta, branded); botões "Preparar rodada (não executa)" e "Registrar observação manual" (dialog com todos os campos de `import_observation`, incluindo lista de citações e concorrentes); (7) "Chave de sinais": criar/rotacionar, mostra `site_id`, snippet pronto para copiar (`<script src=".../zica-signals.js" data-site="..." data-endpoint="..." defer></script>`), origens permitidas, último lote recebido; aviso de que o segredo aparece uma vez.
- Estados: carregando (skeleton), vazio ("Nenhuma observação no período. Registre uma observação manual ou prepare uma rodada."), bloqueado (banner âmbar quando `execute` devolve 402/423), erro.
- `src/components/article-generator/NexusGapBrief.tsx`: usado em `BulkArticleGenerator.tsx` acima da lista de palavras-chave: carrega `observatory` do projeto selecionado, mostra até 10 lacunas com concorrentes e um botão por lacuna "Adicionar como pauta" que insere `{keyword: topic-as-keyword, title: initialArticleTitle(...)}` via o mesmo caminho que a importação de palavras-chave usa hoje (`isValidEditorialKeyword`), gravando `config.nexus_gap = {query, country, engines_missing}` quando o item for gerado. Lê `?nexusGaps=` da URL e pré-seleciona. Não altera o fluxo de geração existente.
- Testes vitest: `src/test/nexus-observatory.test.ts` (mapeamento do JSON da RPC para KPIs/gráficos, cálculo de lacunas, montagem do snippet) e `src/test/nexus-gap-brief.test.tsx` (render com dados vazios e com 2 lacunas; clique adiciona pauta).
- Acessibilidade: gráficos com `aria-label` e tabela equivalente oculta/visível; cores com contraste AA nos dois temas.

## 8. Entregáveis por bloco e critérios de aceite
| Bloco | Dono | Arquivos | Aceite |
|---|---|---|---|
| A | nexus-eng-construtor (backend/DB) | migração 1.x, `nexus-intelligence/index.ts`, `_shared/nexus-intelligence.ts` + `_test.ts`, `zica-signals/index.ts`, `_shared/zica-signals.ts` + `_test.ts`, `docs/NEXUS_OBSERVATORY.md` | `deno test supabase/functions/_shared/nexus-intelligence_test.ts supabase/functions/_shared/zica-signals_test.ts` verde; `deno check` das duas funções; SQL revisado contra as tabelas existentes (ler migração 20261028153533) |
| B | nexus-eng-construtor (frontend) | seção 7 | `npx vitest run src/test/nexus-observatory.test.ts src/test/nexus-gap-brief.test.tsx` verde; `npx tsc -p tsconfig.app.json --noEmit` sem erros novos; `npm run lint` nos arquivos novos |
| C | nexus-eng-construtor (plugin/integrações) | seções 4, 5, 6 | `php -l` em cada PHP; `node --check` no snippet/worker/middleware; `python -m py_compile` no shipper; `npm run build:wordpress-packages` gera o zip 3.16.0 |

Depois dos três blocos: `npm run check:claude-models`, `npm run test`, `npm run build` na raiz; revisão cruzada; nada é implantado sem autorização do dono.
