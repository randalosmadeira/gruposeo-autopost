import { beforeEach, describe, expect, it } from 'vitest';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { handleAutoOptimizeAction, orchestratorPort, resetEventsProbe, type AutoOptimizeCtx } from '../../supabase/functions/_shared/auto-optimize-handler';
import type { AiRequest } from '../../supabase/functions/_shared/auto-optimize-core';

const ORG_A = '00000000-0000-4000-8000-0000000000a1';
const ORG_B = '00000000-0000-4000-8000-0000000000a2';
const USER = '00000000-0000-4000-8000-0000000000c1';
const PROJ = '00000000-0000-4000-8000-0000000000b1';
const PROJ_B = '00000000-0000-4000-8000-0000000000b2';
const ART = '00000000-0000-4000-8000-0000000000d1';
const ART_B = '00000000-0000-4000-8000-0000000000d2';
const NOW = Date.UTC(2026, 10, 20, 15, 0, 0);

const P1 = 'A prescrição extingue a pretensão do credor quando o prazo legal termina sem que a cobrança tenha sido feita, e o devedor pode alegar esse prazo vencido na própria defesa, desde que o juiz receba o pedido no momento correto do processo, porque a lei não permite que o magistrado reconheça o prazo sem provocação em muitos casos concretos.';
const P1_OK = 'A prescrição extingue a pretensão do credor quando o prazo legal termina sem cobrança. O devedor pode alegar esse prazo vencido na própria defesa. Isso vale desde que o juiz receba o pedido no momento correto do processo. A lei não permite que o magistrado reconheça o prazo sem provocação em muitos casos concretos.';
const CONTENT = `<h2>Prazo para recorrer</h2><p>${P1}</p><h2>Requisitos para a defesa</h2><p>Guarde comprovantes e contratos.</p>`;

function world(over: { identity?: Row; articleOrg?: string } = {}) {
  const tables: Record<string, Row[]> = {
    projects: [
      { id: PROJ, organization_id: ORG_A, name: 'Exemplo', domain: 'exemplo.com', wordpress_url: 'https://exemplo.com', nicho: 'general', editorial_identity: over.identity ?? { author_name: 'Dra. Ana Souza' }, nexus_strategy: {}, seo_plugin: null, empresa_nome: 'Exemplo', cta_conclusao: 'Fale com a nossa equipe pelo formulário do site.', updated_at: 'p1' },
      { id: PROJ_B, organization_id: ORG_B, name: 'Outra', editorial_identity: {}, nexus_strategy: {}, updated_at: 'p2' },
    ],
    articles: [
      { id: ART, organization_id: over.articleOrg ?? ORG_A, project_id: PROJ, title: 'Prescrição da dívida: prazos e defesa', keyword: 'prescrição da dívida', excerpt: 'Entenda os prazos de cobrança.', content: CONTENT, slug: 'prescricao', language: 'pt-BR', status: 'ready', published_url: null, config: { optimization_rules: { links_internos: 2 } }, updated_at: 'u1', created_at: '2026-11-01T10:00:00Z' },
      { id: ART_B, organization_id: ORG_B, project_id: PROJ_B, title: 'Outro', keyword: 'outro', excerpt: '', content: '<p>x</p>', config: {}, updated_at: 'u9' },
      { id: '00000000-0000-4000-8000-0000000000d3', organization_id: ORG_A, project_id: PROJ, title: 'Como negociar uma dívida antiga', keyword: 'negociar dívida', status: 'published', published_url: 'https://exemplo.com/negociar', config: {}, updated_at: 'u3' },
    ],
    wordpress_article_index: [], prompt_templates: [], project_events: [],
  };
  const w = fakeAdmin(tables, {
    spend_status: () => ({ data: { cap_usd_micros: 7_000_000, used_usd_micros: 1_400_000, remaining_to_cap_usd_micros: 5_600_000, state: 'livre' }, error: null }),
  });
  return { ...w, art: () => tables.articles[0], proj: () => tables.projects[0] };
}

