/** Cliente do Estúdio de Páginas: chama o portão `engine` com module='estudio' e traduz os erros para português. */
import { callEngine, EngineError } from '@/lib/engine-api';

export type PageType = 'pagina' | 'landing' | 'hub' | 'servico' | 'local' | 'guia' | 'comparativo';
export type PageStatus = 'rascunho' | 'em_revisao' | 'aprovada' | 'publicada' | 'despublicada';
export type Adapter = 'wordpress_plugin' | 'site_manifest' | 'zica_hosted';
export type GateStatus = 'ok' | 'aviso' | 'falha' | 'info' | 'desligado';

export interface PageSummary { id: string; type: PageType; status: PageStatus; title: string; slug_path: string; url: string | null; language: string; place: string | null; version: number; quality_score: number | null; ai_score: number | null; pending_count: number; adapter: Adapter; updated_at: string; live: boolean }
export interface ProfileGap { key: string; label: string; where: string }
export interface CostEstimate { perPageMicros: { text: number; images: number; total: number }; pagesPerDayWithinCap: number; capMicros: number; extraMicros: number; note: string }
export interface StudioOptions { batch_limit: number; daily_publish_limit: number; require_distinct_approver: boolean; max_ai_steps: number; step_max_tokens: number; benchmark_top_n: number; rewrite_rounds: number; created_in_24h?: number }
export interface StudioList {
  project: { id: string; name: string; domain: string | null }; can_edit: boolean; total: number; page: number; page_size: number; counts: Record<PageStatus, number>; pages: PageSummary[];
  options: StudioOptions; rules_layers: string[]; capabilities: { ai: boolean; images: boolean; plugin: boolean; radar: boolean; serp_local: boolean; observatory: boolean; taxonomy: boolean; focuses: boolean };
  profile_gaps: ProfileGap[]; cost: CostEstimate; adapters: Adapter[]; types: PageType[]; origin: string | null; base_path: string;
}

export interface GateResult { id: string; label: string; level: 'exigir' | 'recomendar' | 'desligado'; status: GateStatus; note: string; fix: string | null; details?: string[] }
export interface AiFinding { code: string; label: string; excerpt: string; paragraph: number; severity: 1 | 2 | 3; fix: string }
export interface Quality {
  generated_at: string; content_hash: string; score: number; complete: boolean; blocking: string[]; warnings: string[]; ok: number; active: number; pendings: string[]; results: GateResult[];
  ai: { score: number; coverage: 'completa' | 'parcial' | 'estrutural'; words: number; metrics: Record<string, number | null>; findings: AiFinding[] };
  doorway: { verdict: 'ok' | 'fina' | 'porta'; uniquePct: number; maxSimilarity: number; mostSimilar: { label: string; similarity: number } | null; reasons: string[]; proposal: string | null };
  invention: Array<{ code: string; severity: 'bloqueia' | 'revisar'; excerpt: string; why: string }>;
}
export interface PendingItem { id: string; label: string; reason: string; kind: string }
export interface BriefAngle { id: string; kind: string; angle: string; proof: string[]; status: 'pronto' | 'pendente'; missing: string | null; gapTopics: string[] }
export interface Brief {
  query: string; type: PageType; radarSource: 'radar' | 'serp_local' | 'ausente'; notes: string[]; pendings: PendingItem[];
  intent: { recommendedType: PageType; dominant: string | null; mix: Record<string, number>; evidence: string[]; rationale: string; extraSurfaces: string[] };
  benchmark: { n: number; depth: 'completa' | 'so_titulos' | 'nenhuma'; medianWords: number | null; p75Words: number | null; schemaPrevalence: Record<string, number>; mediaShare: { images: number; videos: number }; medianAgeDays: number | null; pages: Array<{ position: number | null; host: string; title: string; words: number | null }>; topEntities: Array<{ entity: string; pages: number }>; socialSummary: { identities: number; topFormats: Array<{ format: string; identities: number }>; medianPostsPerMonth: number | null } };
  gaps: { theyCoverWeDont: Array<{ topic: string; kind: string; coveredBy: number; of: number }>; nobodyCovers: Array<{ topic: string; source: string }>; weCoverTheyDont: string[]; basis: string };
  angles: BriefAngle[]; surfaces: Array<{ kind: string; title: string; status: string; prerequisites: string[]; notes: string }>;
  goals: { linkedToRadar: boolean; goals: Array<{ key: string; label: string; current: number | boolean | null; target: string; source: string; status: 'medido' | 'pendente' }> };
  citedSources: { total: number; matched: string; byHost: Array<{ host: string; kind: string; count: number; share: number; engines: string[]; ownedByUs: boolean }>; own: { count: number; share: number }; presenceTargets: Array<{ host: string; kind: string; why: string; action: string }>; notes: string[] };
  outline: Array<{ level: number; heading: string; purpose: string; from: string }>;
}

