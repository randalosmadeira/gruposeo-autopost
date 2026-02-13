=== ContentFactory RDM ===
Contributors: gruposeomarketing
Tags: content, seo, articles, automation, ai, image-optimization, indexing, indexnow, llms, meta-auditor
Requires at least: 5.8
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 3.2.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Integração avançada com ContentFactory para publicação automática de artigos SEO, sincronização bidirecional, otimização de imagens, links internos, indexação automática Google/Bing e schema markup.

== Description ==

O **ContentFactory RDM** é um plugin WordPress desenvolvido pelo GRUPO SEO MARKETING que conecta seu site à plataforma ContentFactory, permitindo:

* **Publicação Automática**: Artigos criados na plataforma são publicados automaticamente no seu WordPress
* **Sincronização Bidirecional**: Alterações no WordPress são refletidas na plataforma e vice-versa
* **Gestão de Categorias e Tags**: Organize seus artigos automaticamente
* **Suporte a SEO**: Integração com Yoast SEO e Rank Math
* **Webhooks**: Notificações em tempo real sobre alterações
* **API Completa**: REST API para integrações personalizadas
* **Otimização de Imagens**: Compressão automática, redimensionamento e geração de WebP
* **Links Internos Inteligentes**: Análise e sugestão de links internos semanticamente relacionados
* **Logging Avançado**: Registro detalhado de todas as operações com exportação CSV
* **Auto-correções SEO**: Detecção e correção automática de problemas de SEO
* **Indexação Automática**: Notificação automática para Google e Bing quando artigos são publicados
* **Schema Markup**: JSON-LD automático para artigos, imagens e FAQs

== Installation ==

1. Faça upload dos arquivos do plugin para o diretório `/wp-content/plugins/contentfactory-rdm`
2. Ative o plugin através do menu 'Plugins' no WordPress
3. Acesse 'ContentFactory' no menu lateral para configurar
4. Copie a API Key e cole nas configurações do projeto no ContentFactory

== Frequently Asked Questions ==

= Como obter a API Key? =

A API Key é gerada automaticamente quando você ativa o plugin. Acesse ContentFactory > Dashboard para visualizá-la.

= O plugin é compatível com Yoast SEO? =

Sim! O plugin detecta automaticamente se você tem Yoast SEO ou Rank Math instalado e sincroniza os metadados de SEO.

= Como funcionam os webhooks? =

Quando um post é criado, editado ou excluído no WordPress, o plugin envia uma notificação para a plataforma ContentFactory, mantendo tudo sincronizado.

= O plugin otimiza imagens automaticamente? =

Sim! O plugin comprime, redimensiona e gera versões WebP das imagens automaticamente para melhorar a performance do site.

= Como funciona o sistema de links internos? =

O plugin analisa o conteúdo do seu site e sugere links internos semanticamente relacionados para melhorar a arquitetura de SEO.

= O plugin envia artigos para indexação no Google? =

Sim! Na versão 2.1, o plugin notifica automaticamente o Google e o Bing quando um artigo é publicado, acelerando a indexação.

= O plugin gera schema markup automaticamente? =

Sim! O plugin gera JSON-LD para artigos (Article schema), imagens (ImageObject schema) e FAQs automaticamente.

== Changelog ==

= 2.6.2 =
* **MELHORADO**: Paginação completa para buscar TODOS os artigos (sem limite de 100)
* **MELHORADO**: Retorno de total de páginas no endpoint articles-for-indexing
* **CORRIGIDO**: Sincronização agora processa sites com centenas de artigos

= 2.6.1 =
* **CRÍTICO**: Corrigido registro de endpoints REST do Article Indexer para funcionar fora do contexto admin
* **CORRIGIDO**: Endpoints /articles-for-indexing e /export-articles-batch agora respondem corretamente via API externa
* **MELHORADO**: Article Indexer é carregado nas dependências principais para suporte completo à REST API

