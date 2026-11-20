/**
 * Núcleo do Estúdio de Páginas (puro): máquina de estados, hash do que foi aprovado, regras de aprovação e publicação, estimativa de custo, e a ponte entre a linha do banco
 * (studio_pages) e a página (StudioPageDoc). Sem banco, sem rede, sem IA.
 *
 * Regras de ouro: 1) NADA é publicado sem aprovação humana; 2) o que foi aprovado é o que foi publicado (hash do conteúdo inteiro); 3) editar página aprovada
 * desfaz a aprovação (volta a rascunho); 4) aprovador pode ter de ser outra pessoa (opção do perfil de regras).
 */
import { DEFAULT_CAP_MICROS, DEFAULT_EXTRA_MICROS, DEFAULT_PRICE_BOOK, estimateTextMicros, type PriceBook } from './spend-gate-core.ts';
import { estimateImageMicros } from './studio-images.ts';
import { sha256Hex } from './studio-adapters.ts';
import { TRANSITIONS, type AdapterKind, type FieldFact, type PageStatus, type PageType, type StudioPageDoc } from './studio-types.ts';
import { publicUrl } from './studio-url.ts';
import type { QualityReport } from './studio-gates.ts';
import type { StudioOptions } from './studio-rules.ts';

export const canTransition = (from: PageStatus, to: PageStatus): boolean => TRANSITIONS[from]?.includes(to) ?? false;

/** JSON guardado na coluna `doc` (a página sem o corpo e sem os campos que já têm coluna própria). */
export interface StoredDoc {
  faq: StudioPageDoc['faq']; breadcrumbs: StudioPageDoc['breadcrumbs']; sources: StudioPageDoc['sources']; links: StudioPageDoc['links']; images: StudioPageDoc['images'];
  author: StudioPageDoc['author']; datePublished: string | null; dateModified: string | null; noindex: boolean; hreflang: Record<string, string>; seoPlugin: string | null; areaServed: string[];
  segment: string | null; fieldFacts: FieldFact[]; usedFactIds: string[]; keywords: string[]; redirectFrom: string | null; inboundSuggested: Array<{ from: string; to: string; reason: string }>; hasTranslations: boolean;
}
export const emptyStored = (): StoredDoc => ({ faq: [], breadcrumbs: [], sources: [], links: [], images: [], author: null, datePublished: null, dateModified: null, noindex: false, hreflang: {}, seoPlugin: null, areaServed: [], segment: null, fieldFacts: [], usedFactIds: [], keywords: [], redirectFrom: null, inboundSuggested: [], hasTranslations: false });

export interface PageRow {
  id: string; organization_id: string; project_id: string; focus_id?: string | null; taxonomy_node_id?: string | null; geo_scope_id?: string | null; type: PageType; language: string; query: string;
  subject: string | null; place: string | null; slug_path: string; host: string; base_path: string; adapter: AdapterKind; status: PageStatus; version: number; published_version: number | null;
  title: string; meta_description: string; h1: string; body_html: string; doc: Partial<StoredDoc>; brief: Record<string, unknown>; pipeline: Record<string, unknown>; quality: Record<string, unknown>;
  quality_score: number | null; ai_score: number | null; pending_count: number; content_hash: string | null; approved_hash: string | null; approved_by: string | null; approved_at: string | null;
  external_id: string; wp_post_id: number | null; public_url: string | null; published_at: string | null; unpublished_at: string | null; last_error: string | null; created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
}

export const storedOf = (row: Pick<PageRow, 'doc'>): StoredDoc => ({ ...emptyStored(), ...(row.doc || {}) });

/** A página que os portões, o renderizador e os adaptadores enxergam. */
export function rowToDoc(row: PageRow, origin: string): StudioPageDoc {
  const s = storedOf(row);
  return {
    type: row.type, language: row.language, title: row.title, metaDescription: row.meta_description, h1: row.h1, slugPath: row.slug_path, origin, url: publicUrl(origin, row.slug_path, row.base_path), bodyHtml: row.body_html,
    faq: s.faq, breadcrumbs: s.breadcrumbs, sources: s.sources, links: s.links, images: s.images, author: s.author, datePublished: s.datePublished, dateModified: s.dateModified, noindex: s.noindex,
    hreflang: s.hreflang, seoPlugin: s.seoPlugin, areaServed: s.areaServed, subject: row.subject, place: row.place, segment: s.segment,
  };
}
export function docToStored(doc: StudioPageDoc, prev: StoredDoc): StoredDoc {
  return { ...prev, faq: doc.faq, breadcrumbs: doc.breadcrumbs, sources: doc.sources, links: doc.links, images: doc.images, author: doc.author, datePublished: doc.datePublished, dateModified: doc.dateModified, noindex: doc.noindex, hreflang: doc.hreflang, seoPlugin: doc.seoPlugin, areaServed: doc.areaServed, segment: doc.segment };
}

/** Hash do CONTEÚDO COMPLETO que vai ao ar: texto, título, meta, endereço, imagens, FAQ, autor, noindex. O que foi aprovado é o que foi publicado. */
export async function contentHash(doc: StudioPageDoc): Promise<string> {
  const canon = { t: doc.title, m: doc.metaDescription, h: doc.h1, s: doc.slugPath, b: doc.bodyHtml, f: doc.faq, i: doc.images.map((x) => [x.slot, x.url, x.alt, x.width, x.height]), a: doc.author, n: doc.noindex, l: doc.language, hl: doc.hreflang, ty: doc.type };
  return sha256Hex(JSON.stringify(canon));
}

