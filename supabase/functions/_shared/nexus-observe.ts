/**
 * Observação agendada (14/11/2026): roda sozinha os conjuntos de perguntas (`nexus_prompt_sets`) com cadência diária ou semanal.
 * Causa das métricas de IA "cegas": nada agendava a coleta; as 21 operações do Observatório eram importações manuais.
 *
 * Segurança de gastos (nada novo, tudo reaproveitado do fluxo manual `execute` do nexus-intelligence):
 *  - portão por organização (`executionGate`): programa ligado + orçamento > 0 + provedor habilitado;
 *  - reserva do teto por operação pela RPC `nexus_reserve_operation` (recusa sem preço verificado ou sem orçamento);
 *  - só mecanismos executáveis (API); credencial lida pela RPC de serviço `nexus_provider_secret_read` (nunca devolvida);
 *  - limite de operações por execução e margem de orçamento preservada para uso manual.
 * Nada daqui chama provedor fora da lista de mecanismos executáveis, e a URL é sempre montada pelo servidor.
 */
import { serperRequest } from './serper-request.ts';
import { runCollector } from './nexus-collectors.ts';
import { executionGate } from './nexus-providers.ts';
import {
  engineKind, ENGINE_PROVIDER, isExecutableEngine, parseAiObservation, parseClaudeObservation, parseGeminiObservation, parsePerplexityObservation, parseSerp,
  runRequestKey, SAMPLING_METHOD,
} from './nexus-intelligence.ts';

// 12 por passada: SERP leva ~1-2 s por operação; as chamadas de IA (10-20 s) são contidas pelo prazo OBSERVE_TICK_BUDGET_MS.
export const OBSERVE_MAX_OPS_PER_TICK = 12;
export const OBSERVE_BUDGET_MARGIN_MICROS = 500_000;
export const OBSERVE_TICK_BUDGET_MS = 110_000;
const HOUR = 3_600_000;

export type Cadence = 'manual' | 'daily' | 'weekly';
export type Market = { country: string; language: string; city?: string };
export type PromptSet = { id: string; organization_id: string; project_id: string; user_id: string; cadence: string; status: string; engines: string[]; markets: Market[] };
export type Prompt = { id: string; query: string; topic?: string; intent?: string; branded?: boolean };

/** Próxima execução: diária a cada 20 h; semanal a cada 6,5 dias; manual nunca. `lastMs` = última operação da rodada deste conjunto. */
export function cadenceDue(cadence: string, lastMs: number | null, nowMs: number): boolean {
  if (cadence !== 'daily' && cadence !== 'weekly') return false;
  if (lastMs === null) return true;
  const every = cadence === 'daily' ? 20 * HOUR : 6.5 * 24 * HOUR;
  return nowMs - lastMs >= every;
}

/** Diária: só o mercado principal (o primeiro). Semanal: todos os mercados do conjunto (no máximo 6). */
export function marketsFor(cadence: string, markets: Market[]): Market[] {
  const list = Array.isArray(markets) && markets.length ? markets : [{ country: 'br', language: 'pt-BR' }];
  return cadence === 'daily' ? list.slice(0, 1) : list.slice(0, 6);
}

/** Identifica uma combinação pergunta × mecanismo × mercado, independente do dia. */
export const comboKey = (i: Record<string, unknown>) => [i.prompt_id, i.engine, String(i.country ?? '').toLowerCase(), String(i.city ?? '').toLowerCase(), String(i.language ?? '').toLowerCase()].join('|');
export const executableEngines = (engines: unknown): string[] => [...new Set((Array.isArray(engines) ? engines : []).filter(isExecutableEngine))];

/** Mesmas linhas de `prepare_prompt_run` (chave determinística por dia: repetir no mesmo dia não duplica nem gasta de novo). */
export function buildRunRows(o: { set: PromptSet; prompts: Prompt[]; engines: string[]; markets: Market[]; variants: string[]; day: string }) {
  const rows: Array<Record<string, unknown>> = [];
  for (const prompt of o.prompts) for (const engine of o.engines) for (const market of o.markets) {
    const query = String(prompt.query);
    rows.push({
      organization_id: o.set.organization_id, project_id: o.set.project_id, user_id: o.set.user_id, kind: engineKind(engine),
      request_key: runRequestKey(o.set.id, prompt.id, engine, market.country, o.day, market.city ?? '', market.language),
      input: {
        engine, query, country: market.country, language: market.language, city: market.city || '', topic: prompt.topic, intent: prompt.intent, variants: o.variants,
        branded: prompt.branded === true || prompt.intent === 'branded' || o.variants.some((v) => query.toLocaleLowerCase().includes(v.toLocaleLowerCase())),
        repetition: 1, method_version: SAMPLING_METHOD.version, prompt_set_id: o.set.id, prompt_id: prompt.id, scheduled: true,
      },
    });
  }
  return rows;
}

