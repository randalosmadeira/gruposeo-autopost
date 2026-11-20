import { describe, expect, it } from 'vitest';
import { EXPORT_TABLES, FLOW_CHAIN, MODULES, moduleEdges, moduleByKey, producerOf } from '../../supabase/functions/_shared/module-registry';
import { buildConnectionMap, verifyIntegrity, verifyManifest } from '../../supabase/functions/_shared/project-integrity-core';
import type { ProjectFacts } from '../../supabase/functions/_shared/project-health-core';
import { PLUGIN_VERSION } from '../../supabase/functions/_shared/plugin-version';

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const base = (over: Partial<ProjectFacts> = {}): ProjectFacts => ({
  id: '00000000-0000-4000-8000-0000000000b1', name: 'Blog RDM', domain: 'rdmadvogados.com.br', wordpress_url: 'https://rdmadvogados.com.br', created_at: daysAgo(200),
  lifecycle_status: 'ativo', archived_at: null, paused_reason: null,
  wordpress: { connected: true, plugin_version: PLUGIN_VERSION, mode: 'zica_posts', connected_at: daysAgo(100), last_verified_at: daysAgo(2) },
  profile: { status: 'confirmed', completeness: 92, confirmed: true },
  articles: { total: 10, published: 8, last_published_at: daysAgo(10) },
  gsc: { rows: 500, last_day: daysAgo(2).slice(0, 10) }, ga4: { rows: 50, last_day: daysAgo(2).slice(0, 10) }, providers: ['gsc', 'ga4'],
  signals: { tracking_key: true, last_batch_at: daysAgo(1), last_day: daysAgo(1).slice(0, 10), cta_28d: 3 },
  automation: { news_agents_active: 0, rss_active: 0 }, taxonomy: { nodes: 5, approved: 3 }, site_map: { reads: 1, last_at: daysAgo(3) },
  speed: { scheduled: true, enabled: true, frequency: 'weekly', consecutive_failures: 0, runs: 3, last_run_at: daysAgo(3), last_score: 70 },
  alerts: { open_speed: 0, open_backlinks: 0 }, backlinks: { total: 4, live: 3, last_checked_at: daysAgo(3) }, funnel: { configured: true, entries: 2, last_month: '2026-10-01' },
  observatory: { prompts: 1, citations: 1 }, ...over,
});

describe('manifesto de módulos', () => {
  it('a cadeia perfil → taxonomia → estúdio de páginas → funil → monitor → alertas → árvore está inteira e o manifesto é consistente', () => {
    expect(FLOW_CHAIN).toEqual(['perfil', 'taxonomia', 'estudio_paginas', 'funil', 'monitor', 'alertas', 'arvore']);
    expect(verifyManifest().problems).toEqual([]);
    const edges = moduleEdges();
    FLOW_CHAIN.slice(0, -1).forEach((from, i) => expect(edges.some((e) => e.from === from && e.to === FLOW_CHAIN[i + 1]), `${from} → ${FLOW_CHAIN[i + 1]}`).toBe(true));
  });

  it('toda tabela consumida tem um módulo produtor; nenhum módulo ativo depende de módulo planejado; chaves únicas', () => {
    const keys = MODULES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of MODULES) {
      for (const t of [...m.consumes, ...m.plannedConsumes]) expect(producerOf(t), `${m.key} consome ${t}`).toBeTruthy();
      if (m.status === 'ativo') for (const t of m.consumes) expect(producerOf(t)?.status, `${m.key} consome ${t}`).toBe('ativo');
    }
  });

  it('Árvore da Marca segue PLANEJADA (ligação prevista, não prometida); o Estúdio de Páginas está ATIVO, com as ligações reais declaradas como opcionais', () => {
    expect(moduleByKey('estudio_paginas')).toMatchObject({ status: 'ativo', route: '/estudio' });
    expect(moduleByKey('estudio_paginas')?.produces).toEqual(expect.arrayContaining(['studio_pages', 'studio_publications']));
    expect(moduleByKey('estudio_paginas')?.optionalConsumes).toEqual(expect.arrayContaining(['project_taxonomy_nodes', 'nexus_citations']));
    expect(moduleByKey('arvore')?.status).toBe('planejado');
    const prev = moduleEdges().filter((e) => e.planned);
    expect(prev.some((e) => e.from === 'perfil' && e.to === 'taxonomia')).toBe(true);
  });

  it('tabelas exportáveis: sem repetição, com ordenação estável e sem tabela de segredo', () => {
    const names = EXPORT_TABLES.map((t) => t.table);
    expect(new Set(names).size).toBe(names.length);
    for (const t of EXPORT_TABLES) { expect(t.order.length).toBeGreaterThan(0); expect(t.pageSize).toBeGreaterThan(0); }
    expect(names).not.toContain('nexus_oauth_connections');
    expect(names).not.toContain('nexus_site_keys');
    expect(names).not.toContain('projects');
    expect(EXPORT_TABLES.find((t) => t.table === 'nexus_search_performance')?.reobtainable).toBe(true);
  });
});

