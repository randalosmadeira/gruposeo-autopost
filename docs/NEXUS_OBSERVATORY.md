# NEXUS Observatório (backend)

Mede se o site aparece (menção e citação) em respostas de IA e buscas, quem aparece no lugar, e quanto tráfego de IA chega ao site.
Linguagem do produto: "observado", "não encontrado na amostra" (nunca "posição zero"); "submissão recebida" não é "indexação".

> **Execução paga continua bloqueada.** `PAID_SERVICES_BLOCKED = true` em `_shared/nexus-spend-lock.ts` e orçamento 0 impedem qualquer chamada
> a OpenAI, Gemini, Anthropic, Perplexity ou Serper. As ações novas só leem, gravam observações manuais e *preparam* operações (`status='prepared'`).
> Nada foi implantado: migração, funções e `config.toml` estão só no repositório.

## O que cada tabela guarda

| Tabela | Conteúdo |
|---|---|
| `nexus_prompt_sets` | Conjunto de consultas: nome, mercados (`country`/`language`/`city`), motores, cadência (`manual`/`weekly`/`daily`), status. |
| `nexus_prompts` | Consultas do conjunto: tópico, intenção, texto (≤ 500), `branded`, posição, ativa. Única por (conjunto, consulta, intenção). |
| `nexus_operations` (existente) | Cada observação (`ai_observation` ou `serp`). É a fonte da verdade. |
| `nexus_citations` | Derivada: uma linha por URL citada em cada observação válida, com `host` (sem `www.`) e `is_own`. |
| `nexus_competitor_mentions` | Derivada: concorrentes citados/mencionados em cada observação válida. |
| `nexus_site_keys` | Uma chave de sinais por projeto: `site_id` público, hash sha256 do segredo, origens permitidas, último lote. O segredo em claro fica só no Vault (`nexus_site_<site_id>`). |
| `nexus_site_signals` | Contadores agregados por dia × tipo × agente × caminho. Sem IP, sem User-Agent completo, sem cookies. |
| `nexus_signal_batches` | Dedupe de lotes do servidor (`site_id`, `batch_id`). Sem limpeza automática: apagar linhas com mais de 30 dias manualmente ou criar um `pg_cron` depois. |

As tabelas derivadas são preenchidas por um gatilho em `nexus_operations` (status `succeeded`, tipos `ai_observation`/`serp`); ele é idempotente e nunca derruba a gravação da operação (falhas viram `warning` no log do Postgres).

## Registrar uma observação manual

Chamada à função `nexus-intelligence` (usuário autenticado, projeto próprio):

```json
{ "action": "import_observation", "projectId": "<uuid>", "observation": {
  "engine": "chatgpt_web", "country": "us", "language": "en-US",
  "query": "...", "topic": "custodia", "intent": "international",
  "rdm_mentioned": false, "rdm_cited": false,
  "citations": [{ "url": "https://...", "title": "..." }],
  "competitors": ["CNJ", { "name": "Fulano & Cia", "host": "fulano.com.br", "source": "organic" }],
  "answer_excerpt": "...", "observed_at": "2026-11-12T10:00:00-03:00", "observer": "nome", "evidence_path": "prints/2026-11-12-a.png" } }
```

A chave de idempotência é `manual:<motor>:<sha256(consulta)[0..12]>:<país>:<dia>`: repetir a mesma consulta, no mesmo motor e país, no mesmo dia **substitui** a observação anterior (não soma). Para guardar repetições, registre em dias diferentes.
Motores válidos: `chatgpt_web`, `chatgpt_api`, `gemini_web`, `gemini_api`, `claude_web`, `claude_api`, `perplexity_web`, `perplexity_api`, `copilot_web`, `google_aio`, `google_serp`, `bing_serp`.
Os coletores automatizáveis (preparados, não executados) são os `*_api` e `google_serp`; em `execute`, `gemini_api` e `claude_api` exigem o modelo em `nexus_programs.settings.observation_models.<motor>`.

## Lacunas e share of voice (RPC `nexus_observatory_summary`)

- `valid` = operações `succeeded` no período (data em UTC: `output.collected_at`, senão `input.observed_at`, senão `updated_at`).
- Por operação, `mentioned` = `output.mentioned`; `cited` = `output.cited` **ou** existe citação própria derivada.
- `mention_rate`/`citation_rate` = contagem ÷ `valid` (null se `valid = 0`).
- `share_of_voice` = `own_citations` ÷ (`own_citations` + `competitor_mentions`), contando linhas de `nexus_citations` próprias e de `nexus_competitor_mentions` das observações válidas; null se a soma é 0.
- `gaps`: agrupa as observações válidas por (consulta, país) e mantém os grupos em que **nenhuma** observação teve `cited = true` (`having not bool_or(cited)`). `engines_missing` são os motores que observaram a consulta; `competitors` são os distintos (até 10). Ordenado por número de concorrentes, máx. 50. Consulta sem texto é ignorada.
- `by_engine_country` cruza motor × país para a matriz do painel.

## Chave de sinais (plugin, servidor e snippet)

1. `signals_key_create` gera `site_id` (12 caracteres `[a-z0-9]`) e um segredo de 32 bytes em hex. O segredo aparece **uma única vez** na resposta; depois só existe no Vault. `signals_key_rotate` troca o segredo mantendo o `site_id`. Só dono/admin da organização.
2. **Modo servidor** (plugin WordPress, Worker, middleware, log shipper): `POST /functions/v1/zica-signals` com `X-Zica-Site`, `X-Zica-Timestamp` (±300 s), `X-Zica-Nonce` (≥ 16 caracteres, UUID serve) e `X-Zica-Signature = hex(hmac_sha256(segredo, timestamp + "\n" + nonce + "\n" + sha256hex(corpo)))`. Corpo: `{site_host, batch_id, events:[{day, kind, agent, path, hits}]}` (≤ 500, ≤ 64 KB). Resposta `200 {accepted, duplicate, dropped}`; lote repetido volta `200 {accepted:0, duplicate:true}`. `401` assinatura inválida (ou site desconhecido), `409` relógio fora da janela, `413` tamanho.
3. **Modo navegador** (snippet `zica-signals.js`): sem assinatura; exige `Origin` na lista `allowed_origins` (vazia = só o host do projeto). Aceita `text/plain` ou `application/json`; responde `204` com CORS da origem, `403` caso contrário. Cada envio conta 1 e o corpo tem ≤ 1 KB.
4. Agentes fora do catálogo (`integrations/zica-signals/signals-catalog.json`) viram `other`; nunca são rejeitados. `human_pageview` sempre usa `other`.
5. Limitações: o navegador não prova nada (a origem é declarada pelo cliente e `site_id` é público; contagens de navegador podem ser forjadas fora de um navegador). Robôs de IA não executam JavaScript: só os modos de servidor medem `ai_bot_hit`.
6. A função é pública (`verify_jwt = false` em `supabase/config.toml`) e não faz chamadas externas.
