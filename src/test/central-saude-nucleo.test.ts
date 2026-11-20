import { describe, expect, it } from 'vitest';
import {
  assessOrganization, assessProject, buildItems, compareVersions, normalizeDomain, normalizeFacts, normalizeName, scoreItems, type ProjectFacts,
} from '../../supabase/functions/_shared/project-health-core';
import { PLUGIN_MINIMUM_VERSION, PLUGIN_VERSION } from '../../supabase/functions/_shared/plugin-version';

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const dayOnly = (n: number) => daysAgo(n).slice(0, 10);

/** Projeto saudável por padrão; cada teste altera só o que importa. */
const facts = (over: Partial<ProjectFacts> = {}): ProjectFacts => ({
  id: '00000000-0000-4000-8000-0000000000b1', name: 'Blog RDM', domain: 'rdmadvogados.com.br', wordpress_url: 'https://rdmadvogados.com.br', created_at: daysAgo(200),
  lifecycle_status: 'ativo', archived_at: null, paused_reason: null,
  wordpress: { connected: true, plugin_version: PLUGIN_VERSION, mode: 'zica_posts', connected_at: daysAgo(100), last_verified_at: daysAgo(2) },
  profile: { status: 'confirmed', completeness: 92, confirmed: true },
  articles: { total: 2312, published: 2218, last_published_at: daysAgo(10) },
  gsc: { rows: 48672, last_day: dayOnly(2) }, ga4: { rows: 900, last_day: dayOnly(2) }, providers: ['gsc', 'ga4', 'bing'],
  signals: { tracking_key: true, last_batch_at: daysAgo(1), last_day: dayOnly(1), cta_28d: 12 },
  automation: { news_agents_active: 0, rss_active: 0 },
  taxonomy: { nodes: 40, approved: 30 }, site_map: { reads: 3, last_at: daysAgo(5) },
  speed: { scheduled: true, enabled: true, frequency: 'weekly', consecutive_failures: 0, runs: 20, last_run_at: daysAgo(3), last_score: 71 },
  alerts: { open_speed: 0, open_backlinks: 0 }, backlinks: { total: 120, live: 90, last_checked_at: daysAgo(4) }, funnel: { configured: true, entries: 8, last_month: dayOnly(20) },
  observatory: { prompts: 10, citations: 4 },
  ...over,
});
const assess = (f: ProjectFacts, all: ProjectFacts[] = [f]) => assessProject(f, all, NOW);