let aiCalls: AiRequest[];
const ctxOf = (action: string, body: Record<string, unknown>, role: string | null = 'editor', extra: Partial<AutoOptimizeCtx> = {}): AutoOptimizeCtx => ({
  action, body, userId: USER, now: () => NOW,
  roleByOrg: new Map(role ? [[ORG_A, role]] : []),
  makeAi: () => ({ async call(req) { aiCalls.push(req); const content = req.stepId === 'conclusion' ? '<p>O artigo explica o prazo e os requisitos para a defesa.</p>' : req.user.includes(P1) ? `<p>${P1_OK}</p>` : req.user; return { content, costMicros: 5000, usage: { inputTokens: 500, outputTokens: 300 } }; } }),
  ...extra,
});
const call = (w: ReturnType<typeof world>, action: string, body: Record<string, unknown>, role: string | null = 'editor', extra: Partial<AutoOptimizeCtx> = {}) => handleAutoOptimizeAction(w.admin, ctxOf(action, body, role, extra));

async function runSteps(w: ReturnType<typeof world>, role = 'editor') {
  let r = await call(w, 'start', { articleId: ART }, role);
  let job = r.body.job as Record<string, unknown>;
  for (let i = 0; i < 12 && !(job.done as boolean); i++) { r = await call(w, 'step', { articleId: ART, job }, role); expect(r.status).toBe(200); job = r.body.job as Record<string, unknown>; }
  return job;
}

beforeEach(() => { aiCalls = []; resetEventsProbe(); });

describe('Piloto Automático (tratador): papéis, organização e entrada', () => {
  it('ação desconhecida 400; artigo ausente/inválido 422/404; sem vínculo com a organização 403 (o papel vem do banco, não do corpo)', async () => {
    const w = world();
    expect((await call(w, 'nada', {})).status).toBe(400);
    expect((await call(w, 'get', { articleId: 'x' })).status).toBe(422);
    expect((await call(w, 'get', { articleId: '00000000-0000-4000-8000-0000000000ff' })).status).toBe(404);
    expect((await call(w, 'get', { articleId: ART }, null)).body.error).toBe('organization_membership_required');
    // corpo tentando forjar organização/papel: ignorado
    expect((await call(w, 'get', { articleId: ART, organizationId: ORG_A, role: 'owner' }, null)).status).toBe(403);
    // artigo de OUTRA organização com usuário da A
    expect((await call(w, 'get', { articleId: ART_B }, 'owner')).status).toBe(403);
  });

  it('projeto de outra organização que o do artigo é fronteira violada', async () => {
    const w = world({ articleOrg: ORG_A });
    (w.tables.articles[0] as Row).project_id = PROJ_B;
    expect((await call(w, 'get', { articleId: ART }, 'owner')).body.error).toBe('organization_boundary');
  });

  it('leitor vê o estado, mas não roda, não aplica e não descarta', async () => {
    const w = world();
    const g = await call(w, 'get', { articleId: ART }, 'viewer');
    expect(g.status).toBe(200);
    expect(g.body).toMatchObject({ can_write: false, can_admin: false });
    for (const a of ['start', 'step', 'finish', 'trigger', 'apply', 'discard', 'get_proposal']) expect((await call(w, a, { articleId: ART, job: {} }, 'viewer')).status, a).toBe(403);
    expect(aiCalls.length).toBe(0);
  });

  it('get: regras com a origem de cada número, idioma/fórmula, teto do dia e custo do piloto; nada de segredo', async () => {
    const w = world();
    const g = await call(w, 'get', { articleId: ART }, 'editor');
    const body = g.body as { rules: Array<{ id: string; source: string; value: number | null }>; language: { tag: string; formula: { id: string } }; spend: { pct: number; cap_usd_micros: number }; pilot_today_usd_micros: number; auto: boolean };
    expect(body.rules.find((r) => r.id === 'internal_links')).toMatchObject({ source: 'artigo', value: 2 });
    expect(body.rules.find((r) => r.id === 'flesch')?.source).toBe('padrao_editavel');
    expect(body.language).toMatchObject({ tag: 'pt-BR', formula: { id: 'flesch_pt' } });
    expect(body.spend).toMatchObject({ cap_usd_micros: 7_000_000, pct: 20 });
    expect(body.auto).toBe(false);
    expect(body.pilot_today_usd_micros).toBe(0);
    expect(JSON.stringify(g.body)).not.toMatch(/service_role|api_key|secret/i);
  });
});

