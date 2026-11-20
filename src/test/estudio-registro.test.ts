import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINE_SPECS, EXPORT_TABLES, FLOW_CHAIN, MODULES, engineSpec, moduleByKey, moduleEdges } from '../../supabase/functions/_shared/module-registry';
import { verifyManifest } from '../../supabase/functions/_shared/project-integrity-core';
import { ADAPTERS, routeEngineRequest } from '../../supabase/functions/_shared/engine-router';
import { STUDIO_ACTIONS, READ_ACTIONS } from '../../supabase/functions/_shared/studio-handler';
import { assessProject, normalizeFacts, normalizeStudio } from '../../supabase/functions/_shared/project-health-core';
import { EVENT_LABELS, describeEvent, EVENT_KIND_RE } from '../../supabase/functions/_shared/project-events';
import { STUDIO_EVENT_LABELS } from '../../supabase/functions/_shared/studio-events';
import { GATE_IDS, GATE_LABELS, DEFAULT_GATES, DEFAULT_WORDS } from '../../supabase/functions/_shared/studio-rules';
import { PAGE_TYPES } from '../../supabase/functions/_shared/studio-types';
import { fakeAdmin } from './helpers/fake-admin';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

describe('Estúdio no núcleo único: manifesto, portão engine, papéis, eventos, saúde do projeto', () => {
  it('registrado e ativo; produz as 5 tabelas; ligações reais com outros módulos são OPCIONAIS; a cadeia combinada continua inteira', () => {
    const m = moduleByKey('estudio_paginas')!;
    expect(m).toMatchObject({ status: 'ativo', route: '/estudio', label: 'Estúdio de Páginas' });
    expect(m.produces).toEqual(['studio_pages', 'studio_page_versions', 'studio_page_links', 'studio_page_assets', 'studio_publications']);
    expect(m.consumes).toEqual([]);
    expect(m.optionalConsumes).toEqual(expect.arrayContaining(['project_taxonomy_nodes', 'project_geo_scope', 'market_serp_results', 'nexus_citations']));
    expect(verifyManifest().problems).toEqual([]);
    expect(FLOW_CHAIN).toContain('estudio_paginas');
    const into = moduleEdges().filter((e) => e.to === 'estudio_paginas');
    expect(into.every((e) => e.optional && !e.planned)).toBe(true);
    expect(into.some((e) => e.from === 'taxonomia')).toBe(true);
    expect(moduleEdges().some((e) => e.from === 'estudio_paginas' && e.to === 'funil' && e.planned)).toBe(true);
  });
  it('módulo "estudio" no portão: as 11 ações, leitura por membro, escrita por editor, só generate e images podem gerar custo', () => {
    const s = engineSpec('estudio')!;
    expect(s).toMatchObject({ handler: 'estudio', cost: 'none', scope: 'project', roleSource: 'members' });
    expect(Object.keys(s.actions).sort()).toEqual([...STUDIO_ACTIONS].sort());
    for (const a of READ_ACTIONS) expect(s.actions[a].minRole).toBe('member');
    for (const a of STUDIO_ACTIONS.filter((x) => !READ_ACTIONS.includes(x))) expect(s.actions[a].minRole).toBe('editor');
    expect(Object.entries(s.actions).filter(([, a]) => a.paid).map(([k]) => k).sort()).toEqual(['generate', 'images']);
    expect(ADAPTERS.estudio).toBeTypeOf('function');
    expect(ENGINE_SPECS.filter((e) => e.handler === 'estudio')).toHaveLength(1);
    expect(s.produces).toEqual(expect.arrayContaining(['studio_pages', 'project_events', 'index_urls']));
  });
  it('exportação do projeto inclui as tabelas do Estúdio, com ordenação estável', () => {
    const names = EXPORT_TABLES.map((t) => t.table);
    expect(names).toEqual(expect.arrayContaining(['studio_pages', 'studio_page_versions', 'studio_page_links', 'studio_page_assets', 'studio_publications']));
    for (const t of EXPORT_TABLES.filter((x) => x.module === 'estudio_paginas')) { expect(t.order.length).toBeGreaterThan(0); expect(t.pageSize).toBeGreaterThan(0); }
    expect(new Set(names).size).toBe(names.length);
    expect(MODULES.find((x) => x.key === 'estudio_paginas')!.hasData({ studio: null } as never)).toBeNull();
    expect(MODULES.find((x) => x.key === 'estudio_paginas')!.hasData({ studio: { pages: 2 } } as never)).toBe(true);
  });
  it('eventos do barramento: nomes válidos e rótulos em português; o portão engine entrega a ação ao handler (papel conferido no banco)', async () => {
    for (const [k, v] of Object.entries(STUDIO_EVENT_LABELS)) { expect(EVENT_KIND_RE.test(k), k).toBe(true); expect(k.startsWith('estudio.')).toBe(true); expect(v.length).toBeGreaterThan(5); expect(EVENT_LABELS[k]).toBe(v); }
    expect(describeEvent({ kind: 'estudio.pagina_publicada', payload: { count: 1 } })).toBe('Página publicada (1)');
    const t = { projects: [{ id: 'p', organization_id: 'o' }], organization_members: [], organizations: [] } as never;
    const fake = fakeAdmin(t);
    const r = await routeEngineRequest(fake.admin, { userId: 'u', body: { module: 'estudio', action: 'list', projectId: '00000000-0000-4000-8000-0000000000b1' } }, { fetchFn: fetch, lookupA: async () => [], now: () => NOW, sleep: async () => undefined, speedApiKey: null, paidBlocked: false });
    expect([403, 404]).toContain(r.status);
  });
  it('saúde do projeto: item "Estúdio de Páginas" é "sem dados" sem o módulo/páginas, "ok" saudável e "atenção" com pendências ou qualidade baixa', () => {
    const item = (studio: unknown) => {
      const f = normalizeFacts({ id: 'p1', name: 'X', domain: 'x.example', studio });
      return assessProject(f, [f], NOW).items.find((i) => i.key === 'estudio')!;
    };
    expect(item(undefined).status).toBe('sem_dados');
    expect(item(undefined).detail).toMatch(/ainda não instalado/);
    expect(item({ pages: 0 }).status).toBe('sem_dados');
    expect(item({ pages: 4, drafts: 1, in_review: 1, approved: 0, published: 2, pending: 0, avg_quality: 88, last_published_at: '2026-11-19T10:00:00.000Z' })).toMatchObject({ status: 'ok' });
    expect(item({ pages: 4, drafts: 1, in_review: 1, approved: 0, published: 2, pending: 3, avg_quality: 88 })).toMatchObject({ status: 'atencao', action: expect.stringMatching(/pendências/) });
    expect(item({ pages: 2, drafts: 2, in_review: 0, approved: 0, published: 0, pending: 0, avg_quality: 55 }).status).toBe('atencao');
    expect(normalizeStudio('x')).toBeNull();
    expect(normalizeStudio({ pages: '3', avg_quality: null })).toMatchObject({ pages: 3, avg_quality: null, published: 0 });
  });
  it('regras: todo portão tem rótulo e padrão editável; tipos de página têm tamanho padrão editável (não fixo)', () => {
    for (const id of GATE_IDS) { expect(GATE_LABELS[id], id).toBeTruthy(); expect(DEFAULT_GATES[id], id).toMatchObject({ source: 'padrao_editavel' }); }
    for (const t of PAGE_TYPES) expect(DEFAULT_WORDS[t]).toBeGreaterThan(0);
    expect(GATE_IDS).toHaveLength(Object.keys(GATE_LABELS).length);
  });
});