= 2.6.0 =
* **NOVO**: Verificação automática de saúde do plugin ao selecionar projeto
* **NOVO**: Barra de status de qualidade de conexão com latência em tempo real
* **NOVO**: Testes de conectividade integrados no painel de integrações
* **NOVO**: Guia visual de instalação do plugin quando não detectado
* **NOVO**: Fallback automático para REST API padrão quando plugin não instalado
* **MELHORADO**: Sistema de indexação automática com crawling periódico (2x/dia)
* **MELHORADO**: Endpoints REST para sincronização em batch de artigos
* **MELHORADO**: Detecção de clusters temáticos com análise semântica
* **CORRIGIDO**: Erros específicos do WordPress agora exibem mensagens claras

= 2.5.2 =
* **MELHORADO**: Sincronização de artigos diretamente pelo painel de Linkagem Interna do app
* **MELHORADO**: Busca via IA agora funciona corretamente no Gerador de Artigos V2
* **MELHORADO**: Endpoint de exportação em batch para melhor performance
* **CORRIGIDO**: Compatibilidade com REST API padrão do WordPress para sites sem plugin

= 2.5.1 =
* **NOVO**: Sistema de linkagem interna inteligente com IA para sincronização automática
* **NOVO**: Indexador de artigos com análise semântica e detecção de clusters temáticos
* **NOVO**: Regras de linkagem automática por palavras-chave com priorização
* **MELHORADO**: Integração de links internos em todos os geradores de conteúdo

= 2.2.1 =
* **CRÍTICO**: Corrigido conflito com Elementor e page builders que causava tela branca
* **CRÍTICO**: Corrigido erro de tabela não existente durante ativação
* **CORRIGIDO**: Lazy loading de dependências para evitar conflitos de memória
* **CORRIGIDO**: Hooks agora verificam se page builders estão salvando antes de executar
* **CORRIGIDO**: Logger não falha mais quando tabelas não existem
* **MELHORADO**: Detecção de Elementor, Beaver Builder, Divi e WPBakery
* **MELHORADO**: Hooks de save_post usam prioridade baixa (100) para evitar conflitos
* **MELHORADO**: Classes são carregadas sob demanda (lazy loading)

= 2.2.0 =
* **NOVO**: Validador de Schema JSON-LD antes da publicação
* **NOVO**: Endpoints REST para validação e preview de schemas
* **NOVO**: Integração com Google Rich Results Test
* **NOVO**: Avisos no admin para problemas de schema
* **NOVO**: Schema Product para artigos de review de produtos
* **NOVO**: Schema Review com rating, prós e contras
* **NOVO**: Schema ItemList para artigos de comparação
* **NOVO**: Extração automática de produtos do conteúdo
* **NOVO**: Suporte a prós/contras estruturados (positiveNotes/negativeNotes)
* **MELHORADO**: Detecção automática de tipo de artigo (review/comparison)

= 2.1.0 =
* **NOVO**: Indexação automática - notificação para Google e Bing ao publicar
* **NOVO**: Schema markup JSON-LD automático para artigos
* **NOVO**: Schema markup para imagens destacadas (ImageObject)
* **NOVO**: Extração automática de FAQ schema do conteúdo
* **NOVO**: API endpoint para verificar status de indexação
* **NOVO**: Meta tag de disclosure para conteúdo gerado por IA
* **MELHORADO**: Compatibilidade com WordPress 6.7
* **MELHORADO**: Branding atualizado para GRUPO SEO MARKETING

= 2.0.0 =
* **NOVO**: Sistema de logging detalhado com exportação CSV
* **NOVO**: Otimização automática de imagens (compressão, redimensionamento, WebP)
* **NOVO**: Geração automática de imagens OpenGraph
* **NOVO**: Análise e sugestão de links internos
* **NOVO**: Auto-correções de SEO (títulos, excerpts, meta descriptions)
* **NOVO**: Portal de notícias e atualizações da plataforma
* **NOVO**: Dashboard administrativo aprimorado com métricas
* **MELHORADO**: Performance geral do plugin
* **MELHORADO**: Compatibilidade com WordPress 6.5
* **CORRIGIDO**: Diversos bugs menores

