# ADENDO ao contrato "NEXUS · Motores & APIs" (12/11/2026, pedido do dono): gratuitos 100% + auditoria contínua

Vale em conjunto com `docs/NEXUS_PROVIDERS_CONTRACT.md` (ler os dois). Mesmas regras: ninguém implanta, sem commit/push, sem trocar de branch, sem segredos em código, textos em pt-BR, sem promessa de resultado.

## G. Gratuitos funcionando de ponta a ponta
Gratuitos = **Google Search Console** e **Bing Webmaster**. Coleta automática de dados reais de tráfego (cliques, impressões, posição, consultas, páginas), sem custo. Dependem só de credenciais que o dono gera (conta de serviço do Google; chave de API do Bing). O módulo tem um cartão "Ativação guiada dos gratuitos" no topo, com passo a passo, botão Conectar e resultado do primeiro teste e da primeira sincronização.
- **Bing** (A2, `_shared/nexus-bing.ts`): `GET https://ssl.bing.com/webmaster/api.svc/json/{Método}?apikey=…&siteUrl=…`, resposta no nó `d`. Métodos: `GetUserSites` (saúde), `GetQueryStats` (consulta, cliques, impressões, posição média, data), `GetPageStats`, `GetRankAndTrafficStats` (série diária). Datas vêm como `"/Date(1700000000000)/"` (converter para `YYYY-MM-DD` em UTC). Sem dimensão de país/dispositivo: gravar string vazia. Tratar `d` ausente, HTTP 5xx e erro do provedor (a API já teve instabilidades) com 1 nova tentativa e erro `bing_unreachable`.
- **Sincronização comum** (A2, `_shared/nexus-search-sync.ts`): `syncSearchPerformance(admin, opts)`, onde `opts = {organizationId, projectId, source:'gsc'|'bing'|'all', days, fetchFn, resolveSecret:(provider)=>Promise<string|null>, domain, property?}` e o retorno é `{results:Array<{source,ok,rows_upserted,truncated?,error?,from,to}>}`. Upsert em lotes de 500 em `nexus_search_performance`; idempotente; nunca lança por falha de um provedor (devolve `ok:false`). A ação `search_performance_sync` do `nexus-intelligence` ganha `source?: 'gsc'|'bing'|'all'` (padrão `all`).
- Agendamento: o executor da auditoria sincroniza GSC/Bing de cada projeto com credencial a cada 12 h (janela de 7 dias) e uma vez por semana com 90 dias.

## H. Auditoria contínua ("Saúde do sistema")
Nova função de borda **`nexus-audit`** (bloco D; não mexe no `nexus-intelligence`). Roda por agendamento (pg_cron a cada 15 min, **somente verificações gratuitas e leituras**; NUNCA chamadas pagas: usa `runHealthChecks` com `confirmCost:false`, GETs públicos aos próprios sites e SQL) e sob demanda. Resultado = **achados** em `corrective` (quebrado agora), `preventive` (vai quebrar ou ficar caro) e `improvement` (melhoria/upgrade), severidade `critical|high|medium|low|info`, evidência, ação sugerida e, quando seguro, **correção aplicável com um clique**. Achados se resolvem sozinhos quando a condição some, reabrem se voltarem e deduplicam por impressão digital.

### Tabelas (`supabase/migrations/20261112140000_nexus_audit.sql`)
- `nexus_audit_runs(id bigserial pk, organization_id uuid, trigger text check in ('schedule','manual'), started_at timestamptz default now(), finished_at timestamptz, status text check in ('ok','partial','error'), rules_evaluated int default 0, findings_opened int default 0, findings_resolved int default 0, detail jsonb default '{}')`.
- `nexus_audit_findings(id uuid pk default gen_random_uuid(), organization_id uuid not null, project_id uuid null, rule_id text not null, subject text not null default '', fingerprint text not null, category text check in ('corrective','preventive','improvement'), severity text check in ('critical','high','medium','low','info'), title text not null, detail text, suggested_action text, fix_action jsonb null, evidence jsonb default '{}', status text default 'open' check in ('open','acknowledged','snoozed','resolved'), note text, snoozed_until timestamptz, first_seen_at timestamptz default now(), last_seen_at timestamptz default now(), resolved_at timestamptz, occurrences int default 1, unique(organization_id, fingerprint))`. `fingerprint = rule_id|project_id|subject`. RLS: leitura por membro; escrita só `service_role`. Ambas na publicação `supabase_realtime` (com guarda). Retenção: documentar limpeza de runs > 90 dias e de achados resolvidos > 180 dias.
- RPCs `security definer`, `set search_path=''`, só `service_role`: `private.nexus_security_grants_audit()` → `{anon_write_tables:int, sample:string[] (até 10), rls_disabled_tables:int}` (tabelas de `public` onde `anon` tem INSERT/UPDATE/DELETE/TRUNCATE; tabelas sem RLS); `private.nexus_cron_health(p_hours int default 24)` → por job do pg_cron `{jobname,active,runs,failures,last_status,last_run}` (se `cron` não for legível, devolver vazio sem erro); wrappers `public.` só `service_role`.
- Agendamento: `cron.schedule('nexus-audit-every-15-min','*/15 * * * *', …)` chamando `nexus-audit` com o **mesmo padrão de autenticação dos cron jobs existentes** (ler `supabase/migrations/20260919010000_auto_process_rss_cron.sql` e `20260926200258_news_agents_quarter_hour_cron.sql` e copiar o mecanismo; se houver segredo, NÃO escrever o valor na migração: usar o mesmo lookup em Vault/GUC dos existentes). Migração idempotente (`cron.unschedule` se já existir). Documentar como pausar (`update cron.job set active=false where jobname='nexus-audit-every-15-min'`).

