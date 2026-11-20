/**
 * Manifesto de módulos do Zica Posts: cada módulo declara as tabelas que PRODUZ e as que CONSOME de outros módulos.
 *
 * Serve a três coisas: (1) o mapa de conexões e o verificador de integridade (project-integrity-core.ts);
 * (2) a exportação por módulo antes da exclusão definitiva (project-lifecycle); (3) um teste que prova que a cadeia
 *     perfil -> taxonomia -> estúdio de páginas -> funil/conversões -> monitor -> alertas -> árvore da marca está inteira.
 *
 * `consumes` = ligação REAL (o código do módulo lê aquela tabela). `plannedConsumes` = ligação prevista que ainda NÃO existe no código:
 * aparece no mapa como "prevista", nunca como se estivesse funcionando. Módulos `planejado` ainda não foram construídos.
 */
import type { ProjectFacts } from './project-health-core.ts';

export type ModuleKey = 'projeto' | 'perfil' | 'google' | 'conteudo' | 'sinais' | 'visao_geral' | 'taxonomia' | 'estudio_paginas' | 'funil' | 'monitor' | 'alertas' | 'observatorio' | 'arvore' | 'indexacao' | 'radar';

export interface ExportTable {
  table: string;
  /** Colunas de ordenação estável para paginar (a última deve desempatar). */
  order: string[];
  pageSize: number;
  /** Dado que dá para baixar de novo do Google: o pacote avisa se ficou incompleto, mas não é perda definitiva. */
  reobtainable?: boolean;
}

/** Ação de um módulo no portão `engine`: papel mínimo (igual ao que o handler já exige) e se pode gerar custo. */
export interface EngineActionSpec { minRole: 'member' | 'editor' | 'admin' | 'owner'; paid?: boolean }
/**
 * Como um módulo aparece no portão único (`engine`): nome usado em { module }, adaptador ligado em engine-router.ts (`handler`), onde o papel é resolvido,
 * custo declarado ('none' = nunca passa pelo teto de gasto), ações com papel mínimo e as tabelas que produz e consome (informativo; o mapa de conexões
 * usa produces/consumes do módulo). Um módulo pode ter mais de um (ex.: Monitor = velocidade + backlinks).
 */
export interface EngineSpec {
  name: string;
  handler: string;
  scope: 'project' | 'organization';
  roleSource: 'members' | 'members+owner';
  cost: 'none' | 'paid';
  actions: Record<string, EngineActionSpec>;
  produces?: string[];
  consumes?: string[];
}

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  route: string | null;
  status: 'ativo' | 'planejado';
  produces: string[];
  consumes: string[];
  plannedConsumes: string[];
  /** Ligação REAL, mas dispensável: o módulo funciona sem essa origem (ex.: a Indexação lê a taxonomia se existir). Sem dado na origem não é "vínculo quebrado". */
  optionalConsumes?: string[];
  /** Entradas no portão `engine` (opcional: módulo ainda não migrado para o portão continua só com a função de borda própria). */
  engine?: EngineSpec[];
  /** true/false = tem dado neste projeto; null = a tabela do módulo não existe no banco (módulo não instalado). */
  hasData: (f: ProjectFacts) => boolean | null;
  dataText: (f: ProjectFacts) => string;
  exportTables: ExportTable[];
}

const n = (v: number) => v.toLocaleString('pt-BR');