export interface PlannedLink { url: string; anchor: string; kind: 'interno' | 'externo'; reason: string; verified?: boolean | null }
export interface PageImage { slot: string; origin: 'acervo' | 'gerada' | 'pendente'; url: string; alt: string; width: number; height: number; format: string; filename: string }
export interface PageDetail {
  page: PageSummary & { query: string; subject: string | null; host: string; base_path: string; h1: string; meta_description: string; body_html: string; public_url: string | null; approved_by: string | null; approved_at: string | null; last_error: string | null; content_hash: string; approved_hash: string | null; published_version: number | null };
  doc: { faq: Array<{ q: string; a: string }>; sources: Array<{ url: string; label: string; official?: boolean; verified?: boolean | null }>; links: PlannedLink[]; images: PageImage[]; fieldFacts: Array<{ id: string; kind: string; text: string; source_url: string | null; source_label: string | null; approved: boolean; place?: string | null }>; author: { name: string; credential: string | null } | null; noindex: boolean; inboundSuggested: Array<{ from: string; to: string; reason: string }> };
  brief: Brief; quality: Quality; marked_html: string; serp: { title: string; url: string; display_url: string; description: string }; preview_html: string; schema: unknown; schema_notes: string[];
  versions: Array<{ version: number; title: string; reason: string | null; created_at: string; content_hash: string }>; links: Array<{ direction: string; kind: string; url: string; anchor: string; reason: string | null; verified: boolean | null }>;
  assets: PageImage[]; publications: Array<{ version: number; adapter: Adapter; action: string; status: string; final_url: string | null; error: string | null; created_at: string; indexation: Record<string, unknown> }>; profile_gaps: ProfileGap[];
  pipeline: { stage: string | null; done: boolean; stopped: { reason: string; message: string } | null; sections: Array<{ id: string; heading: string | null; status: string; reason: string | null }> };
  can_edit: boolean; cost: CostEstimate; rules: { layers: string[]; options: StudioOptions; gates: Record<string, { level: string; value: number | null; max: number | null; source: string }> };
}
export interface StaticPackage { files: Array<{ path: string; content: string; sha256: string; bytes: number }>; manifest: Record<string, unknown>; warnings: string[]; instructions: string }

export const StudioError = EngineError;
const MESSAGES: Record<string, string> = {
  query_required: 'Informe a busca (ou o assunto) que a página precisa responder.',
  language_required: 'Informe o idioma da página (o sistema não presume idioma).',
  type_invalid: 'Tipo de página inválido.',
  slug_invalid: 'O endereço da página não é válido.',
  origin_required: 'O projeto não tem domínio cadastrado: sem ele não há endereço público.',
  batch_limit: 'Limite de páginas novas por lote atingido (definido no perfil de regras).',
  page_changed_reload: 'A página mudou enquanto você mexia. Recarregue e tente de novo.',
  not_approved: 'Só página aprovada por uma pessoa pode ser publicada.',
  approval_blocked: 'A página ainda não pode ser aprovada.',
  publish_blocked: 'A página não pode ser publicada ainda.',
  plugin_unavailable: 'A conexão com o plugin do WordPress não está disponível agora.',
  daily_limit: 'Limite de publicações por dia atingido (definido no perfil de regras).',
  doorway: 'Página de porta: o texto repete as páginas irmãs. Consolide.',
  brief_missing: 'Esta página ainda não tem briefing.',
  global_paid_services_blocked: 'Serviços pagos estão bloqueados globalmente: a geração por IA e de imagens fica para depois.',
  spend_denied: 'O teto de gasto do dia não permite esta ação agora.',
  role_not_allowed: 'Seu papel nesta organização permite ver, mas não alterar.',
  organization_membership_required: 'Você não faz parte da organização deste projeto.',
  unknown_module: 'O portão ainda não está no ar (função "engine" não publicada).',
};
export const studioErrorMessage = (e: unknown): string => {
  if (e instanceof EngineError) {
    const reasons = Array.isArray((e.detail as { reasons?: unknown } | null)?.reasons) ? ` ${((e.detail as { reasons: string[] }).reasons).join(' ')}` : '';
    return `${MESSAGES[e.code] || e.serverMessage || 'Não foi possível concluir agora. Tente de novo.'}${reasons}`.trim();
  }
  return 'Não foi possível concluir agora. Tente de novo.';
};

