/**
 * Portão de completude do plugin WordPress (Zica Posts 3.17.0): o contrato entre o Zica e o plugin, do lado do servidor.
 *
 * O Zica manda, junto do artigo, o que espera (`completeness`): política (avisar/exigir/desligado), o hash do conteúdo aprovado, os níveis de cada
 * item vindos do perfil de regras e o que o plugin pode conferir. O plugin confere o CONJUNTO antes de publicar, PREENCHE sozinho o que for
 * determinístico (trilha, schema, canonical, Open Graph, alt...) e devolve um relatório estruturado. Itens que ele não consegue preencher ficam
 * "pendente". Por padrão publica com aviso; só segura como rascunho se a política for "exigir" E houver item de nível "exigir" pendente.
 *
 * Plugin antigo (sem este recurso) ignora os campos novos e não devolve relatório: o servidor trata como "plugin antigo" e segue como sempre.
 * Nada aqui faz requisição externa nem envia conteúdo a terceiros: o relatório é só o que o plugin devolve na resposta da publicação.
 */
import type { RuleProfile, RuleLevel } from './optimization-rules.ts';

export const COMPLETENESS_VERSION = 1;
export const MIN_PLUGIN_FOR_COMPLETENESS = '3.17.0';

export const ITEM_IDS = [
  'title', 'meta_description', 'h1_single', 'heading_hierarchy', 'breadcrumb', 'schema', 'schema_faq', 'schema_duplicates', 'canonical', 'open_graph',
  'featured_image', 'image_alt', 'internal_links', 'author', 'dates', 'no_markdown_tables', 'no_prompt_residue', 'content_hash', 'hreflang',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];
export type ItemState = 'ok' | 'filled' | 'pending' | 'info';
export type ItemLevel = 'exigir' | 'recomendar';

export const ITEM_LABELS: Record<ItemId, string> = {
  title: 'Título', meta_description: 'Meta descrição', h1_single: 'H1 único', heading_hierarchy: 'Hierarquia de títulos', breadcrumb: 'Trilha de navegação (breadcrumb)',
  schema: 'Schema Article/BlogPosting', schema_faq: 'Schema FAQPage (informativo)', schema_duplicates: 'Sem Article duplicado', canonical: 'URL canônica',
  open_graph: 'Open Graph', featured_image: 'Imagem destacada', image_alt: 'Texto alternativo das imagens', internal_links: 'Links internos', author: 'Autor identificado',
  dates: 'Datas coerentes', no_markdown_tables: 'Tabelas sem markdown cru', no_prompt_residue: 'Sem resíduo de prompt ou placeholder', content_hash: 'Conteúdo igual ao aprovado',
  hreflang: 'hreflang e x-default',
};

export type CompletenessPolicy = 'warn' | 'require' | 'off';

export interface CompletenessRequest {
  version: number;
  policy: CompletenessPolicy;
  /** sha256 (hex) do conteúdo que o Zica aprovou e está enviando, exatamente como segue no campo `content` */
  approved_hash: string;
  language: string | null;
  /** nível de cada item; item ausente = desligado (o plugin nem avalia) */
  levels: Partial<Record<ItemId, ItemLevel>>;
  internal_links_min: number | null;
  expect: { faq_schema: boolean; hreflang: boolean; author_identified: boolean | null };
  schema_policy: { seo_plugin: string | null; drop_types: string[] };
}

const level = (l: RuleLevel): ItemLevel | null => (l === 'desligado' ? null : l);

export function policyOf(profile: RuleProfile, projectOverride?: unknown): CompletenessPolicy {
  if (projectOverride === 'off') return 'off';
  return profile.options.plugin_gate === 'exigir' ? 'require' : 'warn';
}

export function buildCompletenessRequest(args: {
  rules: RuleProfile; approvedHash: string; language: string | null; hasFaq: boolean; hasTranslations: boolean; authorIdentified: boolean | null;
  schemaPolicy: { seo_plugin: string | null; drop_types: string[] };
}): CompletenessRequest {
  const r = args.rules.rules;
  const levels: Partial<Record<ItemId, ItemLevel>> = {};
  const set = (id: ItemId, l: ItemLevel | null) => { if (l) levels[id] = l; };
  set('title', level(r.title_length.level) ? 'recomendar' : null);
  set('meta_description', level(r.meta_length.level) ? 'recomendar' : null);
  set('h1_single', 'recomendar'); set('heading_hierarchy', 'recomendar');
  set('breadcrumb', level(r.breadcrumb.level)); set('schema', level(r.schema_article.level)); set('schema_faq', args.hasFaq && level(r.schema_faq.level) ? 'recomendar' : null);
  set('schema_duplicates', level(r.schema_article.level)); set('canonical', level(r.canonical.level)); set('open_graph', level(r.open_graph.level));
  set('featured_image', level(r.featured_image.level)); set('image_alt', level(r.image_alt.level)); set('internal_links', level(r.internal_links.level));
  set('author', level(r.author_byline.level)); set('dates', level(r.dates_coherent.level)); set('no_markdown_tables', level(r.no_markdown_tables.level));
  set('no_prompt_residue', level(r.no_prompt_residue.level)); set('content_hash', level(r.content_hash_match.level)); set('hreflang', args.hasTranslations ? 'recomendar' : null);
  // schema FAQ nunca é obrigatório (rich result de FAQ aposentado pelo Google em 05/2026)
  if (levels.schema_faq) levels.schema_faq = 'recomendar';
  return {
    version: COMPLETENESS_VERSION, policy: policyOf(args.rules), approved_hash: args.approvedHash, language: args.language, levels,
    internal_links_min: r.internal_links.level === 'desligado' ? null : (r.internal_links.value ?? 10),
    expect: { faq_schema: args.hasFaq, hreflang: args.hasTranslations, author_identified: args.authorIdentified },
    schema_policy: args.schemaPolicy,
  };
}

