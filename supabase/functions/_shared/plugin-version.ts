/**
 * Versão centralizada do Plugin ContentFactory RDM.
 * 
 * TODAS as edge functions, agentes e prompts devem importar daqui.
 * Ao atualizar o plugin, basta alterar ESTE arquivo.
 */

export const PLUGIN_VERSION = "3.5.0";
export const PLUGIN_MINIMUM_VERSION = "3.0.0";
export const PLUGIN_RELEASED = "2026-02-19";

export const PLUGIN_FEATURES = [
  "auto_notifications",
  "portal_monitoring",
  "originality_score",
  "ajax_table_repair",
  "meta_auditor",
  "indexnow",
  "llms_txt",
  "post_duplicator",
  "sitemap_optimizer",
  "news_sitemap",
  "ai_og_twitter",
  "realtime_module_integration",
  "safe_auto_update",
  "pre_update_checks",
  "verniz_dna_v3",
  "rest_indexnow_batch",
  "rest_meta_audit",
  "ai_traffic_detector",
  "seo_checklist",
  "method_validator",
  "cron_auto_schedule",
  "ai_source_rules",
  "google_indexing_submitter",
  "gmb_auto_poster",
  "gsc_dynamic_sitemap",
  "auto_fix_ai_crawlers",
  "batch_faq_schema_injection",
  "autonomous_seo_fix",
  "scan_seo_issues",
  "autonomous_content_edit",
  "manage_redirect",
  "llms_txt_force_enable",
  "orphan_auto_backlink",
  "sitemap_cross_domain_filter",
  "redirect_manager",
  "duplicate_cleanup",
  "geo_schema_injection",
  "ai_seo_generator",
  "llms_txt_physical_fallback",
  "422_auto_recovery",
  "indexnow_rate_limit",
  "anti_hallucination_v2",
  "full_ai_sync",
  "safe_action_parsing",
  "action_block_auto_execute",
  "site_crawler",
  "full_site_crawl",
  "real_broken_link_check",
  "redirect_chain_detector",
  "duplicate_content_scanner",
  "site_structure_analyzer",
  "image_audit",
  "directive_audit",
] as const;

/**
 * Bloco de texto para injetar em system prompts dos agentes.
 * Sempre reflete a versão atual do plugin.
 */
export const PLUGIN_PROMPT_BLOCK = `### 🔌 Plugin WordPress (ContentFactory RDM v${PLUGIN_VERSION})
Módulos disponíveis no plugin instalado nos sites:
- **AI Meta Auditor**: Audita e corrige automaticamente titles, meta descriptions, OG tags e Twitter Cards a cada 6h
- **AI Auto-Fix**: Detecta e repara automaticamente:
  • Links quebrados (erros 404) com redirecionamentos inteligentes 301/302
  • FAQs duplicadas entre artigos
  • URLs ou artigos em duplicidade
  • Metas idênticas entre posts
  • Bloqueios de crawlers de IA no robots.txt (GPTBot, ClaudeBot, PerplexityBot, etc.)
  • Injeção batch de FAQ Schema (FAQPage JSON-LD) em artigos sem structured data
- **Agente SEO Autônomo (v${PLUGIN_VERSION})**:
  • scan-seo-issues: detecta canonical faltando, URLs HTTP, H1 ausente, títulos duplicados, meta descriptions vazias
  • autonomous-seo-fix: aplica correções batch (canonical, title, slug, HTTPS, delete, noindex, FAQ schema)
  • autonomous-content-edit: modifica título WP, H1, H2, hero, insere imagens e força HTTPS no conteúdo
  • manage-redirect: cria/exclui redirects 301/302 via Rank Math ou .htaccess
  • orphan-auto-backlink: detecta artigos órfãos e insere backlinks internos via IA
- **Redirect Manager (v${PLUGIN_VERSION})**:
  • Gerenciamento completo de redirects 301/302 com tabela dedicada
  • Limpeza automática de URLs duplicadas (sufixos -2, -3, etc.)
  • Batch cleanup de lixo técnico (hello-world, parâmetros, arquivos de sistema)
  • API REST para criação, listagem e exclusão de redirects
- **AI SEO Generator**: Gera slugs, meta descriptions, focus keywords, tags e títulos virais via IA
- **GEO Schema Injection**: Injeção automática de LocalBusiness/Attorney/HealthAndBeautyBusiness JSON-LD
- **llms.txt Force-Enable**: Força ativação e regeneração imediata de llms.txt e llms-full.txt na raiz do site, com escrita de arquivo físico como fallback para CDN/cache
- **Internal Links Engine**: Insere links internos e backlinks automaticamente baseado em regras de keywords e relevância semântica entre artigos
- **IndexNow Integration**: Notifica Google, Bing e Yandex sobre alterações em tempo real
- **Google Indexing API**: Submissão direta de URLs (200/dia) via Service Account
- **Google Meu Negócio Auto-Poster**: Publica automaticamente no GMB com limpeza de page builders
- **GSC Integration**: Inspeção expandida de posts, pages e products com sitemap dinâmico
- **Sitemap Optimizer**: Gera e otimiza sitemaps XML com prioridades automáticas e News Sitemap
- **Schema Validator**: Valida JSON-LD para Article, FAQ, HowTo, Product e Review
- **Image Optimizer**: Converte imagens para WebP com compressão inteligente
- **HTTPS Enforcer**: Garante que todos os recursos internos usem HTTPS
- **Post Duplicator**: Clona posts/páginas individualmente ou em lote
- **AI Source Rules**: Detecção automática de tráfego de IA via User-Agent (16+ bots)
- **SEO Checklist**: Checklist visual de Fundação SEO com 15 verificações automáticas
- **Structured Logs**: Sistema de logs para diagnóstico em tempo real
- **Diagnóstico**: Painel com status de 10 tabelas e 13 cron jobs + reparo automático`;
