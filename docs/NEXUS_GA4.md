# NEXUS · Google Analytics 4 (GA4): ativação, o que é medido e erros comuns

Estado: **construído localmente em 13/11/2026; nada foi publicado nem executado contra o Google.** Contrato: `docs/NEXUS_GA4_AND_MANAGEMENT_PLANE_CONTRACT.md` (seções B, C e G). Veja também `docs/NEXUS_PROVIDERS.md` e `docs/NEXUS_MANAGEMENT_PLANE.md` (quem pode conectar: **só o gestor**).

O GA4 mostra **o que as pessoas fizeram no site** (sessões, engajamento, eventos-chave, de onde vieram, inclusive vindas de assistentes de IA). O Search Console mostra a busca no Google; os dois se complementam. A leitura é **gratuita** (Google Analytics Data API) e só **lê**: nada é alterado no seu Analytics.

Os números são **dados observados do passado**, não previsão. Nada aqui autoriza prometer resultado, posição ou captação de clientes (Provimento 205/2021 da OAB; ver o capítulo 10 de `NEXUS_PROVIDERS.md`).

## 1. Roteiro de ativação (para o dono, feito pelo gestor)

Pré-requisito: acesso de administrador à propriedade GA4 do site e à conta Google Cloud do escritório.

1. **Projeto no Google Cloud.** Use o mesmo projeto do Search Console, se já houver um.
2. **Ativar a API.** Abra a [página da Google Analytics Data API](https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com), confira o projeto e clique em **Ativar**.
3. **Conta de serviço.** Pode **reaproveitar a mesma conta de serviço e o mesmo arquivo JSON do Search Console**. O sistema guarda uma cópia separada para cada provedor (você cola o JSON duas vezes: uma no cartão do Search Console, outra no do GA4). Escopo usado: `https://www.googleapis.com/auth/analytics.readonly`.
4. **Dar acesso à propriedade.** No Google Analytics: **Administrador → Gerenciamento de acesso à propriedade → +** e adicione o **e-mail da conta de serviço** (campo `client_email` do JSON) com a função **Leitor**. Sem isso o Google responde 403.
5. **Achar o ID da propriedade.** **Administrador → Detalhes da propriedade**: o **ID da propriedade** é um número (por exemplo `123456789`). **Não** é o ID de métricas `G-XXXXXXX` nem o ID da conta.
6. **Conectar no Zica.ai.** Em `/nexus/motores`, cartão **Google Analytics 4**, **Conectar**, cole o JSON inteiro. O teste gratuito roda em seguida.
7. **Informar a propriedade do projeto.** No cartão de integrações do projeto, preencha **ID da propriedade GA4** (somente dígitos, 5 a 15). Cada site tem a **sua** propriedade; o sistema recusa o mesmo ID em dois projetos da organização (`ga4_property_already_used`). Nunca compartilhe uma propriedade entre sites.
8. **Sincronizar.** Botão **Sincronizar** (janela de 28 dias por padrão; 1 a 90). Depois disso a auditoria sincroniza sozinha: a cada 12 horas (7 dias) e uma vez por semana (90 dias). Apague o arquivo JSON do seu computador depois de colar.

Cada site/página continua com a **sua própria tag de conversão**; este módulo apenas lê dados.

## 2. O que é medido

Dimensões: `date`, `pagePath`, `sessionDefaultChannelGroup`, `sessionSource`. Métricas (nomes vigentes da Data API; `keyEvents` substituiu o antigo "conversões"): `sessions`, `engagedSessions`, `screenPageViews`, `totalUsers`, `userEngagementDuration`, `keyEvents`.

Uma sincronização faz **duas coletas** (decisão registrada em `NEXUS_MANAGEMENT_PLANE.md`, item 11):

| Coleta | Dimensões | Guarda em `nexus_analytics_daily` | Alimenta |
|---|---|---|---|
| **Site** | data, canal, fonte | `page = ''` | totais, série diária, canais, fontes de IA |
| **Páginas** | data, caminho, canal, fonte | `page <> ''` | ranking de páginas e desempenho por área |

