/**
 * Portões de qualidade técnica do Estúdio de Páginas (SEO, GEO, AEO, AIO, E-E-A-T, acessibilidade, desempenho, conformidade).
 *
 * Cada portão devolve: estado (ok | aviso | falha | info | desligado), nota em português e COMO CORRIGIR. O NÍVEL (exigir | recomendar | desligado) vem do perfil de regras
 * (studio-rules.ts): 'exigir' que não passa = FALHA (bloqueia a aprovação); 'recomendar' que não passa = AVISO. Conformidade do segmento (OAB, saúde, finanças...) é
 * sempre AVISO por padrão e pode ser desligada. Defeitos reais da auditoria da RDM (20/11/2026) viraram casos de teste: Article duplicado, sem autor, sem breadcrumb,
 * várias "entidades", telefone/horário conflitantes, páginas de cidade com texto repetido, tabela em markdown cru, H2 sem pergunta, sem fonte.
 * Puro (sem rede, sem banco, sem IA).
 */
import { GATE_IDS, GATE_LABELS, gateOn, gateValue, type GateId, type StudioRules } from './studio-rules.ts';
import type { FieldFact, ProfileFacts, StudioPageDoc } from './studio-types.ts';
import { detectAiPatterns, headingsOf, htmlToText, paragraphsOf, sentencesOf, type AiReport } from './studio-ai-detector.ts';
import { renderBody, renderDocument } from './studio-render.ts';
import { validateGraph, typesOf, type SchemaBuild, type StudioGraph } from './studio-schema.ts';
import { anchorVariety, extractLinks, isOfficialHost } from './studio-links.ts';
import { assessDoorway, type DoorwayReport, type SiblingText } from './studio-doorway.ts';
import { buildFactBank, extractPendingMarkers, guardInvention, phoneKnown, phonesInHtml, type FactBank, type InventionIssue } from './studio-facts.ts';
import { findBrokenContactCtas, type QualityIssue } from './publication-quality.ts';
import { findPublicationResidues } from './publication-safety.ts';
import { LANGUAGES, STRUCTURAL_HEADING, isQuestionHeading, parseLanguageTag } from './language-packs.ts';
import { completeHreflang, isGenericAuthor } from './schema-completeness.ts';
import { resolvePack, runPack, type PackResult } from './segment-packs.ts';

export type GateStatus = 'ok' | 'aviso' | 'falha' | 'info' | 'desligado';
export interface GateResult { id: GateId; label: string; level: 'exigir' | 'recomendar' | 'desligado'; status: GateStatus; note: string; fix: string | null; details?: string[] }

export interface GateContext {
  doc: StudioPageDoc;
  rules: StudioRules;
  profile: ProfileFacts;
  schema: SchemaBuild;
  siblings: SiblingText[];
  /** títulos e metas das OUTRAS páginas do site/Estúdio (unicidade) */
  existing: { titles: string[]; metas: string[] };
  fieldFacts: FieldFact[];
  /** ids dos fatos de campo usados na página */
  usedFactIds: string[];
  /** palavras-chave que a página quer ranquear (para recusar âncora de correspondência exata) */
  keywords: string[];
  /** quantas páginas já apontam para esta (entrada): 0 = órfã até alguém linkar */
  inboundPlanned: number;
  /** links externos já checados: url -> 200? */
  linkChecks?: Record<string, boolean | null>;
  /** âncoras de outras páginas para o mesmo destino (variedade) */
  siteLinks?: Array<{ to: string; anchor: string }>;
  hasTranslations?: boolean;
  nowMs?: number;
  /** pacote/modo de conformidade resolvidos de fora (testes podem injetar); se ausentes, saem do perfil de regras */
  compliance?: PackResult | null;
}

export interface QualityReport {
  results: GateResult[];
  /** portões 'exigir' que falharam: bloqueiam a aprovação */
  blocking: GateId[];
  warnings: GateId[];
  ok: number;
  active: number;
  /** 0 a 100: parte dos portões ligados que passou (aviso conta metade) */
  score: number;
  complete: boolean;
  ai: AiReport;
  doorway: DoorwayReport;
  invention: InventionIssue[];
  pendings: string[];
  generated_at: string;
}

const MD_TABLE = /^\s*\|.+\|\s*$/m;
const MD_RESIDUE = /(?:^|\n)\s{0,3}#{1,6}\s+\S|\*\*[^*\n]{2,}\*\*|(?<!\w)__[^_\n]{2,}__|```|\|\s*:?-{3,}:?\s*\|/;
const GENERIC_LINK_TEXT = /^(?:clique aqui|saiba mais|leia mais|ver mais|aqui|click here|read more|learn more|here|more|haga clic aqu[ií]|m[aá]s|ver m[aá]s|mehr|hier)$/i;
const MODERN = new Set(['webp', 'avif']);

const lc = (s: string) => String(s || '').toLowerCase();
const words = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
const fullDoc = (c: GateContext) => renderDocument(c.doc, c.schema.graph, { siteName: c.profile.name });