const call = <T>(action: string, body: Record<string, unknown>) => callEngine<T>('estudio', action, body);
export interface BriefInput { query: string; type?: PageType; language?: string; place?: string; subject?: string; slugPath?: string; adapter?: Adapter; focusId?: string; nodeId?: string; geoScopeId?: string; placeId?: string; fieldFacts?: Array<Record<string, unknown>>; sources?: Array<Record<string, unknown>>; allowMissingParent?: boolean }
export interface ReviseInput { title?: string; metaDescription?: string; h1?: string; bodyHtml?: string; slugPath?: string; fieldFacts?: Array<Record<string, unknown>>; sources?: Array<Record<string, unknown>>; faq?: Array<{ q: string; a: string }>; noindex?: boolean; reason?: string }
export const studio = {
  list: (projectId: string, f: { status?: string; type?: string; q?: string; page?: number } = {}) => call<StudioList>('list', { projectId, ...f }),
  detail: (projectId: string, pageId: string) => call<PageDetail>('detail', { projectId, pageId }),
  brief: (projectId: string, b: BriefInput) => call<{ page: PageSummary; brief: Brief; slug: unknown; pendings: PendingItem[]; profile_gaps: ProfileGap[] }>('brief', { projectId, ...b }),
  generate: (projectId: string, pageId: string, restart = false) => call<{ page: PageSummary; quality: Quality; pendings: PendingItem[]; pipeline: { stopped: { reason: string; message: string } | null; ai_used: number; cost_usd_micros: number; ai_available: boolean; done: boolean } }>('generate', { projectId, pageId, restart }),
  revise: (projectId: string, pageId: string, r: ReviseInput) => call<{ page: PageSummary; quality: Quality; redirect_needed: { from: string; to: string } | null }>('revise', { projectId, pageId, ...r }),
  check: (projectId: string, pageId: string, verifyLinks = false) => call<{ quality: Quality; links_verified: number }>('check', { projectId, pageId, verifyLinks }),
  planLinks: (projectId: string, pageId: string, verifyLinks = false) => call<{ links: PlannedLink[]; inbound: Array<{ from: string; to: string; reason: string }>; missing: { internal: number; external: number }; rejected_external: Array<{ url: string; why: string }> }>('plan_links', { projectId, pageId, verifyLinks }),
  images: (projectId: string, pageId: string, o: { generate?: boolean; scene?: { sceneEn: string; alt: string }; inline?: number } = {}) => call<{ images: PageImage[]; pendings: PendingItem[]; notes: string[]; generated: number; selected: number; cost_usd_micros: number }>('images', { projectId, pageId, ...o }),
  approve: (projectId: string, pageId: string, step: 'enviar' | 'aprovar' | 'devolver') => call<{ page: PageSummary }>('approve', { projectId, pageId, step }),
  publish: (projectId: string, pageId: string, o: { target?: 'publish' | 'draft'; confirmDeployed?: boolean; llmsTxt?: boolean } = {}) => call<{ published: boolean; url?: string; package?: StaticPackage; next_step?: string; draft_sent?: boolean; indexation?: Record<string, unknown>; warnings?: string[] }>('publish', { projectId, pageId, ...o }),
  unpublish: (projectId: string, pageId: string, o: { confirmRemoved?: boolean } = {}) => call<{ unpublished: boolean; next_step?: string }>('unpublish', { projectId, pageId, ...o }),
};

export const usd = (micros: number) => `US$ ${(micros / 1_000_000).toFixed(2)}`;