export const MODULES: ModuleDef[] = [
  {
    key: 'projeto', label: 'Projeto e site', route: '/projects', status: 'ativo',
    produces: ['projects'], consumes: [], plannedConsumes: [],
    engine: [
      { name: 'central', handler: 'lifecycle', scope: 'project', roleSource: 'members', cost: 'none', consumes: ['projects'],
        actions: { health_overview: { minRole: 'member' }, health_detail: { minRole: 'member' }, integrity_report: { minRole: 'member' }, pause: { minRole: 'editor' }, resume: { minRole: 'editor' }, archive: { minRole: 'editor' }, restore: { minRole: 'editor' }, delete_plan: { minRole: 'admin' }, export: { minRole: 'admin' }, purge: { minRole: 'admin' } } },
      { name: 'teto_gasto', handler: 'spend-policy', scope: 'organization', roleSource: 'members+owner', cost: 'none',
        actions: { status: { minRole: 'member' }, history: { minRole: 'member' }, update_policy: { minRole: 'owner' }, unlock_extra: { minRole: 'admin' } } },
      { name: 'eventos', handler: 'events', scope: 'project', roleSource: 'members', cost: 'none', consumes: ['project_events'], actions: { list: { minRole: 'member' } } },
    ],
    hasData: (f) => !!(f.domain || f.wordpress.connected), dataText: (f) => (f.domain ? `domínio ${f.domain}` : f.wordpress.connected ? 'WordPress conectado' : 'sem domínio'),
    exportTables: [],
  },
  {
    key: 'perfil', label: 'Perfil do Projeto', route: '/business-profile', status: 'ativo',
    produces: ['project_profile_extended', 'project_profile_facts', 'project_profile_snapshots', 'project_modules'], consumes: ['projects'], plannedConsumes: [],
    hasData: (f) => (f.profile === null ? false : f.profile.confirmed === true || f.profile.status === 'complete' || (f.profile.completeness ?? 0) > 0),
    dataText: (f) => (f.profile ? `perfil ${f.profile.completeness ?? 0}% completo` : 'não preenchido'),
    exportTables: [
      { table: 'project_profile_extended', order: ['project_id'], pageSize: 50 },
      { table: 'project_profile_facts', order: ['observed_at', 'id'], pageSize: 500 },
      { table: 'project_profile_snapshots', order: ['created_at', 'id'], pageSize: 100 },
      { table: 'project_modules', order: ['project_id', 'module_code'], pageSize: 200 },
    ],
  },
  {
    key: 'google', label: 'Google (Search Console e GA4)', route: '/nexus/motores', status: 'ativo',
    produces: ['nexus_oauth_connections', 'nexus_search_performance', 'nexus_analytics_daily'], consumes: ['projects'], plannedConsumes: [],
    hasData: (f) => f.providers.length > 0 || f.gsc.rows > 0 || f.ga4.rows > 0,
    dataText: (f) => `${n(f.gsc.rows)} linhas do Search Console, ${n(f.ga4.rows)} do GA4`,
    exportTables: [
      { table: 'nexus_search_performance', order: ['id'], pageSize: 2000, reobtainable: true },
      { table: 'nexus_analytics_daily', order: ['id'], pageSize: 2000, reobtainable: true },
    ],
  },
  {
    key: 'conteudo', label: 'Artigos e WordPress', route: '/articles', status: 'ativo',
    produces: ['articles'], consumes: ['projects'], plannedConsumes: ['project_profile_extended'],
    hasData: (f) => f.articles.total > 0, dataText: (f) => `${n(f.articles.total)} artigos, ${n(f.articles.published)} publicados`,
    exportTables: [{ table: 'articles', order: ['created_at', 'id'], pageSize: 100 }],
  },
  {
    key: 'sinais', label: 'Sinais do site (script)', route: '/estrutura', status: 'ativo',
    produces: ['nexus_site_keys', 'nexus_site_signals'], consumes: ['projects'], plannedConsumes: [],
    hasData: (f) => f.signals.tracking_key || f.signals.last_day !== null, dataText: (f) => (f.signals.tracking_key ? `chave ativa, ${n(f.signals.cta_28d)} cliques de contato em 28 dias` : 'sem chave'),
    exportTables: [{ table: 'nexus_site_signals', order: ['id'], pageSize: 2000 }],
  },
  {
    key: 'visao_geral', label: 'Visão geral e estrutura do domínio', route: '/estrutura', status: 'ativo',
    produces: ['project_site_maps'], consumes: ['nexus_search_performance', 'nexus_analytics_daily', 'nexus_site_signals', 'articles'], plannedConsumes: [],
    engine: [{ name: 'visao_geral', handler: 'overview', scope: 'project', roleSource: 'members', cost: 'none', produces: ['project_site_maps'], consumes: ['nexus_search_performance', 'nexus_analytics_daily', 'nexus_site_signals', 'articles'],
      actions: { overview: { minRole: 'member' }, refresh_structure: { minRole: 'editor' } } }],
    hasData: (f) => (f.site_map === null ? null : f.site_map.reads > 0), dataText: (f) => (f.site_map ? `${n(f.site_map.reads)} leituras do mapa` : 'não instalado'),
    exportTables: [{ table: 'project_site_maps', order: ['fetched_at', 'id'], pageSize: 50 }],
  },
  {
    key: 'taxonomia', label: 'Taxonomia e mercado', route: '/taxonomia', status: 'ativo',
    produces: ['project_taxonomy_nodes', 'project_taxonomy_edges', 'project_geo_scope', 'market_campaigns', 'market_queries', 'market_serp_results', 'market_competitors'],
    consumes: ['project_site_maps', 'nexus_search_performance'], plannedConsumes: ['project_profile_extended'],
    engine: [
      { name: 'taxonomia', handler: 'taxonomy', scope: 'project', roleSource: 'members', cost: 'none', produces: ['project_taxonomy_nodes', 'project_taxonomy_edges', 'project_geo_scope'], consumes: ['project_site_maps', 'nexus_search_performance'],
        actions: { overview: { minRole: 'member' }, geo_overview: { minRole: 'member' }, suggest: { minRole: 'editor' }, pack_load: { minRole: 'editor' }, review: { minRole: 'editor' }, tail_import: { minRole: 'editor' }, tail_generate: { minRole: 'editor' }, geo_sync: { minRole: 'editor' }, geo_districts: { minRole: 'editor' }, scope_save: { minRole: 'editor' } } },
      // mercado: mesmo adaptador da taxonomia (o handler de taxonomia despacha para o de mercado); campaign_execute é o único ponto que pode gerar custo
      { name: 'mercado', handler: 'taxonomy', scope: 'project', roleSource: 'members', cost: 'none', produces: ['market_campaigns', 'market_queries', 'market_serp_results', 'market_competitors'], consumes: ['project_taxonomy_nodes', 'project_geo_scope'],
        actions: { competitors_list: { minRole: 'member' }, campaign_plan: { minRole: 'editor' }, campaign_approve: { minRole: 'editor' }, campaign_cancel: { minRole: 'editor' }, campaign_execute: { minRole: 'editor', paid: true }, campaign_results_import: { minRole: 'editor' } } },
    ],
    hasData: (f) => (f.taxonomy === null ? null : f.taxonomy.nodes > 0), dataText: (f) => (f.taxonomy ? `${n(f.taxonomy.nodes)} nós, ${n(f.taxonomy.approved)} aprovados` : 'não instalado'),
    exportTables: [
      { table: 'project_taxonomy_nodes', order: ['created_at', 'id'], pageSize: 500 },
      { table: 'project_taxonomy_edges', order: ['created_at', 'id'], pageSize: 500 },
      { table: 'project_geo_scope', order: ['created_at', 'id'], pageSize: 500 },
      { table: 'market_campaigns', order: ['created_at', 'id'], pageSize: 200 },
      { table: 'market_queries', order: ['id'], pageSize: 500 },
      { table: 'market_serp_results', order: ['fetched_at', 'id'], pageSize: 500 },
      { table: 'market_competitors', order: ['id'], pageSize: 500 },
    ],
  },
  {
    key: 'estudio_paginas', label: 'Estúdio de Páginas', route: '/estudio', status: 'ativo',
    produces: ['studio_pages', 'studio_page_versions', 'studio_page_links', 'studio_page_assets', 'studio_publications'], consumes: [], plannedConsumes: [],
    // ligações REAIS, mas dispensáveis: o Estúdio lê cada tabela só se ela existir (to_regclass) e funciona só com o Perfil. O Radar de Mercado (outro módulo) é lido por contrato.
    optionalConsumes: ['project_taxonomy_nodes', 'project_geo_scope', 'market_serp_results', 'market_competitors', 'nexus_citations', 'project_profile_extended', 'nexus_search_performance'],
    engine: [{
      name: 'estudio', handler: 'estudio', scope: 'project', roleSource: 'members', cost: 'none',
      produces: ['studio_pages', 'studio_page_versions', 'studio_page_links', 'studio_page_assets', 'studio_publications', 'project_events', 'index_urls'],
      consumes: ['project_taxonomy_nodes', 'project_geo_scope', 'market_serp_results', 'nexus_citations', 'project_profile_extended'],
      actions: {
        list: { minRole: 'member' }, detail: { minRole: 'member' },
        brief: { minRole: 'editor' }, generate: { minRole: 'editor', paid: true }, revise: { minRole: 'editor' }, check: { minRole: 'editor' }, plan_links: { minRole: 'editor' },
        images: { minRole: 'editor', paid: true }, approve: { minRole: 'editor' }, publish: { minRole: 'editor' }, unpublish: { minRole: 'editor' },
      },
    }],
    hasData: (f) => (f.studio == null ? null : f.studio.pages > 0), dataText: (f) => (f.studio ? `${n(f.studio.pages)} páginas, ${n(f.studio.published)} publicadas` : 'não instalado'),
    exportTables: [
      { table: 'studio_pages', order: ['created_at', 'id'], pageSize: 100 },
      { table: 'studio_page_versions', order: ['created_at', 'page_id', 'version'], pageSize: 200 },
      { table: 'studio_page_links', order: ['created_at', 'id'], pageSize: 500 },
      { table: 'studio_page_assets', order: ['created_at', 'id'], pageSize: 500 },
      { table: 'studio_publications', order: ['created_at', 'id'], pageSize: 500 },
    ],
  },
  {
    key: 'funil', label: 'Funil e conversões', route: '/funil', status: 'ativo',
    produces: ['project_funnels', 'project_funnel_entries'], consumes: ['project_profile_extended', 'nexus_site_signals'], plannedConsumes: ['studio_pages'],
    hasData: (f) => (f.funnel === null ? null : f.funnel.configured || f.funnel.entries > 0), dataText: (f) => (f.funnel ? `${n(f.funnel.entries)} números lançados` : 'não instalado'),
    exportTables: [
      { table: 'project_funnels', order: ['project_id'], pageSize: 50 },
      { table: 'project_funnel_entries', order: ['month', 'metric_key'], pageSize: 1000 },
    ],
  },
  {
    key: 'monitor', label: 'Monitor (velocidade e backlinks)', route: '/velocidade', status: 'ativo',
    produces: ['project_speed_schedules', 'project_speed_runs', 'project_backlinks', 'project_backlink_settings'], consumes: ['projects'], plannedConsumes: ['project_funnel_entries'],
    engine: [
      { name: 'velocidade', handler: 'speed', scope: 'project', roleSource: 'members', cost: 'none', produces: ['project_speed_schedules', 'project_speed_runs'], consumes: ['projects'],
        actions: { history: { minRole: 'member' }, run: { minRole: 'editor' }, schedule_save: { minRole: 'editor' }, alerts_dismiss: { minRole: 'editor' } } },
      { name: 'backlinks', handler: 'backlinks', scope: 'project', roleSource: 'members', cost: 'none', produces: ['project_backlinks', 'project_backlink_settings'], consumes: ['projects'],
        actions: { get: { minRole: 'member' }, import: { minRole: 'editor' }, verify: { minRole: 'editor' }, remove: { minRole: 'editor' }, settings_save: { minRole: 'editor' }, alerts_dismiss: { minRole: 'editor' } } },
    ],
    hasData: (f) => (f.speed === null && f.backlinks === null ? null : (f.speed?.runs || 0) > 0 || (f.speed?.scheduled ?? false) || (f.backlinks?.total || 0) > 0),
    dataText: (f) => `${n(f.speed?.runs || 0)} medições, ${n(f.backlinks?.total || 0)} backlinks`,
    exportTables: [
      { table: 'project_speed_runs', order: ['fetched_at', 'id'], pageSize: 500 },
      { table: 'project_backlinks', order: ['first_seen_at', 'id'], pageSize: 1000 },
      { table: 'project_speed_schedules', order: ['project_id'], pageSize: 50 },
      { table: 'project_backlink_settings', order: ['project_id'], pageSize: 50 },
    ],
  },
  {
    key: 'alertas', label: 'Alertas', route: '/velocidade', status: 'ativo',
    produces: ['project_alerts'], consumes: ['project_speed_runs', 'project_backlinks'], plannedConsumes: [],
    hasData: (f) => (f.alerts === null ? null : f.alerts.open_speed + f.alerts.open_backlinks > 0), dataText: (f) => (f.alerts ? `${n(f.alerts.open_speed + f.alerts.open_backlinks)} avisos abertos` : 'não instalado'),
    exportTables: [{ table: 'project_alerts', order: ['created_at', 'id'], pageSize: 500 }],
  },
  {
    key: 'observatorio', label: 'Observatório de IA', route: '/nexus/observatorio', status: 'ativo',
    produces: ['nexus_prompt_sets', 'nexus_prompts', 'nexus_citations'], consumes: ['projects'], plannedConsumes: ['project_profile_extended'],
    hasData: (f) => (f.observatory === null ? null : f.observatory.prompts > 0 || f.observatory.citations > 0), dataText: (f) => (f.observatory ? `${n(f.observatory.prompts)} perguntas, ${n(f.observatory.citations)} citações` : 'não instalado'),
    exportTables: [
      { table: 'nexus_prompt_sets', order: ['created_at', 'id'], pageSize: 200 },
      { table: 'nexus_prompts', order: ['id'], pageSize: 500 },
      { table: 'nexus_citations', order: ['id'], pageSize: 1000 },
    ],
  },
  {
    key: 'arvore', label: 'Árvore da Marca', route: null, status: 'planejado',
    produces: ['project_brand_tree'], consumes: [], plannedConsumes: ['project_taxonomy_nodes', 'project_funnel_entries', 'project_alerts', 'project_profile_extended'],
    hasData: () => false, dataText: () => 'ainda não construído', exportTables: [],
  },
  {
    key: 'indexacao', label: 'Indexação', route: '/indexacao', status: 'ativo',
    produces: ['index_urls', 'index_status', 'index_submissions', 'index_hygiene', 'index_keys', 'project_events'],
    consumes: [], plannedConsumes: [],
    // ligações REAIS (o código lê cada tabela), mas dispensáveis: sem taxonomia, Google ou artigos a indexação funciona só com os sitemaps
    optionalConsumes: ['project_taxonomy_nodes', 'nexus_search_performance', 'articles', 'project_site_maps'],
    engine: [{
      name: 'indexacao', handler: 'indexacao', scope: 'project', roleSource: 'members', cost: 'none',
      produces: ['index_urls', 'index_status', 'index_submissions', 'index_hygiene', 'index_keys', 'project_events'], consumes: ['project_taxonomy_nodes', 'nexus_search_performance', 'articles', 'project_site_maps'],
      actions: {
        overview: { minRole: 'member' }, list: { minRole: 'member' }, plan: { minRole: 'member' },
        inventory_sync: { minRole: 'editor' }, check_urls: { minRole: 'editor' }, google_inspect: { minRole: 'editor' }, submit_indexnow: { minRole: 'editor' }, bing_submit: { minRole: 'editor' }, hygiene: { minRole: 'editor' },
        indexnow_key_save: { minRole: 'admin' },
      },
    }],
    hasData: (f) => (f.indexation == null ? null : f.indexation.urls > 0),
    dataText: (f) => (f.indexation ? `${n(f.indexation.urls)} URLs, ${n(f.indexation.indexed)} indexadas` : 'não instalado'),
    exportTables: [
      { table: 'index_urls', order: ['first_seen', 'id'], pageSize: 1000 },
      { table: 'index_status', order: ['checked_at', 'id'], pageSize: 2000, reobtainable: true },
      { table: 'index_submissions', order: ['created_at', 'id'], pageSize: 500 },
      { table: 'index_hygiene', order: ['project_id', 'check_key'], pageSize: 200 },
      { table: 'project_events', order: ['created_at', 'id'], pageSize: 1000 },
    ],
  },
  {
    key: 'radar', label: 'Radar de mercado', route: '/radar', status: 'ativo',
    produces: ['project_focuses', 'project_focus_places', 'geo_places', 'geo_place_members', 'radar_competitors', 'radar_identities', 'radar_identity_metrics', 'radar_pages', 'radar_map_listings', 'radar_site_scans', 'radar_links', 'radar_coverage', 'radar_runs', 'radar_scores', 'radar_schedules'],
    consumes: [], plannedConsumes: [],
    // ligações REAIS (o código lê cada tabela), mas dispensáveis: sem taxonomia, Search Console ou Observatório o radar funciona com os focos e as buscas
    optionalConsumes: ['project_taxonomy_nodes', 'nexus_search_performance', 'nexus_citations', 'nexus_prompts', 'ibge_municipios'],
    engine: [{
      name: 'radar', handler: 'radar', scope: 'project', roleSource: 'members', cost: 'none',
      produces: ['project_focuses', 'project_focus_places', 'geo_places', 'radar_competitors', 'radar_identities', 'radar_pages', 'radar_map_listings', 'radar_links', 'radar_coverage', 'radar_runs', 'radar_scores', 'radar_schedules', 'project_events'],
      consumes: ['project_taxonomy_nodes', 'nexus_search_performance', 'nexus_citations', 'nexus_prompts', 'ibge_municipios'],
      actions: {
        overview: { minRole: 'member' }, territory: { minRole: 'member' }, plan: { minRole: 'member' }, coverage: { minRole: 'member' }, competitors_list: { minRole: 'member' }, competitor_detail: { minRole: 'member' },
        scoreboard: { minRole: 'member' }, attack_list: { minRole: 'member' }, landscape: { minRole: 'member' }, tree_overlap: { minRole: 'member' }, orphans: { minRole: 'member' },
        focus_from_text: { minRole: 'editor' }, focus_save: { minRole: 'editor' }, territory_resolve: { minRole: 'editor' }, territory_decide: { minRole: 'editor' },
        run_batch: { minRole: 'editor', paid: true }, backlinks_fetch: { minRole: 'editor', paid: true }, enrich_run: { minRole: 'editor' }, youtube_discover: { minRole: 'editor' },
        competitor_save: { minRole: 'editor' }, competitor_merge: { minRole: 'editor' }, competitor_link: { minRole: 'editor' }, orphan_fix: { minRole: 'editor' }, schedule_save: { minRole: 'editor' }, scores_snapshot: { minRole: 'editor' },
        territory_sync: { minRole: 'admin' },
      },
    }],
    hasData: (f) => (f.radar == null ? null : f.radar.focuses > 0),
    dataText: (f) => (f.radar ? `${n(f.radar.focuses)} focos, ${n(f.radar.competitors)} concorrentes` : 'não instalado'),
    exportTables: [
      { table: 'project_focuses', order: ['created_at', 'id'], pageSize: 200 },
      { table: 'project_focus_places', order: ['created_at', 'id'], pageSize: 500 },
      { table: 'radar_competitors', order: ['first_seen', 'id'], pageSize: 500 },
      { table: 'radar_identities', order: ['first_seen', 'id'], pageSize: 500 },
      { table: 'radar_identity_metrics', order: ['observed_at', 'id'], pageSize: 1000 },
      { table: 'radar_pages', order: ['seen_at', 'id'], pageSize: 1000 },
      { table: 'radar_map_listings', order: ['seen_at', 'id'], pageSize: 500 },
      { table: 'radar_site_scans', order: ['scanned_at', 'id'], pageSize: 100 },
      { table: 'radar_links', order: ['created_at', 'id'], pageSize: 1000 },
      { table: 'radar_coverage', order: ['created_at', 'id'], pageSize: 1000, reobtainable: true },
      { table: 'radar_runs', order: ['started_at', 'id'], pageSize: 500 },
      { table: 'radar_scores', order: ['week', 'id'], pageSize: 1000 },
      { table: 'radar_schedules', order: ['created_at', 'id'], pageSize: 200 },
    ],
  },
];