describe('saúde do projeto: estados e nota', () => {
  it('projeto saudável: nota alta, estado Saudável, todos os itens com fonte', () => {
    const h = assess(facts());
    expect(h.state).toBe('saudavel');
    expect(h.state_label).toBe('Saudável');
    expect(h.score).toBeGreaterThanOrEqual(80);
    expect(h.items.length).toBeGreaterThan(10);
    for (const i of h.items) expect(i.source.length).toBeGreaterThan(2);
    expect(h.items.find((i) => i.key === 'publicacao')?.date).toBeTruthy();
    expect(h.suggestions).toEqual([]);
  });

  it('só WordPress (sem Google, sem sinais, perfil vazio): Atenção, com ação recomendada em português e leitura do Google "sem dados"', () => {
    const f = facts({ providers: [], gsc: { rows: 0, last_day: null }, ga4: { rows: 0, last_day: null }, signals: { tracking_key: false, last_batch_at: null, last_day: null, cta_28d: 0 }, articles: { total: 0, published: 0, last_published_at: null }, profile: null, taxonomy: { nodes: 0, approved: 0 }, speed: { scheduled: false, enabled: false, frequency: null, consecutive_failures: 0, runs: 0, last_run_at: null, last_score: null }, backlinks: { total: 0, live: 0, last_checked_at: null }, funnel: { configured: false, entries: 0, last_month: null }, observatory: { prompts: 0, citations: 0 }, site_map: { reads: 0, last_at: null }, created_at: daysAgo(5) });
    const h = assess(f);
    expect(h.state).toBe('atencao');
    const google = h.items.find((i) => i.key === 'google')!;
    expect(google.status).toBe('atencao');
    expect(google.action).toMatch(/Conecte o Google/);
    expect(h.items.find((i) => i.key === 'leitura_google')?.status).toBe('sem_dados');
    expect(h.items.find((i) => i.key === 'publicacao')?.detail).toBe('O projeto não tem artigos.');
    expect(h.suggestions.map((s) => s.key)).not.toContain('sem_conexao'); // tem WordPress
  });

  it('sem Google e sem WordPress: sugere "sem conexão"; sem domínio: sugere cadastrar', () => {
    const h = assess(facts({ domain: null, wordpress_url: null, providers: [], wordpress: { connected: false, plugin_version: null, mode: null, connected_at: null, last_verified_at: null }, gsc: { rows: 0, last_day: null }, ga4: { rows: 0, last_day: null } }));
    expect(h.suggestions.map((s) => s.key)).toEqual(expect.arrayContaining(['sem_conexao', 'sem_dominio']));
    expect(h.suggestions.find((s) => s.key === 'sem_dominio')?.kind).toBe('configurar');
  });

  it('inativo há 90 dias: estado Inativo e sugestão forte de arquivar (nada é arquivado sozinho)', () => {
    const f = facts({ articles: { total: 1592, published: 1500, last_published_at: daysAgo(95) }, gsc: { rows: 100, last_day: dayOnly(95) }, ga4: { rows: 0, last_day: null }, signals: { tracking_key: false, last_batch_at: null, last_day: null, cta_28d: 0 }, speed: null, site_map: null, backlinks: null, funnel: null, providers: [] });
    const h = assess(f);
    expect(h.state).toBe('inativo');
    expect(h.days_inactive).toBe(95);
    expect(h.reason).toMatch(/Sem atividade há 95 dias/);
    const s = h.suggestions.find((x) => x.key === 'inativo_90')!;
    expect(s.kind).toBe('arquivar');
  });

  it('inativo há 60 dias: sugestão mais leve (retomar ou arquivar)', () => {
    const f = facts({ articles: { total: 5, published: 5, last_published_at: daysAgo(65) }, gsc: { rows: 10, last_day: dayOnly(64) }, ga4: { rows: 0, last_day: null }, signals: { tracking_key: false, last_batch_at: null, last_day: null, cta_28d: 0 }, speed: null, site_map: null, backlinks: null, funnel: null });
    const h = assess(f);
    expect(h.state).toBe('inativo');
    expect(h.suggestions.map((s) => s.key)).toContain('inativo_60');
    expect(h.suggestions.map((s) => s.key)).not.toContain('inativo_90');
  });

  it('projeto antigo que nunca teve atividade é Inativo; projeto novo (3 dias) não é', () => {
    const empty = { wordpress: { connected: false, plugin_version: null, mode: null, connected_at: null, last_verified_at: null }, providers: [], articles: { total: 0, published: 0, last_published_at: null }, gsc: { rows: 0, last_day: null }, ga4: { rows: 0, last_day: null }, signals: { tracking_key: false, last_batch_at: null, last_day: null, cta_28d: 0 }, speed: null, site_map: null, backlinks: null, funnel: null, taxonomy: null, observatory: null, alerts: null, profile: null } as Partial<ProjectFacts>;
    const old = assess(facts({ ...empty, created_at: daysAgo(40) }));
    expect(old.state).toBe('inativo');
    expect(old.suggestions.map((s) => s.key)).toContain('nunca_ativo');
    expect(assess(facts({ ...empty, created_at: daysAgo(3) })).state).not.toBe('inativo');
  });

  it('duplicados (mesmo domínio, mesmo com barra e www): os dois recebem aviso "Mesclar manualmente"; só o mais vazio recebe "Arquivar"', () => {
    const rich = facts({ id: '00000000-0000-4000-8000-0000000000b2', name: 'RDM Advogados Associados', domain: 'rdmadvogados.com.br', gsc: { rows: 90, last_day: dayOnly(2) }, created_at: daysAgo(10) });
    const poor = facts({ id: '00000000-0000-4000-8000-0000000000b3', name: 'RDM Advogados Associados', domain: 'https://www.rdmadvogados.com.br/', articles: { total: 0, published: 0, last_published_at: null }, gsc: { rows: 0, last_day: null }, ga4: { rows: 0, last_day: null }, providers: [], created_at: daysAgo(1) });
    const all = [rich, poor];
    const hr = assess(rich, all);
    const hp = assess(poor, all);
    expect(hr.suggestions.map((s) => s.key)).toContain('duplicado');
    expect(hr.suggestions.map((s) => s.key)).not.toContain('duplicado_arquivar');
    expect(hp.suggestions.map((s) => s.key)).toEqual(expect.arrayContaining(['duplicado', 'duplicado_arquivar']));
    expect(hp.suggestions.find((s) => s.key === 'duplicado')?.related_project_id).toBe(rich.id);
    expect(hp.suggestions.find((s) => s.key === 'duplicado')?.text).toMatch(/não mescla sozinho/);
  });

  it('duplicado só por nome (sem acento/caixa) e arquivados não contam como par', () => {
    const a = facts({ id: '00000000-0000-4000-8000-0000000000c1', name: 'Conquista Prime', domain: null, wordpress_url: null });
    const b = facts({ id: '00000000-0000-4000-8000-0000000000c2', name: 'conquista  PRIME', domain: null, wordpress_url: null });
    expect(assess(a, [a, b]).suggestions.map((s) => s.key)).toContain('duplicado');
    const archived = { ...b, lifecycle_status: 'arquivado' as const };
    expect(assess(a, [a, archived]).suggestions.map((s) => s.key)).not.toContain('duplicado');
  });

  it('plugin desatualizado vira Atenção + sugestão; abaixo do mínimo vira Crítico', () => {
    const old = assess(facts({ wordpress: { connected: true, plugin_version: '3.13.0', mode: 'zica_posts', connected_at: daysAgo(100), last_verified_at: daysAgo(1) } }));
    const item = old.items.find((i) => i.key === 'plugin')!;
    expect(item.status).toBe('atencao');
    expect(item.detail).toContain(`versão atual é ${PLUGIN_VERSION}`);
    expect(old.suggestions.find((s) => s.key === 'plugin_desatualizado')?.kind).toBe('atualizar');
    const veryOld = assess(facts({ wordpress: { connected: true, plugin_version: '3.0.1', mode: 'zica_posts', connected_at: daysAgo(100), last_verified_at: daysAgo(1) } }));
    expect(veryOld.items.find((i) => i.key === 'plugin')?.status).toBe('critico');
    expect(veryOld.state).toBe('critico');
    expect(veryOld.reason).toContain(PLUGIN_MINIMUM_VERSION);
  });

  it('leitura do Google parada há mais de 14 dias é Crítico, com a data do último dado', () => {
    const h = assess(facts({ gsc: { rows: 48672, last_day: dayOnly(20) } }));
    expect(h.state).toBe('critico');
    const it = h.items.find((i) => i.key === 'leitura_google')!;
    expect(it.status).toBe('critico');
    expect(it.detail).toMatch(/leitura parada há 20 dias/);
    expect(it.action).toMatch(/Reconecte o Google/);
  });

  it('arquivado: estado Arquivado, sem nota, sem itens e sem sugestões; pausado: estado Pausado com o motivo', () => {
    const a = assess(facts({ lifecycle_status: 'arquivado', archived_at: daysAgo(4) }));
    expect(a).toMatchObject({ state: 'arquivado', score: null, items: [], suggestions: [] });
    expect(a.reason).toMatch(/Arquivado em/);
    const p = assess(facts({ lifecycle_status: 'pausado', paused_reason: 'cliente pediu' }));
    expect(p.state).toBe('pausado');
    expect(p.reason).toContain('cliente pediu');
  });

  it('nunca inventa dado: módulo ausente vira "sem dados" e não entra na nota', () => {
    const f = facts({ taxonomy: null, site_map: null, speed: null, alerts: null, backlinks: null, funnel: null, observatory: null });
    const items = buildItems(f, NOW);
    for (const k of ['taxonomia', 'mapa_dominio', 'velocidade', 'avisos', 'funil', 'citacoes_ia']) expect(items.find((i) => i.key === k)?.status, k).toBe('sem_dados');
    expect(items.find((i) => i.key === 'taxonomia')?.detail).toMatch(/não instalado/);
    const withMissing = scoreItems(items);
    const onlyScored = scoreItems(items.filter((i) => i.status !== 'sem_dados'));
    expect(withMissing).toBe(onlyScored);
    const none = scoreItems([{ key: 'x', area: 'risco', label: 'x', status: 'sem_dados', detail: '', source: '', date: null, action: null }]);
    expect(none).toBeNull();
  });

  it('organização: ordena por urgência e conta cada estado', () => {
    const ok = facts();
    const crit = facts({ id: '00000000-0000-4000-8000-0000000000d2', name: 'Quebrado', domain: 'quebrado.com.br', wordpress_url: null, gsc: { rows: 5, last_day: dayOnly(30) } });
    const arch = facts({ id: '00000000-0000-4000-8000-0000000000d3', name: 'Velho', domain: 'velho.com.br', wordpress_url: null, lifecycle_status: 'arquivado' });
    const org = assessOrganization([ok, arch, crit], NOW);
    expect(org.projects.map((p) => p.state)).toEqual(['critico', 'saudavel', 'arquivado']);
    expect(org.totals).toMatchObject({ critico: 1, saudavel: 1, arquivado: 1, atencao: 0 });
  });
});