= 1.0.0 =
* Lançamento inicial
* Sistema de API Key para autenticação segura
* REST API completa para artigos, categorias e tags
* Webhooks para sincronização em tempo real
* Painel administrativo com estatísticas
* Suporte a Yoast SEO e Rank Math
* Upload de mídia via API
* Logs de atividade

= 3.2.1 =
* **CORRIGIDO**: Erro 'verificação cookie falhou' em Autocorreções e Sincronização (migrado de REST para AJAX)
* **CORRIGIDO**: Linkagem interna usa fallback 'Leia também' quando âncora exata não é encontrada
* **CORRIGIDO**: Regex Unicode-safe para matching de texto âncora com caracteres acentuados
* **CORRIGIDO**: Posts que já contêm link para URL alvo retornam sucesso em vez de erro
* **MELHORADO**: Pré-verificação com mb_stripos antes de regex para melhor performance

= 3.2.0 =
* **NOVO**: Notificações automáticas no dashboard para artigos gerados por cron
* **NOVO**: Monitoramento de portais com scraping HTML e RSS integrado
* **NOVO**: Reescrita automática com score de originalidade (95%+)
* **NOVO**: Painel de diagnóstico com reparo de tabelas via AJAX fallback
* **INTEGRAÇÃO**: Pipeline completo: portal monitoring → rewrite → publish → notify
* **MELHORADO**: Notificações com badge de não-lidas e link direto ao editor
* **MELHORADO**: Sincronização de WordPress Stats otimizada com upsert

= 3.1.0 =
* **NOVO**: Auditor de Meta Descriptions com IA (cron a cada 6h)
* **NOVO**: IndexNow - notificação automática ao Bing/Google/Yandex
* **NOVO**: llms.txt + headers AI-friendly para ChatGPT/Claude/Gemini
* **NOVO**: Duplicador de Posts/Páginas com ação em lote
* **NOVO**: Exclusão em massa de posts selecionados
* **NOVO**: News Sitemap para Google News
* **NOVO**: Sitemap Optimizer com prioridades dinâmicas
* **NOVO**: robots.txt otimizado para crawlers de IA
* **NOVO**: Open Graph e Twitter Cards auto-preenchidos
* **INTEGRAÇÃO**: Publicação → Meta Audit → IndexNow → llms.txt invalidação
* **SEGURANÇA**: Pre-update checks (PHP, WP, disco, DB, erros recentes)
* **SEGURANÇA**: Rollback automático em caso de falha na atualização

= 3.0.2 =
* **CORRIGIDO**: Ordem de registro de cron intervals
* **CORRIGIDO**: Fallback para intervalos customizados
* **CORRIGIDO**: Prevenção de fatal errors durante init

= 3.0.0 =
* **NOVO**: Integração Google Search Console via OAuth 2.0
* **NOVO**: AI Auto-Fix para erros 404
* **NOVO**: Ubersuggest Sync
* **NOVO**: HTTPS Enforcer
* **NOVO**: AI Content Enhancer

== Upgrade Notice ==

= 3.2.1 =
Correção do erro de cookie em Autocorreções/Sincronização e melhorias na linkagem interna com suporte Unicode. Recomendado para todos os usuários.

= 3.2.0 =
Notificações automáticas, monitoramento de portais com reescrita IA e pipeline completo de automação. Recomendado para todos os usuários.

= 3.1.0 =
Atualização major com Meta Auditor IA, IndexNow, llms.txt, Duplicador de Posts, Sitemap Optimizer e sistema de atualização segura com rollback automático.

= 3.0.0 =
Integração Google Search Console, AI Auto-Fix e novos módulos de SEO avançado. Faça backup antes de atualizar.

= 2.2.0 =
Nova versão com validador de schema JSON-LD, suporte a Product/Review schemas e integração com Google Rich Results Test.

= 1.0.0 =
Primeira versão do plugin.

== Screenshots ==

1. Dashboard principal com estatísticas
2. Configurações do plugin
3. Lista de artigos sincronizados
4. Sistema de logs detalhado
5. Análise de links internos
6. Status de indexação dos artigos