export interface ReportItem { id: ItemId; level: ItemLevel; state: ItemState; note?: string }
export interface CompletenessReport {
  ran: boolean;
  reason?: 'plugin_antigo' | 'sem_relatorio' | 'desligado' | 'relatorio_invalido';
  version: number;
  policy: CompletenessPolicy | null;
  status: 'complete' | 'warnings' | 'held' | 'unknown';
  held: boolean;
  published_status: string | null;
  items: ReportItem[];
  filled: ItemId[];
  pending: ItemId[];
  pending_required: ItemId[];
  hash: { expected: string | null; actual: string | null; match: boolean | null };
  plugin_version: string | null;
}

const isId = (v: unknown): v is ItemId => typeof v === 'string' && (ITEM_IDS as readonly string[]).includes(v);
const cut = (v: unknown, n = 200) => String(v ?? '').slice(0, n);
const emptyReport = (reason: CompletenessReport['reason']): CompletenessReport => ({ ran: false, reason, version: COMPLETENESS_VERSION, policy: null, status: 'unknown', held: false, published_status: null, items: [], filled: [], pending: [], pending_required: [], hash: { expected: null, actual: null, match: null }, plugin_version: null });

/** Lê o relatório devolvido pelo plugin. Qualquer coisa fora do formato vira "sem relatório": nunca lança e nunca confia em texto do plugin como instrução. */
export function parseCompletenessReport(raw: unknown, pluginVersion?: unknown): CompletenessReport {
  if (raw === undefined || raw === null) return { ...emptyReport('plugin_antigo'), plugin_version: pluginVersion ? cut(pluginVersion, 20) : null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return emptyReport('relatorio_invalido');
  const o = raw as Record<string, unknown>;
  if (o.ran === false) return { ...emptyReport('desligado'), policy: o.policy === 'off' ? 'off' : null };
  if (!Array.isArray(o.items)) return emptyReport('relatorio_invalido');
  const items: ReportItem[] = [];
  const seen = new Set<string>();
  for (const it of o.items.slice(0, 40)) {
    const x = it as Record<string, unknown>;
    if (!x || !isId(x.id) || seen.has(x.id)) continue;
    const state: ItemState = x.state === 'ok' || x.state === 'filled' || x.state === 'pending' || x.state === 'info' ? x.state : 'pending';
    seen.add(x.id);
    items.push({ id: x.id, level: x.level === 'exigir' ? 'exigir' : 'recomendar', state, ...(x.note ? { note: cut(x.note) } : {}) });
  }
  const filled = items.filter((i) => i.state === 'filled').map((i) => i.id);
  const pending = items.filter((i) => i.state === 'pending').map((i) => i.id);
  const pendingRequired = items.filter((i) => i.state === 'pending' && i.level === 'exigir').map((i) => i.id);
  const h = (o.hash && typeof o.hash === 'object' ? o.hash : {}) as Record<string, unknown>;
  const held = o.held === true;
  return {
    ran: true, version: Number(o.version) || COMPLETENESS_VERSION, policy: o.policy === 'require' || o.policy === 'off' ? o.policy : 'warn',
    status: held ? 'held' : pending.length ? 'warnings' : 'complete', held, published_status: typeof o.published_status === 'string' ? cut(o.published_status, 20) : null,
    items, filled, pending, pending_required: pendingRequired,
    hash: { expected: typeof h.expected === 'string' ? cut(h.expected, 64) : null, actual: typeof h.actual === 'string' ? cut(h.actual, 64) : null, match: typeof h.match === 'boolean' ? h.match : null },
    plugin_version: typeof o.plugin_version === 'string' ? cut(o.plugin_version, 20) : null,
  };
}

/** Frases em português para a tela do artigo. */
export function describeCompleteness(r: CompletenessReport): { headline: string; lines: string[] } {
  if (!r.ran) {
    const why = r.reason === 'plugin_antigo' ? `O plugin do WordPress ainda não tem o portão de completude (precisa da versão ${MIN_PLUGIN_FOR_COMPLETENESS} ou mais nova). A publicação seguiu como antes.` : r.reason === 'desligado' ? 'O portão de completude está desligado neste site.' : 'O plugin não devolveu o relatório de completude.';
    return { headline: 'Conferência do plugin não disponível', lines: [why] };
  }
  const lines: string[] = [];
  if (r.filled.length) lines.push(`O plugin preencheu sozinho: ${r.filled.map((i) => ITEM_LABELS[i]).join(', ')}.`);
  for (const i of r.items.filter((x) => x.state === 'pending')) lines.push(`Pendente (${i.level === 'exigir' ? 'exigido' : 'recomendado'}): ${ITEM_LABELS[i.id]}${i.note ? ` — ${i.note}` : ''}.`);
  if (r.hash.match === false) lines.push('O conteúdo recebido pelo plugin não é idêntico ao aprovado no Zica.');
  const headline = r.held ? 'Publicação segurada como rascunho pelo portão do plugin' : r.pending.length ? `Publicado com ${r.pending.length} aviso(s) do plugin` : 'Conjunto completo: nada ausente';
  return { headline, lines };
}

/** Versão resumida para guardar no artigo (config.plugin_completeness). */
export function compactReport(r: CompletenessReport, nowIso: string) {
  return { at: nowIso, ran: r.ran, reason: r.reason ?? null, status: r.status, held: r.held, policy: r.policy, filled: r.filled, pending: r.pending, pending_required: r.pending_required, hash_match: r.hash.match, plugin_version: r.plugin_version };
}