describe('utilitários do núcleo', () => {
  it('compareVersions', () => {
    expect(compareVersions('3.13.0', '3.16.2')).toBeLessThan(0);
    expect(compareVersions('3.16.2', '3.16.2')).toBe(0);
    expect(compareVersions('3.16.10', '3.16.2')).toBeGreaterThan(0);
    expect(compareVersions('4', '3.99.99')).toBeGreaterThan(0);
  });
  it('normalizeDomain e normalizeName', () => {
    expect(normalizeDomain('https://www.RdmAdvogados.com.br/')).toBe('rdmadvogados.com.br');
    expect(normalizeDomain('rdmadvogados.com.br/')).toBe('rdmadvogados.com.br');
    expect(normalizeDomain('sem ponto')).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeName('  Elas   Tracy! ')).toBe('elas tracy');
    expect(normalizeName('Ação Jurídica')).toBe('acao juridica');
    expect(normalizeName('ab')).toBeNull();
  });
  it('normalizeFacts: JSON bruto do banco com blocos de módulo ausentes (null) e valores estranhos', () => {
    const f = normalizeFacts({ id: 'x', name: 'N', lifecycle_status: 'lixo', articles: { total: '3', published: 2, last_published_at: '' }, providers: ['gsc', 7, null], taxonomy: null, speed: { scheduled: true, enabled: true, runs: 2, last_score: null } });
    expect(f.lifecycle_status).toBe('ativo');
    expect(f.articles).toEqual({ total: 3, published: 2, last_published_at: null });
    expect(f.providers).toEqual(['gsc']);
    expect(f.taxonomy).toBeNull();
    expect(f.speed).toMatchObject({ scheduled: true, runs: 2, last_score: null, consecutive_failures: 0 });
    expect(f.alerts).toBeNull();
    expect(f.gsc).toEqual({ rows: 0, last_day: null });
  });
});