### Regras iniciais (módulo puro `_shared/nexus-audit.ts`, uma função por regra, testável sem rede)
O contexto `ctx` é montado pelo executor: provedores (overview), credenciais, programa, operações recentes, projetos (`wordpress_url`, `domain`, `wordpress_plugin_version`, `commercial_info`), chaves de sinais e último lote, última sincronização de `nexus_search_performance`, resultados de sondagens HTTP (função injetável `probe(url)` → `{ok,status,ms,bodySample}`), `security_grants`, `cron_health`.
| id | categoria | severidade | condição | ação sugerida / correção |
|---|---|---|---|---|
| `provider.never_verified` | corrective | medium | credencial guardada sem nenhum teste | fix `provider_health_check` |
| `provider.check_failed` | corrective | high (critical se GSC/Bing) | último teste falhou | reconferir chave/permissões; fix `provider_health_check` |
| `provider.latency_high` | preventive | low | latência média 7 d > 4000 ms | acompanhar |
| `provider.quota_low` | preventive | high (<10%) / medium (<25%) | quota restante baixa | recarregar créditos |
| `provider.unused_30d` | improvement | info | configurado, 0 operações em 30 dias | usar ou remover |
| `provider.free_not_connected` | improvement | high | GSC ou Bing sem credencial | abrir Ativação guiada (fix `open_route`) |
| `search.sync_stale` | corrective | medium (high > 7 d) | última sincronização GSC/Bing > 48 h com credencial ativa | fix `search_performance_sync` |
| `search.no_data` | improvement | medium | credencial ativa e 0 linhas | conferir propriedade/permissão |
| `observatory.stale` | preventive | low | nenhuma observação nova há 14 dias | registrar ou preparar rodada |
| `observatory.no_prompts` | improvement | medium | projeto sem conjunto de prompts | criar conjunto |
| `signals.no_batch` | corrective | medium | chave criada há > 24 h e `last_batch_at` nulo | conferir snippet |
| `signals.snippet_missing` | corrective | high | chave existe e a homepage não contém `zica-signals` (sondagem GET) | instalar o snippet |
| `plugin.outdated` | preventive | medium | `GET …/zica-posts/v1/version` (fallback `?rest_route=`) devolve versão < `PLUGIN_VERSION` | instalar zip novo |
| `plugin.unreachable` | corrective | high | REST do plugin não responde 2xx | verificar plugin/WAF |
| `site.llms_missing` | corrective | medium | `/llms.txt` ou `/robots.txt` fora do ar | fix `plugin_discovery_refresh` |
| `site.schema_thin` | improvement | low | homepage sem nó Organization/LegalService com name+url+sameAs | aplicar perfil de schema |
| `runtime.function_down` | corrective | critical | sondagem a `nexus-intelligence` e `zica-signals` (GET sem token: esperado 401/405) devolve 5xx/timeout | acionar suporte |
| `runtime.cron_failing` | preventive | medium | jobs `zica-*`/`nexus-*` com ≥ 3 falhas em 24 h | investigar |
| `security.anon_write` | preventive | high | `anon_write_tables > 0` | revogar escrita anônima (sem correção automática) |
| `security.rls_off` | preventive | high | tabelas sem RLS | habilitar RLS |
| `cost.budget_80` | preventive | high | consumido+reservado ≥ 80% do orçamento | ajustar orçamento |
| `cost.enabled_without_provider` | corrective | low | execução ligada sem provedores habilitados | habilitar ou desligar |
| `execution.enabled_info` | improvement | info | execução paga ligada | revisar orçamento |
`fix_action` = `{type:'provider_health_check'|'search_performance_sync'|'plugin_discovery_refresh'|'open_route', params:{…}}`. **Somente esses quatro tipos** são aplicáveis automaticamente; outros são rejeitados; nenhum faz chamada paga. `plugin_discovery_refresh` = `POST …/zica-posts/v1/discovery/refresh` ao WordPress do projeto (mesma chamada do `rdm-batch-discovery`: ver `_shared/wordpress-plugin-client.ts`; usar `providerFetch`).