Por quê: no GA4, uma sessão que passa por 3 páginas aparece em 3 linhas quando o caminho é dimensão. Somar as linhas por página contaria a mesma sessão várias vezes. **Não some uma família com a outra.**

Regras de gravação: caminho sem `?` nem `#`, no máximo 1000 caracteres (e limite em bytes, para caber no índice), `/` quando vazio; fonte e canal até 200 caracteres; linhas inválidas (data ruim, métrica não numérica ou negativa) são descartadas; linhas que colidem na chave única são somadas; até 100 000 linhas por página de resposta e no máximo 5 páginas por coleta (`truncated: true` quando passa disso). Reexecutar **não duplica** (`upsert` por `project_id, day, page, channel, source`, em lotes de 500; `synced_at` é atualizado).

Limitações que valem saber:

- **Usuários** = soma por dia, canal e fonte. Não é o total de usuários únicos do período que o painel do GA4 mostra.
- O GA4 aplica cotas e, em propriedades grandes, amostragem/limiares; o dia de hoje pode estar incompleto até a próxima sincronização.
- A janela é calculada em UTC; a propriedade pode ter outro fuso.

### Tráfego vindo de IA

`is_ai` é calculado no código pela lista exportada `AI_SOURCE_HOSTS` (em `_shared/nexus-ga4.ts`; testada): `chatgpt.com`, `chat.openai.com`, `openai.com`, `perplexity.ai`, `gemini.google.com`, `copilot.microsoft.com`, `claude.ai`, `you.com`, `phind.com`, entre outras. A comparação é por igualdade ou sufixo de domínio (`evil-claude.ai` não conta). **Nem todo assistente envia a origem da visita**; o que chega como `(direct)` não é contado como IA. É uma observação, não uma medida completa.

## 3. Desempenho por área

`content_performance` agrupa os artigos publicados do índice (`wordpress_article_index.topic_cluster`) por **área** e junta GSC e GA4 pelo **caminho** da URL (endereço do site ignorado, barra final ignorada, minúsculas). Retorna, por área: artigos, `gsc{clicks, impressions, ctr, position}`, `ga4{sessions, engaged_sessions, key_events, ai_sessions}` e até 10 páginas com tráfego.

- Páginas com tráfego **sem artigo correspondente** aparecem em `unmatched` (`{count, items}`), nunca somem em silêncio. Caminhos com acentos codificados de formas diferentes podem cair aí (o `%` é igualado só em minúsculas, não decodificado).
- Quando `analysis_version = 1000`, a área foi definida por **palavras-chave** (heurística do banco), **não** por revisão jurídica. A tela mostra esse aviso.
- Bing não entra nesta visão (só GSC e GA4).

## 4. Ações da API (`nexus-intelligence`)

| Ação | Quem | Corpo (além de `action` e `projectId`) | Resposta 200 |
|---|---|---|---|
| `ga4_sync` | gestor | `days?` (1–90) | `{ result: { property, from, to, rows_upserted, truncated, results:[{source:'ga4', ok, rows_upserted, error?}] } }` |
| `ga4_summary` | qualquer membro | `from?`, `to?` (YYYY-MM-DD; padrão 28 dias; máx. 366) | `{ summary }` |
| `content_performance` | qualquer membro | `from?`, `to?` | `{ performance }` |
| `project_integrations_set` | gestor | `ga4PropertyId?`, `gscProperty?` (vazio remove) | `{ integrations:{ ga4_property_id, gsc_property } }` |
| `project_integrations_get` | qualquer membro | — | gestor: valores; demais: `{ ga4_configured, gsc_configured }` |

`ga4_summary` devolve `period`, `totals{sessions, engaged_sessions, page_views, users, engagement_rate, avg_engagement_seconds, key_events}`, `daily[]`, `top_pages[]` (20), `by_channel[]`, `ai_referrals{totals, by_source[]}`, `notes[]` e `last_synced_at`. Períodos inválidos: `400 period_invalid`.

