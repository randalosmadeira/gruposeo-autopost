=== Zica Posts ===
Contributors: zica-ai
Tags: seo, geo, llms, indexnow, schema, wordpress, automation, queue
Requires at least: 5.8
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 3.19.0
License: GPLv2 or later

Agente WordPress leve oficial da Zica.ai. Publica, registra eventos duráveis, serve discovery files e conversa com o Zica Orchestrator sem executar IA pesada durante save_post.

== 3.19.0 ==

* Aviso de versao em segundo plano: quando a versao instalada muda (ou o WordPress atualiza o plugin), o plugin agenda UM aviso unico pelo wp-cron e o envia ao Zica com a mesma chave de API do pareamento. O painel do Zica passa a mostrar a versao nova sem esperar ninguem clicar em "testar conexao". Antes, esse registro rodava dentro do carregamento da pagina (ate 20 s de espera) e nao chegava ao painel.
* GET /status passa a trazer "outbox_summary": contagem da fila de saida por status e o erro MAIS RECENTE ja saneado (sem enderecos, tokens ou chaves, no maximo 200 caracteres), para o Zica mostrar o motivo das falhas. Somente leitura: o comportamento da fila nao muda e nada e apagado.
* Sem tabela nova, sem requisicao externa alem do aviso de versao ao Zica, sem telemetria. Zica antigo continua funcionando (o campo "outbox" de sempre continua no /status).
* ATENCAO: a sintaxe PHP desta versao NAO foi executada antes do empacotamento (nao havia PHP no ambiente de build). Instale primeiro em UM site de teste e confira o /status e o aviso no painel do Zica.

== 3.18.0 ==

* Páginas do Estúdio de Páginas do Zica: a nova rota POST /pages cria ou atualiza uma PÁGINA (page), idempotente por zica_ai_id, com endereço semântico EXATO (até 3 níveis) e hierarquia. Se o WordPress mudar o slug (sufixo "-2") ou a hierarquia, a criação é DESFEITA e a rota devolve 409. A página-pai precisa existir; página de outro zica_ai_id no mesmo caminho devolve 409 (nunca sobrescreve página alheia).
* POST ou GET /pages/lookup (acha por caminho ou zica_ai_id), POST /pages/status (despublica ou republica), GET /pages/{id} (conteúdo e hash, para detectar desvio) e POST /redirects (301 do endereço antigo para o novo).
* Schema JSON-LD em um grafo só (impresso pelo módulo de descoberta), meta descrição, canonical, hreflang, Open Graph e cartão do X vindos do Estúdio; título de SEO e robots (noindex) respeitados. Com Rank Math ou Yoast ativos, título, descrição e canonical vão para as chaves deles e o Zica Posts não imprime os seus.
* Reaproveita o portão de completude 3.17.0 (relatório estruturado; por padrão publica com aviso). Conteúdo filtrado por wp_kses_post; sem requisição externa nova; sem telemetria. Zica antigo continua funcionando como antes.
* ATENÇÃO: a sintaxe PHP desta versão e o comportamento nos temas (Elementor, Divi, blocos) NÃO foram executados antes do empacotamento: instale primeiro em UM site de teste e publique uma página de teste como rascunho.

== 3.17.0 ==

* Portão de completude antes de publicar: o plugin confere o conjunto do artigo (título, meta descrição, H1 único e hierarquia, trilha BreadcrumbList, schema Article, canonical, Open Graph, imagem destacada e alt, links internos mínimos, autor, datas coerentes, tabelas sem markdown cru, resíduo de prompt e o hash do conteúdo aprovado no Zica) e devolve um relatório estruturado ao Zica.
* O que o plugin consegue preencher de forma determinística ele preenche (trilha, schema, canonical, Open Graph, alt das imagens na exibição, data de modificação do schema). O que não consegue fica "pendente" no relatório. Por padrão publica com aviso; só segura como rascunho se o projeto, no Zica, escolher "exigir".
* Um só bloco Article por post: com Rank Math, Yoast, AIOSEO ou SEOPress ativos o Article e a trilha ficam com eles e o Zica Posts não duplica. As opções `zica_posts_fill_breadcrumb`, `zica_posts_fill_schema`, `zica_posts_fill_og` e `zica_posts_fill_alt` (padrão "1") desligam cada preenchimento.
* Sem requisição externa nova, sem telemetria e sem enviar conteúdo a terceiros. Não altera o texto salvo do post. Zica antigo (sem o campo `completeness`) continua funcionando como antes.

== 3.16.2 ==

* Cliques de contato: o script de sinais passa a medir clique em WhatsApp, telefone, e-mail e envio de formulário de contato (tipo `cta_click`). Só o tipo do contato e o caminho da página saem do navegador: nunca o número, o e-mail ou o texto digitado. Respeita "não rastrear". Botões que não são links podem usar `data-zica-cta="whatsapp|phone|email|form"`.
* Pede a migração `20261120100000` do Zica (aceita o tipo `cta_click`); antes dela, os cliques são recusados com segurança e a medição de visitas continua igual.

== 3.16.1 ==

* Auditor de IA: a checagem "Schema JSON-LD da homepage" agora lê o JSON-LD que a página realmente publica (tema, Rank Math ou plugin), junta `@graph`, ignora blocos inválidos e aponta o que falta (endereço, telefone, sameAs). O schema configurado no plugin continua sendo contado como fonte adicional.
* Auditor de IA: a checagem de schema dos artigos amostra os 6 posts mais recentes e, quando não há `_zica_posts_json_ld`, lê a permalink renderizada em busca de Article/NewsArticle/BlogPosting.
* As duas checagens de schema ficam em cache de 6 horas (`zica_posts_audit_schema_cache`). "Rodar Auditor de IA Agora" ignora o cache e `POST /homepage-schema/inject` o invalida.

