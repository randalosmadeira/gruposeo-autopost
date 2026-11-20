/**
 * Barramento de eventos do projeto (tabela project_events): módulos PUBLICAM fatos; outros módulos e a tela LEEM (linha do tempo).
 *
 *  - `recordEvent(s)`: grava sem nunca derrubar a ação que o chamou (falha de gravação só devolve false e vai ao log sem conteúdo);
 *  - limpa o conteúdo: chaves de segredo somem, textos são cortados e o tamanho total é limitado;
 *  - `listEvents` / `handleEventsAction` (módulo `eventos`, ação `list`): leitura por qualquer membro da organização.
 * Só acrescenta (o banco recusa update). Nada aqui chama serviço pago.
 */
import { fail, ok, resolveProject, type Admin, type Reply } from './engine-kernel.ts';
import { STUDIO_EVENT_LABELS } from './studio-events.ts';

export const EVENT_KIND_RE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;
export const EVENTS_ACTIONS = ['list'];
export const MAX_EVENT_JSON = 8000;
const SECRET_KEY = /(secret|token|password|passwd|vault|api_?key|key_value|credential|authorization)/i;

export interface ProjectEventInput { organization_id: string; project_id: string; module: string; kind: string; subject?: Record<string, unknown>; payload?: Record<string, unknown> }
export interface ProjectEventRow { id: string; module: string; kind: string; subject: Record<string, unknown>; payload: Record<string, unknown>; created_at: string }

/** Remove chaves de segredo (em qualquer nível), corta textos longos e listas grandes. */
export function sanitizeEventData(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 4) return null;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitizeEventData(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 40)) if (!SECRET_KEY.test(k)) out[k] = sanitizeEventData(v, depth + 1);
    return out;
  }
  return null;
}

function cleanObject(v: unknown): Record<string, unknown> {
  const s = sanitizeEventData(v);
  const o = s && typeof s === 'object' && !Array.isArray(s) ? s as Record<string, unknown> : {};
  return JSON.stringify(o).length > MAX_EVENT_JSON ? { truncated: true } : o;
}

export function buildEventRow(e: ProjectEventInput): Record<string, unknown> | null {
  if (!e.organization_id || !e.project_id || !e.module || !EVENT_KIND_RE.test(e.kind) || e.kind.length > 80) return null;
  return { organization_id: e.organization_id, project_id: e.project_id, module: e.module.slice(0, 40), kind: e.kind, subject: cleanObject(e.subject), payload: cleanObject(e.payload) };
}

/** Grava um fato. Nunca lança: o fato é secundário e não pode derrubar a ação principal. */
export async function recordEvent(admin: Admin, e: ProjectEventInput): Promise<boolean> {
  return (await recordEvents(admin, [e])) === 1;
}

/** Grava vários fatos de uma vez; devolve quantos entraram. */
export async function recordEvents(admin: Admin, list: ProjectEventInput[]): Promise<number> {
  const rows = list.map(buildEventRow).filter((r): r is Record<string, unknown> => r !== null);
  if (!rows.length) return 0;
  try {
    const r = await admin.from('project_events').insert(rows);
    if (r.error) { console.error('[project-events] write_failed'); return 0; }
    return rows.length;
  } catch { console.error('[project-events] write_failed'); return 0; }
}

export interface ListOptions { module?: string; kind?: string; limit?: number; before?: string }
/** Fatos mais recentes primeiro. */
export async function listEvents(admin: Admin, projectId: string, opts: ListOptions = {}): Promise<ProjectEventRow[]> {
  const limit = Math.max(1, Math.min(Math.floor(opts.limit ?? 50), 200));
  let q = admin.from('project_events').select('id,module,kind,subject,payload,created_at').eq('project_id', projectId);
  if (opts.module) q = q.eq('module', opts.module);
  if (opts.kind) q = q.eq('kind', opts.kind);
  if (opts.before) q = q.lt('created_at', opts.before);
  const r = await q.order('created_at', { ascending: false }).limit(limit);
  if (r.error) throw r.error;
  return (r.data || []) as ProjectEventRow[];
}

/** Texto em português de cada tipo de fato (a tela usa; tipo desconhecido aparece como está). */
export const EVENT_LABELS: Record<string, string> = {
  'indexacao.inventario_atualizado': 'Inventário de URLs atualizado',
  'indexacao.url_descoberta': 'URLs novas descobertas',
  'indexacao.verificadas': 'URLs verificadas no site',
  'indexacao.problema': 'Problema de indexação encontrado',
  'indexacao.google_consultado': 'Estado no Google consultado (somente leitura)',
  'indexacao.enviada': 'URLs enviadas a buscador',
  'indexacao.higiene': 'Higiene de indexação verificada',
  'indexacao.chave_indexnow': 'Chave do IndexNow cadastrada',
  'estrutura.mapa_atualizado': 'Mapa do domínio atualizado',
  'conexao.plugin_atualizado': 'Plugin do WordPress atualizado (o plugin avisou)',
  'backlinks.verificados': 'Backlinks verificados',
  'radar.foco_criado': 'Foco de mercado criado',
  'radar.rodada_concluida': 'Rodada do radar concluída',
  'radar.parada_no_teto': 'Radar parou no teto diário de gasto',
  'radar.rotina_executada': 'Rotina do radar executada',
  'radar.concorrentes_fundidos': 'Concorrentes fundidos',
  'radar.pontas_soltas_ligadas': 'Pontas soltas ligadas à árvore',
  ...STUDIO_EVENT_LABELS,
};
export const describeEvent = (e: Pick<ProjectEventRow, 'kind' | 'payload'>): string => {
  const base = EVENT_LABELS[e.kind] || e.kind;
  const n = typeof e.payload?.count === 'number' ? e.payload.count : typeof e.payload?.urls === 'number' ? e.payload.urls : null;
  return n !== null ? `${base} (${n.toLocaleString('pt-BR')})` : base;
};

/** Módulo `eventos` do portão: ação `list` (qualquer membro). */
export async function handleEventsAction(admin: Admin, ctx: { action: string; body: Record<string, unknown>; roleByOrg: Map<string, string> }): Promise<Reply> {
  try {
    if (ctx.action !== 'list') return fail(400, 'unknown_action');
    const scope = await resolveProject(admin, ctx, ctx.body.projectId);
    if (scope.ok === false) return scope.reply;
    const mod = typeof ctx.body.eventModule === 'string' && /^[a-z0-9_]{2,40}$/.test(ctx.body.eventModule) ? ctx.body.eventModule : undefined;
    const before = typeof ctx.body.before === 'string' && Number.isFinite(Date.parse(ctx.body.before)) ? ctx.body.before : undefined;
    const events = await listEvents(admin, scope.project.id, { module: mod, before, limit: Number(ctx.body.limit) || 50 });
    return ok({ events: events.map((e) => ({ ...e, text: describeEvent(e) })) });
  } catch (_e) {
    console.error('[eventos] operation_failed');
    return fail(500, 'eventos_operation_failed');
  }
}