### Ações da função `nexus-audit` (JWT de usuário da organização; [admin] = dono/admin)
| action | entrada | saída |
|---|---|---|
| `overview` | `{projectId}` | `{generated_at,last_run:{id,trigger,started_at,finished_at,status,rules_evaluated,findings_opened,findings_resolved}|null,counts:{open:{corrective,preventive,improvement},by_severity:{critical,high,medium,low,info},resolved_7d},findings:[{id,rule_id,project_id,category,severity,title,detail,suggested_action,fix_action,status,first_seen_at,last_seen_at,occurrences,snoozed_until,evidence}] (abertos, reconhecidos, adiados e resolvidos nos últimos 7 d; máx. 200),runs:[últimas 20]}` |
| `run` [admin] | `{projectId}` | roda agora para a organização; `{run}`; 1 execução manual por 60 s por organização (`429 audit_rate_limited`) |
| `update_finding` | `{id,status:'acknowledged'|'snoozed'|'open',snoozeHours?,note?}` | `{finding}`; `snoozed` exige 1–720 h |
| `apply_fix` [admin] | `{id}` | executa o `fix_action` (whitelist), registra em `evidence.last_fix`, reavalia a regra e devolve `{ok,result,finding}` |
| (cron) | cabeçalho de segredo interno, sem usuário | audita todas as organizações com `nexus_programs`; `{organizations,findings_opened,findings_resolved}` |
Executor com orçamento de tempo (máx. 50 s por organização; sondagens com timeout de 8 s; paralelismo ≤ 5), resiliente: falha de uma regra não derruba as outras (registra em `detail.rule_errors`). `PLUGIN_VERSION` vem de `_shared/plugin-version.ts`.

### Interfaces entre blocos (stubs criados pelo coordenador)
`_shared/nexus-providers.ts` (A1) exporta `PROVIDER_IDS`, `FREE_HEALTH_PROVIDERS`, `HealthResult` e `runHealthChecks(admin,{organizationId,triggeredBy,providers?,confirmCost?,fetchFn})`, além de `computeProviderStatus` e `computeProviderScore`. `_shared/nexus-search-sync.ts` (A2) exporta `syncSearchPerformance`. `_shared/nexus-gsc.ts` (A2) exporta `gscListSites`. Os blocos donos substituem os stubs mantendo as assinaturas.

### Frontend (acréscimo ao Bloco B)
Aba **"Saúde do sistema"** em `/nexus/motores`: faixa com a última auditoria ("há Ns · próxima em ≈ N min"), contagem por categoria e severidade, botão "Auditar agora" (admin), achados agrupados em Corretivas · Preventivas · Melhorias (severidade com cor + texto + ícone), título, detalhe, ação sugerida, "Aplicar correção" (só com `fix_action`; confirmação; mostra o resultado), "Reconhecer", "Adiar" (1 h / 24 h / 7 d), histórico de execuções e estado vazio positivo. Chama `supabase.functions.invoke('nexus-audit',{body})`. Realtime em `nexus_audit_findings` e `nexus_audit_runs` (mesmo padrão do módulo) com polling de 60 s. Cartão **"Ativação guiada dos gratuitos"** no topo da aba principal (some quando GSC e Bing estão conectados e saudáveis).

### Blocos e donos (acréscimos)
| Bloco | Arquivos | Verificação |
|---|---|---|
| D auditoria | `supabase/migrations/20261112140000_nexus_audit.sql`, `supabase/functions/nexus-audit/index.ts`, `_shared/nexus-audit.ts` (+ `_test.ts`), `supabase/config.toml` (entrada `nexus-audit` seguindo o padrão dos cron jobs: `verify_jwt=false` se o cron usar segredo próprio) | `deno test` (abrir, deduplicar, resolver sozinho, reabrir, adiar, falha isolada de regra), `deno check`, tsc 0, eslint sem erro novo |
| A2 (ampliado) | + `_shared/nexus-bing.ts`, `_shared/nexus-search-sync.ts` | `fetch` injetado e fixtures de GSC e Bing |
| B (ampliado) | + aba "Saúde do sistema" + ativação guiada | idem |
| C (ampliado) | `docs/NEXUS_PROVIDERS.md` ganha os capítulos "Auditoria contínua" (regras, categorias, como pausar o agendamento, como interpretar achados) e "Ativação dos gratuitos" | links conferidos |