== 3.16.0 ==

* Sinais de IA: conta acessos de robôs de IA (GPTBot, ClaudeBot, PerplexityBot etc.) e visitas vindas de IA/busca, por dia, agente e página. Sem IP, sem User-Agent completo, sem cookies e ignorando usuários logados.
* Snippet de navegador `assets/zica-signals.js` (sem cookies, respeita Do Not Track, envia uma vez por visita) impresso quando o site está conectado.
* Envio horário assinado (HMAC-SHA256) ao Zica.ai; endpoint precisa ser HTTPS e terminar em .supabase.co ou usar o host do webhook do Hub.
* REST: `GET /signals/status`, `POST /signals/configure`, `POST /signals/flush`. Bloco "Sinais de IA" no admin.
* `ZICA_Posts_Auth::sign_body` aceita segredo opcional (compatível com chamadas anteriores).
* Limite: com cache de página/CDN o PHP não vê o acesso do robô; use o Worker/middleware/leitor de logs em integrations/zica-signals.

== 3.15.0 ==

* Redimensionamento e recompressão reais no servidor: `POST /media` agora aplica `target_width`/`target_height` (crop central via `WP_Image_Editor::resize`) e reduz a qualidade em degraus até caber em `max_kb`, respeitando `preferred_format` (WebP quando suportado, senão JPEG).
* Fallback seguro quando o servidor não tem GD/Imagick ou os parâmetros de redimensionamento não são enviados: mantém o upload bruto anterior.

== 3.14.0 ==

* Lista canônica de bots de IA liberados em robots.txt/ai.txt ampliada (Claude-SearchBot, Googlebot-Image, Googlebot-Video, Bingbot, DuckAssistBot).
* Schema JSON-LD de homepage (Organization/LegalService) via `POST /homepage-schema/inject`, impresso em `wp_head` na home.
* hreflang entre traduções via `POST /articles/hreflang-sync`, impresso em `wp_head` nos posts singulares.
* Agente.IA Auditor: checagem sob demanda de robots.txt, arquivos de discovery, schema por artigo, schema de homepage e hreflang — botão no admin e `GET /ai-audit`.
* Endpoints portados do plugin legado zica-ai: `POST /fix-ai-crawlers`, `POST /discovery/refresh`, `GET /diagnostics` (estendido), `POST /schema/validate` (com LegalService/Attorney/Organization).

== 3.13.0 ==

* Política de imagens 2026: imagem destacada entregue em 1200x675 (16:9) WebP, até 150 KB, com cópia JPEG.
* Filtro wp_robots força max-image-preview:large em todas as páginas, independentemente de tema ou plugin de SEO.
* Upload de mídia grava alt text e legenda enviados pelo Zica.ai.

== 3.12.0 ==

* Pareamento com uma única chave, sem digitação manual da URL.
* Descoberta e validação automática da URL completa do WordPress.
* Chave bruta protegida no Vault do Zica Posts; o registro central armazena somente SHA-256.

== 3.11.0 ==

* Auditoria pós-publicação e após novas edições.
* Autocorreção conservadora de símbolos Markdown e caracteres invisíveis no título, preservando revisão anterior.
* Impressão digital de título e conteúdo para advertência de possíveis duplicidades.
* Painel administrativo com atalhos para editar, corrigir com segurança e mover para a lixeira.
* Exclusão permanente somente após envio à lixeira, mediante permissão, nonce e confirmação explícita.
* Nenhuma duplicidade é removida automaticamente.

== 3.10.2 ==

* Arquitetura modular: Auth, Discovery, Outbox, REST, Cards e Admin separados.
* Correção anti-eco: atualizações Hub -> WordPress não retornam ao outbound outbox.
* Delegação explícita de IndexNow ao Orchestrator para evitar submissões duplicadas.
* Outbox persistente com idempotência por content hash, correlation ID e retry exponencial.
* HMAC SHA-256 com timestamp e nonce no canal Hub -> WordPress.
* Webhook Hub exige HTTPS público; redirects são desabilitados no POST do outbox.
* Discovery: llms.txt, llms-full.txt, ai.txt, manifest JSON e sitemap com lastmod.
* Escrita física atômica com fallback virtual.
* IndexNow em batch; aceite de submissão não é tratado como confirmação de indexação.
* Endpoint autenticado de artigo completo para workers externos.
* Cards relacionados agora carregam stylesheet público próprio, responsivo.
* Reconciliação fallback às 15:00 America/Sao_Paulo.
* Não altera automaticamente blog_public, permalink, comentários, WAF ou cache global.
* Não usa Google Indexing API para artigos comuns.
* OAI-SearchBot e demais crawlers conhecidos são configuráveis; User-Agent nunca é critério de bypass de WAF.

== Arquitetura ==

WordPress -> Outbox -> Zica Orchestrator -> BullMQ/Redis -> IA/Mídia/SEO -> Delivery -> Discovery/IndexNow -> Métricas.

Quando o Hub está habilitado, recomenda-se deixar "Hub é responsável pelo IndexNow" ativado. Assim o plugin não duplica o envio.

Discovery e permissão de crawling não garantem indexação, treinamento, ingestão, citação ou ranking por mecanismos externos.