function mk(ctx: GateContext, id: GateId, pass: boolean, note: string, fix: string | null, details?: string[]): GateResult {
  const rule = ctx.rules.gates[id];
  const label = GATE_LABELS[id];
  if (rule.level === 'desligado') return { id, label, level: 'desligado', status: 'desligado', note: 'Desligado no perfil de regras.', fix: null };
  const status: GateStatus = pass ? 'ok' : rule.level === 'exigir' ? 'falha' : 'aviso';
  return { id, label, level: rule.level, status, note: pass ? note : note, fix: pass ? null : fix, ...(details && details.length ? { details } : {}) };
}
const info = (ctx: GateContext, id: GateId, note: string): GateResult => (ctx.rules.gates[id].level === 'desligado' ? mk(ctx, id, true, '', null) : { id, label: GATE_LABELS[id], level: ctx.rules.gates[id].level, status: 'info', note, fix: null });

// ------------------------------------------------------------------------------------------------------------ portões individuais
function gHtmlSemantic(ctx: GateContext): GateResult {
  const doc = ctx.doc; const body = renderBody(doc); const full = fullDoc(ctx);
  const problems: string[] = [];
  const hs = headingsOf(body);
  const h1s = hs.filter((h) => h.level === 1);
  if (h1s.length !== 1) problems.push(`${h1s.length} H1 (precisa ser exatamente 1).`);
  let prev = 0;
  for (const h of hs) { if (prev && h.level > prev + 1) problems.push(`Salto de ${`H${prev}`} para H${h.level} ("${h.text.slice(0, 40)}").`); prev = h.level; }
  if (hs.some((h) => !h.text.trim())) problems.push('Título vazio.');
  if (words(htmlToText(doc.bodyHtml)) > 300 && hs.filter((h) => h.level === 2).length < 2) problems.push('Texto longo sem H2 suficientes para dividir os assuntos.');
  if (MD_TABLE.test(doc.bodyHtml.replace(/<[^>]+>/g, '\n'))) problems.push('Tabela em markdown cru (linhas com "|"): use <table> com <th>.');
  for (const t of doc.bodyHtml.matchAll(/<table\b[\s\S]*?<\/table>/gi)) if (!/<th\b/i.test(t[0])) problems.push('Tabela sem cabeçalho <th>.');
  if (/<(?:p|div)[^>]*>\s*(?:[•▪●-]\s+)/i.test(doc.bodyHtml)) problems.push('Lista feita com símbolos: use <ul>/<ol>.');
  for (const tag of ['<main', '<header', '<footer']) if (!full.includes(tag)) problems.push(`Falta o marco ${tag.slice(1)}>.`);
  if (!/<html[^>]+lang="[^"]+"/i.test(full)) problems.push('<html> sem lang.');
  return mk(ctx, 'html_semantic', problems.length === 0, 'Um H1, hierarquia sem saltos, marcos e tabelas reais.', 'Corrija a estrutura de títulos e use elementos HTML de verdade (tabela, lista, marcos).', problems);
}

