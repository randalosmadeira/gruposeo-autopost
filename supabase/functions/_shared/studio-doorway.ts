/**
 * Trava contra páginas finas em massa e páginas de porta ("doorway pages").
 *
 * Uma página por bairro ou cidade com o mesmo texto trocando só o nome do lugar NÃO é permitida: prejudica o site (política de spam do Google) e a
 * auditoria da RDM achou exatamente isso (29% a 45% de texto único nas páginas de cidade). Este módulo mede, explica o porquê e propõe consolidar.
 *
 * Medidas (puras, sem rede):
 *  - texto único = % dos trechos de 5 palavras da página que NÃO aparecem em nenhuma página irmã (nome do lugar neutralizado antes de comparar);
 *  - similaridade máxima = maior índice de Jaccard entre a página e uma irmã;
 *  - limite de lote: quantas páginas novas por lote e quantas publicações por dia (números do perfil de regras, nunca fixos).
 */
import { htmlToText } from './studio-ai-detector.ts';

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tokens = (s: string): string[] => norm(s).match(/[\p{L}\p{N}]+/gu) || [];

/** Texto da página sem marcação, com o(s) nome(s) do lugar trocados por um marcador (para páginas de cidade/bairro compararem pelo MOLDE). */
export function neutralize(html: string, places: string[] = []): string {
  let t = norm(htmlToText(html));
  for (const p of places.map((x) => norm(x).trim()).filter((x) => x.length >= 3).sort((a, b) => b.length - a.length)) t = t.split(p).join(' lugar ');
  return t;
}
export function shingles(text: string, n = 5): Set<string> {
  const w = tokens(text);
  const out = new Set<string>();
  if (w.length < n) { if (w.length) out.add(w.join(' ')); return out; }
  for (let i = 0; i <= w.length - n; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0; const [s, l] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of s) if (l.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface SiblingText { id: string; label: string; html: string; place?: string | null }
export interface OverlapReport { uniquePct: number; maxSimilarity: number; mostSimilar: { id: string; label: string; similarity: number } | null; sharedWith: Array<{ id: string; label: string; similarity: number }>; words: number }

/** Compara a página com as irmãs (mesmo modelo). Sem irmãs: 100% único (não há com o que comparar). */
export function measureOverlap(page: { html: string; place?: string | null }, siblings: SiblingText[], extraPlaces: string[] = []): OverlapReport {
  const mine = shingles(neutralize(page.html, [page.place || '', ...extraPlaces]));
  const words = tokens(htmlToText(page.html)).length;
  if (!mine.size || !siblings.length) return { uniquePct: 100, maxSimilarity: 0, mostSimilar: null, sharedWith: [], words };
  const union = new Set<string>();
  const sims: Array<{ id: string; label: string; similarity: number }> = [];
  for (const s of siblings) {
    const theirs = shingles(neutralize(s.html, [s.place || '', page.place || '', ...extraPlaces]));
    for (const x of theirs) union.add(x);
    sims.push({ id: s.id, label: s.label, similarity: Math.round(jaccard(mine, theirs) * 1000) / 1000 });
  }
  let shared = 0; for (const x of mine) if (union.has(x)) shared++;
  sims.sort((a, b) => b.similarity - a.similarity);
  return { uniquePct: Math.round((1 - shared / mine.size) * 100), maxSimilarity: sims[0]?.similarity ?? 0, mostSimilar: sims[0] || null, sharedWith: sims.filter((s) => s.similarity >= 0.3).slice(0, 5), words };
}

export type DoorwayVerdict = 'ok' | 'fina' | 'porta';
export interface DoorwayReport extends OverlapReport { verdict: DoorwayVerdict; reasons: string[]; proposal: string | null }

/**
 * Veredito: 'porta' quando o molde se repete (similaridade acima do limite) ou o texto único fica abaixo do mínimo E há irmãs com lugar diferente;
 * 'fina' quando as palavras ficam abaixo do mínimo do perfil de regras. `minUniquePct`, `maxSimilarityPct` e `minWords` vêm do perfil (nunca fixos).
 */
export function assessDoorway(page: { html: string; place?: string | null; type: string }, siblings: SiblingText[], t: { minUniquePct: number | null; maxSimilarityPct: number | null; minWords: number | null }): DoorwayReport {
  const o = measureOverlap(page, siblings);
  const reasons: string[] = [];
  let verdict: DoorwayVerdict = 'ok';
  if (t.minWords !== null && o.words < t.minWords) { verdict = 'fina'; reasons.push(`Só ${o.words} palavras; o perfil de regras pede pelo menos ${t.minWords}.`); }
  const sameKind = siblings.filter((s) => (s.place || '') !== (page.place || ''));
  if (sameKind.length) {
    if (t.minUniquePct !== null && o.uniquePct < t.minUniquePct) { verdict = 'porta'; reasons.push(`Só ${o.uniquePct}% do texto é próprio desta página (o perfil pede ${t.minUniquePct}%). O resto repete as páginas irmãs com o nome do lugar trocado.`); }
    if (t.maxSimilarityPct !== null && o.maxSimilarity * 100 > t.maxSimilarityPct) { verdict = 'porta'; reasons.push(`${Math.round(o.maxSimilarity * 100)}% igual a "${o.mostSimilar?.label}" (limite ${t.maxSimilarityPct}%).`); }
  }
  const proposal = verdict === 'porta'
    ? `Consolide: uma página regional forte (com seções por lugar, cada uma com fatos locais reais: órgãos, endereços, prazos) em vez de ${sameKind.length + 1} páginas quase iguais. Só crie página própria do lugar quando houver texto e dado próprios que a justifiquem.`
    : null;
  return { ...o, verdict, reasons, proposal };
}

/** Quantas páginas de um mesmo molde (mesmo `type`+assunto) já existem com lugares diferentes: se passa do limite do lote, a criação em massa é segurada. */
export interface ThrottleInput { requested: number; createdInWindow: number; batchLimit: number; publishedToday: number; dailyPublishLimit: number; kind: 'criar' | 'publicar' }
export interface ThrottleResult { allowed: number; blocked: boolean; reason: string | null }
export function checkThrottle(i: ThrottleInput): ThrottleResult {
  if (i.kind === 'criar') {
    const room = Math.max(0, i.batchLimit - i.createdInWindow);
    if (i.requested > room) return { allowed: room, blocked: room === 0, reason: room === 0 ? `O limite de ${i.batchLimit} páginas novas por lote já foi usado. Revise e aprove as existentes antes de criar mais (limite configurável no perfil de regras).` : `Só cabem ${room} páginas novas neste lote (limite ${i.batchLimit}); pediu ${i.requested}.` };
    return { allowed: i.requested, blocked: false, reason: null };
  }
  const room = Math.max(0, i.dailyPublishLimit - i.publishedToday);
  if (i.requested > room) return { allowed: room, blocked: room === 0, reason: room === 0 ? `O limite de ${i.dailyPublishLimit} publicações por dia já foi usado.` : `Só cabem ${room} publicações hoje (limite ${i.dailyPublishLimit}).` };
  return { allowed: i.requested, blocked: false, reason: null };
}