describe('Piloto Automático (tratador): passo a passo, rascunho de revisão e aplicação', () => {
  it('start, step... finish: o artigo NÃO muda; a proposta fica como rascunho versionado com relatório e custo', async () => {
    const w = world();
    const job = await runSteps(w);
    expect(aiCalls.length).toBeGreaterThan(0);
    for (const c of aiCalls) expect(c.maxTokens).toBeLessThanOrEqual(1800);
    const fin = await call(w, 'finish', { articleId: ART, job });
    expect(fin.status).toBe(200);
    expect(fin.body.proposal).toBe('pending_review');
    expect(w.art().content).toBe(CONTENT); // intacto até o dono aplicar
    const ao = (w.art().config as Row).auto_optimize as Row;
    expect((ao.proposal as Row).status).toBe('pending_review');
    expect(String((ao.proposal as Row).content)).toContain('Qual é o prazo para recorrer?');
    expect((ao.last_report as Row).cost_is_estimate).toBe(true);
    expect((ao.cost_log as unknown[]).length).toBe(1);
    expect(((w.art().config as Row).schema_plan as Row).types).toEqual(expect.arrayContaining(['Article', 'BreadcrumbList']));
    // custo do piloto no dia aparece no get
    const g = await call(w, 'get', { articleId: ART });
    expect(g.body.pilot_today_usd_micros).toBeGreaterThan(0);
    expect((g.body.proposal as Row).status).toBe('pending_review');
  });

  it('apply troca o texto e exige revisão antes de publicar; só uma vez; recusa se o artigo foi editado depois da análise', async () => {
    const w = world();
    await call(w, 'finish', { articleId: ART, job: await runSteps(w) });
    const gp = await call(w, 'get_proposal', { articleId: ART });
    expect(String((gp.body.proposal as Row).content)).toContain('<a href="https://exemplo.com/negociar">');
    // edição humana no meio: aplicar apagaria essa edição
    w.art().content = `${CONTENT}<p>edição nova</p>`;
    expect((await call(w, 'apply', { articleId: ART })).body.error).toBe('article_changed_since_proposal');
    expect((w.art().config as Row).auto_optimize).toBeTruthy();
    w.art().content = CONTENT;
    const ok = await call(w, 'apply', { articleId: ART });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ applied: true, needs_review_before_publish: true });
    expect(String(w.art().content)).toContain('Qual é o prazo para recorrer?');
    expect(((w.art().config as Row).auto_optimize as Row).proposal).toMatchObject({ status: 'applied', applied_by: USER });
    expect((await call(w, 'apply', { articleId: ART })).body.error).toBe('no_pending_proposal');
  });

  it('descartar o rascunho não mexe no texto', async () => {
    const w = world();
    await call(w, 'finish', { articleId: ART, job: await runSteps(w) });
    expect((await call(w, 'discard', { articleId: ART })).body.discarded).toBe(true);
    expect(w.art().content).toBe(CONTENT);
    expect((await call(w, 'discard', { articleId: ART })).status).toBe(409);
  });

  it('o artigo mudou durante a rodada: nada é gravado por cima (409)', async () => {
    const w = world();
    const job = await runSteps(w);
    w.art().content = `${CONTENT}<p>alguém editou durante a rodada</p>`;
    const fin = await call(w, 'finish', { articleId: ART, job });
    expect(fin.status).toBe(409);
    expect((w.art().config as Row).auto_optimize).toBeUndefined();
  });

  it('"aplicar sem revisão" ligado no projeto: aplica direto; mas se o teto parou o piloto, NÃO aplica (artigo intacto)', async () => {
    const w = world({ identity: { author_name: 'Dra. Ana Souza', optimization_rules: { options: { apply_without_review: true } } } });
    const job = await runSteps(w);
    const fin = await call(w, 'finish', { articleId: ART, job });
    expect(fin.body).toMatchObject({ proposal: 'applied', applied_without_review: true });
    expect(String(w.art().content)).toContain('Qual é o prazo para recorrer?');

    const w2 = world({ identity: { author_name: 'Dra. Ana Souza', optimization_rules: { options: { apply_without_review: true } } } });
    const negado = { makeAi: () => ({ async call() { const e = new Error('daily_cap_reached') as Error & { info?: unknown }; e.name = 'SpendDeniedError'; e.info = { code: 'daily_cap_reached', message: 'Teto diário de gasto com IA atingido: US$ 7,00 gastos hoje de US$ 7,00.' }; throw e; } }) };
    let r = await call(w2, 'start', { articleId: ART }, 'editor', negado);
    let j = r.body.job as Record<string, unknown>;
    for (let i = 0; i < 6 && !(j.done as boolean); i++) { r = await call(w2, 'step', { articleId: ART, job: j }, 'editor', negado); j = r.body.job as Record<string, unknown>; }
    expect((j.stopped as Row).reason).toBe('teto');
    expect((r.body.progress as Row).stopped).toMatchObject({ reason: 'teto' });
    const fin2 = await call(w2, 'finish', { articleId: ART, job: j }, 'editor', negado);
    expect(fin2.body.proposal).toBe('pending_review');
    expect(w2.art().content).toBe(CONTENT);
    expect((fin2.body.report as Row).partial).toBe(true);
  });

  it('o estado do trabalho vindo da tela é saneado: tamanho, tipos e listas limitadas; texto gigante é ignorado', async () => {
    const w = world();
    const r = await call(w, 'step', { articleId: ART, job: { working: { content: 'x'.repeat(500_000) }, applied: Array.from({ length: 999 }, () => ({})), aiUsed: 9999, costMicros: -5 } });
    expect(r.status).toBe(200);
    const j = r.body.job as { working: { content: string }; applied: unknown[]; aiUsed: number; costMicros: number };
    expect(j.working.content.length).toBeLessThan(10_000);
    expect(j.aiUsed).toBeLessThanOrEqual(50);
    expect(j.costMicros).toBeGreaterThanOrEqual(0);
    (w.art() as Row).content = 'y'.repeat(450_000);
    expect((await call(w, 'start', { articleId: ART })).status).toBe(413);
  });
});