Erros do `ga4_sync` (campo `error`; o corpo traz também `result`):

| Código | HTTP | Significado | O que fazer |
|---|---|---|---|
| `manager_required` | 403 | Quem chamou não é gestor | Pedir ao gestor (aba Solicitações) |
| `ga4_not_configured` | 409 | Nenhuma credencial GA4 guardada | Conectar (passo 6) |
| `ga4_property_required` | 409 | Projeto sem ID de propriedade (ou inválido) | Passo 7 |
| `ga4_forbidden` | 403 | O Google recusou: API desativada ou conta de serviço sem acesso à propriedade (também 404 do Google) | Passos 2 e 4 |
| `ga4_quota` | 429 | Cota do Google atingida | Aguardar e tentar de novo |
| `ga4_unreachable` | 502 | Google fora do ar, sem resposta ou erro 5xx | Aguardar; a auditoria tenta sozinha |
| `ga4_credential_invalid` / `ga4_auth_failed` | 502 | JSON inválido ou conta de serviço recusada na troca de token | Gerar uma chave nova e usar **Trocar chave** |
| `ga4_request_failed` | 502 | O Google recusou a consulta (HTTP 400) | Conferir o ID da propriedade |
| `upsert_failed:…` | 502 | Falha ao gravar no banco | Tentar de novo; avisar o suporte se persistir |
| `ga4_property_already_used` | 409 | (em `project_integrations_set`) o ID já está em outro projeto da organização | Usar a propriedade certa do site |
| `ga4_property_invalid` | 400 | (em `project_integrations_set`) o ID não tem só dígitos (5 a 15) | Corrigir |

Se a primeira coleta (site) grava e a segunda (páginas) falha, `rows_upserted` mostra o que foi gravado e `error` o motivo; repetir é seguro.

## 5. Auditoria (`nexus-audit`)

| Regra | Categoria | Quando |
|---|---|---|
| `ga4.not_connected` | Melhoria (alta se o GSC está conectado) | Sem credencial GA4 |
| `ga4.property_missing` | Corretiva | Credencial ativa e projeto sem `ga4_property_id` |
| `ga4.sync_stale` | Corretiva | Última sincronização há mais de 48 h (correção de 1 clique: `analytics_sync`) |
| `ga4.no_data` | Melhoria | Credencial ativa há mais de 24 h, propriedade informada, zero linhas |
| `content.internal_links_low` | Melhoria | Média de links internos por conteúdo do índice menor que 2 |
| `content.area_unclassified_high` | Info | Mais de 20% do índice como `nao-classificado` |

A auditoria **nunca faz chamada paga**; a lista branca de correções ganhou apenas `analytics_sync` (leitura gratuita do GA4).

## 6. Banco de dados (migração `20261113100000_nexus_ga4_management.sql`)

- `nexus_analytics_daily` (RLS de leitura por membro; escrita só `service_role`; índice `(project_id, day)`).
- RPCs `nexus_analytics_summary` e `nexus_content_performance` (security invoker; o RLS de quem chama vale; a Edge Function chama com `service_role` depois de autorizar).
- Estatísticas da auditoria passam a incluir `ga4_property_id`, estado do GA4 e o índice de conteúdos (`private.nexus_audit_project_stats`).
- Retenção: nenhuma limpeza automática. Limpeza manual sugerida: `delete from public.nexus_analytics_daily where day < now() - interval '400 days';`.
- Reversão: comentário no topo da migração.

## 7. Verificação (o que já foi rodado localmente e o que não)

Rodado: testes Deno de `nexus-ga4`, `nexus-management`, `nexus-providers`, `nexus-audit`, `nexus-gsc`, `nexus-search-sync` (fetch simulado e credenciais sintéticas, sem rede); `deno check` das duas funções; SQL em PGlite (Postgres em memória). **Não rodado:** nenhuma chamada real à GA4 Data API, a migração no Postgres real do projeto e a implantação das funções. Antes de publicar, rodar a migração em uma branch e uma sincronização real com uma propriedade de teste.
