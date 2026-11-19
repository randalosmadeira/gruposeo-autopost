import { describe, expect, it } from 'vitest';
import { handleProfileAction } from '../../supabase/functions/_shared/profile-handler';
import { cleanStrategy } from '../../supabase/functions/_shared/nexus-business';

/** Banco em memória com o mínimo do cliente do Supabase usado pelo tratador (select/insert/update/upsert + filtros). */
type Row = Record<string, unknown>;
function fakeAdmin(tables: Record<string, Row[]>) {
  const log: string[] = [];
  const from = (name: string) => {
    tables[name] ||= [];
    const rows = () => tables[name];
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: Row = {};
    let conflict = '';
    const filters: Array<(r: Row) => boolean> = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let lim = Infinity;
    const matched = () => rows().filter((r) => filters.every((f) => f(r)));
    const exec = (): { data: unknown; error: unknown } => {
      if (op === 'insert') {
        const pk = name === 'project_profile_extended' || name === 'project_profile_private' ? 'project_id' : name === 'project_profile_snapshots' ? '' : '';
        if (pk && rows().some((r) => r[pk] === payload[pk])) return { data: null, error: { code: '23505' } };
        if (name === 'project_profile_snapshots' && rows().some((r) => r.project_id === payload.project_id && r.version === payload.version)) return { data: null, error: { code: '23505' } };
        const row = { id: `${name}-${rows().length + 1}`, ...payload };
        rows().push(row);
        log.push(`insert:${name}`);
        return { data: [row], error: null };
      }
      if (op === 'update') {
        const hit = matched();
        // simula o gatilho do banco: mudar nexus_strategy sobe a versão (nexus_strategy_versioning)
        hit.forEach((r) => {
          const bump = name === 'projects' && payload.nexus_strategy !== undefined && JSON.stringify(payload.nexus_strategy) !== JSON.stringify(r.nexus_strategy);
          Object.assign(r, payload);
          if (bump) r.nexus_strategy_version = Number(r.nexus_strategy_version) + 1;
        });
        if (hit.length) log.push(`update:${name}`);
        return { data: hit, error: null };
      }
      if (op === 'upsert') {
        const keys = conflict.split(',');
        const found = rows().find((r) => keys.every((k) => r[k] === payload[k]));
        if (found) Object.assign(found, payload); else rows().push({ ...payload });
        log.push(`upsert:${name}`);
        return { data: null, error: null };
      }
      let out = matched();
      if (orderBy) out = [...out].sort((a, b) => (Number(a[orderBy!.col]) - Number(b[orderBy!.col])) * (orderBy!.asc ? 1 : -1));
      return { data: out.slice(0, lim), error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      insert: (p: Row) => { op = 'insert'; payload = p; return q; },
      update: (p: Row) => { op = 'update'; payload = p; return q; },
      upsert: (p: Row, o: { onConflict: string }) => { op = 'upsert'; payload = p; conflict = o.onConflict; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      order: (col: string, o?: { ascending?: boolean }) => { orderBy = { col, asc: o?.ascending ?? true }; return q; },
      limit: (n: number) => { lim = n; return q; },
      maybeSingle: () => { const r = exec(); const d = r.data as Row[] | null; return Promise.resolve({ data: d && d.length ? d[0] : null, error: r.error }); },
      single: () => { const r = exec(); const d = r.data as Row[] | null; return Promise.resolve({ data: d && d.length ? d[0] : null, error: r.error }); },
      then: (resolve: (v: unknown) => unknown) => resolve(exec()),
    };
    return q;
  };
  // P5: a decisão de módulo é gravada pela função do banco; aqui ela é simulada (a lógica de verdade é testada em SQL e em perfil-p5-*).
  const rpc = async (fn: string, args: Row) => {
    log.push(`rpc:${fn}`);
    if (fn === 'apply_project_module') {
      const keys = ['project_id', 'module_code'];
      const row = { project_id: args.p_project, organization_id: (tables.projects || []).find((p) => p.id === args.p_project)?.organization_id, module_code: args.p_module, enabled: args.p_enabled, reason: args.p_reason, decided_by: args.p_actor, paused_state: {} };
      const found = (tables.project_modules ||= []).find((r) => keys.every((k) => r[k] === row[k]));
      if (found) Object.assign(found, row); else tables.project_modules.push(row);
      return { data: { enabled: args.p_enabled, effects: [] }, error: null };
    }
    if (fn === 'preview_project_module') return { data: [], error: null };
    return { data: null, error: { code: 'PGRST202' } };
  };
  return { admin: { from, rpc }, tables, log };
}

const PID = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const OTHER_PID = '33333333-3333-4333-8333-333333333333';
const OTHER_ORG = '44444444-4444-4444-8444-444444444444';

function mundo(over: Partial<Record<string, Row[]>> = {}) {
  return fakeAdmin({
    projects: [
      { id: PID, name: 'Blog Teste', domain: 'teste.com.br', organization_id: ORG, user_id: 'u-dono', nexus_business_id: null, nexus_strategy: cleanStrategy({ offer: 'Oferta antiga', sector: 'Direito' }), nexus_strategy_version: 4, nexus_profile_status: 'complete', social_links: {}, editorial_identity: {}, commercial_info: {} },
      { id: OTHER_PID, name: 'De outra org', organization_id: OTHER_ORG, user_id: 'u-outro', nexus_business_id: 'b', nexus_strategy: cleanStrategy({}), nexus_strategy_version: 0, nexus_profile_status: 'pending' },
    ],
    nexus_businesses: [],
    project_profile_extended: [],
    project_profile_private: [],
    project_profile_snapshots: [],
    module_catalog: [{ code: 'dashboard', name: 'Painel', description: null, route: '/dashboard', core: true, default_enabled: true, sort: 10 }, { code: 'articles', name: 'Artigos', description: null, route: '/articles', core: false, default_enabled: true, sort: 100 }],
    project_modules: [],
    ...over,
  });
}
const roles = (r: string | null) => new Map<string, string>(r ? [[ORG, r]] : []);
const call = (w: ReturnType<typeof mundo>, action: string, body: Record<string, unknown>, role: string | null = 'owner') =>
  handleProfileAction(w.admin, { action, body: { projectId: PID, ...body }, userId: 'u-1', roleByOrg: roles(role) });
const EXP0 = { strategy: 4, extended: 0, private: 0 };

describe('tratador do perfil: leitura', () => {
  it('abre um projeto sem perfil novo: versão 0, estratégia antiga intacta, módulos do catálogo', async () => {
    const w = mundo();
    const r = await call(w, 'profile_load', {});
    expect(r.status).toBe(200);
    const b = r.body as { extended: { version: number }; strategy: { data: Record<string, string>; version: number }; private: unknown; modules: { catalog: unknown[] } };
    expect(b.extended.version).toBe(0);
    expect(b.strategy.data.offer).toBe('Oferta antiga');
    expect(b.strategy.version).toBe(4);
    expect(b.private).toEqual({ version: 0, finance: {}, goals: {} });
    expect(b.modules.catalog).toHaveLength(2);
    expect(w.log).toEqual([]); // leitura não grava nada
  });

  it('visualizador lê mas não recebe o financeiro; editor também não', async () => {
    const w = mundo({ project_profile_private: [{ project_id: PID, version: 2, finance: { fat: 99999 }, goals: {} }] });
    for (const role of ['viewer', 'editor']) {
      const r = await call(w, 'profile_load', {}, role);
      expect((r.body as Record<string, unknown>).private).toBeNull();
      expect(JSON.stringify(r.body)).not.toContain('99999');
    }
    const dono = await call(w, 'profile_load', {}, 'admin');
    expect(JSON.stringify(dono.body)).toContain('99999');
  });

  it('projeto de outra organização, id inválido e projeto inexistente são recusados', async () => {
    const w = mundo();
    expect((await handleProfileAction(w.admin, { action: 'profile_load', body: { projectId: OTHER_PID }, userId: 'u-1', roleByOrg: roles('owner') })).status).toBe(403);
    expect((await call(w, 'profile_load', { projectId: 'nao-e-uuid' })).status).toBe(422);
    expect((await call(w, 'profile_load', { projectId: '55555555-5555-4555-8555-555555555555' })).status).toBe(404);
    expect((await call(w, 'profile_load', {}, null)).status).toBe(403);
  });
});

describe('tratador do perfil: gravação', () => {
  it('primeira gravação: cria o perfil estendido v1, a estratégia nova (com negócio vinculado), o financeiro e a versão guardada SEM financeiro', async () => {
    const w = mundo();
    const r = await call(w, 'profile_save', { changes: { fase: 'Crescendo', offer: 'Oferta nova', fat: '50.000,00' }, expected: EXP0 });
    expect(r.status).toBe(200);
    expect(w.tables.project_profile_extended[0]).toMatchObject({ project_id: PID, organization_id: ORG, version: 1, sections: { negocio: { fase: 'Crescendo' } } });
    expect(w.tables.project_profile_private[0]).toMatchObject({ version: 1, finance: { fat: 50000 } });
    const proj = w.tables.projects[0];
    expect((proj.nexus_strategy as Record<string, string>).offer).toBe('Oferta nova');
    expect((proj.nexus_strategy as Record<string, string>).sector).toBe('Direito'); // o que não veio não muda
    expect(proj.nexus_business_id).toBeTruthy();
    expect(w.tables.nexus_businesses).toHaveLength(1);
    expect(w.tables.project_profile_snapshots).toHaveLength(1);
    expect(JSON.stringify(w.tables.project_profile_snapshots)).not.toContain('50000');
    expect(JSON.stringify(r.body)).toContain('50000'); // dono vê o próprio financeiro na resposta
  });

  it('mudar só seção não toca a estratégia (não dispara revisão de artigos) nem o financeiro', async () => {
    const w = mundo();
    await call(w, 'profile_save', { changes: { fase: 'Crescendo' }, expected: EXP0 });
    expect(w.log).not.toContain('update:projects');
    expect(w.tables.project_profile_private).toHaveLength(0);
    expect(w.tables.nexus_businesses).toHaveLength(0);
  });

  it('salvar de novo sem mudança não grava nada', async () => {
    const w = mundo();
    await call(w, 'profile_save', { changes: { fase: 'Crescendo' }, expected: EXP0 });
    const antes = w.log.length;
    const r = await call(w, 'profile_save', { changes: { fase: 'Crescendo' }, expected: { strategy: 4, extended: 1, private: 0 } });
    expect(r.status).toBe(200);
    expect((r.body as Record<string, unknown>).noop).toBe(true);
    expect(w.log.length).toBe(antes);
  });

  it('versão desatualizada: 409, nada é alterado', async () => {
    const w = mundo();
    await call(w, 'profile_save', { changes: { fase: 'Crescendo' }, expected: EXP0 });
    const snapshot = JSON.stringify(w.tables);
    const r = await call(w, 'profile_save', { changes: { fase: 'Começando' }, expected: EXP0 });
    expect(r.status).toBe(409);
    expect((r.body as Record<string, unknown>).error).toBe('profile_changed_reload');
    expect(JSON.stringify(w.tables)).toBe(snapshot);
  });

  it('estratégia mudou em outra tela (versão diferente): 409 antes de gravar a estratégia', async () => {
    const w = mundo();
    const r = await call(w, 'profile_save', { changes: { offer: 'Nova' }, expected: { strategy: 3, extended: 0, private: 0 } });
    expect(r.status).toBe(409);
    expect((w.tables.projects[0].nexus_strategy as Record<string, string>).offer).toBe('Oferta antiga');
    expect(w.tables.project_profile_extended).toHaveLength(0);
  });

  it('papéis: visualizador não grava; editor grava mas não o financeiro; dono grava tudo', async () => {
    const w = mundo();
    expect((await call(w, 'profile_save', { changes: { fase: 'Crescendo' }, expected: EXP0 }, 'viewer')).status).toBe(403);
    expect((await call(w, 'profile_save', { changes: { fat: 10 }, expected: EXP0 }, 'editor')).status).toBe(422);
    expect(w.tables.project_profile_private).toHaveLength(0);
    expect((await call(w, 'profile_save', { changes: { fase: 'Crescendo' }, expected: EXP0 }, 'editor')).status).toBe(200);
  });

  it('valor inválido: 422 com o campo, nada gravado', async () => {
    const w = mundo();
    const r = await call(w, 'profile_save', { changes: { cnpj: '123', fase: 'Crescendo' }, expected: EXP0 });
    expect(r.status).toBe(422);
    expect((r.body as { fields: Record<string, string> }).fields.cnpj).toBe('invalid_cnpj');
    expect(w.tables.project_profile_extended).toHaveLength(0);
  });

  it('chave desconhecida (por exemplo, tentativa de gravar fora do registro) é descartada', async () => {
    const w = mundo();
    const r = await call(w, 'profile_save', { changes: { fase: 'Crescendo', wordpress_app_password: 'x', schema_profile: {} }, expected: EXP0 });
    expect(r.status).toBe(200);
    expect((r.body as Record<string, unknown>).ignored).toEqual(['wordpress_app_password', 'schema_profile']);
    expect(JSON.stringify(w.tables)).not.toContain('wordpress_app_password');
  });
});

describe('tratador do perfil: versões e módulos', () => {
  it('restaura uma versão como nova versão, sem tocar no financeiro', async () => {
    const w = mundo();
    await call(w, 'profile_save', { changes: { fase: 'Começando', offer: 'Primeira oferta', fat: 1000 }, expected: EXP0 });
    await call(w, 'profile_save', { changes: { fase: 'Crescendo', offer: 'Segunda oferta', fat: 2000 }, expected: { strategy: 5, extended: 1, private: 1 } });
    const r = await call(w, 'profile_restore', { version: 1, expected: { strategy: 6, extended: 2, private: 2 } });
    expect(r.status).toBe(200);
    expect(w.tables.project_profile_extended[0]).toMatchObject({ version: 3, sections: { negocio: { fase: 'Começando' } } });
    expect((w.tables.projects[0].nexus_strategy as Record<string, string>).offer).toBe('Primeira oferta');
    expect(w.tables.project_profile_private[0]).toMatchObject({ version: 2, finance: { fat: 2000 } });
    expect(w.tables.project_profile_snapshots).toHaveLength(3);
    expect((await call(w, 'profile_restore', { version: 99, expected: { strategy: 7, extended: 3, private: 2 } })).status).toBe(404);
  });

  it('decisão de módulo: dono liga e desliga, nuclear não desliga, editor não decide', async () => {
    const w = mundo();
    expect((await call(w, 'modules_set', { moduleCode: 'articles', enabled: false, reason: 'sem uso' })).status).toBe(200);
    expect(w.tables.project_modules[0]).toMatchObject({ project_id: PID, module_code: 'articles', enabled: false, reason: 'sem uso', decided_by: 'u-1' });
    expect((await call(w, 'modules_set', { moduleCode: 'articles', enabled: true })).status).toBe(200);
    expect(w.tables.project_modules).toHaveLength(1);
    expect(w.tables.project_modules[0].enabled).toBe(true);
    expect((await call(w, 'modules_set', { moduleCode: 'dashboard', enabled: false })).status).toBe(422);
    expect((await call(w, 'modules_set', { moduleCode: 'articles', enabled: false }, 'editor')).status).toBe(403);
  });
});