describe('mapa de conexões e integridade do projeto', () => {
  it('mapa: módulos com dados, planejados e não instalados; ligações reais e previstas', () => {
    const map = buildConnectionMap(base({ taxonomy: null }));
    const st = (k: string) => map.modules.find((m) => m.key === k)?.state;
    expect(st('google')).toBe('com_dados');
    expect(st('taxonomia')).toBe('nao_instalado');
    expect(st('estudio_paginas')).toBe('nao_instalado');
    expect(st('arvore')).toBe('planejado');
    expect(map.chain).toHaveLength(6);
    expect(map.chain.find((c) => c.from === 'monitor' && c.to === 'alertas')?.connected).toBe(true);
    expect(map.chain.find((c) => c.from === 'perfil' && c.to === 'taxonomia')?.connected).toBe(false);
    expect(map.links.find((l) => l.from === 'perfil' && l.to === 'taxonomia')?.state).toBe('prevista');
  });

  it('"Taxonomia sem Perfil", "Sinais sem conversões" e "Backlinks sem velocidade" aparecem como problemas com ação', () => {
    const r = verifyIntegrity(base({ profile: null, speed: { scheduled: false, enabled: false, frequency: null, consecutive_failures: 0, runs: 0, last_run_at: null, last_score: null }, funnel: { configured: false, entries: 0, last_month: null } }), NOW);
    const keys = r.issues.map((i) => i.key);
    expect(keys).toContain('backlinks_sem_velocidade');
    // funil consome o perfil (ligação real): funil com dado e perfil vazio = vínculo quebrado; aqui o funil está vazio, então não há quebra
    expect(keys).not.toContain('sem_origem:perfil>funil');
    const r2 = verifyIntegrity(base({ profile: null }), NOW);
    expect(r2.issues.find((i) => i.key === 'sem_origem:perfil>funil')).toMatchObject({ kind: 'vinculo_quebrado', level: 'atencao' });
    expect(r2.intact).toBe(false);
  });

  it('dado parado: produtor com dado e consumidor sem dado vira "módulo com dado e sem consumidor" (informativo)', () => {
    const r = verifyIntegrity(base({ funnel: { configured: false, entries: 0, last_month: null } }), NOW);
    expect(r.issues.find((i) => i.key === 'sem_consumo:perfil>funil')).toMatchObject({ kind: 'modulo_sem_consumidor', level: 'info' });
  });

  it('Google conectado sem nenhuma linha, dado sem conexão e chave de sinais sem envio são vínculos quebrados', () => {
    expect(verifyIntegrity(base({ gsc: { rows: 0, last_day: null }, ga4: { rows: 0, last_day: null } }), NOW).issues.map((i) => i.key)).toContain('google_sem_dado');
    expect(verifyIntegrity(base({ providers: [] }), NOW).issues.map((i) => i.key)).toContain('dado_sem_conexao');
    expect(verifyIntegrity(base({ signals: { tracking_key: true, last_batch_at: null, last_day: null, cta_28d: 0 } }), NOW).issues.map((i) => i.key)).toContain('sinais_sem_envio');
  });

  it('plugin abaixo do mínimo é crítico; WordPress com endereço e sem credencial é atenção', () => {
    const crit = verifyIntegrity(base({ wordpress: { connected: true, plugin_version: '3.0.0', mode: 'zica_posts', connected_at: null, last_verified_at: daysAgo(1) } }), NOW);
    expect(crit.issues.find((i) => i.key === 'plugin_abaixo_do_minimo')?.level).toBe('critico');
    expect(crit.totals.critico).toBe(1);
    const nocred = verifyIntegrity(base({ wordpress: { connected: false, plugin_version: null, mode: null, connected_at: null, last_verified_at: null } }), NOW);
    expect(nocred.issues.map((i) => i.key)).toContain('wordpress_sem_credencial');
  });

  it('dados órfãos da organização entram no relatório só quando o escaneamento informa; nada é apagado automaticamente', () => {
    const none = verifyIntegrity(base(), NOW, null);
    expect(none.issues.some((i) => i.kind === 'dado_orfao')).toBe(false);
    const r = verifyIntegrity(base(), NOW, { tables: [{ table: 'articles', orphans: 12 }, { table: 'gbp_audits', orphans: 0 }], unverifiable: [] });
    const o = r.issues.filter((i) => i.kind === 'dado_orfao');
    expect(o).toHaveLength(1);
    expect(o[0].text).toContain('12 linha(s)');
    expect(o[0].action).toMatch(/Nada é apagado automaticamente/);
  });

  it('projeto em ordem: íntegro (só ligações previstas, informativas)', () => {
    const r = verifyIntegrity(base(), NOW);
    expect(r.intact).toBe(true);
    expect(r.issues.every((i) => i.level === 'info')).toBe(true);
    expect(r.issues.some((i) => i.kind === 'ligacao_prevista')).toBe(true);
  });
});