export type ObserveAdmin = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
};
export type ProgramRow = { execution_enabled?: boolean | null; budget_usd_micros?: number | string | null; reserved_usd_micros?: number | string | null; consumed_usd_micros?: number | string | null; settings?: Record<string, unknown> | null };
export type OpRow = { id: string; kind: string; input: Record<string, unknown> };
export type ExecOutcome = { ok: true } | { ok: false; code: string; stopOrg?: boolean };

const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Orçamento livre (micros) = orçamento − reservado − consumido. */
export function budgetLeftMicros(p: ProgramRow | null | undefined): number {
  if (!p) return 0;
  return Number(p.budget_usd_micros ?? 0) - Number(p.reserved_usd_micros ?? 0) - Number(p.consumed_usd_micros ?? 0);
}

/**
 * Executa UMA operação preparada (serp ou ai_observation) pelo mesmo caminho governado do `execute`. Nunca lança.
 * Falha depois da reserva: a operação vira `uncertain` e a reserva fica retida (mesma regra do fluxo manual).
 */
export async function executeObservation(
  admin: ObserveAdmin, fetchFn: typeof fetch, ctx: { orgId: string; host: string; program: ProgramRow },
  operation: OpRow, now: () => number = Date.now,
): Promise<ExecOutcome> {
  let reserved = false;
  try {
    const input = operation.input ?? {};
    const engine = text(input.engine, 40) || (operation.kind === 'serp' ? 'google_serp' : 'chatgpt_api');
    if (!['serp', 'ai_observation'].includes(operation.kind)) return { ok: false, code: 'kind_not_schedulable' };
    if (!isExecutableEngine(engine)) return { ok: false, code: 'engine_not_executable' };
    if (engineKind(engine) !== operation.kind) return { ok: false, code: 'engine_kind_mismatch' };
    const provider = ENGINE_PROVIDER[engine] || 'openai';
    const gate = executionGate(ctx.program, provider);
    if (gate) return { ok: false, code: gate.error, stopOrg: gate.error === 'budget_paused' };
    const settings = (ctx.program.settings ?? {}) as Record<string, unknown>;
    const models = (settings.observation_models ?? {}) as Record<string, unknown>;
    const model = ['gemini_api', 'claude_api'].includes(engine) ? text(models[engine], 100) : text(settings.observation_model, 100);
    if (['openai', 'gemini', 'anthropic'].includes(provider) && !model) return { ok: false, code: 'model_not_configured' };
    const serper = operation.kind === 'serp' && provider === 'serper' ? serperRequest(input) : null;
    if (operation.kind === 'serp' && provider === 'serper' && (!serper || serper.type !== 'search')) return { ok: false, code: 'invalid_serper_parameters' };
    const { data: credential, error: credentialError } = await admin.rpc('nexus_provider_secret_read', { p_org: ctx.orgId, p_provider: provider });
    if (credentialError || typeof credential !== 'string' || !credential) return { ok: false, code: 'organization_credential_required' };

    const { error: reserveError } = await admin.rpc('nexus_reserve_operation', { p_operation: operation.id });
    if (reserveError) return { ok: false, code: 'budget_or_pricing_gate', stopOrg: true };
    reserved = true;

    const startedAt = now();
    const variants: string[] = Array.isArray(input.variants) ? input.variants.filter((v): v is string => typeof v === 'string') : [];
    let output: Record<string, unknown>;
    if (operation.kind === 'serp' && provider !== 'serper') {
      const collected = await runCollector(engine, credential, {
        engine, query: String(input.query || ''), country: String(input.country || 'br'), language: String(input.language || 'pt-BR'),
        city: String(input.city || ''), domain: ctx.host, variants,
      }, fetchFn);
      output = { ...collected.output, raw: collected.raw };
    } else if (operation.kind === 'serp') {
      const response = await fetchFn(serper!.url, { method: 'POST', headers: { 'X-API-KEY': credential, 'Content-Type': 'application/json' }, body: JSON.stringify(serper!.payload), signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('provider_request_failed');
      const raw = await response.json();
      output = { ...parseSerp(raw, ctx.host), raw, collected_at: new Date(now()).toISOString(), query: input.query, context: input, provider: 'serper' };
    } else if (['gemini_api', 'claude_api', 'perplexity_api'].includes(engine)) {
      const country = String(input.country || 'br').toUpperCase();
      let response: Response;
      if (engine === 'gemini_api') {
        response = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': credential, 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: input.query }] }], tools: [{ google_search: {} }] }), signal: AbortSignal.timeout(90000) });
      } else if (engine === 'claude_api') {
        response = await fetchFn('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': credential, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: 'user', content: input.query }], tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country, city: input.city || undefined } }] }), signal: AbortSignal.timeout(90000) });
      } else {
        response = await fetchFn('https://api.perplexity.ai/search', { method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: input.query, country, max_results: 10 }), signal: AbortSignal.timeout(30000) });
      }
      if (!response.ok) throw new Error('provider_request_failed');
      const raw = await response.json();
      const parsed = engine === 'gemini_api' ? parseGeminiObservation(raw, ctx.host, variants) : engine === 'claude_api' ? parseClaudeObservation(raw, ctx.host, variants) : parsePerplexityObservation(raw, ctx.host, variants);
      output = { ...parsed, raw, collected_at: new Date(now()).toISOString(), query: input.query, context: input, engine, provider: ENGINE_PROVIDER[engine], method: SAMPLING_METHOD };
    } else {
      const response = await fetchFn('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, max_output_tokens: 4000, store: false, tools: [{ type: 'web_search', user_location: { type: 'approximate', country: String(input.country || 'br').toUpperCase(), city: input.city || undefined } }], input: input.query }),
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) throw new Error('provider_request_failed');
      const raw = await response.json();
      output = { ...parseAiObservation(raw, ctx.host, variants), raw, collected_at: new Date(now()).toISOString(), query: input.query, context: input, provider: 'openai', method: SAMPLING_METHOD };
    }
    output.latency_ms = now() - startedAt;
    output.accounting = 'configured_ceiling_debit_not_provider_invoice';
    output.scheduled = true;
    const { error: finishError } = await admin.rpc('nexus_finish_operation', { p_operation: operation.id, p_output: output });
    if (finishError) throw new Error('finish_failed');
    return { ok: true };
  } catch (e) {
    if (reserved) {
      await admin.from('nexus_operations').update({ status: 'uncertain', output: { error: 'execution_or_recording_failed', reservation_retained: true, scheduled: true } }).eq('id', operation.id);
    }
    // só códigos estáveis do nosso código/coletores entram no detalhe (nunca corpo de resposta nem credencial)
    const why = e instanceof Error && /^[a-z0-9_]{3,60}$/.test(e.message) ? e.message : 'unexpected';
    return { ok: false, code: `${reserved ? 'failed_reservation_retained' : 'failed'}:${why}` };
  }
}

