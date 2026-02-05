=== ContentFactory RDM ===
Contributors: contentfactoryrdm
Tags: content, seo, articles, automation, ai
Requires at least: 5.8
Tested up to: 6.4
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Integração completa com a plataforma ContentFactory RDM para gestão de artigos SEO, publicação automática e sincronização bidirecional.

== Description ==

O **ContentFactory RDM** é um plugin WordPress que conecta seu site à plataforma ContentFactory RDM, permitindo:

* **Publicação Automática**: Artigos criados na plataforma são publicados automaticamente no seu WordPress
* **Sincronização Bidirecional**: Alterações no WordPress são refletidas na plataforma e vice-versa
* **Gestão de Categorias e Tags**: Organize seus artigos automaticamente
* **Suporte a SEO**: Integração com Yoast SEO e Rank Math
* **Webhooks**: Notificações em tempo real sobre alterações
* **API Completa**: REST API para integrações personalizadas

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

== Changelog ==

= 1.0.0 =
* Lançamento inicial
* Sistema de API Key para autenticação segura
* REST API completa para artigos, categorias e tags
* Webhooks para sincronização em tempo real
* Painel administrativo com estatísticas
* Suporte a Yoast SEO e Rank Math
* Upload de mídia via API
* Logs de atividade

== Upgrade Notice ==

= 1.0.0 =
Primeira versão do plugin.
