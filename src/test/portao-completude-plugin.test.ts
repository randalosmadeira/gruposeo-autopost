import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolveRuleProfile, defaultProfile } from '../../supabase/functions/_shared/optimization-rules';
import {
  ITEM_IDS, buildCompletenessRequest, compactReport, describeCompleteness, parseCompletenessReport, policyOf,
} from '../../supabase/functions/_shared/plugin-completeness';
import { sha256Hex } from '../../supabase/functions/_shared/auto-optimize-core';

const read = (p: string) => readFileSync(p, 'utf8');
const PLUGIN = 'public/wordpress-plugin/zica-posts';
const PHP = read(`${PLUGIN}/includes/class-zica-posts-completeness.php`);
const REST = read(`${PLUGIN}/includes/class-zica-posts-rest.php`);
const DISCOVERY = read(`${PLUGIN}/includes/class-zica-posts-discovery.php`);
const MAIN = read(`${PLUGIN}/zica-posts.php`);

/** Contagem de (), [] e {} em PHP ignorando strings e comentários. NÃO é um parser: só pega o erro de digitação mais comum (a sintaxe PHP não foi executada aqui). */
function phpBalance(src: string): { ok: boolean; detail: string } {
  const stack: string[] = []; const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  let i = 0;
  while (i < src.length) {
    const c = src[i]; const n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '#' ) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return { ok: false, detail: 'comentário aberto' }; i += 2; continue; }
    if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; continue; }
    if ('([{'.includes(c)) stack.push(c);
    else if (')]}'.includes(c)) { if (stack.pop() !== pairs[c]) return { ok: false, detail: `fecha ${c} sem abrir, perto de "${src.slice(Math.max(0, i - 40), i + 5)}"` }; }
    i++;
  }
  return { ok: stack.length === 0, detail: stack.length ? `faltou fechar ${stack.join('')}` : 'ok' };
}