describe('Piloto Automático (tratador): gatilho automático e liga/desliga por projeto', () => {
  it('automático desligado: o gatilho não faz nada; ligado: roda rápido (sem IA, sem gasto) e grava o rascunho; repetir não repete', async () => {
    const off = world();
    expect((await call(off, 'trigger', { articleId: ART, trigger: 'pre_publish' })).body.skipped).toBe('auto_off');
    const on = world({ identity: { author_name: 'Dra. Ana Souza', optimization_rules: { options: { auto: true } } } });
    const r = await call(on, 'trigger', { articleId: ART, trigger: 'pre_publish' });
    expect(r.body).toMatchObject({ ran: true, mode: 'quick', proposal: 'pending_review' });
    expect(aiCalls.length).toBe(0);
    const rep = r.body.report as { cost_usd_micros: number; pending: Array<{ kind: string }> };
    expect(rep.cost_usd_micros).toBe(0);
    expect(rep.pending.some((p) => p.kind === 'limite')).toBe(true);
    const again = await call(on, 'trigger', { articleId: ART, trigger: 'pre_publish' });
    expect(again.body.skipped).toBe('already_optimized');
    // manual ignora a chave "automático"
    expect((await call(off, 'trigger', { articleId: ART, trigger: 'manual', mode: 'quick' })).body.ran).toBe(true);
  });

  it('rodada completa pelo gatilho usa a IA em passos pequenos e respeita o perfil', async () => {
    const on = world({ identity: { author_name: 'Dra. Ana Souza', optimization_rules: { options: { auto: true, max_ai_steps: 2, step_max_tokens: 900 } } } });
    const r = await call(on, 'trigger', { articleId: ART, trigger: 'ready', mode: 'full' });
    expect(r.body).toMatchObject({ ran: true, mode: 'full' });
    expect(aiCalls.length).toBeLessThanOrEqual(2);
    for (const c of aiCalls) expect(c.maxTokens).toBeLessThanOrEqual(900);
  });

  it('set_auto: editor liga o automático; "aplicar sem revisão" e o portão do plugin só dono/administrador; preserva o resto da identidade', async () => {
    const w = world();
    expect((await call(w, 'set_auto', { projectId: PROJ, auto: true }, 'editor')).status).toBe(200);
    expect(w.proj().editorial_identity).toMatchObject({ author_name: 'Dra. Ana Souza', optimization_rules: { options: { auto: true } } });
    expect((await call(w, 'set_auto', { projectId: PROJ, apply_without_review: true }, 'editor')).status).toBe(403);
    expect((await call(w, 'set_auto', { projectId: PROJ, plugin_gate: 'exigir' }, 'editor')).status).toBe(403);
    expect((await call(w, 'set_auto', { projectId: PROJ, plugin_gate: 'exigir', apply_without_review: false }, 'admin')).status).toBe(200);
    expect(((w.proj().editorial_identity as Row).optimization_rules as Row).options).toMatchObject({ auto: true, plugin_gate: 'exigir', apply_without_review: false });
    expect((await call(w, 'set_auto', { projectId: PROJ, auto: false }, 'viewer')).status).toBe(403);
    expect((await call(w, 'set_auto', { projectId: PROJ_B, auto: true }, 'owner')).status).toBe(403); // outra organização
    expect((await call(w, 'set_auto', { projectId: PROJ }, 'owner')).body.error).toBe('nothing_to_change');
    // o perfil lido depois enxerga a chave
    expect((await call(w, 'get', { articleId: ART })).body).toMatchObject({ auto: true, plugin_gate: 'exigir' });
  });
});