describe('migração do Estúdio: aditiva, com RLS, sem grant a anon/authenticated, reversível', () => {
  const sql = read('supabase/migrations/20261120700000_estudio_de_paginas.sql');
  const rb = read('supabase/rollbacks/20261120700000_estudio_de_paginas_rollback.sql');
  const TABLES = ['studio_pages', 'studio_page_versions', 'studio_page_links', 'studio_page_assets', 'studio_publications'];
  it('cria as 5 tabelas, todas com RLS, trigger de organização e permissão só para a chave de serviço', () => {
    for (const t of TABLES) expect(sql, t).toMatch(new RegExp(`create table if not exists public\\.${t}\\b`));
    for (const t of TABLES) expect(sql).toContain(`'${t}'`);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.%I from public, anon, authenticated/);
    expect(sql).toMatch(/grant all on table public\.%I to service_role/);
    expect(sql).toMatch(/profile_assert_project_org\(\)/);
    expect(sql).not.toMatch(/grant [^;]*\bto (?:anon|authenticated)\b/i);
    expect(sql).not.toMatch(/create policy/i);
  });
  it('é aditiva (nada de alter/drop em tabela existente, exceto as chaves estrangeiras condicionais das próprias tabelas) e guarda as travas no banco', () => {
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql.match(/alter table public\.(\w+)/gi)!.every((m) => /studio_pages|%I/.test(m))).toBe(true);
    expect(sql).toMatch(/unique \(project_id, slug_path\)/);
    expect(sql).toMatch(/status in \('rascunho', 'em_revisao', 'aprovada', 'publicada', 'despublicada'\)/);
    expect(sql).toMatch(/status not in \('aprovada', 'publicada'\) or approved_by is not null/);
    expect(sql).toMatch(/status <> 'publicada' or public_url is not null/);
    expect(sql).toMatch(/slug_path = lower\(slug_path\)/);
    expect(sql).toMatch(/studio_page_versions_immutable/);
    expect(sql).toMatch(/to_regclass\('public\.project_taxonomy_nodes'\)/);
    expect(sql).toMatch(/adapter in \('wordpress_plugin', 'site_manifest', 'zica_hosted'\)/);
  });
  it('funções: resumo para a saúde do projeto e lista de tabelas opcionais (to_regclass), sem acesso de anon/authenticated', () => {
    expect(sql).toMatch(/function private\.project_studio_summary/);
    expect(sql).toMatch(/function public\.project_studio_summary/);
    expect(sql).toMatch(/function private\.studio_optional_tables/);
    expect(sql).toMatch(/to_regclass\('public\.' \|\| t\)/);
    for (const t of ['radar_pages', 'radar_scores', 'project_focuses', 'geo_places', 'market_serp_results', 'nexus_citations', 'module_image_policies']) expect(sql).toContain(`'${t}'`);
    expect(sql).toMatch(/revoke all on function private\.project_studio_summary/);
    expect(sql).toMatch(/to service_role/);
  });
  it('rollback derruba tudo o que foi criado, na ordem das dependências, e avisa o que NÃO desfaz', () => {
    for (const t of TABLES) expect(rb).toMatch(new RegExp(`drop table if exists public\\.${t};`));
    for (const f of ['public.studio_optional_tables()', 'private.studio_optional_tables()', 'public.project_studio_summary(uuid)', 'private.project_studio_summary(uuid)', 'public.studio_page_versions_immutable()']) expect(rb).toContain(f);
    expect(rb.indexOf('studio_publications')).toBeLessThan(rb.indexOf('public.studio_pages;'));
    expect(rb).toMatch(/NÃO são removidas de lá/);
  });
});