function gTitle(ctx: GateContext): GateResult {
  const t = ctx.doc.title.trim(); const rule = ctx.rules.gates.title_unique;
  const min = rule.value ?? 35; const max = rule.max ?? 70;
  const problems: string[] = [];
  if (!t) problems.push('Sem título.');
  if (t && (t.length < min || t.length > max)) problems.push(`${t.length} caracteres (o perfil pede de ${min} a ${max}).`);
  if (ctx.existing.titles.some((x) => lc(x).trim() === lc(t))) problems.push('Já existe outra página com este título.');
  if (/\[|\{\{|lorem/i.test(t)) problems.push('Título com marcador.');
  return mk(ctx, 'title_unique', problems.length === 0, 'Título único e do tamanho certo.', 'Reescreva o título com a intenção da busca e um diferencial real (lugar, serviço, prazo).', problems);
}
function gMeta(ctx: GateContext): GateResult {
  const m = ctx.doc.metaDescription.trim(); const rule = ctx.rules.gates.meta_description;
  const min = rule.value ?? 110; const max = rule.max ?? 170;
  const problems: string[] = [];
  if (!m) problems.push('Sem meta descrição.');
  if (m && (m.length < min || m.length > max)) problems.push(`${m.length} caracteres (o perfil pede de ${min} a ${max}).`);
  if (m && lc(m) === lc(ctx.doc.title)) problems.push('Igual ao título.');
  if (ctx.existing.metas.some((x) => lc(x).trim() === lc(m))) problems.push('Já existe outra página com esta meta descrição.');
  return mk(ctx, 'meta_description', problems.length === 0, 'Meta descrição única.', 'Escreva uma descrição própria que responda ao que a pessoa procurou.', problems);
}
function gCanonical(ctx: GateContext): GateResult {
  const { doc } = ctx; const problems: string[] = [];
  let u: URL | null = null; try { u = new URL(doc.url); } catch { problems.push('URL canônica inválida.'); }
  if (u) { if (u.protocol !== 'https:') problems.push('A URL canônica precisa ser https.'); if (u.search || u.hash) problems.push('A URL canônica não pode ter parâmetros.'); if (!u.pathname.endsWith('/')) problems.push('Sem barra final (o site usa barra final).'); if (!doc.slugPath || !u.pathname.replace(/\/+$/, '').endsWith(doc.slugPath)) problems.push('A URL canônica não corresponde ao endereço semântico.'); }
  return mk(ctx, 'canonical', problems.length === 0, 'Canônica própria, https e igual ao endereço semântico.', 'Use a URL final da página como canônica.', problems);
}
function gHreflang(ctx: GateContext): GateResult {
  const { doc } = ctx; const keys = Object.keys(doc.hreflang || {});
  if (!keys.length) return ctx.hasTranslations ? mk(ctx, 'hreflang', false, 'A página tem traduções mas não tem hreflang.', 'Informe as versões por idioma (com a própria página e x-default).') : info(ctx, 'hreflang', 'Sem traduções: hreflang não se aplica.');
  const tag = parseLanguageTag(doc.language)?.tag || doc.language;
  const c = completeHreflang(doc.hreflang, { selfTag: tag, selfUrl: doc.url });
  const problems: string[] = [];
  if (c.invalid.length) problems.push(`Etiquetas ou endereços inválidos: ${c.invalid.join(', ')}.`);
  if (doc.hreflang[tag] !== doc.url) problems.push('A própria página precisa estar na lista (autorreferência).');
  if (!doc.hreflang['x-default']) problems.push('Falta x-default.');
  return mk(ctx, 'hreflang', problems.length === 0, 'hreflang com autorreferência e x-default.', 'Inclua a própria página e o x-default.', problems);
}
function gOpenGraph(ctx: GateContext): GateResult {
  const og = ctx.doc.images.find((i) => i.slot === 'og' && i.origin !== 'pendente') || ctx.doc.images.find((i) => i.slot === 'hero' && i.origin !== 'pendente');
  const problems: string[] = [];
  if (!og) problems.push('Sem imagem para o cartão social (og:image).');
  else { if (og.width < 1200 || og.height < 630) problems.push(`Imagem social ${og.width}x${og.height}: o ideal é 1200x630 ou maior.`); if (!og.alt) problems.push('Imagem social sem alt.'); }
  return mk(ctx, 'open_graph', problems.length === 0, 'Open Graph e cartão do X completos.', 'Gere ou escolha uma imagem social 1200x630.', problems);
}
const gRobots = (ctx: GateContext): GateResult => mk(ctx, 'robots', !ctx.doc.noindex, 'Página indexável.', 'A página está marcada noindex. Se não for intencional, libere a indexação.');
function gSchema(ctx: GateContext): GateResult {
  const probs = validateGraph(ctx.schema.graph, { seoPlugin: ctx.doc.seoPlugin }).map((p) => p.text);
  const types = typesOf(ctx.schema.graph);
  if (ctx.schema.graph) {
    if (!ctx.doc.seoPlugin && !types.some((t) => ['WebPage', 'CollectionPage'].includes(t))) probs.push('Falta WebPage.');
    if (['servico', 'local'].includes(ctx.doc.type) && ctx.doc.subject && !types.includes('Service')) probs.push('Página de serviço sem Service.');
    if (ctx.doc.type === 'guia' && !ctx.doc.seoPlugin && !types.includes('Article')) probs.push('Guia sem Article.');
    if (ctx.doc.type !== 'guia' && types.includes('Article')) probs.push('Article em página que não é guia.');
  }
  return mk(ctx, 'schema_graph', probs.length === 0, 'Grafo único, sem duplicidade.', 'Gere o schema pelo Estúdio (um só @id por entidade) e desative o schema duplicado do tema.', probs);
}
function gBreadcrumb(ctx: GateContext): GateResult {
  const { doc } = ctx; const problems: string[] = [];
  if (doc.breadcrumbs.length < 2) problems.push('Trilha com menos de 2 níveis.');
  else {
    const last = doc.breadcrumbs[doc.breadcrumbs.length - 1];
    if (last.url !== doc.url) problems.push('O último item da trilha não é a própria página.');
    const levels = doc.slugPath.split('/').filter(Boolean);
    if (doc.breadcrumbs.length !== levels.length + 1) problems.push('A trilha não segue a hierarquia do endereço.');
    if (doc.breadcrumbs.some((c) => !/^https:\/\//.test(c.url))) problems.push('Item da trilha sem URL real.');
  }
  return mk(ctx, 'breadcrumb', problems.length === 0, 'Trilha igual à hierarquia do endereço.', 'Gere a trilha a partir do endereço semântico.', problems);
}
function gFaq(ctx: GateContext): GateResult {
  const { doc } = ctx;
  if (!doc.faq.length) return info(ctx, 'faq_schema', 'Sem FAQ: nada a marcar.');
  const inText = doc.faq.filter((f) => lc(htmlToText(doc.bodyHtml)).includes(lc(f.q).trim()));
  const has = typesOf(ctx.schema.graph).includes('FAQPage');
  const problems: string[] = [];
  if (inText.length < doc.faq.length) problems.push(`${doc.faq.length - inText.length} pergunta(s) do FAQ não aparecem no texto da página.`);
  if (inText.length >= 2 && !has && !doc.seoPlugin) problems.push('FAQ real sem FAQPage (informativo).');
  return mk(ctx, 'faq_schema', problems.length === 0, 'FAQPage só com perguntas que estão na página (informativo: o Google aposentou o rich result em 05/2026).', 'Mostre as perguntas na página ou retire-as do schema.', problems);
}
function gSitemap(ctx: GateContext): GateResult {
  const { doc } = ctx; const now = ctx.nowMs ?? Date.now(); const problems: string[] = [];
  const mod = Date.parse(doc.dateModified || ''); const pub = Date.parse(doc.datePublished || '');
  if (!Number.isFinite(mod)) problems.push('Sem data de modificação real para o lastmod.');
  else { if (mod > now + 86_400_000) problems.push('Data de modificação no futuro.'); if (Number.isFinite(pub) && mod < pub) problems.push('Modificação anterior à publicação.'); }
  if (doc.noindex) problems.push('Página noindex não entra no sitemap.');
  return mk(ctx, 'sitemap_entry', problems.length === 0, 'Entra no sitemap com lastmod real.', 'Registre a data real da última alteração; o sitemap usa essa data.', problems);
}
function gInternal(ctx: GateContext): GateResult {
  const { doc } = ctx; const min = gateValue(ctx.rules, 'internal_links', 3);
  const inBody = extractLinks(doc.bodyHtml, doc.origin).internal.filter((l) => l.url.replace(/\/+$/, '') !== doc.url.replace(/\/+$/, ''));
  const planned = doc.links.filter((l) => l.kind === 'interno');
  const targets = new Set([...inBody.map((l) => l.url), ...planned.map((l) => l.url)]);
  const problems: string[] = [];
  if (targets.size < min) problems.push(`${targets.size} link(s) interno(s) distintos; o perfil pede ${min}.`);
  if (ctx.inboundPlanned < 1) problems.push('Nenhuma página aponta para esta: seria página órfã. Planeje o link de entrada (do hub ou de uma página forte).');
  const own = [...inBody.map((l) => ({ to: l.url, anchor: l.anchor })), ...planned.map((l) => ({ to: l.url, anchor: l.anchor })), ...(ctx.siteLinks || [])];
  const v = anchorVariety(own);
  problems.push(...v.problems.map((p) => `Âncoras repetidas: ${p}.`));
  return mk(ctx, 'internal_links', problems.length === 0, 'Links internos suficientes, sem órfã e com âncoras variadas.', 'Use o plano de links: hub, páginas fortes do tema e âncoras diferentes.', problems);
}
function gExternal(ctx: GateContext): GateResult {
  const { doc } = ctx; const min = gateValue(ctx.rules, 'external_links', 1);
  const ext = extractLinks(doc.bodyHtml, doc.origin).external;
  const all = [...ext.map((e) => ({ url: e.url, anchor: e.anchor })), ...doc.links.filter((l) => l.kind === 'externo').map((l) => ({ url: l.url, anchor: l.anchor }))];
  const uniq = [...new Map(all.map((e) => [e.url, e])).values()];
  const problems: string[] = [];
  if (uniq.length < min) problems.push(`${uniq.length} fonte(s) externa(s); o perfil pede ${min}. Sem fonte oficial a página vira opinião.`);
  const kw = new Set(ctx.keywords.map(lc));
  for (const e of uniq) {
    let host = ''; try { host = new URL(e.url).hostname; } catch { problems.push(`Link inválido: ${e.url}`); continue; }
    const checked = ctx.linkChecks?.[e.url];
    if (!isOfficialHost(host) && checked !== true) problems.push(`${host}: não é fonte oficial e não foi verificada (HEAD/200).`);
    if (checked === false) problems.push(`${e.url}: não respondeu 200.`);
    if (kw.has(lc(e.anchor))) problems.push(`Âncora "${e.anchor}" é a palavra-chave da página: use o nome da fonte.`);
  }
  return mk(ctx, 'external_links', problems.length === 0, 'Fontes oficiais ou referências verificadas, âncora descritiva.', 'Cite o órgão oficial (lei, tribunal, ministério) e verifique o link.', problems);
}
function gAeo(ctx: GateContext): GateResult {
  const { doc } = ctx; const lang = LANGUAGES[doc.language.slice(0, 2).toLowerCase()] || null;
  const paras = paragraphsOf(doc.bodyHtml); const hs = headingsOf(doc.bodyHtml);
  const problems: string[] = [];
  const firstP = paras[0] || '';
  const fw = words(firstP);
  if (!fw) problems.push('Sem parágrafo de resposta direta no começo.');
  else if (fw > 70) problems.push(`A resposta direta tem ${fw} palavras; abra com 30 a 60 palavras que respondem à busca.`);
  const content = hs.filter((h) => h.level >= 2 && !STRUCTURAL_HEADING.test(h.text));
  const q = content.filter((h) => isQuestionHeading(h.text, lang));
  if (content.length >= 3 && q.length < 2) problems.push('Poucos títulos em forma de pergunta real (as pessoas e as IAs buscam por perguntas).');
  return mk(ctx, 'aeo_blocks', problems.length === 0, 'Resposta direta no início e perguntas reais nos títulos.', 'Abra com a resposta curta e transforme títulos em perguntas que o público faz.', problems);
}
function gGeo(ctx: GateContext): GateResult {
  const { doc, profile } = ctx; const text = htmlToText(doc.bodyHtml); const lang = LANGUAGES[doc.language.slice(0, 2).toLowerCase()] || null;
  const problems: string[] = [];
  if (profile.name && !lc(text).includes(lc(profile.name))) problems.push('A página não diz quem é a entidade (nome do negócio) no texto.');
  const sentences = sentencesOf(text);
  const attributed = sentences.filter((s) => /\d/.test(s) && (lang?.sourcePhrases.some((r) => new RegExp(r.source, 'i').test(s)) || /\b(?:lei|art\.?|resolu[cç][aã]o|portaria|section|article|ley|loi|gesetz)\b/i.test(s) || /https?:\/\//.test(s)));
  const factsUsed = ctx.usedFactIds.length;
  if (!attributed.length && factsUsed === 0) problems.push('Sem fato citável com atribuição (número, norma ou prazo com a fonte ao lado).');
  if (!ctx.schema.graph) problems.push('Sem schema para identificar a entidade às máquinas.');
  return mk(ctx, 'geo_entity', problems.length === 0, 'Entidade clara e fatos citáveis com origem.', 'Nomeie a entidade e traga ao menos um fato verificável com a fonte (lei, órgão, prazo).', problems);
}
function gEeat(ctx: GateContext): GateResult {
  const a = ctx.doc.author; const problems: string[] = [];
  if (!a || !a.name.trim()) problems.push('Sem autor. Cadastre a pessoa real no Perfil (o sistema não inventa autor).');
  else { if (isGenericAuthor(a.name) || lc(a.name) === lc(ctx.profile.name)) problems.push('Autor genérico ("Redação", "Equipe") ou igual à empresa.'); if (!a.credential) problems.push('Autor sem credencial (formação, registro profissional).'); }
  return mk(ctx, 'eeat_author', problems.length === 0, 'Autor real com credencial.', 'Cadastre o autor e a credencial (ex.: registro profissional) no Perfil do Projeto.', problems);
}
function gA11y(ctx: GateContext): GateResult {
  const { doc } = ctx; const full = fullDoc(ctx); const problems: string[] = [];
  for (const m of full.matchAll(/<img\b[^>]*>/gi)) { if (!/\balt\s*=\s*"[^"]+"/i.test(m[0])) problems.push('Imagem sem texto alternativo.'); if (!/\bwidth=/.test(m[0]) || !/\bheight=/.test(m[0])) problems.push('Imagem sem width/height (causa deslocamento de layout).'); }
  for (const l of extractLinks(doc.bodyHtml, doc.origin).internal.concat(extractLinks(doc.bodyHtml, doc.origin).external as never)) if (GENERIC_LINK_TEXT.test(l.anchor.trim())) problems.push(`Texto de link genérico: "${l.anchor}".`);
  for (const m of doc.bodyHtml.matchAll(/<a\b[^>]*>\s*<\/a>/gi)) problems.push(`Link sem texto: ${m[0].slice(0, 40)}.`);
  if (/<(?:input|textarea|select)\b(?![^>]*\baria-label)/i.test(doc.bodyHtml) && !/<label\b/i.test(doc.bodyHtml)) problems.push('Campo de formulário sem rótulo.');
  if (/<[^>]+style="[^"]*(?:display:\s*none|font-size:\s*[0-8]px)/i.test(doc.bodyHtml)) problems.push('Texto escondido ou minúsculo.');
  return mk(ctx, 'accessibility', problems.length === 0, 'Idioma, alt, rótulos e textos de link adequados (contraste não é medido aqui).', 'Corrija os itens listados; contraste e leitor de tela precisam de teste manual.', [...new Set(problems)]);
}
function gPerf(ctx: GateContext): GateResult {
  const { doc } = ctx; const rule = ctx.rules.gates.perf_budget; const full = fullDoc(ctx);
  const kb = Math.round(new TextEncoder().encode(full).length / 1024);
  const maxHtml = rule.value ?? 120; const maxImg = rule.max ?? 450; const problems: string[] = [];
  if (kb > maxHtml) problems.push(`HTML com ${kb} KB (orçamento ${maxHtml} KB).`);
  const scripts = [...full.matchAll(/<script\b([^>]*)>/gi)].filter((m) => !/application\/ld\+json/i.test(m[1]));
  if (scripts.length) problems.push(`${scripts.length} script(s) além do JSON-LD: a página deve funcionar sem JavaScript.`);
  if (/<link[^>]+rel="stylesheet"|@import|fonts\.googleapis/i.test(full)) problems.push('Folha de estilo ou fonte externa (requisição extra).');
  const imgs = doc.images.filter((i) => i.origin !== 'pendente');
  const total = imgs.reduce((a, i) => a + (i.bytes || 0), 0) / 1024;
  if (total > maxImg) problems.push(`Imagens somam ${Math.round(total)} KB (orçamento ${maxImg} KB).`);
  for (const i of imgs) if (!MODERN.has(i.format)) problems.push(`${i.filename}: use WebP ou AVIF.`);
  if (imgs.filter((i) => i.slot === 'inline').some((i) => i.lazy === false)) problems.push('Imagem abaixo da dobra sem carregamento tardio.');
  return mk(ctx, 'perf_budget', problems.length === 0, `Dentro do orçamento (${kb} KB de HTML, sem JavaScript).`, 'Reduza o HTML, retire scripts e use imagens WebP/AVIF.', problems);
}
function gCta(ctx: GateContext): GateResult {
  const { doc, profile } = ctx;
  if (!['landing', 'servico', 'local', 'pagina'].includes(doc.type)) return info(ctx, 'cta_tracking', 'Tipo de página sem CTA obrigatório.');
  const problems: string[] = [];
  const hasCta = /href="(?:tel:|mailto:|https?:\/\/(?:wa\.me|api\.whatsapp\.com))/i.test(doc.bodyHtml) || /<a\b[^>]*data-zica-cta/i.test(doc.bodyHtml);
  if (!hasCta) problems.push(profile.phones.length || profile.whatsapp || profile.email ? 'Sem chamada para contato (telefone, WhatsApp ou e-mail do Perfil).' : 'Sem chamada para contato e o Perfil não tem telefone, WhatsApp ou e-mail: cadastre um canal.');
  for (const m of doc.bodyHtml.matchAll(/<a\b([^>]*href="(?:tel:|mailto:|https?:\/\/(?:wa\.me|api\.whatsapp\.com))[^>]*)>/gi)) if (!/data-zica-cta="(?:whatsapp|phone|email|form)"/.test(m[1])) problems.push('Link de contato sem data-zica-cta (o clique não será medido).');
  for (const q of findBrokenContactCtas(doc.bodyHtml)) problems.push(q.label);
  return mk(ctx, 'cta_tracking', problems.length === 0, 'Chamada para contato com rastreio de clique.', 'Use data-zica-cta="whatsapp|phone|email|form" nos botões; só o tipo do contato é medido.', [...new Set(problems)]);
}
function gNap(ctx: GateContext, bank: FactBank): GateResult {
  const { doc, profile } = ctx; const problems: string[] = [];
  for (const d of phonesInHtml(doc.bodyHtml)) if (!phoneKnown(d, bank)) problems.push(`Telefone ${d} que não está no Perfil (conflito de contato prejudica Google Maps, schema e citação por IA).`);
  const text = htmlToText(doc.bodyHtml);
  if (/(?:atend\w*|plant[aã]o|abert[oa]s?|funcion\w*|open|available|dispon[ií]vel)[^.]{0,40}\b24\s?(?:h|horas|hours|hrs)\b|plant[aã]o 24|24\/7|24 hours a day|open 24/i.test(text) && !/24/.test(profile.hours || '')) problems.push('A página fala em atendimento 24 horas, mas o horário do Perfil não é 24 horas.');
  const hoursInText = [...text.matchAll(/\b(\d{1,2})\s?(?:h|:)\s?(\d{2})?\s*(?:às|a|-|to|–)\s*(\d{1,2})\s?(?:h|:)?\s?(\d{2})?/gi)].map((m) => m[0]);
  if (hoursInText.length && !profile.hours) problems.push(`Horário no texto ("${hoursInText[0]}") sem horário cadastrado no Perfil.`);
  if (hoursInText.length && profile.hours) { const ph = profile.hours.replace(/\D/g, ''); for (const h of hoursInText) { const dg = h.replace(/\D/g, ''); if (dg && !ph.includes(dg.slice(0, 2)) ) problems.push(`Horário no texto ("${h}") diferente do Perfil.`); } }
  return mk(ctx, 'nap_consistency', problems.length === 0, 'Telefone, endereço e horário iguais ao Perfil.', 'Use só os dados de contato do Perfil; mude o dado no Perfil, não na página.', problems);
}
function gCompliance(ctx: GateContext): GateResult {
  const opts = ctx.rules.base.options;
  if (opts.compliance_mode === 'desligado') return { id: 'compliance', label: GATE_LABELS.compliance, level: 'desligado', status: 'desligado', note: 'Conformidade do segmento desligada.', fix: null };
  const lang = parseLanguageTag(ctx.doc.language);
  const pack = resolvePack(opts.compliance_pack, ctx.profile.segment || ctx.doc.segment, { code: lang?.code, region: lang?.region });
  const res = ctx.compliance !== undefined ? ctx.compliance : runPack(pack, opts.compliance_mode, { title: ctx.doc.title, content: ctx.doc.bodyHtml, excerpt: ctx.doc.metaDescription, brand: ctx.profile.name });
  if (!res || !res.pack) return info(ctx, 'compliance', 'Sem pacote de conformidade para este segmento (nenhuma verificação).');
  const items = res.warnings.map((w: QualityIssue) => `${w.label}${w.sample ? `: "${w.sample}"` : ''}`);
  const base = mk(ctx, 'compliance', res.warnings.length === 0, `Pacote ${res.pack}: nada encontrado (orientação, não parecer jurídico).`, 'Reescreva o trecho de forma informativa e neutra; a decisão final é de quem responde pela publicidade.', items);
  // por padrão é AVISO; só o modo "rigido" escolhido por quem responde pelo projeto transforma em falha
  if (res.warnings.length && res.blocking) return { ...base, status: 'falha' };
  if (res.warnings.length) return { ...base, status: 'aviso' };
  return base;
}
function gAi(ctx: GateContext, ai: AiReport): GateResult {
  const max = gateValue(ctx.rules, 'ai_patterns', 35);
  const top = ai.findings.slice(0, 5).map((f) => `${f.label}: "${f.excerpt}"`);
  return mk(ctx, 'ai_patterns', ai.score <= max, `Nota de "cara de IA" ${ai.score} (máximo aceito ${max}).`, 'Reescreva os trechos marcados com fatos concretos; o Estúdio reescreve em passos pequenos dentro do teto de gasto.', ai.score <= max ? [] : [`Nota ${ai.score} (máximo ${max}).`, ...top]);
}
function gUnique(ctx: GateContext, d: DoorwayReport): GateResult {
  if (!ctx.siblings.length) return info(ctx, 'unique_content', 'Sem páginas irmãs para comparar.');
  const min = gateValue(ctx.rules, 'unique_content', 60);
  return mk(ctx, 'unique_content', d.uniquePct >= min, `${d.uniquePct}% do texto é próprio (mínimo ${min}%).`, 'Troque trechos repetidos por fatos e exemplos próprios desta página.', d.uniquePct >= min ? [] : [`Só ${d.uniquePct}% é próprio; mais parecida: ${d.mostSimilar?.label ?? '-'} (${Math.round(d.maxSimilarity * 100)}%).`]);
}
function gDoorway(ctx: GateContext, d: DoorwayReport): GateResult {
  return mk(ctx, 'doorway', d.verdict !== 'porta', 'Não é página de porta.', d.proposal || 'Consolide páginas quase iguais.', d.verdict === 'porta' ? d.reasons : []);
}
function gLocalFacts(ctx: GateContext): GateResult {
  if (ctx.doc.type !== 'local') return info(ctx, 'local_facts', 'Só páginas locais exigem fatos locais.');
  const min = gateValue(ctx.rules, 'local_facts', 3);
  const used = ctx.fieldFacts.filter((f) => f.approved && ctx.usedFactIds.includes(f.id) && !!f.source_url);
  return mk(ctx, 'local_facts', used.length >= min, `${used.length} fato(s) local(is) aprovado(s) e com fonte usados (mínimo ${min}).`, 'Cadastre e aprove fatos reais do lugar (órgãos, endereços, prazos) com a fonte. Sem eles a página local não deve existir.', used.length >= min ? [] : [`Só ${used.length} de ${min} fatos locais aprovados com fonte.`]);
}
function gInvention(ctx: GateContext, issues: InventionIssue[]): GateResult {
  const blocking = issues.filter((i) => i.severity === 'bloqueia');
  const review = issues.filter((i) => i.severity === 'revisar');
  const r = mk(ctx, 'no_invention', blocking.length === 0, 'Tudo o que a página afirma tem origem nos dados fornecidos.', 'Remova ou substitua o trecho por dado real do Perfil/fatos aprovados; o que faltar fica como pendência.', blocking.map((i) => `${i.why} "${i.excerpt}"`));
  if (r.status === 'ok' && review.length) return { ...r, note: `Nomes a conferir: ${review.slice(0, 4).map((i) => i.excerpt).join(', ')}.`, details: review.map((i) => `${i.why} "${i.excerpt}"`) };
  return r;
}
function gResidue(ctx: GateContext): GateResult {
  const { doc } = ctx; const problems: string[] = [];
  const pend = extractPendingMarkers(doc.bodyHtml);
  if (pend.length) problems.push(...pend.map((p) => `Pendência no texto: ${p}.`));
  for (const r of findPublicationResidues({ title: doc.title, content: doc.bodyHtml, excerpt: doc.metaDescription })) problems.push(r.label);
  if (MD_RESIDUE.test(doc.bodyHtml)) problems.push('Marcação markdown crua no texto.');
  if (/lorem ipsum|\{\{[^}]+\}\}|\bas an ai language model\b|como um modelo de linguagem|claro! aqui est[aá]|certainly! here|\[inserir |\[insert /i.test(htmlToText(doc.bodyHtml))) problems.push('Resíduo de prompt ou modelo.');
  return mk(ctx, 'no_residue', problems.length === 0, 'Sem resíduo, placeholder ou markdown cru.', 'Resolva as pendências e remova os resíduos antes de aprovar.', [...new Set(problems)]);
}
function gImages(ctx: GateContext): GateResult {
  const imgs = ctx.doc.images; const problems: string[] = [];
  const hero = imgs.find((i) => i.slot === 'hero');
  if (!hero || hero.origin === 'pendente') problems.push('Sem imagem principal (pendente).');
  for (const i of imgs.filter((x) => x.origin !== 'pendente')) {
    if (!i.alt.trim()) problems.push(`${i.filename}: sem alt.`);
    else { if (i.alt.length > 125) problems.push(`${i.filename}: alt com mais de 125 caracteres.`); if (/^(?:imagem|foto|image|photo|picture|imagen)\b(?: de| of)?/i.test(i.alt.trim()) || lc(i.alt) === lc(i.filename.replace(/\.\w+$/, '').replace(/-/g, ' '))) problems.push(`${i.filename}: alt genérico; descreva o que a imagem mostra.`); }
    if (/^(?:img|dsc|image|screenshot|[0-9a-f]{8}-)[-_ ]?\d*/i.test(i.filename) && !/[a-z]{4,}-[a-z]{3,}/i.test(i.filename)) problems.push(`${i.filename}: nome de arquivo sem significado.`);
    if (!i.width || !i.height) problems.push(`${i.filename}: sem dimensões.`);
  }
  return mk(ctx, 'images', problems.length === 0, 'Imagens com alt, nome semântico e dimensões.', 'Escolha do acervo ou gere pela política do projeto e descreva cada imagem.', problems);
}
function gWords(ctx: GateContext): GateResult {
  const rule = ctx.rules.gates.words; const n = words(htmlToText(ctx.doc.bodyHtml));
  const problems: string[] = [];
  if (rule.value && n < rule.value) problems.push(`${n} palavras (definido pelo perfil de regras: ${rule.value} ou mais).`);
  if (rule.max && n > rule.max) problems.push(`${n} palavras (máximo ${rule.max}).`);
  return mk(ctx, 'words', problems.length === 0, `${n} palavras.`, 'O tamanho vem do perfil de regras/prompt do projeto: ajuste o texto ou a regra.', problems);
}

/** Roda todos os portões. */
export function runGates(ctx: GateContext): QualityReport {
  const allowedUrls = [...ctx.doc.links.map((l) => l.url), ...ctx.doc.sources.map((s) => s.url)];
  const bank = buildFactBank({ profile: ctx.profile, fieldFacts: ctx.fieldFacts, sources: ctx.doc.sources, ownOrigin: ctx.doc.origin, allowedUrls, extra: ctx.doc.faq.length ? [] : [] });
  const ai = detectAiPatterns(ctx.doc.bodyHtml, ctx.doc.language);
  const nowYear = new Date(ctx.nowMs ?? Date.now()).getUTCFullYear();
  const invention = guardInvention(ctx.doc.bodyHtml, bank, { nowYear, allowedUrls, ownOrigin: ctx.doc.origin });
  const minWords = ctx.rules.gates.words.level !== 'desligado' ? ctx.rules.gates.words.value ?? null : null;
  const doorway = assessDoorway({ html: ctx.doc.bodyHtml, place: ctx.doc.place, type: ctx.doc.type }, ctx.siblings, {
    minUniquePct: gateOn(ctx.rules, 'unique_content') ? gateValue(ctx.rules, 'unique_content', 60) : null,
    maxSimilarityPct: gateOn(ctx.rules, 'doorway') ? gateValue(ctx.rules, 'doorway', 70) : null,
    minWords,
  });
  const by: Record<GateId, GateResult> = {
    html_semantic: gHtmlSemantic(ctx), title_unique: gTitle(ctx), meta_description: gMeta(ctx), canonical: gCanonical(ctx), hreflang: gHreflang(ctx), open_graph: gOpenGraph(ctx),
    robots: gRobots(ctx), schema_graph: gSchema(ctx), breadcrumb: gBreadcrumb(ctx), faq_schema: gFaq(ctx), sitemap_entry: gSitemap(ctx), internal_links: gInternal(ctx), external_links: gExternal(ctx),
    aeo_blocks: gAeo(ctx), geo_entity: gGeo(ctx), eeat_author: gEeat(ctx), accessibility: gA11y(ctx), perf_budget: gPerf(ctx), cta_tracking: gCta(ctx), nap_consistency: gNap(ctx, bank),
    compliance: gCompliance(ctx), ai_patterns: gAi(ctx, ai), unique_content: gUnique(ctx, doorway), doorway: gDoorway(ctx, doorway), local_facts: gLocalFacts(ctx), no_invention: gInvention(ctx, invention),
    no_residue: gResidue(ctx), images: gImages(ctx), words: gWords(ctx),
  };
  const results = GATE_IDS.map((id) => by[id]);
  const active = results.filter((r) => r.status !== 'desligado' && r.status !== 'info');
  const ok = active.filter((r) => r.status === 'ok').length;
  const warn = active.filter((r) => r.status === 'aviso').length;
  const blocking = results.filter((r) => r.status === 'falha').map((r) => r.id);
  return {
    results, blocking, warnings: results.filter((r) => r.status === 'aviso').map((r) => r.id), ok, active: active.length,
    score: active.length ? Math.round(((ok + warn * 0.5) / active.length) * 100) : 100, complete: blocking.length === 0, ai, doorway, invention,
    pendings: extractPendingMarkers(ctx.doc.bodyHtml), generated_at: new Date(ctx.nowMs ?? Date.now()).toISOString(),
  };
}

export const gateById = (r: QualityReport, id: GateId): GateResult => r.results.find((x) => x.id === id)!;
export type { StudioGraph };