/** Ordem de comunicação combinada com o dono: cada módulo alimenta o seguinte. */
export const FLOW_CHAIN: ModuleKey[] = ['perfil', 'taxonomia', 'estudio_paginas', 'funil', 'monitor', 'alertas', 'arvore'];

export const moduleByKey = (key: string): ModuleDef | undefined => MODULES.find((m) => m.key === key);
/** Módulo que produz a tabela (o primeiro que a declara). */
export const producerOf = (table: string): ModuleDef | undefined => MODULES.find((m) => m.produces.includes(table));

export interface ModuleEdge { from: ModuleKey; to: ModuleKey; table: string; planned: boolean; optional?: boolean }
/** Entradas do portão `engine` de todos os módulos, na ordem do manifesto. */
export const ENGINE_SPECS: Array<EngineSpec & { moduleKey: ModuleKey }> = MODULES.flatMap((m) => (m.engine || []).map((e) => ({ ...e, moduleKey: m.key })));
export const engineSpec = (name: string): (EngineSpec & { moduleKey: ModuleKey }) | undefined => ENGINE_SPECS.find((e) => e.name === name);

/** Todas as ligações declaradas (reais e previstas) entre módulos, derivadas de produces/consumes. */
export function moduleEdges(): ModuleEdge[] {
  const out: ModuleEdge[] = [];
  for (const m of MODULES) {
    for (const [tables, planned, optional] of [[m.consumes, false, false], [m.optionalConsumes || [], false, true], [m.plannedConsumes, true, false]] as const) {
      for (const t of tables) {
        const p = producerOf(t);
        if (p && p.key !== m.key) out.push(optional ? { from: p.key, to: m.key, table: t, planned, optional } : { from: p.key, to: m.key, table: t, planned });
      }
    }
  }
  return out;
}

/** Tabelas exportáveis de todos os módulos, na ordem do manifesto. */
export const EXPORT_TABLES: Array<ExportTable & { module: ModuleKey }> = MODULES.flatMap((m) => m.exportTables.map((t) => ({ ...t, module: m.key })));