export type TickSetReport = { set_id: string; project_id: string; cadence: string; due: boolean; prepared: number; executed: number; failed: number; skipped_reason?: string; codes: string[] };
export type TickReport = { organization_id: string; sets: TickSetReport[]; stopped?: string };

export type TickDeps = {
  admin: ObserveAdmin; fetchFn: typeof fetch; now: () => number; maxOps?: number; deadlineMs?: number; dryRun?: boolean;
};

/** Uma passada de agendamento para UMA organização. Nunca lança; respeita limites de operações, tempo e orçamento. */
export async function runObservationTickForOrg(deps: TickDeps, orgId: string): Promise<TickReport> {
  const { admin } = deps;
  const report: TickReport = { organization_id: orgId, sets: [] };
  const maxOps = deps.maxOps ?? OBSERVE_MAX_OPS_PER_TICK;
  const deadline = deps.deadlineMs ?? deps.now() + OBSERVE_TICK_BUDGET_MS;
  let opsLeft = maxOps;
  try {
    const { data: program } = await admin.from('nexus_programs').select('execution_enabled,budget_usd_micros,reserved_usd_micros,consumed_usd_micros,settings').eq('organization_id', orgId).maybeSingle();
    if (!program || program.execution_enabled !== true) { report.stopped = 'program_off'; return report; }
    const { data: sets } = await admin.from('nexus_prompt_sets').select('id,organization_id,project_id,user_id,cadence,status,engines,markets').eq('organization_id', orgId).eq('status', 'active').in('cadence', ['daily', 'weekly']).limit(50);
    const day = new Date(deps.now()).toISOString().slice(0, 10);
    // Correção (15/11/2026): sobras "prepared" de dias anteriores (ex.: limite por passada) também continuam devidas, por até 8 dias.
    const pendingSince = new Date(deps.now() - 8 * 24 * 3_600_000).toISOString();
    for (const set of (sets ?? []) as PromptSet[]) {
      const rep: TickSetReport = { set_id: set.id, project_id: set.project_id, cadence: set.cadence, due: false, prepared: 0, executed: 0, failed: 0, codes: [] };
      report.sets.push(rep);
      const { data: last } = await admin.from('nexus_operations').select('created_at').eq('organization_id', orgId).eq('project_id', set.project_id).like('request_key', `run:${set.id}:%`).neq('status', 'prepared').order('created_at', { ascending: false }).limit(1);
      const lastMs = last?.[0]?.created_at ? Date.parse(last[0].created_at) : null;
      // operações já preparadas hoje e ainda não executadas (ex.: tick anterior parou no limite) continuam devidas
      const { data: pending } = await admin.from('nexus_operations').select('id,kind,input').eq('organization_id', orgId).eq('project_id', set.project_id).eq('status', 'prepared').like('request_key', `run:${set.id}:%`).gte('created_at', pendingSince).limit(100);
      const cadenceIsDue = cadenceDue(set.cadence, lastMs, deps.now());
      const hasPending = (pending?.length ?? 0) > 0;
      const periodDue = cadenceIsDue || hasPending;
      const engines = executableEngines(set.engines);
      if (!engines.length) { rep.due = periodDue; rep.skipped_reason = 'no_executable_engine'; continue; }
      // Complemento (14/11/2026): se o conjunto já rodou neste período, mas ganhou mecanismo, pergunta ou mercado depois (ex.: Brave adicionado
      // à tarde), só as combinações que ainda não têm operação no período são preparadas. Sem isso, o novo mecanismo esperava o dia seguinte.
      let covered: Set<string> | null = null;
      if (!cadenceIsDue) {
        const windowMs = set.cadence === 'daily' ? 20 * 3_600_000 : 6.5 * 24 * 3_600_000;
        const { data: recent } = await admin.from('nexus_operations').select('input').eq('organization_id', orgId).eq('project_id', set.project_id).like('request_key', `run:${set.id}:%`).gte('created_at', new Date(deps.now() - windowMs).toISOString()).limit(2000);
        covered = new Set(((recent ?? []) as Array<{ input?: Record<string, unknown> }>).map((o) => comboKey(o.input ?? {})));
      }
      rep.due = periodDue;
      if (deps.dryRun) { rep.skipped_reason = rep.due ? 'dry_run' : 'not_due'; continue; }
      const { data: project } = await admin.from('projects').select('name,domain,wordpress_url').eq('id', set.project_id).maybeSingle();
      let host = '';
      try { host = new URL(project?.wordpress_url || (project?.domain ? `https://${project.domain}` : '')).hostname; } catch { host = ''; }
      const variants = [...new Set([project?.name, host, host.replace(/^www\./, '')].map((v) => String(v || '').trim()).filter((v) => v.length >= 3))].slice(0, 8).map((v) => v.slice(0, 120));
      const { data: prompts } = await admin.from('nexus_prompts').select('id,query,topic,intent,branded').eq('prompt_set_id', set.id).eq('active', true).order('position', { ascending: true }).limit(100);
      let rows = buildRunRows({ set, prompts: (prompts ?? []) as Prompt[], engines, markets: marketsFor(set.cadence, set.markets), variants, day });
      if (covered) {
        rows = rows.filter((r) => !covered!.has(comboKey((r.input ?? {}) as Record<string, unknown>)));
        if (!rows.length && !hasPending) { rep.skipped_reason = 'not_due'; continue; }
        if (rows.length) rep.codes.push('top_up');
        rep.due = true;
      }
      for (let i = 0; i < rows.length; i += 100) {
        const { data } = await admin.from('nexus_operations').upsert(rows.slice(i, i + 100), { onConflict: 'organization_id,request_key', ignoreDuplicates: true }).select('id');
        rep.prepared += data?.length ?? 0;
      }
      const { data: todo } = await admin.from('nexus_operations').select('id,kind,input').eq('organization_id', orgId).eq('project_id', set.project_id).eq('status', 'prepared').like('request_key', `run:${set.id}:%`).gte('created_at', pendingSince).order('created_at', { ascending: true }).limit(maxOps + 1);
      if ((todo?.length ?? 0) > maxOps) rep.codes.push('tick_op_limit'); // sobraram operações para o próximo tick
      for (const op of ((todo ?? []) as OpRow[]).slice(0, maxOps)) {
        if (opsLeft <= 0) { if (!rep.codes.includes('tick_op_limit')) rep.codes.push('tick_op_limit'); break; }
        if (deps.now() > deadline) { rep.codes.push('tick_time_limit'); break; }
        const { data: fresh } = await admin.from('nexus_programs').select('execution_enabled,budget_usd_micros,reserved_usd_micros,consumed_usd_micros,settings').eq('organization_id', orgId).maybeSingle();
        if (budgetLeftMicros(fresh) < OBSERVE_BUDGET_MARGIN_MICROS) { report.stopped = 'budget_margin'; break; }
        opsLeft--;
        const out = await executeObservation(admin, deps.fetchFn, { orgId, host, program: fresh as ProgramRow }, op, deps.now);
        if (out.ok) rep.executed++;
        else {
          rep.failed++; if (!rep.codes.includes(out.code)) rep.codes.push(out.code);
          if (out.stopOrg) { report.stopped = out.code; break; }
        }
      }
      if (report.stopped) break;
      if (opsLeft <= 0 || deps.now() > deadline) break;
    }
  } catch (_e) {
    report.stopped = 'tick_error';
  }
  return report;
}
