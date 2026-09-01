=== Zica Posts — Conector WordPress Oficial Zica.ai ===
Contributors: zica-ai
Tags: seo, geo, llms, indexnow, schema, automation, wordpress, ai
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 3.10.0
License: GPLv2 or later

Conector oficial do software Zica Posts/Zica.ai para publicação, GEO, Schema, descoberta por LLMs, sitemaps, IndexNow e automação editorial 24/7.

== Identidade ==
Software ID: zica-posts
Nome do plugin: Zica Posts — Conector WordPress Oficial Zica.ai
Namespace canônico: /wp-json/zica-posts/v1/
Compatibilidade temporária: /wp-json/zica-ai/v1/ e /wp-json/cfrdm/v1/

== Segurança e conexão ==
Na ativação é criada uma API Key própria do plugin.
Headers aceitos:
* X-ZICA-POSTS-Key
* X-ZICA-AI-API-Key
* X-CFRDM-API-Key apenas para migração legado
Também é aceito Authorization: Bearer <API KEY>.

== Sincronização ==
O plugin faz dois ciclos complementares:
1. Publicação/atualização: agenda sincronização curta e assíncrona após o conteúdo ser salvo.
2. Varredura integral: todos os dias às 15:00 no fuso America/Sao_Paulo.

A rotina das 15h é agendada como evento único e recriada após cada execução para preservar o horário local mesmo se a regra de fuso mudar.

IMPORTANTE: WP-Cron depende de tráfego. Para máxima precisão em VPS/cPanel, configure o cron do servidor para executar wp-cron.php ou WP-CLI a cada 5 minutos. O plugin continuará responsável por decidir se o evento das 15h está devido.

== Documentos atualizados ==
* /llms.txt
* /llms-full.txt
* /ai.txt
* /zica-ai-manifest.json
* /zica-ai-sitemap.xml
* arquivo de verificação do IndexNow

Quando a raiz do WordPress é gravável, o plugin atualiza esses arquivos por escrita atômica (temporário + rename). Se o File Manager/servidor não permitir escrita, os mesmos recursos continuam sendo servidos dinamicamente pelo WordPress, evitando tela branca, travas ou falha de publicação.

== Indexação ==
O plugin usa o protocolo IndexNow para URLs novas ou alteradas. O IndexNow compartilha URLs com os buscadores participantes.

O antigo endpoint de ping de sitemap do Google não é utilizado na 3.10.0. Para Google, a estratégia é manter sitemap e lastmod reais, incluir sitemap em robots.txt e usar Search Console. A Google Indexing API não é usada para artigos comuns porque sua finalidade oficial é restrita a tipos de conteúdo elegíveis.

== LLMs e crawlers de IA ==
O plugin publica índices textuais e adiciona regras Allow no robots.txt para crawlers de IA conhecidos. Isso aumenta a descoberta técnica, mas não promete nem falsifica "indexação garantida" em qualquer LLM.

A lista é extensível pelo filtro WordPress zica_posts_ai_bots.

== Schema ==
Quando o artigo chega da Zica.ai com json_ld_schemas, os schemas fornecidos são armazenados e renderizados.
Se não houver schema fornecido e Rank Math/Yoast não estiver gerando structured data, o plugin cria um Article JSON-LD básico para evitar duplicação de schemas.

== Cards automáticos ==
Posições disponíveis:
* Antes do conteúdo
* Após o 2º parágrafo
* Após o 4º parágrafo
* Após o conteúdo
* Desativado

Quantidade: 1 a 6 cards relacionados.
Também existe shortcode: [zica_posts_cards count="3"]

== REST API 3.10.0 ==
Públicos:
GET /version
GET /health

Autenticados:
GET /test
GET /status
POST /sync
GET /files
GET/POST /cards/settings
GET/POST /articles
POST /media

== Compatibilidade ==
A 3.10.0 é uma reconstrução limpa. O pacote 3.9.0 não é necessário para instalar esta versão.
O diretório e software ID são novos (zica-posts), porém aliases de API foram mantidos para que o backend antigo possa migrar gradualmente.

== Changelog ==
= 3.10.0 =
* Reconstrução limpa após descarte do pacote 3.9 corrompido.
* Novo Software ID zica-posts.
* Novo namespace /zica-posts/v1.
* Endpoints autenticados e aliases de compatibilidade.
* Sincronização automática na publicação e ciclo diário 15:00 America/Sao_Paulo.
* llms.txt, llms-full.txt, ai.txt, manifest JSON e sitemap próprio.
* Escrita física atômica com fallback virtual.
* IndexNow em batch sem endpoints obsoletos de ping.
* Cards relacionados automáticos com controle de posição.
* JSON-LD com proteção contra duplicação de Rank Math/Yoast.
* Compatibilidade com publicação atual da Zica.ai em /zica-ai/v1/articles e /media.
