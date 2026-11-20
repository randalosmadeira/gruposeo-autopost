/**
 * Curadoria de conteúdo: núcleo puro (sem rede, sem banco, sem IA, sem custo).
 *
 * Todo artigo que ainda não saiu (em criação, na fila, finalizado) é auditado pelos módulos do sistema, UM item por módulo:
 *   perfil, funil, taxonomia, dominio, backlinks, mercado, radar, indexacao, estudio, piloto, observatorio e imagens.
 * Cada item é { modulo, estado: 'ok' | 'aviso' | 'pendencia' | 'sem_dados', motivo_em_portugues, fonte }.
 *
 * Regras duras (pedido do dono, 20/11/2026):
 *  - imagem REPETIDA (a mesma imagem em mais de 1 artigo do projeto) ou AUSENTE => estado geral `bloqueado`: o artigo não pode ser publicado;
 *  - tamanho, mínimos e o resto da conformidade são FLEXÍVEIS: só avisam;
 *  - nunca inventa dado: sem informação de origem o item é `sem_dados` e diz o que falta; fonte, autor e número nunca são preenchidos;
 *  - tudo que é correspondência por palavras (perfil, taxonomia, mercado, radar, observatório, relevância da imagem) é HEURÍSTICA e vem rotulado.
 *
 * Reaproveita, sem reimplementar: detector anti-IA do Estúdio de Páginas (studio-ai-detector), resíduos e CTAs quebrados da publicação
 * (publication-safety/publication-quality), a análise de SEO e o Piloto Automático (auto-optimize-core: só a parte DETERMINÍSTICA, que não usa IA)
 * e o Perfil do Projeto (studio-profile). As portas técnicas do Estúdio (runGates) pedem uma StudioPageDoc de página; artigo de blog não é isso, então
 * não são reimplementadas aqui (o detector anti-IA, as regras de publicação e a análise do Piloto cobrem o que se aplica a artigo).
 */
import { detectAiPatterns, htmlToText, headingsOf } from './studio-ai-detector.ts';
import { findPublicationResidues } from './publication-safety.ts';
import { findBrokenContactCtas } from './publication-quality.ts';
import { analyzeWorking, newJob, runDeterministic, sha256Hex, type PilotInput } from './auto-optimize-core.ts';
import { defaultProfile, type RuleProfile } from './optimization-rules.ts';
import { resolveLanguage } from './language-packs.ts';
import type { LinkCandidate } from './auto-optimize-fixes.ts';
import type { ProfileFacts } from './studio-types.ts';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** Muda quando as regras da curadoria mudam: curadoria gravada com versão antiga deixa de valer. */
export const CURADORIA_VERSION = 1;

/**
 * Espelho dos números de `image-policy.ts` (política de imagem 2026-09). O arquivo da política importa um codec por URL do Deno e não carrega fora dele,
 * então os números ficam aqui e um teste confere a igualdade com o arquivo (mesmo padrão de src/lib/image-policy.ts).
 */
export const IMAGE_RULES = { min_width: 1200, min_pixels: 300_000, max_bytes: 150 * 1024 } as const;

export type ItemState = 'ok' | 'aviso' | 'pendencia' | 'sem_dados';
export type OverallState = 'aprovado' | 'precisa_correcao' | 'bloqueado';
export type ImageState = 'ok' | 'aviso' | 'repetida' | 'ausente';
export const CURATION_MODULES = ['perfil', 'funil', 'taxonomia', 'dominio', 'backlinks', 'mercado', 'radar', 'indexacao', 'estudio', 'piloto', 'observatorio', 'imagens'] as const;
export type CurationModule = (typeof CURATION_MODULES)[number];

export interface CurationItem {
  modulo: CurationModule;
  estado: ItemState;
  motivo_em_portugues: string;
  fonte: string;
  /** só no item de imagens: este item impede a publicação */
  bloqueia?: boolean;
  detalhes?: string[];
}

// ---------------------------------------------------------------------------------------------------------------- entrada