describe('plugin 3.18.0: rotas de páginas (PHP NÃO executado aqui: checagem estática e de contrato)', () => {
  const php = read('public/wordpress-plugin/zica-posts/includes/class-zica-posts-pages.php');
  const main = read('public/wordpress-plugin/zica-posts/zica-posts.php');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""');
  it('abre com <?php, protege o acesso direto e tem parênteses, colchetes e chaves balanceados', () => {
    expect(php.startsWith('<?php')).toBe(true);
    expect(php).toMatch(/if \(!defined\('ABSPATH'\)\) exit;/);
    const c = strip(php);
    for (const [a, b] of [['(', ')'], ['[', ']'], ['{', '}']]) expect(c.split(a).length, a).toBe(c.split(b).length);
  });
  it('registra as rotas /pages, /pages/lookup, /pages/status, /pages/{id} e /redirects com a autenticação por chave', () => {
    for (const r of ["'/pages'", "'/pages/lookup'", "'/pages/status'", "'/pages/(?P<id>\\d+)'", "'/redirects'"]) expect(php).toContain(r);
    expect((php.match(/verify_api_key/g) || []).length).toBeGreaterThanOrEqual(1);
    expect(php).toMatch(/\$auth = array\(\$this->auth, 'verify_api_key'\)/);
    expect(php).not.toMatch(/'permission_callback' => '__return_true'/);
  });
  it('slug exato e hierarquia: desfaz a criação (e restaura o slug antigo na atualização) e devolve 409; não cria "-2"; pai precisa existir; página alheia não é sobrescrita', () => {
    expect(php).toContain('zica_page_slug_changed');
    expect(php).toMatch(/wp_delete_post\(\$id, true\)/);
    expect(php).toMatch(/'post_name' => \$previous_name/);
    expect(php).toMatch(/\$stored_name !== \$slug \|\| \$stored_path !== \$path/);
    expect(php).toContain('zica_page_parent_not_found');
    expect(php).toContain('zica_page_path_taken');
    expect(php).toMatch(/'post_name' => \$slug, 'post_parent' => \$parent_id/);
    expect(php).toMatch(/MAX_LEVELS = 3/);
    expect(php).toMatch(/\\p\{L\}\\p\{N\}/);
    expect(php).toMatch(/idempotent/);
  });
  it('segurança: HTML por wp_kses_post, saneamento de entradas, sem requisição externa, sem eval, só https em hreflang, redirecionamento seguro', () => {
    expect(php).toMatch(/wp_kses_post\(/);
    expect(php).not.toMatch(/wp_remote_|curl_|file_get_contents\(|eval\(|base64_decode|unserialize/);
    expect(php).toMatch(/sanitize_text_field/);
    expect(php).toMatch(/esc_url_raw/);
    expect(php).toMatch(/0 === strpos\(\$url, 'https:\/\/'\)/);
    expect(php).toMatch(/wp_safe_redirect\(home_url\(\$map\[\$key\]\), 301\)/);
    expect(php).toMatch(/MAX_REDIRECTS = 500/);
    expect(php).toMatch(/'post_status' => \$status/);
    expect(php).toMatch(/in_array\(\$p\['status'\], array\('publish', 'draft'\), true\)/);
  });
  it('não duplica SEO plugin: com Rank Math/Yoast grava nas chaves deles e não imprime os seus; sem eles imprime meta, canonical, hreflang, OG e cartão do X; noindex via wp_robots', () => {
    expect(php).toContain('rank_math_description');
    expect(php).toContain('_yoast_wpseo_metadesc');
    expect(php).toMatch(/'' !== \$this->seo_plugin\(\)\) return;/);
    for (const w of ['name="description"', 'rel="canonical"', 'hreflang', 'og:image', 'twitter:card']) expect(php).toContain(w);
    expect(php).toContain("add_filter('wp_robots'");
    expect(php).toContain("remove_action('wp_head', 'rel_canonical')");
    expect(php).toContain("_zica_posts_json_ld', array($p['schema'])");
  });
  it('reaproveita o portão de completude e é carregado e instanciado pelo arquivo principal; sem o campo novo um Zica antigo segue como antes', () => {
    expect(php).toContain('$this->completeness->precheck($q, $status)');
    expect(php).toContain('$this->completeness->finalize($id, $gate)');
    expect(main).toContain("require_once ZICA_POSTS_DIR . 'includes/class-zica-posts-pages.php';");
    expect(main).toContain('new Zica_Posts_Pages($this->auth, $this->completeness)');
    expect(main.indexOf('class-zica-posts-completeness.php')).toBeLessThan(main.indexOf('class-zica-posts-pages.php'));
  });
  it('versão 3.18.0 em todos os lugares que travam a versão; features, leia-me e empacotamento incluem as páginas', () => {
    expect(main).toContain('Version: 3.18.0');
    expect(main).toContain("define('ZICA_POSTS_VERSION', '3.18.0');");
    const vj = JSON.parse(read('public/wordpress-plugin/zica-posts/version.json'));
    expect(vj.version).toBe('3.18.0');
    expect(vj.features).toEqual(expect.arrayContaining(['completeness_gate', 'studio_pages', 'semantic_url_pages', 'page_lookup', 'page_status', 'page_redirects_301']));
    const readme = read('public/wordpress-plugin/zica-posts/readme.txt');
    expect(readme).toContain('Stable tag: 3.18.0');
    expect(readme).toMatch(/== 3\.18\.0 ==[\s\S]*NÃO foram executados[\s\S]*== 3\.17\.0 ==/);
    expect(read('src/lib/plugin-version.ts')).toContain("PLUGIN_VERSION='3.18.0'");
    expect(read('supabase/functions/_shared/plugin-version.ts')).toContain('PLUGIN_VERSION="3.18.0"');
    expect(read('supabase/functions/_shared/plugin-version.ts')).toContain('"studio_pages"');
    expect(read('scripts/build-wordpress-downloads.mjs')).toContain("outputName: 'zica-posts-3.18.0.zip'");
    expect(read('scripts/build-wordpress-downloads.mjs')).toContain('includes/class-zica-posts-pages.php');
    const wf = read('.github/workflows/zica-posts-package.yml');
    expect(wf).toContain("grep -q 'Version: 3.18.0'");
    expect(wf).toContain('zica_page_slug_changed');
    expect(wf).toContain('zica-posts-3.18.0.zip');
  });
  it('contrato servidor-plugin: o plugin lê os campos que o Estúdio envia e devolve os que o Estúdio lê', () => {
    for (const k of ['zica_ai_id', 'full_path', 'parent_path', 'slug', 'seo_title', 'meta_description', 'canonical', 'schema', 'hreflang', 'noindex', 'og', 'completeness', 'excerpt', 'content', 'title', 'status', 'language']) expect(php, k).toContain(`'${k}'`);
    for (const k of ["'id'", "'url'", "'path'", "'status'", "'created'", "'idempotent'", "'completeness'", "'content_hash'"]) expect(php, k).toContain(k);
    expect(php).toContain("'pages/status'".replace("'pages/status'", "'/pages/status'"));
  });
});
