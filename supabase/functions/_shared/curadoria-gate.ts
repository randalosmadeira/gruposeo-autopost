/**
 * Portão de curadoria na SAÍDA: nenhum artigo novo vira publicação sem curadoria `aprovado` e atual.
 *
 * Usado por `publish-to-wordpress`, o único caminho que muda artigo para publicado (`auto-publish-article` foi aposentada e responde 410; `auto-process-rss`,
 * `zica-brain-tick`, `wordpress-operations`, `wordpress-api`, `analyze-seo-advanced` e `reprocess-article-images` publicam chamando `publish-to-wordpress`).
 *
 * Vale quando: a publicação é "publish" (rascunho no WordPress não sai ao público), o artigo ainda NÃO foi publicado (artigo já publicado nunca é tocado: republicar
 * para atualizar não passa por aqui) e o interruptor não está desligado.
 *
 * Interruptor `CURADORIA_GATE`: padrão LIGADO. `aviso` (ou `warn`) deixa publicar e só devolve o relatório do que faltaria. `0`, `off`, `false` ou `desligado` desliga.
 * "Atual" = existe linha em `article_curation`, com a versão das regras de hoje, e a impressão digital (título, resumo, texto, imagem, endereço) é a mesma do artigo agora.
 * Além da linha gravada, confere AO VIVO se a mesma imagem já está em outro artigo do projeto (um irmão pode ter tomado a imagem depois da curadoria).
 */
import { CURADORIA_VERSION, articleFingerprint, imageKey } from './curadoria-core.ts';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Any = any;
type Rec = Record<string, unknown>;

export type GateMode = 'ligado' | 'aviso' | 'desligado';
export type GateReason = 'ok' | 'desligado' | 'ja_publicado' | 'sem_curadoria' | 'desatualizada' | 'versao_antiga' | 'bloqueado' | 'precisa_correcao' | 'imagem_repetida_ao_vivo' | 'imagem_ausente' | 'erro_de_leitura';

export function gateModeFrom(raw: unknown): GateMode {
  const v = String(raw ?? '').trim().toLowerCase();
  if (['0', 'off', 'false', 'desligado', 'no', 'nao', 'não'].includes(v)) return 'desligado';
  if (['aviso', 'warn', 'warning', 'advisory'].includes(v)) return 'aviso';
  return 'ligado';
}

export interface GateVerdict {
  /** true = a publicação pode seguir (inclui o modo aviso) */
  allowed: boolean;
  /** true = há pendência, mesmo que o modo aviso tenha deixado seguir */
  pending: boolean;
  mode: GateMode;
  reason: GateReason;
  message: string;
  faltando: string[];
  estado: string | null;
}

const MESSAGES: Record<GateReason, string> = {
  ok: 'Curadoria aprovada e atual.',
  desligado: 'Portão de curadoria desligado.',
  ja_publicado: 'Artigo já publicado: o portão de curadoria não se aplica à atualização.',
  sem_curadoria: 'Este artigo ainda não passou pela curadoria. Rode a curadoria no painel (Curadoria) e corrija o que faltar antes de publicar.',
  desatualizada: 'O artigo mudou depois da curadoria. Rode a curadoria de novo para que ela valha para esta versão.',
  versao_antiga: 'A curadoria deste artigo foi feita com regras antigas. Rode a curadoria de novo.',
  bloqueado: 'A curadoria bloqueou este artigo (imagem repetida ou ausente). Troque a imagem e rode a curadoria de novo.',
  precisa_correcao: 'A curadoria encontrou pendências neste artigo. Corrija e rode a curadoria de novo.',
  imagem_repetida_ao_vivo: 'A imagem deste artigo já está em outro artigo do projeto. Troque por uma imagem própria deste tema e rode a curadoria de novo.',
  imagem_ausente: 'O artigo não tem imagem destacada. Inclua uma imagem própria deste tema e rode a curadoria de novo.',
  erro_de_leitura: 'Não foi possível conferir a curadoria agora. Por segurança, a publicação não foi feita; tente de novo.',
};