export interface CurationArticle {
  id: string;
  project_id: string | null;
  organization_id?: string | null;
  title: string | null;
  keyword: string | null;
  secondary_keywords?: string[] | null;
  excerpt: string | null;
  content: string | null;
  slug: string | null;
  status: string;
  language?: string | null;
  type?: string | null;
  featured_image_url: string | null;
  image_prompt?: string | null;
  image_source?: string | null;
  nicho_detectado?: string | null;
  published_url?: string | null;
  config?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TaxNode { id: string; label: string; slug?: string | null; kind?: string | null; keywords?: string[] | null; status?: string | null }
export interface GeoScopeRow { uf?: string | null; municipio?: string | null; bairro?: string | null; regiao?: string | null; status?: string | null }
export interface PromptRef { id: string; query: string; topic?: string | null; intent?: string | null; set_name?: string | null }
export interface TextRef { id: string; label: string; kind?: string }

export interface CurationContext {
  now: number;
  project: Record<string, unknown> | null;
  /** Perfil do Projeto (studio-profile). null = projeto sem perfil lido. */
  profile: ProfileFacts | null;
  rules?: RuleProfile;
  /** null = módulo não instalado/sem leitura; configured=false = existe mas o projeto não configurou */
  funnel: { configured: boolean; template?: string | null } | null;
  taxonomy: TaxNode[] | null;
  geo: GeoScopeRow[] | null;
  /** perguntas do Observatório de IA (nexus_prompts ativos) */
  prompts: PromptRef[] | null;
  /** buscas mapeadas pelo módulo de Mercado (market_queries) */
  market: TextRef[] | null;
  /** focos e temas acompanhados pelo Radar de Mercado */
  radar: TextRef[] | null;
  /** índice de indexação por URL normalizada (index_urls + index_status); null = módulo sem dado */
  indexation: Record<string, { indexed: boolean | null; detail?: string }> | null;
  /** backlinks conhecidos por URL de destino normalizada; null = módulo sem dado */
  backlinks: Record<string, number> | null;
  /** links que apontam PARA cada URL de artigo do projeto (entrada); null = não medido */
  inbound: Record<string, number> | null;
  siteHost: string | null;
  candidates: LinkCandidate[];
  /** chave normalizada da imagem -> ids dos artigos do projeto que a usam (todos os status) */
  imageUsage: Map<string, string[]>;
  /** quantos artigos do projeto podem dividir a mesma imagem (padrão 1; portais de notícia podem permitir mais) */
  maxImageUses?: number;
}

// ---------------------------------------------------------------------------------------------------------------- texto

const strip = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'sem', 'sobre', 'e', 'ou', 'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'ao', 'aos', 'que', 'se', 'ser', 'ter',
  'como', 'qual', 'quais', 'quando', 'onde', 'quanto', 'quantos', 'porque', 'pode', 'posso', 'devo', 'preciso', 'fazer', 'mais', 'muito', 'sua', 'seu', 'suas', 'seus', 'meu', 'minha', 'isso', 'esse', 'essa',
  'the', 'and', 'for', 'with', 'how', 'what', 'when', 'where', 'your', 'you', 'are', 'can', 'los', 'las', 'del', 'por', 'una',
]);
/** palavras significativas (sem acento, sem artigos, sem plural simples), únicas */
export function tokens(text: unknown): string[] {
  const out = new Set<string>();
  for (const raw of strip(text).split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw)) continue;
    out.add(raw.length > 4 && raw.endsWith('s') ? raw.slice(0, -1) : raw);
  }
  return [...out];
}
const tokenSet = (text: unknown) => new Set(tokens(text));

/** uma pergunta/busca "está coberta" quando a maioria das palavras dela aparece no texto-foco do artigo (rótulo: heurística) */
export function covers(queryTokens: string[], textTokens: Set<string>): { ok: boolean; matched: string[] } {
  const matched = queryTokens.filter((t) => textTokens.has(t));
  const total = queryTokens.length;
  if (!total) return { ok: false, matched };
  const ok = total <= 2 ? matched.length === total : matched.length >= 2 && matched.length / total >= 0.6;
  return { ok, matched };
}

const HEUR = 'heurística por palavras (não prova que o texto responde de verdade)';

/** texto em que o artigo "se posiciona": título, palavra-chave, secundárias, títulos de seção e resumo (não o corpo inteiro) */
export function focusTokens(a: CurationArticle): Set<string> {
  const heads = headingsOf(String(a.content || '')).map((h) => h.text).join(' ');
  return tokenSet([a.title, a.keyword, ...(a.secondary_keywords || []), heads, a.excerpt].filter(Boolean).join(' '));
}

// ---------------------------------------------------------------------------------------------------------------- imagem

