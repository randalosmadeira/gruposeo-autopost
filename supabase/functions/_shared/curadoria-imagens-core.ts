/**
 * Núcleo puro do lote de imagens da curadoria (sem rede, sem banco): contas do teto, escolha e ordem dos artigos, corpo do pedido ao generate-image
 * e leitura da resposta. A função `curadoria-imagens` só liga isto ao banco e ao generate-image.
 * Regra de ouro: o lote NUNCA começa uma imagem que, pela estimativa, estouraria o teto autorizado pelo dono.
 */
export const MODULE_KEY = 'conteudo_original';
export const STATUS_ORDER = ['generating', 'draft', 'ready'] as const;
/** abaixo disto o artigo não tem texto de verdade (ex.: "Em criação" travado): imagem ali seria dinheiro jogado fora */
export const MIN_TEXT_CHARS = 1500;
/** estimativa enquanto nada foi medido: US$ 0,12 por imagem (qualidade média, 1536x1024) */
export const DEFAULT_ESTIMATE_MICROS = 120_000;
export const MAX_ATTEMPTS_PER_ARTICLE = 2;

export interface TargetArticle {
  id: string; user_id: string; project_id: string; status: string; title: string | null; keyword: string | null;
  content: string | null; created_at: string | null;
}
export interface JobLite { article_id: string; status: string }

/** gasto restante do teto autorizado (nunca negativo) */
export const remainingMicros = (capMicros: number, spentMicros: number): number => Math.max(0, Math.floor(capMicros) - Math.floor(spentMicros));

/** estimativa por imagem: 130% do maior custo medido até agora; sem medição, a estimativa padrão */
export function estimateMicros(measuredOkCosts: number[]): number {
  const valid = measuredOkCosts.filter((n) => Number.isFinite(n) && n > 0);
  if (!valid.length) return DEFAULT_ESTIMATE_MICROS;
  return Math.ceil(Math.max(...valid) * 1.3);
}

/** pode começar mais uma imagem? só se o restante cobre a estimativa */
export const canAffordOne = (remaining: number, estimate: number): boolean => remaining >= estimate && estimate > 0;

/** custo a gravar: o medido; se a medição vier zerada com sucesso (livro-caixa atrasado), grava a estimativa para o teto nunca ficar otimista */
export function recordedCost(measured: number, estimate: number, success: boolean): { cost: number; source: 'medido' | 'estimado' } {
  const m = Number.isFinite(measured) && measured > 0 ? Math.floor(measured) : 0;
  if (m > 0) return { cost: m, source: 'medido' };
  return success ? { cost: Math.floor(estimate), source: 'estimado' } : { cost: 0, source: 'medido' };
}

export const plainText = (html: string | null | undefined, max = 300): string =>
  String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** artigos elegíveis, na ordem: status (Em criação > Na fila > Finalizado), projeto na ordem pedida, mais antigo primeiro */
export function orderTargets(articles: TargetArticle[], jobs: JobLite[], projectOrder: string[], onlyIds: string[] = []): TargetArticle[] {
  const done = new Set(jobs.filter((j) => j.status === 'ok').map((j) => j.article_id));
  const attempts = new Map<string, number>();
  for (const j of jobs) if (j.status === 'erro') attempts.set(j.article_id, (attempts.get(j.article_id) || 0) + 1);
  const rank = (s: string) => { const i = (STATUS_ORDER as readonly string[]).indexOf(s); return i < 0 ? 99 : i; };
  const proj = (p: string) => { const i = projectOrder.indexOf(p); return i < 0 ? 99 : i; };
  const picked = new Map(onlyIds.map((id, i) => [id, i]));
  return articles
    .filter((a) => !picked.size || picked.has(a.id))
    .filter((a) => a.status !== 'published' && (STATUS_ORDER as readonly string[]).includes(a.status))
    .filter((a) => plainText(a.content, MIN_TEXT_CHARS + 1).length >= MIN_TEXT_CHARS && String(a.title || '').trim())
    .filter((a) => !done.has(a.id) && (attempts.get(a.id) || 0) < MAX_ATTEMPTS_PER_ARTICLE)
    .sort((x, y) => picked.size
      ? (picked.get(x.id) ?? 0) - (picked.get(y.id) ?? 0)
      : rank(x.status) - rank(y.status) || proj(x.project_id) - proj(y.project_id) || String(x.created_at).localeCompare(String(y.created_at)));
}

/**
 * corpo do pedido ao generate-image. `projectId` é necessário para a trava de gasto achar a organização (por artigo ela não acha);
 * `forceOriginalImage` (só vale em chamada interna) pula o banco de fotos, que é o que repetia a imagem.
 */
export function buildImageRequest(a: TargetArticle, quality: 'low' | 'medium' | 'high' = 'medium', style = '') {
  return {
    title: String(a.title || '').slice(0, 200), keywords: String(a.keyword || '').slice(0, 200), context: plainText(a.content, 300),
    articleId: a.id, projectId: a.project_id, userId: a.user_id, moduleKey: MODULE_KEY, allowAiGeneration: true, forceOriginalImage: true, quality, aspectRatio: '16:9' as const,
    ...(style.trim() ? { imageStyle: style.trim().slice(0, 700) } : {}),
  };
}

export type StopReason = 'teto_diario' | 'sem_autorizacao' | 'servico_indisponivel' | null;
/** respostas que PARAM a rodada inteira (insistir só gastaria ou falharia de novo) */
export function stopReasonFor(status: number, body: Record<string, unknown> | null): StopReason {
  const code = String(body?.code ?? body?.error ?? '');
  if (status === 423 || /daily_cap|spend|paid_services_blocked/i.test(code)) return 'teto_diario';
  if (status === 401 || status === 403) return 'sem_autorizacao';
  if (status === 503 || code === 'image_provider_missing') return 'servico_indisponivel';
  return null;
}