const verdict = (mode: GateMode, reason: GateReason, faltando: string[] = [], estado: string | null = null): GateVerdict => {
  const pending = !['ok', 'desligado', 'ja_publicado'].includes(reason);
  return { allowed: !pending || mode !== 'ligado', pending, mode, reason, message: MESSAGES[reason], faltando, estado };
};

export interface GateArticle { id: string; project_id?: string | null; status?: string | null; published_url?: string | null; title?: unknown; excerpt?: unknown; content?: unknown; featured_image_url?: unknown; slug?: unknown }

/** Confere o portão para UM artigo que vai ser publicado. Nunca altera nada. */
export async function checkCurationGate(admin: Admin, article: GateArticle, opts: { mode?: GateMode; publishStatus?: string } = {}): Promise<GateVerdict> {
  const mode = opts.mode ?? gateModeFrom((globalThis as Any).Deno?.env?.get?.('CURADORIA_GATE'));
  if (mode === 'desligado') return verdict(mode, 'desligado');
  if ((opts.publishStatus ?? 'publish') !== 'publish') return verdict(mode, 'ok');
  if (article.status === 'published' || article.published_url) return verdict(mode, 'ja_publicado');
  try {
    const r = await admin.from('article_curation').select('estado,version,content_hash,image_state,checks').eq('article_id', article.id).maybeSingle();
    if (r.error) throw r.error;
    const row = r.data as Rec | null;
    if (!row) return verdict(mode, 'sem_curadoria');
    const checks = (row.checks && typeof row.checks === 'object' ? row.checks : {}) as Rec;
    const faltando = [...(Array.isArray(checks.bloqueios) ? checks.bloqueios : []), ...(Array.isArray(checks.faltando) ? checks.faltando : [])].filter((x): x is string => typeof x === 'string').slice(0, 12);
    const estado = String(row.estado ?? '');
    if (Number(row.version) !== CURADORIA_VERSION) return verdict(mode, 'versao_antiga', faltando, estado);
    const now = await articleFingerprint({ title: article.title as string, excerpt: article.excerpt as string, content: article.content as string, featured_image_url: article.featured_image_url as string, slug: article.slug as string });
    if (row.content_hash !== now) return verdict(mode, 'desatualizada', faltando, estado);
    const key = imageKey(article.featured_image_url);
    if (!key) return verdict(mode, 'imagem_ausente', faltando, estado);
    if (estado === 'bloqueado') return verdict(mode, 'bloqueado', faltando, estado);
    if (estado !== 'aprovado') return verdict(mode, 'precisa_correcao', faltando, estado);
    // conferência ao vivo: outro artigo do projeto com exatamente a mesma imagem (URL idêntica)
    if (article.project_id && typeof article.featured_image_url === 'string' && !/^data:/i.test(article.featured_image_url)) {
      const dup = await admin.from('articles').select('id').eq('project_id', article.project_id).eq('featured_image_url', article.featured_image_url).neq('id', article.id).limit(1);
      if (dup.error) throw dup.error;
      if (Array.isArray(dup.data) && dup.data.length) return verdict(mode, 'imagem_repetida_ao_vivo', faltando, estado);
    }
    return verdict(mode, 'ok', [], estado);
  } catch {
    console.error('[curadoria-gate] read_failed');
    // falha fechada no modo ligado; no modo aviso segue
    return verdict(mode, 'erro_de_leitura');
  }
}

/** Corpo da recusa 409 (mesmo formato dos outros portões de publicação). */
export function gateRefusalBody(v: GateVerdict, requestId: string): Rec {
  return {
    success: false, error: v.message, code: 'curadoria_pendente', motivo: v.reason, faltando: v.faltando, estado_da_curadoria: v.estado, retryable: false, request_id: requestId,
  };
}

/** Resumo curto para devolver junto da resposta quando o modo é `aviso`. */
export const gateAdvisory = (v: GateVerdict): Rec | null => (v.pending ? { modo: v.mode, motivo: v.reason, mensagem: v.message, faltando: v.faltando } : null);