describe('portão de completude: contrato do servidor (pedido ao plugin e leitura do relatório)', () => {
  const req = (over: Parameters<typeof buildCompletenessRequest>[0] extends infer T ? Partial<T> : never = {}) => buildCompletenessRequest({
    rules: defaultProfile(), approvedHash: 'a'.repeat(64), language: 'pt-BR', hasFaq: true, hasTranslations: true, authorIdentified: false,
    schemaPolicy: { seo_plugin: null, drop_types: [] }, ...over,
  });

  it('o hash aprovado é o sha256 do conteúdo exatamente como segue no campo content (a conta do PHP é a mesma: hash("sha256", $content))', async () => {
    const content = '<h2>Prazo para recorrer</h2><p>Ação com acentuação, 100% e R$ 10.</p>';
    expect(await sha256Hex(content)).toBe(createHash('sha256').update(content, 'utf8').digest('hex'));
  });

  it('níveis vêm do perfil de regras; regra desligada some; FAQ nunca é exigido; política "exigir" só quando o projeto escolhe', () => {
    const r = req();
    expect(r.levels).toMatchObject({ breadcrumb: 'exigir', schema: 'exigir', canonical: 'exigir', dates: 'exigir', no_markdown_tables: 'exigir', no_prompt_residue: 'exigir', internal_links: 'exigir', author: 'recomendar', open_graph: 'recomendar', hreflang: 'recomendar' });
    expect(r.levels.schema_faq).toBe('recomendar');
    expect(r.policy).toBe('warn');
    expect(r.internal_links_min).toBe(10);
    expect(r.expect).toEqual({ faq_schema: true, hreflang: true, author_identified: false });
    const off = req({ rules: resolveRuleProfile({ articleConfig: { optimization_rules: { breadcrumb: 'desligado', links_internos: 'desligado', faq: 'desligado', schema_faq: 'exigir' }, } }) });
    expect(off.levels.breadcrumb).toBeUndefined();
    expect(off.levels.internal_links).toBeUndefined();
    expect(off.internal_links_min).toBeNull();
    expect(off.levels.schema_faq).toBe('recomendar');
    const semFaq = req({ hasFaq: false, hasTranslations: false });
    expect(semFaq.levels.schema_faq).toBeUndefined();
    expect(semFaq.levels.hreflang).toBeUndefined();
    const exigir = resolveRuleProfile({ projectIdentity: { optimization_rules: { options: { plugin_gate: 'exigir' } } } });
    expect(policyOf(exigir)).toBe('require');
    expect(req({ rules: exigir }).policy).toBe('require');
  });

  it('lê o relatório que o plugin devolve (formato do PHP): preenchido, pendente, segurado e hash', () => {
    const doc = {
      ran: true, version: 1, policy: 'require', held: true, published_status: 'draft', plugin_version: '3.17.0',
      items: [
        { id: 'breadcrumb', level: 'exigir', state: 'filled', note: 'sem BreadcrumbList no envio' },
        { id: 'schema', level: 'exigir', state: 'ok' },
        { id: 'internal_links', level: 'exigir', state: 'pending', note: '3 link(s) interno(s); mínimo 10' },
        { id: 'author', level: 'recomendar', state: 'pending', note: 'autor genérico; o plugin não inventa autor' },
        { id: 'schema_faq', level: 'recomendar', state: 'info' },
      ],
      hash: { expected: 'a'.repeat(64), actual: 'b'.repeat(64), match: false, stored: 'c'.repeat(64) },
    };
    const r = parseCompletenessReport(doc);
    expect(r).toMatchObject({ ran: true, status: 'held', held: true, published_status: 'draft', plugin_version: '3.17.0' });
    expect(r.filled).toEqual(['breadcrumb']);
    expect(r.pending).toEqual(['internal_links', 'author']);
    expect(r.pending_required).toEqual(['internal_links']);
    expect(r.hash).toEqual({ expected: 'a'.repeat(64), actual: 'b'.repeat(64), match: false });
    const d = describeCompleteness(r);
    expect(d.headline).toMatch(/segurada como rascunho/);
    expect(d.lines.join(' ')).toMatch(/preencheu sozinho: Trilha de navegação/);
    expect(d.lines.join(' ')).toMatch(/Pendente \(exigido\): Links internos/);
    expect(d.lines.join(' ')).toMatch(/não é idêntico ao aprovado/);
    expect(compactReport(r, '2026-11-20T12:00:00.000Z')).toMatchObject({ status: 'held', pending_required: ['internal_links'], hash_match: false });
  });

  it('conjunto completo = "complete"; com pendência só recomendada = aviso (publica); plugin antigo = sem relatório; lixo nunca lança', () => {
    const ok = parseCompletenessReport({ ran: true, policy: 'warn', held: false, items: [{ id: 'schema', level: 'exigir', state: 'ok' }] });
    expect(ok.status).toBe('complete');
    expect(describeCompleteness(ok).headline).toMatch(/nada ausente/);
    const aviso = parseCompletenessReport({ ran: true, policy: 'warn', held: false, items: [{ id: 'author', level: 'recomendar', state: 'pending' }] });
    expect(aviso).toMatchObject({ status: 'warnings', held: false });
    expect(describeCompleteness(aviso).headline).toMatch(/Publicado com 1 aviso/);
    const antigo = parseCompletenessReport(undefined);
    expect(antigo).toMatchObject({ ran: false, reason: 'plugin_antigo', status: 'unknown' });
    expect(describeCompleteness(antigo).lines[0]).toMatch(/3\.17\.0/);
    expect(parseCompletenessReport({ ran: false, policy: 'off' })).toMatchObject({ ran: false, reason: 'desligado', policy: 'off' });
    for (const lixo of ['texto', 42, [], { ran: true }, { ran: true, items: 'x' }, null]) {
      expect(() => parseCompletenessReport(lixo)).not.toThrow();
    }
    expect(parseCompletenessReport([]).reason).toBe('relatorio_invalido');
  });

  it('o que o plugin devolve é só dado: id desconhecido é descartado, duplicado ignorado, nota cortada, estado inválido vira pendente (não vira instrução)', () => {
    const r = parseCompletenessReport({ ran: true, items: [
      { id: 'drop_table', level: 'exigir', state: 'ok' }, { id: 'schema', state: 'ok', note: 'x'.repeat(5000) }, { id: 'schema', state: 'pending' }, { id: 'canonical', level: 'exigir', state: 'maybe' },
    ] });
    expect(r.items.map((i) => i.id)).toEqual(['schema', 'canonical']);
    expect(r.items[0].note?.length).toBe(200);
    expect(r.items[1].state).toBe('pending');
    expect(r.pending_required).toEqual(['canonical']);
  });
});

