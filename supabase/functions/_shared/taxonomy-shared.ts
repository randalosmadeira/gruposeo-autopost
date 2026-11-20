import type { Deps } from './profile-analyze-core.ts';
import type { NodeKind, NodeStatus } from './taxonomy-core.ts';

/** Pequenas peças comuns do Motor de Taxonomia e do Planejador (respostas, validação de id, leitura paginada). Sem regra de negócio. */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Admin = any;
export type Reply = { status: number; body: Record<string, unknown> };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
export const chunk = <T,>(list: T[], size: number): T[][] => { const out: T[][] = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; };

/** Sem teto de quantidade: lê até acabar (as páginas de 1.000 evitam estourar a memória do pedido). */
export const UNBOUNDED = Number.MAX_SAFE_INTEGER;

/** Lê uma tabela inteira do projeto em páginas de 1.000 (com teto), com a coluna e o filtro pedidos. */
export async function loadAll<T = Record<string, unknown>>(admin: Admin, table: string, columns: string, filter: { col: string; val: unknown } | null, maxRows = 20000, order?: string): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += 1000) {
    let q = admin.from(table).select(columns);
    if (filter) q = q.eq(filter.col, filter.val);
    if (order) q = q.order(order, { ascending: true });
    const r = await q.range(from, from + 999);
    if (r.error) throw r.error;
    rows.push(...((r.data || []) as T[]));
    if (!r.data || r.data.length < 1000) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export interface TaxonomyCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string>; deps: Deps; /** só para teste: o padrão é o bloqueio global real de gasto */ paidBlocked?: boolean }
export interface NodeRow { id: string; kind: NodeKind; parent_id: string | null; slug: string; label: string; keywords: string[]; source: string; status: NodeStatus; evidence: Record<string, unknown>; created_at?: string; updated_at?: string }
export interface ScopeRow { id: string; country?: string; language?: string; uf: string | null; ibge_code: number | null; municipio: string | null; bairro?: string | null; regiao: string | null; role: string; source: string; status: NodeStatus; evidence: Record<string, unknown> }
export interface ProjectRow { id: string; name: string; domain: string | null; wordpress_url: string | null; organization_id: string }

export const NODE_COLUMNS = 'id,kind,parent_id,slug,label,keywords,source,status,evidence,created_at,updated_at';
export const SCOPE_COLUMNS = 'id,country,language,uf,ibge_code,municipio,bairro,regiao,role,source,status,evidence,created_at';
export const loadNodes = async (admin: Admin, projectId: string) => (await loadAll<NodeRow>(admin, 'project_taxonomy_nodes', NODE_COLUMNS, { col: 'project_id', val: projectId }, UNBOUNDED)).rows;
export const loadScope = async (admin: Admin, projectId: string) => (await loadAll<ScopeRow>(admin, 'project_geo_scope', SCOPE_COLUMNS, { col: 'project_id', val: projectId }, UNBOUNDED)).rows;