/** Chave da imagem: igual para a mesma imagem mesmo com parâmetros, formato derivado (-1200x675.webp) ou rota de render. */
export function imageKey(url: unknown): string | null {
  const v = String(url ?? '').trim();
  if (!v) return null;
  if (/^data:/i.test(v)) return `data:${v.length}:${v.slice(0, 96)}:${v.slice(-48)}`;
  try {
    const u = new URL(v);
    let p = u.pathname.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/');
    try { p = decodeURIComponent(p); } catch { /* mantém o caminho cru */ }
    p = p.replace(/-\d{2,4}x\d{2,4}(?=\.[a-z0-9]+$)/i, '').replace(/\.[a-z0-9]+$/i, '');
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${p.toLowerCase()}`;
  } catch { return v.toLowerCase().split(/[?#]/)[0].replace(/\.[a-z0-9]+$/i, ''); }
}

/** monta o uso das imagens: chave -> ids de artigos (um id por artigo) */
export function buildImageUsage(rows: Array<{ id: string; featured_image_url?: string | null }>): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of rows) {
    const k = imageKey(r.featured_image_url);
    if (!k) continue;
    const list = m.get(k) || [];
    if (!list.includes(r.id)) list.push(r.id);
    m.set(k, list);
  }
  return m;
}

export interface ImageReport {
  estado: ImageState;
  chave: string | null;
  usos: number;
  outros_artigos: string[];
  alt: 'ok' | 'do_titulo' | 'ausente';
  relevancia: 'ok' | 'baixa' | 'sem_dados';
  detalhes: string[];
}

const fileNameTokens = (url: string): string[] => {
  if (!url || /^data:/i.test(url)) return [];
  let name = '';
  try { name = new URL(url).pathname.split('/').pop() || ''; } catch { name = url.split(/[?#]/)[0].split('/').pop() || ''; }
  return tokens(name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')).filter((t) => !/\d/.test(t));
};

export function checkImage(a: CurationArticle, usage: Map<string, string[]>, maxUses = 1): ImageReport {
  const url = String(a.featured_image_url || '').trim();
  const key = imageKey(url);
  const detalhes: string[] = [];
  if (!key) {
    return { estado: 'ausente', chave: null, usos: 0, outros_artigos: [], alt: 'ausente', relevancia: 'sem_dados', detalhes: ['O artigo não tem imagem destacada.'] };
  }
  const ids = new Set([...(usage.get(key) || []), a.id]);
  const outros = [...ids].filter((id) => id !== a.id);
  const usos = ids.size;
  const cfg = (a.config || {}) as Any;
  const geo = (cfg.image_geo && typeof cfg.image_geo === 'object' ? cfg.image_geo : {}) as Any;
  const limite = Math.max(1, Math.floor(maxUses) || 1);
  let estado: ImageState = usos > limite ? 'repetida' : 'ok';
  if (usos > limite) detalhes.push(`A mesma imagem está em ${usos} artigos deste projeto (o limite é ${limite}).`);
  else if (usos > 1) detalhes.push(`A mesma imagem é dividida por ${usos} artigos (dentro do limite de ${limite} deste projeto).`);

  const altText = String(geo.alt_text || '').trim();
  const alt: ImageReport['alt'] = altText ? 'ok' : String(a.title || '').trim() ? 'do_titulo' : 'ausente';
  if (alt === 'do_titulo') { detalhes.push('Sem texto alternativo próprio: na publicação vale o título do artigo.'); if (estado === 'ok') estado = 'aviso'; }
  if (alt === 'ausente') { detalhes.push('Sem texto alternativo e sem título para usar no lugar.'); if (estado === 'ok') estado = 'aviso'; }

  if (/^data:/i.test(url)) { detalhes.push('A imagem está embutida no registro (base64): na publicação ela é reenviada; o ideal é um arquivo no armazenamento.'); if (estado === 'ok') estado = 'aviso'; }
  const hero = (geo.hero && typeof geo.hero === 'object' ? geo.hero : null) as Any;
  if (geo.compliance === 'oversized' || (hero && hero.within_budget === false)) { detalhes.push(`Acima do orçamento de ${Math.round(IMAGE_RULES.max_bytes / 1024)} KB da política de imagem (aviso, não bloqueia).`); if (estado === 'ok') estado = 'aviso'; }
  if (hero && Number(hero.width) > 0 && Number(hero.width) < IMAGE_RULES.min_width) { detalhes.push(`Largura ${hero.width}px, abaixo dos ${IMAGE_RULES.min_width}px pedidos para o Discover (aviso, não bloqueia).`); if (estado === 'ok') estado = 'aviso'; }
  if (!geo.policy_version && !hero) detalhes.push('Sem registro da política de imagem: tamanho e proporção não foram verificados.');

  // relevância ao tema (heurística): palavras do título/palavra-chave x descrição usada para gerar a imagem, origem e nome do arquivo
  const want = tokenSet([a.title, a.keyword].filter(Boolean).join(' '));
  const have = tokenSet([a.image_prompt, a.image_source, geo.alt_text, geo.semantic_filename].filter(Boolean).join(' '));
  for (const t of fileNameTokens(url)) have.add(t);
  let relevancia: ImageReport['relevancia'] = 'sem_dados';
  if (have.size && want.size) {
    const hit = [...want].filter((t) => have.has(t)).length;
    relevancia = hit >= 1 && hit / want.size >= 0.2 ? 'ok' : 'baixa';
    if (relevancia === 'baixa') { detalhes.push(`Pouca relação entre o tema do artigo e a descrição/nome da imagem (${HEUR}).`); if (estado === 'ok') estado = 'aviso'; }
  } else detalhes.push('Sem descrição da imagem (image_prompt/origem/nome do arquivo): relevância ao tema não medida.');
  return { estado, chave: key, usos, outros_artigos: outros.slice(0, 8), alt, relevancia, detalhes };
}

// ---------------------------------------------------------------------------------------------------------------- módulos

const item = (modulo: CurationModule, estado: ItemState, motivo: string, fonte: string, detalhes?: string[]): CurationItem => ({ modulo, estado, motivo_em_portugues: motivo, fonte, ...(detalhes && detalhes.length ? { detalhes } : {}) });
const plain = (a: CurationArticle) => htmlToText(String(a.content || ''));
const hostOf = (u: string): string => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
/** URL sem protocolo, www, parâmetros e barra final */
export const normUrl = (u: unknown): string => { const v = String(u ?? '').trim().toLowerCase(); if (!v) return ''; try { const x = new URL(v); return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`; } catch { return v.replace(/^https?:\/\/(www\.)?/, '').split(/[?#]/)[0].replace(/\/+$/, ''); } };
const list = (xs: string[], n = 3) => xs.slice(0, n).join(', ') + (xs.length > n ? ` e mais ${xs.length - n}` : '');
const isPublished = (a: CurationArticle) => a.status === 'published' || !!a.published_url;

const FUNIL_FUNDO = /\b(contratar|contratacao|quanto custa|preco|valor(?:es)?|honorarios|orcamento|agendar|consulta|escritorio|plantao|urgente|melhor advogado|advogado (?:em|de|para))\b/;
const FUNIL_MEIO = /\b(vale a pena|comparacao|diferenca|versus|\bvs\b|como escolher|quando procurar|criterios|alternativas|pros e contras|opcoes)\b/;
const FUNIL_TOPO = /\b(o que e|como funciona|entenda|guia|passo a passo|saiba|tudo sobre|o que fazer|quais sao|direitos|prazo|significa|conceito)\b/;
/** etapa do funil por heurística de título, palavra-chave e tipo do artigo */
export function funnelStage(a: CurationArticle): { etapa: 'topo' | 'meio' | 'fundo' | null; origem: string } {
  if (a.type === 'sales') return { etapa: 'fundo', origem: 'tipo do artigo (venda)' };
  if (a.type === 'comparison' || a.type === 'review') return { etapa: 'meio', origem: 'tipo do artigo (comparação/avaliação)' };
  const t = strip(`${a.title || ''} ${a.keyword || ''}`);
  if (FUNIL_FUNDO.test(t)) return { etapa: 'fundo', origem: 'palavras do título' };
  if (FUNIL_MEIO.test(t)) return { etapa: 'meio', origem: 'palavras do título' };
  if (FUNIL_TOPO.test(t)) return { etapa: 'topo', origem: 'palavras do título' };
  return { etapa: null, origem: 'palavras do título' };
}
const STAGE_LABEL = { topo: 'topo (quer entender)', meio: 'meio (compara e avalia)', fundo: 'fundo (quer contratar)' } as const;

function checkPerfil(a: CurationArticle, c: CurationContext, text: string): CurationItem {
  const fonte = 'Perfil do Projeto (segmento, oferta, idiomas, o que nunca dizer); ' + HEUR;
  const p = c.profile;
  if (!p || (!p.segment && !p.offer && !p.never && !p.languages.length)) {
    return item('perfil', 'sem_dados', 'O Perfil do Projeto ainda não tem segmento, oferta, idioma nem regras de voz preenchidos: não há o que comparar com o texto.', fonte);
  }
  const body = tokenSet(`${a.title || ''} ${a.keyword || ''} ${text}`);
  const motivos: string[] = []; const detalhes: string[] = []; let aviso = false;
  const want = tokens(`${p.segment || ''} ${p.offer || ''}`);
  if (want.length) {
    const hit = want.filter((t) => body.has(t));
    if (!hit.length) { aviso = true; motivos.push(`O texto não cita o segmento nem a oferta do Perfil ("${(p.segment || p.offer || '').slice(0, 60)}").`); }
    else detalhes.push(`Cita o conceito do Perfil: ${list(hit)}.`);
  }
  const lang = String(a.language || (a.config as Any)?.language || '').slice(0, 2).toLowerCase();
  const langs = p.languages.map((l) => String(l).slice(0, 2).toLowerCase()).filter(Boolean);
  if (lang && langs.length && !langs.includes(lang)) { aviso = true; motivos.push(`Idioma do artigo (${lang}) fora dos idiomas do Perfil (${langs.join(', ')}).`); }
  const nunca = String(p.never || '').split(/[;\n]|,\s+(?=[A-ZÀ-Ú"“])/).map((s) => strip(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()).filter((s) => s.length >= 6);
  const flat = ` ${strip(`${a.title || ''} ${text}`).replace(/[^a-z0-9]+/g, ' ')} `;
  const hits = nunca.filter((s) => flat.includes(` ${s} `));
  if (hits.length) { aviso = true; motivos.push(`Aparece algo que o Perfil diz para nunca usar: "${hits[0]}".`); }
  if (aviso) return item('perfil', 'aviso', motivos.join(' '), fonte, detalhes);
  return item('perfil', 'ok', detalhes.length ? detalhes.join(' ') : 'Nada no texto contradiz o Perfil do Projeto (só o que dá para medir sem IA).', fonte);
}

function checkFunil(a: CurationArticle, c: CurationContext, hasCta: boolean): CurationItem {
  const st = funnelStage(a);
  const configured = c.funnel?.configured === true;
  const fonte = `Funil do projeto (${c.funnel == null ? 'módulo sem leitura' : configured ? 'configurado' : 'não configurado'}); etapa por ${st.origem}: ${HEUR}`;
  const etapa = st.etapa ? `Etapa provável: ${STAGE_LABEL[st.etapa]}.` : 'Etapa do funil não identificada pelo título.';
  if (!hasCta) return item('funil', 'aviso', `${etapa} O artigo não tem convite ao contato (CTA) no texto.`, fonte);
  if (!configured) return item('funil', 'aviso', `${etapa} Tem convite ao contato, mas o funil do projeto não está configurado: as metas da etapa não foram comparadas.`, fonte);
  return item('funil', 'ok', `${etapa} Tem convite ao contato (CTA).`, fonte);
}

function checkTaxonomia(a: CurationArticle, c: CurationContext, focus: Set<string>, body: Set<string>, text: string): CurationItem {
  const fonte = 'Taxonomia do projeto (áreas, nichos e geografia); ' + HEUR;
  const nodes = (c.taxonomy || []).filter((n) => n.status !== 'rejeitado');
  if (!nodes.length) return item('taxonomia', 'sem_dados', 'O projeto ainda não tem taxonomia (áreas, nichos, geografia) aprovada ou sugerida: não há com o que casar o artigo.', fonte);
  const strong: TaxNode[] = []; const weak: TaxNode[] = [];
  const phrase = ` ${strip(`${a.title || ''} ${a.keyword || ''}`).replace(/[^a-z0-9]+/g, ' ')} `;
  for (const n of nodes) {
    const lt = tokens(n.label);
    const kwHit = (n.keywords || []).some((k) => { const s = strip(k).replace(/[^a-z0-9]+/g, ' ').trim(); return s.length >= 4 && phrase.includes(` ${s} `); });
    if (kwHit || (lt.length && lt.every((t) => focus.has(t)))) strong.push(n);
    else if (lt.length && lt.every((t) => body.has(t))) weak.push(n);
  }
  const geoNames = [...new Set((c.geo || []).filter((g) => g.status !== 'rejeitado').flatMap((g) => [g.municipio, g.bairro, g.regiao]).filter((x): x is string => !!x && x.length >= 4))];
  const flat = ` ${strip(`${a.title || ''} ${text}`).replace(/[^a-z0-9]+/g, ' ')} `;
  const geoHits = geoNames.filter((g) => flat.includes(` ${strip(g).replace(/[^a-z0-9]+/g, ' ').trim()} `));
  const det = geoNames.length ? [geoHits.length ? `Geografia citada: ${list(geoHits)}.` : 'Nenhum lugar do território do projeto é citado (normal em conteúdo nacional).'] : undefined;
  if (strong.length) return item('taxonomia', 'ok', `Casa com ${list(strong.map((n) => `${n.label}${n.kind ? ` (${n.kind})` : ''}`))}.`, fonte, det);
  if (weak.length) return item('taxonomia', 'aviso', `Só o corpo do texto toca em ${list(weak.map((n) => n.label))}; título, palavra-chave e seções não.`, fonte, det);
  return item('taxonomia', 'aviso', 'Não casa com nenhuma área, nicho ou geografia da taxonomia do projeto.', fonte, det);
}

const hrefsOf = (html: string): string[] => [...String(html || '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].trim());

function checkDominio(a: CurationArticle, c: CurationContext, internalCount: number, minLinks: number | null): CurationItem {
  const fonte = 'Estrutura do domínio (links internos reais, endereço, canonical); sem rede';
  const problemas: string[] = []; const detalhes: string[] = [];
  const hrefs = hrefsOf(String(a.content || ''));
  const host = c.siteHost;
  const internos = host ? hrefs.filter((h) => /^\/(?!\/)/.test(h) || hostOf(h) === host).length : internalCount;
  if (internos === 0) problemas.push('Sem nenhum link interno de saída: o artigo nasceria isolado dentro do site.');
  else if (minLinks && internos < minLinks) problemas.push(`${internos} link(s) interno(s); o perfil de regras pede ${minLinks} (mínimo flexível: o Piloto insere os possíveis).`);
  else detalhes.push(`${internos} link(s) interno(s).`);
  const slug = String(a.slug || '');
  if (!slug) problemas.push('Sem endereço (slug) definido.');
  else {
    const sl = tokens(slug.replace(/-/g, ' '));
    const kw = tokenSet(`${a.keyword || ''} ${a.title || ''}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) problemas.push('O endereço tem maiúsculas, acento ou caractere fora do padrão.');
    else if (/-\d+$/.test(slug)) problemas.push('O endereço termina em número (-2, -3): sinal de duplicata, não de endereço semântico.');
    else if (slug.length < 8 || slug.length > 90) problemas.push(`O endereço tem ${slug.length} caracteres (o semântico fica entre 8 e 90).`);
    else if (sl.length && kw.size && !sl.some((t) => kw.has(t))) problemas.push('O endereço não tem relação com a palavra-chave nem com o título.');
    else detalhes.push('Endereço semântico.');
  }
  const canon = String((a.config as Any)?.canonical_url || (a.config as Any)?.seo_canonical || '').trim();
  if (canon) { if (host && hostOf(canon) && hostOf(canon) !== host) problemas.push(`O canonical aponta para outro domínio (${hostOf(canon)}).`); else detalhes.push('Canonical coerente.'); }
  else detalhes.push('Canonical: definido na publicação pelo plugin (sem dado antes disso).');
  if (isPublished(a) && a.published_url && c.inbound) {
    const n = c.inbound[normUrl(a.published_url)] || 0;
    if (n === 0) problemas.push('Nenhum outro artigo do projeto aponta para este (órfão de entrada).');
    else detalhes.push(`${n} artigo(s) apontam para este.`);
  } else if (!isPublished(a)) detalhes.push('Links de entrada: só dá para medir depois da publicação.');
  if (!host) detalhes.push('Domínio do projeto não informado: links internos medidos só pela contagem da análise.');
  return problemas.length ? item('dominio', 'aviso', problemas.join(' '), fonte, detalhes) : item('dominio', 'ok', detalhes.join(' '), fonte);
}

function checkBacklinks(a: CurationArticle, c: CurationContext): CurationItem {
  const fonte = 'Backlinks do projeto (project_backlinks), por URL de destino';
  if (!isPublished(a) || !a.published_url) return item('backlinks', 'sem_dados', 'O artigo ainda não foi publicado: não existe endereço para receber backlinks.', fonte);
  if (!c.backlinks) return item('backlinks', 'sem_dados', 'O projeto não tem backlinks importados ou verificados.', fonte);
  const n = c.backlinks[normUrl(a.published_url)] || 0;
  return n > 0 ? item('backlinks', 'ok', `${n} backlink(s) conhecido(s) para este endereço.`, fonte) : item('backlinks', 'aviso', 'Nenhum backlink conhecido para este endereço.', fonte);
}

function matchRefs(refs: TextRef[], focus: Set<string>): Array<{ ref: TextRef; matched: string[] }> {
  const out: Array<{ ref: TextRef; matched: string[] }> = [];
  for (const r of refs) { const m = covers(tokens(r.label), focus); if (m.ok) out.push({ ref: r, matched: m.matched }); }
  return out;
}

function checkMercado(a: CurationArticle, c: CurationContext, focus: Set<string>): CurationItem {
  const fonte = 'Mercado (buscas mapeadas em market_queries); ' + HEUR;
  if (!c.market || !c.market.length) return item('mercado', 'sem_dados', 'O módulo de Mercado ainda não tem buscas mapeadas para este projeto.', fonte);
  const hit = matchRefs(c.market, focus);
  return hit.length
    ? item('mercado', 'ok', `Toca em ${hit.length} busca(s) mapeada(s), por exemplo: ${list(hit.map((h) => `"${h.ref.label}"`), 2)}.`, fonte)
    : item('mercado', 'aviso', 'Não cobre nenhuma das buscas mapeadas pelo módulo de Mercado.', fonte);
}

function checkRadar(a: CurationArticle, c: CurationContext, focus: Set<string>): CurationItem {
  const fonte = 'Radar de Mercado (focos e temas acompanhados); ' + HEUR;
  if (!c.radar || !c.radar.length) return item('radar', 'sem_dados', 'O Radar de Mercado ainda não tem focos ou temas para este projeto.', fonte);
  const hit = matchRefs(c.radar, focus);
  return hit.length
    ? item('radar', 'ok', `Alinha-se a ${list(hit.map((h) => `"${h.ref.label}"`), 2)} (foco/tema do Radar).`, fonte)
    : item('radar', 'aviso', 'Não toca em nenhum foco ou tema acompanhado pelo Radar de Mercado.', fonte);
}

function checkIndexacao(a: CurationArticle, c: CurationContext): CurationItem {
  const fonte = 'Indexação (index_urls e index_status), por URL';
  if (!isPublished(a) || !a.published_url) return item('indexacao', 'sem_dados', 'O artigo ainda não foi publicado: a indexação só pode ser medida depois que o endereço existe.', fonte);
  if (!c.indexation) return item('indexacao', 'sem_dados', 'O módulo de Indexação ainda não tem leitura deste projeto.', fonte);
  const r = c.indexation[normUrl(a.published_url)];
  if (!r) return item('indexacao', 'aviso', 'O endereço ainda não está no inventário de indexação.', fonte);
  if (r.indexed === true) return item('indexacao', 'ok', 'Indexado.', fonte);
  if (r.indexed === false) return item('indexacao', 'aviso', `Ainda não indexado${r.detail ? `: ${r.detail}` : ''}.`, fonte);
  return item('indexacao', 'sem_dados', 'Sem checagem de indexação para este endereço.', fonte);
}

function checkEstudio(a: CurationArticle, text: string): CurationItem {
  const fonte = 'Estúdio de Páginas: detector anti-IA (studio-ai-detector) e regras de publicação (resíduos, CTA quebrado)';
  if (!text) return item('estudio', 'pendencia', 'O artigo ainda não tem texto.', fonte);
  const residues = findPublicationResidues({ title: a.title, content: a.content, excerpt: a.excerpt });
  const broken = findBrokenContactCtas(a.content);
  const lang = resolveLanguage({ configured: [a.language, (a.config as Any)?.language], text: text.slice(0, 4000) });
  const ai = detectAiPatterns(String(a.content || ''), lang.code === 'und' ? 'pt' : lang.code);
  const detalhes = [`Nota do detector anti-IA: ${ai.score}/100 (0 soa humano; cobertura ${ai.coverage}).`];
  if (residues.length || broken.length) {
    const m: string[] = [];
    if (residues.length) m.push(`${residues.length} resíduo(s) de publicação (mensagem interna, rascunho ou placeholder)`);
    if (broken.length) m.push(`${broken.length} chamada(s) de contato quebrada(s)`);
    return item('estudio', 'pendencia', `${m.join(' e ')}: a publicação seria recusada.`, fonte, detalhes);
  }
  if (ai.score >= 60) return item('estudio', 'aviso', `O texto tem muitos tiques de texto automático (${ai.score}/100): ${list(ai.findings.map((f) => f.label), 3)}.`, fonte, detalhes);
  return item('estudio', 'ok', `Sem resíduos nem chamadas quebradas; anti-IA ${ai.score}/100.`, fonte, detalhes);
}

function checkPiloto(a: CurationArticle, c: CurationContext, rules: RuleProfile, text: string): { item: CurationItem; internal: number } {
  const fonte = 'Piloto Automático (auto-optimize-core), só a rodada determinística: não usa IA';
  if (!text) return { item: item('piloto', 'sem_dados', 'Sem texto para o Piloto analisar.', fonte), internal: 0 };
  const input: PilotInput = {
    article: { id: a.id, title: a.title || '', keyword: a.keyword || '', excerpt: a.excerpt || '', content: a.content || '', slug: a.slug, language: a.language, published_url: a.published_url || null, published_at: null, created_at: a.created_at || null, updated_at: a.updated_at || null, featured_image_url: a.featured_image_url, config: a.config || {} },
    project: c.project, rules, candidates: c.candidates, sources: [], cta: (c.project as Any)?.cta_conclusao ? String((c.project as Any).cta_conclusao) : null,
    segment: (a.config as Any)?.segment ?? (c.project as Any)?.nicho ?? null, brand: (c.project as Any)?.empresa_nome ? String((c.project as Any).empresa_nome) : null, skipUnits: [],
  };
  const before = analyzeWorking(input, { title: input.article.title, content: input.article.content, excerpt: input.article.excerpt });
  const job = runDeterministic(input, newJob(input, ''));
  const aplic = job.applied.filter((x) => x.id !== 'schema_article');
  const humanos = job.pending.filter((x) => x.kind === 'humano');
  const detalhes = [...aplic.map((x) => `${x.label}${x.count ? ` (${x.count})` : ''}`), ...humanos.map((x) => `Pendência humana: ${x.label}: ${x.reason}`)];
  const internal = before.analysis.structure.internalLinks;
  if (!aplic.length && !humanos.length) return { item: item('piloto', 'ok', 'O Piloto Automático não tem nada a corrigir sem IA.', fonte), internal };
  const parts: string[] = [];
  if (aplic.length) parts.push(`O Piloto propõe ${aplic.length} correção(ões) sem IA: ${list(aplic.map((x) => x.label), 2)}.`);
  if (humanos.length) parts.push(`${humanos.length} item(ns) dependem de uma pessoa (${list(humanos.map((x) => x.label), 2)}).`);
  return { item: item('piloto', 'aviso', parts.join(' '), fonte, detalhes), internal };
}

function checkObservatorio(a: CurationArticle, c: CurationContext, focus: Set<string>): CurationItem {
  const fonte = 'Observatório de IA (nexus_prompts ativos); ' + HEUR;
  if (!c.prompts || !c.prompts.length) return item('observatorio', 'sem_dados', 'O Observatório ainda não tem perguntas (prompts) ativas para este projeto.', fonte);
  const hit: Array<{ p: PromptRef; matched: string[] }> = [];
  for (const p of c.prompts) { const m = covers(tokens(p.query), focus); if (m.ok) hit.push({ p, matched: m.matched }); }
  return hit.length
    ? item('observatorio', 'ok', `Cobre ${hit.length} pergunta(s) do Observatório, por exemplo: ${list(hit.map((h) => `"${h.p.query}"`), 2)}.`, fonte, hit.slice(0, 5).map((h) => `"${h.p.query}" casou em: ${h.matched.join(', ')}`))
    : item('observatorio', 'aviso', 'Não cobre nenhuma das perguntas ativas do Observatório de IA.', fonte);
}

function checkImagens(img: ImageReport): CurationItem {
  const fonte = 'Política de imagens (image-policy) e uso da imagem no projeto; relevância: ' + HEUR;
  if (img.estado === 'ausente') return { ...item('imagens', 'pendencia', 'Sem imagem destacada: o artigo não pode ser publicado.', fonte, img.detalhes), bloqueia: true };
  if (img.estado === 'repetida') return { ...item('imagens', 'pendencia', `Imagem repetida: a mesma imagem está em ${img.usos} artigos do projeto. Troque por uma imagem própria deste tema antes de publicar.`, fonte, img.detalhes), bloqueia: true };
  if (img.estado === 'aviso') return item('imagens', 'aviso', img.detalhes[0] || 'A imagem tem pontos de atenção.', fonte, img.detalhes);
  return item('imagens', 'ok', 'Imagem exclusiva deste artigo, com texto alternativo e relação com o tema.', fonte, img.detalhes);
}

// ---------------------------------------------------------------------------------------------------------------- relatório

export interface CurationReport {
  version: number;
  article_id: string;
  project_id: string | null;
  evaluated_at: string;
  content_hash: string;
  article_status: string;
  estado: OverallState;
  /** 0 a 100 sobre os itens que deu para medir (aviso vale metade; sem dados não entra). null = nada medido */
  nota: number | null;
  itens: CurationItem[];
  imagem: ImageReport;
  /** o que impede a publicação (imagem) */
  bloqueios: string[];
  /** o que falta corrigir (pendências que não são de imagem) */
  faltando: string[];
  avisos: number;
}

/** Impressão digital do que a curadoria avaliou: se mudar, a curadoria deixa de valer. */
export async function articleFingerprint(a: Pick<CurationArticle, 'title' | 'excerpt' | 'content' | 'featured_image_url' | 'slug'>): Promise<string> {
  return await sha256Hex([a.title, a.excerpt, a.content, a.featured_image_url, a.slug].map((x) => String(x ?? '')).join('\n\u0001\n'));
}

export function overallOf(itens: CurationItem[]): { estado: OverallState; bloqueios: string[]; faltando: string[] } {
  const bloqueios = itens.filter((i) => i.bloqueia).map((i) => i.motivo_em_portugues);
  const faltando = itens.filter((i) => i.estado === 'pendencia' && !i.bloqueia).map((i) => `${i.modulo}: ${i.motivo_em_portugues}`);
  return { estado: bloqueios.length ? 'bloqueado' : faltando.length ? 'precisa_correcao' : 'aprovado', bloqueios, faltando };
}

export function scoreOf(itens: CurationItem[]): number | null {
  const m = itens.filter((i) => i.estado !== 'sem_dados');
  if (!m.length) return null;
  return Math.round((m.reduce((s, i) => s + (i.estado === 'ok' ? 1 : i.estado === 'aviso' ? 0.5 : 0), 0) / m.length) * 100);
}

export async function curateArticle(a: CurationArticle, c: CurationContext): Promise<CurationReport> {
  const rules = c.rules ?? defaultProfile();
  const text = plain(a);
  const focus = focusTokens(a);
  const body = tokenSet(`${a.title || ''} ${a.keyword || ''} ${text}`);
  const piloto = checkPiloto(a, c, rules, text);
  const cta = text ? analyzeWorking(
    { article: { id: a.id, title: a.title || '', keyword: a.keyword || '', excerpt: a.excerpt || '', content: a.content || '', config: a.config || {} }, project: c.project, rules, candidates: [], sources: [], cta: (c.project as Any)?.cta_conclusao ? String((c.project as Any).cta_conclusao) : null },
    { title: a.title || '', content: a.content || '', excerpt: a.excerpt || '' },
  ).analysis.structure.hasCTA === true : false;
  const img = checkImage(a, c.imageUsage, c.maxImageUses ?? 1);
  const minLinks = rules.rules.internal_links.level !== 'desligado' ? (rules.rules.internal_links.value ?? null) : null;
  const byModule: Record<CurationModule, CurationItem> = {
    perfil: checkPerfil(a, c, text),
    funil: checkFunil(a, c, cta),
    taxonomia: checkTaxonomia(a, c, focus, body, text),
    dominio: checkDominio(a, c, piloto.internal, minLinks),
    backlinks: checkBacklinks(a, c),
    mercado: checkMercado(a, c, focus),
    radar: checkRadar(a, c, focus),
    indexacao: checkIndexacao(a, c),
    estudio: checkEstudio(a, text),
    piloto: piloto.item,
    observatorio: checkObservatorio(a, c, focus),
    imagens: checkImagens(img),
  };
  const itens = CURATION_MODULES.map((m) => byModule[m]);
  const { estado, bloqueios, faltando } = overallOf(itens);
  return {
    version: CURADORIA_VERSION, article_id: a.id, project_id: a.project_id, evaluated_at: new Date(c.now).toISOString(), content_hash: await articleFingerprint(a), article_status: a.status,
    estado, nota: scoreOf(itens), itens, imagem: img, bloqueios, faltando, avisos: itens.filter((i) => i.estado === 'aviso').length,
  };
}

// ---------------------------------------------------------------------------------------------------------------- perguntas abertas do Observatório

export interface PromptCoverage {
  prompt: PromptRef;
  estado: 'sem_artigo' | 'so_em_producao' | 'coberto';
  cobertos_por: Array<{ article_id: string; title: string; status: string; palavras_casadas: string[] }>;
}
export const PROMPT_RULE = 'Heurística: a pergunta conta como coberta quando pelo menos 60% das palavras significativas dela (e no mínimo 2; se tiver só 1 ou 2, todas) aparecem no título, na palavra-chave, nas palavras secundárias, nos títulos de seção ou no resumo do artigo. Não prova que o texto responde à pergunta.';

/** Para cada pergunta ativa: quais artigos do projeto a cobrem (índice invertido, sem varrer artigo por artigo). */
export function promptCoverage(prompts: PromptRef[], articles: CurationArticle[], maxPerPrompt = 3): PromptCoverage[] {
  const sets = articles.map((a) => ({ a, t: focusTokens(a) }));
  const index = new Map<string, number[]>();
  sets.forEach((s, i) => { for (const t of s.t) { const l = index.get(t) || []; l.push(i); index.set(t, l); } });
  return prompts.map((p) => {
    const qt = tokens(p.query);
    const counts = new Map<number, string[]>();
    for (const t of qt) for (const i of index.get(t) || []) { const l = counts.get(i) || []; l.push(t); counts.set(i, l); }
    const hits: PromptCoverage['cobertos_por'] = [];
    for (const [i, matched] of counts) {
      const total = qt.length;
      const ok = total <= 2 ? matched.length === total : matched.length >= 2 && matched.length / total >= 0.6;
      if (ok) hits.push({ article_id: sets[i].a.id, title: String(sets[i].a.title || sets[i].a.keyword || ''), status: sets[i].a.status, palavras_casadas: matched });
    }
    hits.sort((x, y) => (x.status === 'published' ? 0 : 1) - (y.status === 'published' ? 0 : 1) || y.palavras_casadas.length - x.palavras_casadas.length);
    const estado: PromptCoverage['estado'] = !hits.length ? 'sem_artigo' : hits.some((h) => h.status === 'published') ? 'coberto' : 'so_em_producao';
    return { prompt: p, estado, cobertos_por: hits.slice(0, maxPerPrompt) };
  });
}

// ---------------------------------------------------------------------------------------------------------------- prioridade de imagem

export const STATUS_PRIORITY: Record<string, number> = { generating: 1, draft: 2, ready: 3, error: 4, published: 9 };
export const STATUS_LABEL: Record<string, string> = { generating: 'Em criação', draft: 'Na fila', ready: 'Finalizado', error: 'Com erro', published: 'Publicado' };