describe('portão de completude: PHP do plugin 3.17.0 (a sintaxe PHP NÃO foi executada: não há PHP neste ambiente)', () => {
  it('parênteses, colchetes e chaves fecham em todos os arquivos PHP do plugin (checagem estática, não é um parser)', () => {
    const files = [`${PLUGIN}/zica-posts.php`, ...readdirSync(`${PLUGIN}/includes`).filter((f) => f.endsWith('.php')).map((f) => `${PLUGIN}/includes/${f}`)];
    for (const f of files) { const b = phpBalance(read(f)); expect(b.ok, `${f}: ${b.detail}`).toBe(true); }
  });

  it('o mesmo conjunto de itens no PHP e no servidor', () => {
    const m = PHP.match(/private static \$item_ids = array\(([\s\S]*?)\);/);
    const ids = [...(m?.[1] || '').matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
    expect(ids.sort()).toEqual([...ITEM_IDS].sort());
  });

  it('não faz requisição externa nem telemetria, e não escreve no texto salvo do post', () => {
    const code = PHP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // sem os comentários
    expect(code).not.toMatch(/wp_remote_|curl_|file_get_contents\s*\(\s*['"]http|fsockopen|wp_mail|setcookie/);
    expect(code).not.toMatch(/wp_update_post|wp_insert_post|post_content\s*=>/);
    expect(code).toMatch(/update_post_meta/);
  });

  it('relatório com as chaves que o servidor lê e política: só segura como rascunho com "require", publicação pedida e item exigido pendente', () => {
    for (const key of ["'ran' => true", "'version' =>", "'policy' =>", "'held' =>", "'published_status' =>", "'items' =>", "'expected' =>", "'actual' =>", "'match' =>", "'plugin_version' =>"]) expect(PHP, key).toContain(key);
    expect(PHP).toMatch(/'require' === \$req\['policy'\] && 'publish' === \$requested_status && \$this->has_pending_required\(\$items\)/);
    expect(PHP).toMatch(/if \('pending' === \$i\['state'\] && 'exigir' === \$i\['level'\]\) return true;/);
    expect(PHP).toMatch(/if \(null === \$req\) return null;/); // Zica antigo: sem o campo, comportamento antigo
    expect(PHP).toMatch(/if \('off' === \$req\['policy'\]\)/);
  });

  it('itens de nível desligado não são avaliados; schema FAQ só informativo; autor nunca inventado', () => {
    expect(PHP).toMatch(/if \(!isset\(\$req\['levels'\]\[\$id\]\)\) return null;/);
    expect(PHP).toMatch(/'schema_faq', in_array\('FAQPage', \$types, true\) \? 'ok' : 'info'/);
    expect(PHP).toMatch(/o plugin não inventa autor/);
    expect(PHP).not.toMatch(/'author' =>\s*array\('@type' => 'Person'/);
  });

  it('nunca duplica o SEO plugin: Rank Math, Yoast, AIOSEO e SEOPress; um Article só; datas coerentes', () => {
    for (const c of ['RANK_MATH_VERSION', 'WPSEO_VERSION', 'AIOSEO_VERSION', 'SEOPRESS_VERSION']) { expect(PHP).toContain(c); expect(DISCOVERY).toContain(c); }
    expect(PHP).toMatch(/if \('' !== \$seo\) \$drop = array_merge\(\$drop, self::\$article_types, array\('BreadcrumbList'\)\);/);
    expect(PHP).toMatch(/\$mod < \$pub\) \$schema\['dateModified'\] = \$schema\['datePublished'\]/);
    expect(PHP).toMatch(/isset\(\$seen\[\$key\]\)\) continue;/);
    expect(DISCOVERY).toContain("apply_filters('zica_posts_stored_schemas',get_post_meta($post->ID,'_zica_posts_json_ld',true),$post)");
  });

  it('REST: recebe o portão por último argumento (compatível), segura como rascunho só pelo precheck e devolve o relatório só quando foi pedido', () => {
    expect(REST).toContain('$signals=null,$completeness=null)');
    expect(REST).toContain("$gate=$this->completeness->precheck($p,$status);if($gate&&!empty($gate['hold']))$status='draft';");
    expect(REST).toContain("if($gate&&$this->completeness)$resp['completeness']=$this->completeness->finalize($id,$gate);");
    expect(REST).toContain("'completeness_gate'=>true");
    expect(MAIN).toContain('$this->signals, $this->completeness);');
    expect(MAIN).toContain("require_once ZICA_POSTS_DIR . 'includes/class-zica-posts-completeness.php';");
  });

  it('versão 3.18.0 em todos os lugares que travam a versão; plugin-version com a nova função; Zica antigo/plugin antigo continuam compatíveis', () => {
    expect(MAIN).toContain('Version: 3.18.0');
    expect(MAIN).toContain("define('ZICA_POSTS_VERSION', '3.18.0');");
    expect(read(`${PLUGIN}/version.json`)).toContain('"version": "3.18.0"');
    expect(read(`${PLUGIN}/version.json`)).toContain('completeness_gate');
    const readme = read(`${PLUGIN}/readme.txt`);
    expect(readme).toContain('Stable tag: 3.18.0');
    expect(readme).toMatch(/== 3\.17\.0 ==[\s\S]*Portão de completude[\s\S]*== 3\.16\.2 ==/);
    expect(read('src/lib/plugin-version.ts')).toContain("PLUGIN_VERSION='3.18.0'");
    expect(read('supabase/functions/_shared/plugin-version.ts')).toContain('PLUGIN_VERSION="3.18.0"');
    expect(read('supabase/functions/_shared/plugin-version.ts')).toContain('"completeness_gate"');
    expect(read('supabase/functions/_shared/plugin-version.ts')).toMatch(/PLUGIN_MINIMUM_VERSION="3\.12\.0"/); // quem não atualizou continua aceito
    expect(read('scripts/build-wordpress-downloads.mjs')).toContain("outputName: 'zica-posts-3.18.0.zip'");
    expect(read('scripts/build-wordpress-downloads.mjs')).toContain('includes/class-zica-posts-completeness.php');
    expect(read('.github/workflows/zica-posts-package.yml')).toContain("grep -q 'Version: 3.18.0'");
  });
});

describe('publish-to-wordpress: lê o relatório do plugin e roda o piloto antes de publicar sem bloquear', () => {
  const pub = read('supabase/functions/publish-to-wordpress/index.ts');
  it('usa o plano de schema e manda o pedido de completude; guarda o relatório no artigo e mostra na resposta', () => {
    expect(pub).toContain('buildSchemaPlan({ article, project, sectorType })');
    expect(pub).toContain('payload.completeness = buildCompletenessRequest(');
    expect(pub).toContain('approvedHash: await sha256Hex(String(article.content || ""))');
    expect(pub).toContain('parseCompletenessReport(result.completeness)');
    expect(pub).toContain('plugin_completeness: compactReport(completenessReport, now)');
    expect(pub).toMatch(/completeness: completenessReport \? \{ \.\.\.completenessReport, summary: describeCompleteness\(completenessReport\) \} : null/);
  });
  it('só marca como publicado se o plugin não segurou; o artigo segue com a regra de aprovação já existente', () => {
    expect(pub).toContain('const effectiveStatus = pluginMode && status === "publish" && completenessReport?.held ? "draft" : status;');
    expect(pub).toContain('const articleUpdate = effectiveStatus === "publish"');
    expect(pub).toContain('held_by_plugin: effectiveStatus !== status');
    expect(pub).toContain('const fingerprint = await editorialFingerprint(article, project);'); // o recibo de aprovação continua valendo
  });
  it('o gatilho automático é rodada rápida (sem IA), com prazo, e a falha dele nunca impede a publicação', () => {
    expect(pub).toContain('action: "trigger", articleId: article.id, trigger: "pre_publish", mode: "quick"');
    expect(pub).toMatch(/setTimeout\(\(\) => reject\(new Error\("autopilot_timeout"\)\), 15000\)/);
    expect(pub).toMatch(/catch \(autopilotError\) \{\s*console\.warn\(/);
  });
});

describe('o funil continua o mesmo: nada de config.toml quebrado e função de borda com login', () => {
  it('auto-optimize no config.toml com verify_jwt = true, e a função confere papel dentro', () => {
    const toml = read('supabase/config.toml');
    expect(toml).toMatch(/\[functions\.auto-optimize\]\s*\r?\nverify_jwt = true/);
    const fn = read('supabase/functions/auto-optimize/index.ts');
    expect(fn).toContain('resolveRequestActor');
    expect(fn).toContain("from('organization_members')");
    expect(fn).toContain('paidLockedServe');
    expect(fn).not.toMatch(/service_role[^'"\s]*\s*:\s*['"]ey/i);
  });
});