// ------------------------------------------------------------------------------------------------------------ aprovar e publicar
export interface ApprovalInput { page: Pick<PageRow, 'status' | 'created_by' | 'content_hash'>; currentHash: string; quality: QualityReport | null; userId: string; options: Pick<StudioOptions, 'require_distinct_approver'>; pendingMarkers: number }
export function approvalCheck(i: ApprovalInput): { ok: boolean; reasons: string[] } {
  const r: string[] = [];
  if (i.page.status !== 'em_revisao') r.push('A página precisa estar "em revisão" para ser aprovada.');
  if (!i.quality) r.push('Rode a verificação de qualidade antes de aprovar.');
  else {
    if (i.quality.generated_at && i.page.content_hash && i.page.content_hash !== i.currentHash) r.push('O conteúdo mudou depois da última verificação: verifique de novo.');
    if (i.quality.blocking.length) r.push(`Portões obrigatórios reprovados: ${i.quality.blocking.join(', ')}.`);
  }
  if (i.pendingMarkers > 0) r.push(`${i.pendingMarkers} pendência(s) [PENDENTE: ...] no texto: resolva antes de aprovar.`);
  if (i.options.require_distinct_approver && i.page.created_by && i.page.created_by === i.userId) r.push('O perfil de regras exige que o aprovador seja outra pessoa, não quem criou a página.');
  return { ok: r.length === 0, reasons: r };
}

export function publishCheck(i: { page: Pick<PageRow, 'status' | 'approved_hash' | 'approved_by'>; currentHash: string; quality: QualityReport | null; adapter: AdapterKind }): { ok: boolean; reasons: string[] } {
  const r: string[] = [];
  if (i.page.status !== 'aprovada' && i.page.status !== 'despublicada') r.push('Só página APROVADA por uma pessoa pode ser publicada.');
  if (i.page.status === 'despublicada') r.push('Aprove de novo antes de republicar.');
  if (!i.page.approved_by) r.push('Sem aprovador registrado.');
  if (!i.page.approved_hash || i.page.approved_hash !== i.currentHash) r.push('O conteúdo mudou depois da aprovação: o que foi aprovado não é o que seria publicado. Envie para revisão e aprove de novo.');
  if (i.quality?.blocking.length) r.push(`Portões obrigatórios reprovados agora: ${i.quality.blocking.join(', ')}.`);
  if (i.adapter === 'zica_hosted') r.push('O adaptador "hospedado pela Zica" ainda não foi construído (só o contrato existe).');
  return { ok: r.length === 0, reasons: r };
}

// ------------------------------------------------------------------------------------------------------------ custo
export interface CostEstimate { perPageMicros: { text: number; images: number; total: number }; pagesPerDayWithinCap: number; capMicros: number; extraMicros: number; note: string }
/** Estimativa (NÃO é o gasto real): passos de IA x tokens por passo pelo preço padrão do projeto (não verificado). O gasto real e o teto estão no módulo Teto Diário. */
export function estimateCost(o: { options: Pick<StudioOptions, 'max_ai_steps' | 'step_max_tokens'>; sections: number; imagesToGenerate: number; book?: PriceBook; promptChars?: number }): CostEstimate {
  const book = o.book || DEFAULT_PRICE_BOOK;
  const steps = Math.min(o.options.max_ai_steps, o.sections + 3);
  const text = steps * estimateTextMicros(book, ['gpt-4.1', 'claude-sonnet-4-5-20250929'], o.promptChars ?? 6000, o.options.step_max_tokens);
  const images = estimateImageMicros(o.imagesToGenerate, book);
  const total = text + images;
  return { perPageMicros: { text, images, total }, pagesPerDayWithinCap: total > 0 ? Math.floor(DEFAULT_CAP_MICROS / total) : 0, capMicros: DEFAULT_CAP_MICROS, extraMicros: DEFAULT_EXTRA_MICROS, note: 'Estimativa pelo preço padrão do projeto (não verificado) no pior caso de cada passo. O gasto real e o teto do dia estão no Teto Diário de Gasto.' };
}

// ------------------------------------------------------------------------------------------------------------ resumo
export interface PageSummary { id: string; type: PageType; status: PageStatus; title: string; slug_path: string; url: string | null; language: string; place: string | null; version: number; quality_score: number | null; ai_score: number | null; pending_count: number; adapter: AdapterKind; updated_at: string; live: boolean }
export const summarize = (r: PageRow): PageSummary => ({ id: r.id, type: r.type, status: r.status, title: r.title || r.query, slug_path: r.slug_path, url: r.public_url, language: r.language, place: r.place, version: r.version, quality_score: r.quality_score, ai_score: r.ai_score, pending_count: r.pending_count, adapter: r.adapter, updated_at: r.updated_at, live: r.status === 'publicada' || (r.published_version !== null && r.status !== 'despublicada') });

export { STUDIO_EVENT_LABELS } from './studio-events.ts';