describe('Piloto Automático (tratador): barramento de eventos e porta de IA', () => {
  it('emite o evento SE a tabela project_events existir; se não existir, segue sem erro e sem criar tabela', async () => {
    const w = world();
    await call(w, 'finish', { articleId: ART, job: await runSteps(w) });
    const ev = w.tables.project_events;
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ module: 'otimizacao', kind: 'otimizacao.piloto_concluido', organization_id: ORG_A, project_id: PROJ, subject: { article_id: ART } });
    expect(JSON.stringify(ev[0])).not.toMatch(/content/);

    resetEventsProbe();
    const w2 = world();
    const realFrom = w2.admin.from;
    (w2.admin as { from: unknown }).from = (name: string) => {
      if (name !== 'project_events') return realFrom(name);
      const q: Record<string, unknown> = { select: () => q, limit: () => q, insert: () => q, then: (res: (v: unknown) => unknown) => res({ data: null, error: { code: '42P01', message: 'relation "public.project_events" does not exist' } }) };
      return q;
    };
    const fin = await call(w2, 'finish', { articleId: ART, job: await runSteps(w2) });
    expect(fin.status).toBe(200);
    expect(w2.tables.project_events).toEqual([]);
  });

  it('orchestratorPort: teto de tokens com trava dura, articleId para o gate e custo estimado pela tabela de preços', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const port = orchestratorPort({ async callWithMeta(_t, _m, o) { seen.push(o || {}); return { content: '<p>x</p>', model: 'claude-sonnet-4-5-20250929', usage: { inputTokens: 1000, outputTokens: 500 } }; } }, ART, 'corr-1');
    const r = await port.call({ stepId: 's', task: 'content_editing', system: 's', user: 'u', maxTokens: 16000, temperature: 0.2 });
    expect(seen[0]).toMatchObject({ maxTokens: 4000, articleId: ART, correlationId: 'corr-1' });
    expect(r.costMicros).toBeGreaterThan(0);
    expect(r.usage).toEqual({ inputTokens: 1000, outputTokens: 500 });
  });
});
