/** Banco em memória com o mínimo do cliente do Supabase usado pelas funções de borda dos testes (select/insert/update/upsert/delete + filtros + rpc). */
export type Row = Record<string, unknown>;
export type RpcHandler = (args: Record<string, unknown>, tables: Record<string, Row[]>) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>;

export function fakeAdmin(tables: Record<string, Row[]>, rpcs: Record<string, RpcHandler> = {}) {
  const log: string[] = [];
  let seq = 0;
  const from = (name: string) => {
    tables[name] ||= [];
    const rows = () => tables[name];
    let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payload: Row | Row[] = {};
    let conflict = '';
    const filters: Array<(r: Row) => boolean> = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let lim = Infinity;
    const matched = () => rows().filter((r) => filters.every((f) => f(r)));
    const exec = (): { data: unknown; error: unknown } => {
      if (op === 'insert') {
        const list: Row[] = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, created_at: new Date(Date.UTC(2026, 10, 15, 12, 0, seq)).toISOString(), ...p }));
        for (const row of list) {
          if (name === 'project_profile_extended' || name === 'project_profile_private') {
            if (rows().some((r) => r.project_id === row.project_id)) return { data: null, error: { code: '23505' } };
          }
          if (name === 'project_profile_snapshots' && rows().some((r) => r.project_id === row.project_id && r.version === row.version)) return { data: null, error: { code: '23505' } };
          rows().push(row);
          log.push(`insert:${name}`);
        }
        return { data: list, error: null };
      }
      if (op === 'update') {
        const hit = matched();
        hit.forEach((r) => {
          const bump = name === 'projects' && (payload as Row).nexus_strategy !== undefined && JSON.stringify((payload as Row).nexus_strategy) !== JSON.stringify(r.nexus_strategy);
          Object.assign(r, payload);
          if (bump) r.nexus_strategy_version = Number(r.nexus_strategy_version) + 1;
        });
        if (hit.length) log.push(`update:${name}`);
        return { data: hit, error: null };
      }
      if (op === 'delete') {
        const hit = matched();
        tables[name] = rows().filter((r) => !hit.includes(r));
        log.push(`delete:${name}`);
        return { data: hit, error: null };
      }
      if (op === 'upsert') {
        const keys = conflict.split(',');
        const p = payload as Row;
        const found = rows().find((r) => keys.every((k) => r[k] === p[k]));
        if (found) Object.assign(found, p); else rows().push({ ...p });
        log.push(`upsert:${name}`);
        return { data: null, error: null };
      }
      let out = matched();
      if (orderBy) out = [...out].sort((a, b) => (String(a[orderBy!.col]) < String(b[orderBy!.col]) ? -1 : String(a[orderBy!.col]) > String(b[orderBy!.col]) ? 1 : 0) * (orderBy!.asc ? 1 : -1));
      return { data: out.slice(0, lim), error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      insert: (p: Row | Row[]) => { op = 'insert'; payload = p; return q; },
      update: (p: Row) => { op = 'update'; payload = p; return q; },
      delete: () => { op = 'delete'; return q; },
      upsert: (p: Row, o: { onConflict: string }) => { op = 'upsert'; payload = p; conflict = o.onConflict; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      gte: (c: string, v: unknown) => { filters.push((r) => String(r[c]) >= String(v)); return q; },
      order: (col: string, o?: { ascending?: boolean }) => { orderBy = { col, asc: o?.ascending ?? true }; return q; },
      limit: (n: number) => { lim = n; return q; },
      maybeSingle: () => { const r = exec(); const d = r.data as Row[] | null; return Promise.resolve({ data: d && d.length ? d[0] : null, error: r.error }); },
      single: () => { const r = exec(); const d = r.data as Row[] | null; return Promise.resolve({ data: d && d.length ? d[0] : null, error: r.error }); },
      then: (resolve: (v: unknown) => unknown) => resolve(exec()),
    };
    return q;
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    log.push(`rpc:${name}`);
    const handler = rpcs[name];
    if (!handler) return { data: null, error: { message: `rpc_not_mocked:${name}` } };
    return await handler(args, tables);
  };
  return { admin: { from, rpc }, tables, log };
}
