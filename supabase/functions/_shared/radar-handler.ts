/**
 * Ações do Radar de Mercado no portão `engine` (módulo `radar`).
 *
 *  - focos:        focus_from_text (frase -> Focos estruturados; IA em modo barato com plano B sem IA), focus_save, focus_list (no overview);
 *  - território:   territory (lê), territory_resolve (menções -> lugares + vizinhança com "por que entrou"), territory_decide, territory_sync (fontes abertas, admin);
 *  - descoberta:   plan (gera as consultas e estima, não gasta), run_batch (GASTA: dentro do teto diário; para quando o teto nega), coverage, youtube_discover;
 *  - concorrência: competitors_list, competitor_detail, competitor_save, competitor_merge, competitor_link, enrich_run (varredura educada), backlinks_fetch (pago);
 *  - leitura:      scoreboard, scores_snapshot, attack_list, landscape, tree_overlap, orphans, orphan_fix, schedule_save, overview.
 * Leitura: qualquer membro. Escrita: dono, administrador e editor (território compartilhado: administrador). Papel e organização vêm do banco.
 * Nada aqui aceita chave, segredo ou organização do corpo do pedido. Respostas nunca trazem segredo.
 */
import { fail, ok, resolveProject, WRITE_ROLES, type Admin, type Reply, type MinRole } from './engine-kernel.ts';
import { chunk, loadAll, UNBOUNDED } from './taxonomy-shared.ts';
import { recordEvent } from './project-events.ts';
import { dayKey } from './spend-gate-core.ts';
import { buildPlaceIndex, expandNeighborhood, normalizeRules, normName, resolveMention, placeLabel, ancestors, explainPlace, type GeoPlace, type Mention, type ResolvedPlace } from './radar-geo-core.ts';
import { applyContextFromText, buildFocusPrompt, extractJson, FOCUS_SYSTEM_PROMPT, heuristicFocusParse, validateFocusDraft, AUDIENCES, COMPLIANCE_MODES, MODALITIES, DEFAULT_MODALITIES, type FocusDraft, type Modality } from './radar-focus-core.ts';
import { GEO_SOURCES } from './radar-packs.ts';
import { generateTasks, coverageSummary, saturationOf, type RoundStat } from './radar-discovery-core.ts';
import { PLATFORMS, THIRD_PARTY_ADAPTERS, THIRD_PARTY_WARNING, YT_KEY_MISSING_MESSAGE, metricsAvailability } from './radar-social-core.ts';
import { auditOrphans, attackList, evidenceFor, scoreEvidence, landscape, overlapByNode, scoreBoard, trendOf, SCORE_DISCLAIMER, WEIGHTS, AUTO_LINK_MIN, type Scope } from './radar-score-core.ts';
import { mergeEntities, liveEntity } from './radar-entity-core.ts';
import { ensureLink, linkKeys, loadGeo, loadSnapshot, persistBook, persistGeoDrafts, type ProjectLite } from './radar-store.ts';
import {
  DEFAULT_MAX_QUERIES, DEFAULT_RUN_BUDGET_MICROS, defaultUnits, dayBudgetOf, enginesFrom, enrichCompetitors, executeBatch, fetchBacklinkSummaries, historyKey, loadFocusInputs, loadLedger, loadSecrets,
  scoreHistory, storeScoreSnapshot, youtubeDiscover, type BatchDeps,
} from './radar-batch.ts';
import { OSM_ATTRIBUTION, OVERPASS_USAGE_NOTE } from './radar-geo-core.ts';
import { CC_NOTE, OPR_NOTE } from './radar-enrich-core.ts';

export interface RadarDeps extends BatchDeps {
  /** texto da IA em modo barato (orquestrador + teto diário). Ausente = só o plano B sem IA. */
  aiJson?: (a: { system: string; user: string; maxTokens: number }) => Promise<string>;
  overpassUrl?: string; geonamesUser?: string | null;
}
export interface RadarCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string>; deps: RadarDeps }

export const RADAR_MIN_ROLE: Record<string, MinRole> = {
  overview: 'member', territory: 'member', plan: 'member', coverage: 'member', competitors_list: 'member', competitor_detail: 'member', scoreboard: 'member', attack_list: 'member',
  landscape: 'member', tree_overlap: 'member', orphans: 'member',
  focus_from_text: 'editor', focus_save: 'editor', territory_resolve: 'editor', territory_decide: 'editor', run_batch: 'editor', enrich_run: 'editor', youtube_discover: 'editor',
  competitor_save: 'editor', competitor_merge: 'editor', competitor_link: 'editor', orphan_fix: 'editor', schedule_save: 'editor', scores_snapshot: 'editor', backlinks_fetch: 'editor',
  territory_sync: 'admin',
};
export const RADAR_ACTIONS = Object.keys(RADAR_MIN_ROLE);
/** Ações que podem gerar custo: o portão confere o teto antes; a reserva do valor acontece no fetch guardado (spend-gate), no momento da chamada. */
export const RADAR_PAID_ACTIONS = ['run_batch', 'backlinks_fetch'];

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isSpendDenied = (e: unknown): boolean => !!e && typeof e === 'object' && ((e as { name?: string }).name === 'SpendDeniedError' || typeof (e as { info?: { code?: string } }).info?.code === 'string');

export async function handleRadarAction(admin: Admin, ctx: RadarCtx): Promise<Reply> {
  try {
    if (!Object.prototype.hasOwnProperty.call(RADAR_MIN_ROLE, ctx.action)) return fail(400, 'unknown_action');
    const scope = await resolveProject(admin, ctx, ctx.body.projectId, RADAR_MIN_ROLE[ctx.action]);
    if (scope.ok === false) return scope.reply;
    const project = scope.project as ProjectLite;
    switch (ctx.action) {
      case 'overview': return await overview(admin, ctx, project);
      case 'focus_from_text': return await focusFromText(admin, ctx, project);
      case 'focus_save': return await focusSave(admin, ctx, project);
      case 'territory': return await territory(admin, ctx, project);
      case 'territory_resolve': return await territoryResolve(admin, ctx, project);
      case 'territory_decide': return await territoryDecide(admin, ctx, project);
      case 'territory_sync': return await territorySync(admin, ctx, project);
      case 'plan': return await plan(admin, ctx, project);
      case 'run_batch': return await runBatch(admin, ctx, project);
      case 'coverage': return await coverage(admin, ctx, project);
      case 'enrich_run': return ok({ ...(await enrichCompetitors(admin, ctx.deps, project, { limit: Number(ctx.body.limit) || 3, ids: Array.isArray(ctx.body.competitorIds) ? (ctx.body.competitorIds as unknown[]).filter(uuid) : undefined })) });
      case 'youtube_discover': return ok({ ...(await youtubeDiscover(admin, ctx.deps, project, { focusId: uuid(ctx.body.focusId) ? ctx.body.focusId : null, maxSearches: Number(ctx.body.maxSearches) || 4 })) });
      case 'backlinks_fetch': return await backlinksFetch(admin, ctx, project);
      case 'competitors_list': return await competitorsList(admin, ctx, project);
      case 'competitor_detail': return await competitorDetail(admin, ctx, project);
      case 'competitor_save': return await competitorSave(admin, ctx, project);
      case 'competitor_merge': return await competitorMerge(admin, ctx, project);
      case 'competitor_link': return await competitorLink(admin, ctx, project);
      case 'scoreboard': return await scoreboard(admin, ctx, project);
      case 'scores_snapshot': { const { snap } = await loadSnapshot(admin, project, ctx.deps.now()); return ok({ ...(await storeScoreSnapshot(admin, project, snap, ctx.deps.now())) }); }
      case 'attack_list': return await attacks(admin, ctx, project);
      case 'landscape': return await landscapeAction(admin, ctx, project);
      case 'tree_overlap': return await treeOverlap(admin, ctx, project);
      case 'orphans': return await orphans(admin, ctx, project);
      case 'orphan_fix': return await orphanFix(admin, ctx, project);
      case 'schedule_save': return await scheduleSave(admin, ctx, project);
      default: return fail(400, 'unknown_action');
    }
  } catch (e) {
    if (isSpendDenied(e)) return { status: 423, body: { error: 'spend_denied', message: 'O teto de gasto do dia não permite esta ação agora.' } };
    console.error('[radar] operation_failed');
    return fail(500, 'radar_operation_failed');
  }
}

// ------------------------------------------------------------------------------------------------------------------ focos
const HINT_LEVELS = new Set(['municipio', 'uf']);
function contextHints(text: string, places: GeoPlace[]): string[] {
  const norm = ` ${normName(text)} `;
  const hits = places.filter((p) => HINT_LEVELS.has(p.level) && (norm.includes(` ${normName(p.name)} `) || (typeof p.meta?.abbr === 'string' && norm.includes(` ${normName(p.meta.abbr)} `))));
  return hits.sort((a, b) => Number(b.level === 'municipio') - Number(a.level === 'municipio') || (b.population ?? 0) - (a.population ?? 0)).map((p) => p.name);
}

interface TerritoryOutcome { resolved: Array<{ mention: Mention; places: GeoPlace[]; note: string | null }>; unresolved: Array<{ mention: Mention; status: string; note: string | null; candidates: Array<{ id: string; name: string; level: string }> }>; seeds: ResolvedPlace[]; added: ResolvedPlace[]; truncated: boolean }
function resolveTerritory(mentions: Mention[], idx: ReturnType<typeof buildPlaceIndex>, rules: unknown, sourceText: string): TerritoryOutcome {
  const resolved: TerritoryOutcome['resolved'] = []; const unresolved: TerritoryOutcome['unresolved'] = []; const seeds: ResolvedPlace[] = []; const regionFor = new Set<string>();
  for (const m of mentions) {
    const r = resolveMention(m, idx);
    if (r.status === 'resolvido') {
      resolved.push({ mention: m, places: r.places, note: r.note });
      for (const p of r.places) { seeds.push({ place: p, origin: 'frase', inferred: p.inferred === true, why: [{ rule: 'citado_na_frase', via: null, detail: `Citado na frase${sourceText ? `: "${m.text}"` : ''}${p.inferred ? ' (agrupamento informal, inferido: confira)' : ''}` }] }); if (m.expand_region) regionFor.add(p.id); }
    } else unresolved.push({ mention: m, status: r.status, note: r.note, candidates: (r.candidates ?? []).map((c) => ({ id: c.id, name: c.name, level: c.level })) });
  }
  const ex = expandNeighborhood(seeds, idx, normalizeRules(rules), { regionFor });
  return { resolved, unresolved, seeds, added: ex.added, truncated: ex.truncated };
}

async function saveFocusPlaces(admin: Admin, project: ProjectLite, focusId: string, out: TerritoryOutcome, nowIso: string): Promise<number> {
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const rp of [...out.seeds, ...out.added]) {
    if (seen.has(rp.place.id)) continue; seen.add(rp.place.id);
    // o que a pessoa disse sem inferência já nasce aprovado; vizinhança e agrupamentos inferidos nascem como sugestão (editáveis)
    const explicit = rp.origin === 'frase' && !rp.inferred;
    rows.push({ organization_id: project.organization_id, project_id: project.id, focus_id: focusId, place_id: rp.place.id, origin: rp.origin, why: rp.why, inferred: rp.inferred, status: explicit ? 'aprovado' : 'sugerido', updated_at: nowIso });
  }
  for (const part of chunk(rows, 300)) { const r = await admin.from('project_focus_places').upsert(part, { onConflict: 'focus_id,place_id' }); if (r.error) throw r.error; }
  return rows.length;
}

async function focusFromText(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const text = clip(ctx.body.text, 4000);
  if (text.length < 8) return fail(422, 'text_required');
  const nodes = (await loadAll<{ id: string; label: string; status: string }>(admin, 'project_taxonomy_nodes', 'id,label,status', { col: 'project_id', val: project.id }, UNBOUNDED)).rows.filter((n) => n.status !== 'rejeitado');
  let drafts: FocusDraft[] | null = null; let source: 'ia' | 'heuristica' = 'ia'; let aiNote: string | null = null; let issues: string[] = [];
  if (ctx.deps.aiJson && ctx.body.useAi !== false) {
    try {
      const raw = await ctx.deps.aiJson({ system: FOCUS_SYSTEM_PROMPT, user: buildFocusPrompt(text, { projectName: project.name, segments: nodes.map((n) => n.label) }), maxTokens: 1500 });
      const v = validateFocusDraft(extractJson(raw));
      if (v.ok === true) { drafts = v.drafts; issues = v.issues; } else aiNote = (v as { error: string }).error;
    } catch (e) { aiNote = isSpendDenied(e) ? 'teto_diario' : 'ia_indisponivel'; }
  } else aiNote = 'ia_nao_ligada';
  if (!drafts) {
    const h = heuristicFocusParse(text);
    if (!h.ok) return fail(422, 'focus_not_understood', { ai_note: aiNote });
    drafts = h.drafts; issues = h.issues; source = 'heuristica';
  }
  const geo = await loadGeo(admin);
  const idx = buildPlaceIndex(geo.places, geo.members);
  drafts = applyContextFromText(drafts, text, contextHints(text, geo.places));
  const nowIso = new Date(ctx.deps.now()).toISOString();
  const existing = (await loadAll<{ id: string; name: string }>(admin, 'project_focuses', 'id,name', { col: 'project_id', val: project.id }, UNBOUNDED)).rows;
  const out: Array<Record<string, unknown>> = [];
  for (const d of drafts) {
    const terr = resolveTerritory(d.territory, idx, ctx.body.rules, text);
    const label = normName(d.segment);
    const node = nodes.find((n) => normName(n.label) === label) ?? null;
    const save = ctx.body.save !== false;
    let id: string | null = null; let placesSaved = 0;
    if (save) {
      const row = { organization_id: project.organization_id, project_id: project.id, name: d.name.slice(0, 160), segment_node_id: node?.id ?? null, segment_label: d.segment.slice(0, 200), topics: d.topics, audiences: d.audiences, weight: d.weight, goals: d.goals, target_hosts: d.target_hosts, modalities: DEFAULT_MODALITIES, language: d.language || clip(ctx.body.language, 12) || 'en', compliance_mode: d.compliance_mode, status: 'ativo', source: 'frase', source_text: text, needs_review: d.needs_review || source === 'heuristica' || terr.unresolved.length > 0, updated_at: nowIso };
      const same = existing.find((f) => normName(f.name) === normName(d.name));
      if (same) { id = same.id; const u = await admin.from('project_focuses').update(row).eq('id', id).eq('project_id', project.id); if (u.error) throw u.error; }
      else { id = crypto.randomUUID(); const i = await admin.from('project_focuses').insert({ id, ...row, created_by: ctx.userId, created_at: nowIso }); if (i.error) throw i.error; existing.push({ id, name: d.name }); }
      placesSaved = await saveFocusPlaces(admin, project, id, terr, nowIso);
      await recordEvent(admin, { organization_id: project.organization_id, project_id: project.id, module: 'radar', kind: 'radar.foco_criado', subject: { focus_id: id }, payload: { name: d.name, weight: d.weight, places: placesSaved, source } });
    }
    out.push({ id, name: d.name, segment: d.segment, topics: d.topics, audiences: d.audiences, weight: d.weight, goals: d.goals, language: d.language, taxonomy_node: node ? { id: node.id, label: node.label } : null, places_saved: placesSaved, resolved: terr.resolved.map((r) => ({ text: r.mention.text, kind: r.mention.kind, places: r.places.map((p) => ({ id: p.id, name: p.name, level: p.level, inferred: p.inferred === true })), note: r.note })), unresolved: terr.unresolved, expansion: { added: terr.added.length, truncated: terr.truncated, sample: terr.added.slice(0, 20).map((a) => ({ id: a.place.id, name: a.place.name, level: a.place.level, why: a.why })) } });
  }
  return ok({ source, ai_note: aiNote, saved: ctx.body.save !== false, geo_loaded: geo.places.length > 0, geo_hint: geo.places.length ? null : 'territory_sync', issues, focuses: out });
}

async function focusSave(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const b = ctx.body; const nowIso = new Date(ctx.deps.now()).toISOString();
  if (b.delete === true) {
    if (!uuid(b.focusId)) return fail(422, 'focus_id_required');
    const d = await admin.from('project_focuses').delete().eq('id', b.focusId).eq('project_id', project.id);
    if (d.error) throw d.error;
    return ok({ deleted: true });
  }
  const patch: Record<string, unknown> = { updated_at: nowIso };
  if (b.name !== undefined) { const n = clip(b.name, 160); if (n.length < 2) return fail(422, 'name_invalid'); patch.name = n; }
  if (b.weight !== undefined) { const w = Number(b.weight); if (!Number.isInteger(w) || w < 1 || w > 10) return fail(422, 'weight_invalid'); patch.weight = w; }
  if (b.topics !== undefined) { if (!Array.isArray(b.topics)) return fail(422, 'topics_invalid'); patch.topics = [...new Set(b.topics.map((t) => clip(t, 160)).filter((t) => t.length >= 2))].slice(0, 60); }
  if (b.audiences !== undefined) { if (!Array.isArray(b.audiences) || !b.audiences.every((a) => (AUDIENCES as readonly string[]).includes(a as string))) return fail(422, 'audiences_invalid'); patch.audiences = [...new Set(b.audiences as string[])]; }
  if (b.modalities !== undefined) { if (!Array.isArray(b.modalities) || !b.modalities.length || !b.modalities.every((m) => (MODALITIES as readonly string[]).includes(m as string))) return fail(422, 'modalities_invalid'); patch.modalities = [...new Set(b.modalities as Modality[])]; }
  if (b.status !== undefined) { if (!['ativo', 'pausado', 'arquivado'].includes(b.status as string)) return fail(422, 'status_invalid'); patch.status = b.status; }
  if (b.complianceMode !== undefined) { if (!(COMPLIANCE_MODES as readonly string[]).includes(b.complianceMode as string)) return fail(422, 'compliance_invalid'); patch.compliance_mode = b.complianceMode; }
  if (b.language !== undefined) { const l = clip(b.language, 12); if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(l)) return fail(422, 'language_invalid'); patch.language = l; }
  if (b.targetHosts !== undefined) { if (!Array.isArray(b.targetHosts)) return fail(422, 'hosts_invalid'); patch.target_hosts = b.targetHosts.map((h) => clip(h, 200).toLowerCase()).filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)).slice(0, 20); }
  if (b.goals !== undefined) { if (!Array.isArray(b.goals)) return fail(422, 'goals_invalid'); patch.goals = b.goals.map((g) => clip(g, 200)).filter(Boolean).slice(0, 20); }
  if (b.segmentNodeId !== undefined) {
    if (b.segmentNodeId !== null) {
      if (!uuid(b.segmentNodeId)) return fail(422, 'node_invalid');
      const n = await admin.from('project_taxonomy_nodes').select('id').eq('id', b.segmentNodeId).eq('project_id', project.id).maybeSingle();
      if (n.error) throw n.error; if (!n.data) return fail(404, 'node_not_found');
    }
    patch.segment_node_id = b.segmentNodeId;
  }
  if (uuid(b.focusId)) {
    const u = await admin.from('project_focuses').update({ ...patch, needs_review: false }).eq('id', b.focusId).eq('project_id', project.id).select('id');
    if (u.error) throw u.error; if (!u.data || !u.data.length) return fail(404, 'focus_not_found');
    return ok({ id: b.focusId, updated: true });
  }
  if (typeof patch.name !== 'string') return fail(422, 'name_invalid');
  const id = crypto.randomUUID();
  const i = await admin.from('project_focuses').insert({ id, organization_id: project.organization_id, project_id: project.id, source: 'manual', created_by: ctx.userId, ...patch });
  if (i.error) throw i.error;
  return ok({ id, created: true });
}

// ------------------------------------------------------------------------------------------------------------------ território
async function focusOf(admin: Admin, project: ProjectLite, id: unknown): Promise<{ id: string; name: string } | null> {
  if (!uuid(id)) return null;
  const r = await admin.from('project_focuses').select('id,name').eq('id', id).eq('project_id', project.id).maybeSingle();
  if (r.error) throw r.error;
  return r.data;
}

async function territory(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const focus = await focusOf(admin, project, ctx.body.focusId);
  if (!focus) return fail(404, 'focus_not_found');
  const rows = (await loadAll<Record<string, unknown>>(admin, 'project_focus_places', 'id,place_id,origin,why,inferred,status,weight_mult', { col: 'focus_id', val: focus.id }, UNBOUNDED)).rows;
  const { snap } = await loadSnapshot(admin, project, ctx.deps.now());
  const idx = buildPlaceIndex([...snap.places.values()]);
  const items = rows.map((r) => { const p = snap.places.get(String(r.place_id)); return p ? { id: r.id, place: { id: p.id, name: p.name, level: p.level, label: placeLabel(p, idx), parents: ancestors(p, idx).map((a) => a.name), population: p.population, source: p.source, license: p.license ?? null, attribution: p.attribution ?? null }, origin: r.origin, why: r.why, inferred: r.inferred === true, status: r.status, weight_mult: Number(r.weight_mult) } : null; }).filter((x): x is NonNullable<typeof x> => !!x);
  const attributions = [...new Set(items.map((i) => i.place.attribution).filter((a): a is string => !!a))];
  return ok({ focus, places: items, attributions, counts: { total: items.length, aprovado: items.filter((i) => i.status === 'aprovado').length, sugerido: items.filter((i) => i.status === 'sugerido').length, rejeitado: items.filter((i) => i.status === 'rejeitado').length, inferido: items.filter((i) => i.inferred).length } });
}

async function territoryResolve(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const focus = await focusOf(admin, project, ctx.body.focusId);
  if (!focus) return fail(404, 'focus_not_found');
  const raw = Array.isArray(ctx.body.mentions) ? ctx.body.mentions : [];
  const mentions: Mention[] = raw.slice(0, 60).map((m) => { const o = obj(m); return { text: clip(o.text ?? m, 120), kind: o.kind === 'zona' ? 'zona' as const : 'lugar' as const, context: clip(o.context, 120) || null, expand_region: o.expand_region === true }; }).filter((m) => m.text.length >= 2);
  const placeIds = Array.isArray(ctx.body.placeIds) ? (ctx.body.placeIds as unknown[]).filter(uuid) : [];
  if (!mentions.length && !placeIds.length) return fail(422, 'mentions_required');
  const geo = await loadGeo(admin);
  const idx = buildPlaceIndex(geo.places, geo.members);
  const out = resolveTerritory(mentions, idx, ctx.body.rules, '');
  for (const id of placeIds) { const p = idx.byId.get(id); if (p) out.seeds.push({ place: p, origin: 'manual', inferred: false, why: [{ rule: 'manual', via: null, detail: 'Adicionado por você' }] }); }
  const saved = await saveFocusPlaces(admin, project, focus.id, out, new Date(ctx.deps.now()).toISOString());
  return ok({ focus, saved, resolved: out.resolved.map((r) => ({ text: r.mention.text, places: r.places.map((p) => ({ id: p.id, name: p.name, level: p.level })), note: r.note })), unresolved: out.unresolved, added: out.added.map((a) => ({ id: a.place.id, name: a.place.name, level: a.place.level, why: a.why, text: explainPlace(a) })), truncated: out.truncated, geo_loaded: geo.places.length > 0 });
}

async function territoryDecide(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const focus = await focusOf(admin, project, ctx.body.focusId);
  if (!focus) return fail(404, 'focus_not_found');
  const ids = Array.isArray(ctx.body.ids) ? (ctx.body.ids as unknown[]) : [];
  if (!ids.length || !ids.every(uuid)) return fail(422, 'ids_invalid');
  const patch: Record<string, unknown> = { updated_at: new Date(ctx.deps.now()).toISOString() };
  if (ctx.body.status !== undefined) { if (!['sugerido', 'aprovado', 'rejeitado'].includes(ctx.body.status as string)) return fail(422, 'decision_invalid'); patch.status = ctx.body.status; }
  if (ctx.body.weightMult !== undefined) { const w = Number(ctx.body.weightMult); if (!Number.isFinite(w) || w <= 0 || w > 10) return fail(422, 'weight_invalid'); patch.weight_mult = w; }
  if (Object.keys(patch).length === 1) return fail(422, 'nothing_to_update');
  for (const part of chunk(ids as string[], 100)) { const u = await admin.from('project_focus_places').update(patch).in('id', part).eq('focus_id', focus.id).eq('project_id', project.id); if (u.error) throw u.error; }
  return ok({ updated: ids.length });
}

async function territorySync(admin: Admin, ctx: RadarCtx, _project: ProjectLite): Promise<Reply> {
  const wanted = Array.isArray(ctx.body.sources) ? (ctx.body.sources as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  if (!wanted.length) return ok({ sources: Object.entries(GEO_SOURCES).map(([id, s]) => ({ id, label: s.label, country: s.country, note: s.note })), overpass_note: OVERPASS_USAGE_NOTE, osm_attribution: OSM_ATTRIBUTION });
  if (!wanted.every((s) => Object.prototype.hasOwnProperty.call(GEO_SOURCES, s))) return fail(422, 'source_unknown');
  const nowIso = new Date(ctx.deps.now()).toISOString(); const results: Array<Record<string, unknown>> = [];
  for (const id of wanted.slice(0, 4)) {
    const res = await GEO_SOURCES[id].run({ admin, body: ctx.body, nowIso, deps: { fetchFn: ctx.deps.fetchFn, sleep: ctx.deps.sleep, now: ctx.deps.now, overpassUrl: ctx.deps.overpassUrl, geonamesUser: ctx.deps.geonamesUser } });
    const saved = res.drafts.length || res.members.length ? await persistGeoDrafts(admin, res.drafts, res.members, nowIso) : { places: 0, members: 0, skipped_parent: 0 };
    results.push({ source: id, ok: res.ok, notes: res.notes, ...saved });
  }
  return ok({ results });
}

// ------------------------------------------------------------------------------------------------------------------ plano e execução
async function providerStatus(ctx: RadarCtx, orgId: string) {
  const s = await loadSecrets(ctx.deps, orgId);
  return { secrets: s, flags: { serper: !!s.serper, dataforseo: !!s.dataforseo, brave: !!s.brave, youtube: !!ctx.deps.youtubeKey, open_pagerank: !!ctx.deps.oprKey, third_party: THIRD_PARTY_ADAPTERS.some((a) => a.enabled) } };
}

async function plan(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const { snap } = await loadSnapshot(admin, project, ctx.deps.now());
  const { flags, secrets } = await providerStatus(ctx, project.organization_id);
  const engines = enginesFrom(secrets, ctx.body.includeBing === true);
  const inputs = await loadFocusInputs(admin, snap, project.id);
  const focuses = uuid(ctx.body.focusId) ? inputs.focuses.filter((f) => f.id === ctx.body.focusId) : inputs.focuses;
  const units = await defaultUnits(ctx.deps);
  const grid = generateTasks(focuses, inputs.focusPlaces, buildPlaceIndex([...snap.places.values()]), { engines: engines.length ? engines : ['serper'], units, multiWeb: ctx.body.multiWeb === true });
  const ledger = await loadLedger(admin, project.id);
  const cov = coverageSummary(grid.tasks, ledger);
  const byModality: Record<string, { tasks: number; est_micros: number }> = {};
  for (const t of grid.tasks) { const m = byModality[t.modality] ?? { tasks: 0, est_micros: 0 }; m.tasks++; m.est_micros += t.est_micros; byModality[t.modality] = m; }
  const day = await dayBudgetOf(ctx.deps, project.organization_id);
  return ok({
    providers: flags, engines, tasks_total: grid.tasks.length, truncated: grid.truncated, notes: grid.notes, by_modality: byModality, estimated_total_micros: grid.tasks.reduce((a, t) => a + t.est_micros, 0),
    cost_basis: 'estimativa pela tabela de preços do teto diário (preços ainda não verificados)', coverage: cov, day,
    sample: grid.tasks.slice(0, 20).map((t) => ({ key: t.key, query: t.query, engine: t.engine, modality: t.modality, priority: t.priority, est_micros: t.est_micros })),
    blocked_reason: engines.length ? null : 'radar_no_provider_key',
  });
}

async function runBatch(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const kind = (['manual', 'diaria', 'semanal', 'mensal'] as const).find((k) => k === ctx.body.kind) ?? 'manual';
  const budget = ctx.body.budgetMicros === undefined ? undefined : Number(ctx.body.budgetMicros);
  if (budget !== undefined && (!Number.isFinite(budget) || budget < 0 || budget > 9_200_000)) return fail(422, 'budget_invalid');
  const max = ctx.body.maxQueries === undefined ? undefined : Number(ctx.body.maxQueries);
  if (max !== undefined && (!Number.isInteger(max) || max < 1 || max > 1000)) return fail(422, 'max_queries_invalid');
  const report = await executeBatch(admin, ctx.deps, project, { kind, budgetMicros: budget, maxQueries: max, focusId: uuid(ctx.body.focusId) ? ctx.body.focusId : null, userId: ctx.userId, multiWeb: ctx.body.multiWeb === true, includeBing: ctx.body.includeBing === true });
  if (!report.ok) return fail(report.error === 'radar_no_provider_key' ? 422 : 422, report.error || 'radar_run_failed');
  return { status: report.stopped === 'teto_diario' ? 200 : 200, body: { ...report } };
}

async function backlinksFetch(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const ids = Array.isArray(ctx.body.competitorIds) ? (ctx.body.competitorIds as unknown[]).filter(uuid) : [];
  if (!ids.length) return fail(422, 'competitor_ids_required');
  ctx.deps.bindOrg?.(project.organization_id, project.id, ctx.userId);
  const r = await fetchBacklinkSummaries(admin, ctx.deps, project, ids);
  if (!r.ok) return fail(422, r.error || 'radar_run_failed');
  return ok({ ...r, note: 'Backlinks pagos (DataForSEO) dentro do teto diário. O que não dá para saber: links de páginas que o provedor ainda não rastreou e links com rel nofollow/ugc não são comparáveis a DR de outras ferramentas.' });
}

async function coverage(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const { snap } = await loadSnapshot(admin, project, ctx.deps.now());
  const inputs = await loadFocusInputs(admin, snap, project.id);
  const { secrets } = await providerStatus(ctx, project.organization_id);
  const engines = enginesFrom(secrets);
  const grid = generateTasks(inputs.focuses, inputs.focusPlaces, buildPlaceIndex([...snap.places.values()]), { engines: engines.length ? engines : ['serper'], units: await defaultUnits(ctx.deps) });
  const ledger = await loadLedger(admin, project.id);
  const runs = (await loadAll<Record<string, unknown>>(admin, 'radar_runs', 'id,kind,status,queries_planned,queries_done,new_entities,total_entities,cost_micros,stop_reason,started_at,finished_at', { col: 'project_id', val: project.id }, 500, 'started_at')).rows;
  const rounds: RoundStat[] = runs.map((r) => ({ queries: Number(r.queries_done), new_entities: Number(r.new_entities), total_entities: Number(r.total_entities) }));
  const names = new Map(inputs.focuses.map((f) => [f.id, f.name]));
  const cov = coverageSummary(grid.tasks, ledger);
  return ok({
    coverage: { ...cov, by_focus: cov.by_focus.map((f) => ({ ...f, name: f.focus_id ? names.get(f.focus_id) ?? null : null })) }, saturation: saturationOf(rounds), runs: runs.slice(-20).reverse(),
    honesty: 'Cobertura do espaço DEFINIDO (focos x territórios x modalidades), não de tudo o que existe. A saturação mostra se rodadas novas ainda acham concorrentes novos.',
  });
}

// ------------------------------------------------------------------------------------------------------------------ concorrência
function scopeFrom(b: Record<string, unknown>): Scope & { node_id: string | null } {
  return { focus_id: uuid(b.focusId) ? b.focusId : null, place_id: uuid(b.placeId) ? b.placeId : null, node_id: uuid(b.nodeId) ? b.nodeId : null };
}
const trendFor = (hist: Map<string, Array<{ week: string; score: number | null }>>, id: string, s: Scope) => trendOf(hist.get(historyKey(id, s)) ?? []);

async function competitorsList(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const b = ctx.body; const scope = scopeFrom(b);
  const { snap } = await loadSnapshot(admin, project, ctx.deps.now());
  const hist = await scoreHistory(admin, project.id);
  const status = clip(b.status, 20); const platform = clip(b.platform, 20); const q = normName(b.q);
  const members = (scope.focus_id || scope.place_id || scope.node_id) ? new Set([...snap.links, ...snap.pages].filter((r) => (!scope.focus_id || r.focus_id === scope.focus_id) && (!scope.place_id || r.place_id === scope.place_id) && (!scope.node_id || (r as { node_id: string | null }).node_id === scope.node_id)).map((r) => r.competitor_id).filter((x): x is string => !!x)) : null;
  const board = scoreBoard(snap, scope.node_id ? { ...scope } : scope).filter((r) => (!members || members.has(r.competitor.id)) && (!status || r.competitor.status === status) && (!q || normName(r.competitor.name).includes(q) || normName(r.competitor.primary_host).includes(q)));
  const filtered = platform ? board.filter((r) => snap.identities.some((i) => i.competitor_id === r.competitor.id && i.platform === platform)) : board;
  const limit = Math.min(300, Math.max(1, Math.round(Number(b.limit) || 100))); const offset = Math.max(0, Math.round(Number(b.offset) || 0));
  const rows = filtered.slice(offset, offset + limit).map((r) => {
    const c = r.competitor; const ids = snap.identities.filter((i) => i.competitor_id === c.id); const ls = snap.listings.filter((l) => l.competitor_id === c.id);
    const rated = ls.filter((l) => l.rating != null);
    return {
      id: c.id, name: c.name, kind: c.kind, primary_host: c.primary_host, is_own: c.is_own, status: c.status,
      identities: ids.map((i) => ({ id: i.id, platform: i.platform, kind: i.kind, handle: i.handle, metrics: i.metrics, metrics_label: i.metrics_label })),
      maps: { listings: ls.length, rating: rated.length ? Math.round((rated.reduce((a, l) => a + (l.rating as number), 0) / rated.length) * 10) / 10 : null, reviews: ls.reduce((a, l) => a + (l.reviews ?? 0), 0) },
      pages: snap.pages.filter((p) => p.competitor_id === c.id).length, links: snap.links.filter((l) => l.competitor_id === c.id).length,
      score: { value: r.result.score, coverage: r.result.coverage, label: r.result.label }, trend: trendFor(hist, c.id, scope), authority: c.authority ?? {},
    };
  });
  return ok({ competitors: rows, total: filtered.length, scope, disclaimer: SCORE_DISCLAIMER, availability: availabilityMap(ctx) });
}
function availabilityMap(ctx: RadarCtx) {
  const m: Record<string, unknown> = {};
  for (const p of PLATFORMS) m[p.id] = metricsAvailability(p.id, { youtubeKey: !!ctx.deps.youtubeKey });
  m.gbp = metricsAvailability('gbp', { youtubeKey: !!ctx.deps.youtubeKey });
  return m;
}

async function competitorDetail(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  if (!uuid(ctx.body.competitorId)) return fail(422, 'competitor_id_required');
  const { snap } = await loadSnapshot(admin, project, ctx.deps.now());
  const c = snap.competitors.find((x) => x.id === ctx.body.competitorId);
  if (!c) return fail(404, 'competitor_not_found');
  const hist = await scoreHistory(admin, project.id);
  const scope: Scope = { focus_id: null, place_id: null };
  const res = scoreEvidence(evidenceFor(snap, c, scope));
  const idRows = (await loadAll<Record<string, unknown>>(admin, 'radar_identities', 'id,platform,kind,handle,url,source,confidence,metrics,metrics_label,metrics_source,metrics_at,evidence', { col: 'competitor_id', val: c.id }, UNBOUNDED)).rows;
  const pageRows = (await admin.from('radar_pages').select('url,title,snippet,position,modality,engine,page_type,focus_id,place_id,seen_at').eq('project_id', project.id).eq('competitor_id', c.id).order('seen_at', { ascending: false }).limit(60));
  if (pageRows.error) throw pageRows.error;
  const listRows = (await admin.from('radar_map_listings').select('name,address,rating,reviews,categories,phone,website,position,place_id,seen_at').eq('project_id', project.id).eq('competitor_id', c.id).limit(40));
  if (listRows.error) throw listRows.error;
  const linkRows = snap.links.filter((l) => l.competitor_id === c.id).map((l) => ({ focus: snap.focuses.find((f) => f.id === l.focus_id)?.name ?? null, place: l.place_id ? snap.places.get(l.place_id)?.name ?? null : null, node: snap.nodes.find((n) => n.id === l.node_id)?.label ?? null }));
  return ok({
    competitor: { id: c.id, name: c.name, kind: c.kind, primary_host: c.primary_host, is_own: c.is_own, status: c.status, authority: c.authority ?? {} },
    identities: idRows.map((i) => ({ ...i, availability: metricsAvailability(String(i.platform) as never, { youtubeKey: !!ctx.deps.youtubeKey }) })),
    pages: pageRows.data || [], listings: listRows.data || [], scan: snap.scans.get(c.id) ?? null, links: linkRows,
    score: { value: res.score, coverage: res.coverage, label: res.label, components: res.components, weights: WEIGHTS }, trend: trendFor(hist, c.id, scope),
    notes: { disclaimer: SCORE_DISCLAIMER, authority: [OPR_NOTE, CC_NOTE], social: THIRD_PARTY_WARNING },
  });
}

async function competitorSave(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  if (!uuid(ctx.body.competitorId)) return fail(422, 'competitor_id_required');
  const patch: Record<string, unknown> = {};
  if (ctx.body.status !== undefined) { if (!['sugerido', 'acompanhado', 'ignorado'].includes(ctx.body.status as string)) return fail(422, 'status_invalid'); patch.status = ctx.body.status; }
  if (ctx.body.kind !== undefined) { if (!['marca', 'pessoa', 'diretorio', 'desconhecido'].includes(ctx.body.kind as string)) return fail(422, 'kind_invalid'); patch.kind = ctx.body.kind; }
  if (ctx.body.name !== undefined) { const n = clip(ctx.body.name, 200); if (!n) return fail(422, 'name_invalid'); patch.name = n; patch.name_norm = normName(n).slice(0, 200); }
  if (!Object.keys(patch).length) return fail(422, 'nothing_to_update');
  const u = await admin.from('radar_competitors').update(patch).eq('id', ctx.body.competitorId).eq('project_id', project.id).select('id');
  if (u.error) throw u.error; if (!u.data || !u.data.length) return fail(404, 'competitor_not_found');
  return ok({ updated: true });
}

async function competitorMerge(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  if (!uuid(ctx.body.fromId) || !uuid(ctx.body.intoId) || ctx.body.fromId === ctx.body.intoId) return fail(422, 'ids_invalid');
  const { book } = await loadSnapshot(admin, project, ctx.deps.now());
  if (!mergeEntities(book, ctx.body.fromId, ctx.body.intoId)) return fail(404, 'competitor_not_found');
  await persistBook(admin, project, book, new Date(ctx.deps.now()).toISOString());
  await recordEvent(admin, { organization_id: project.organization_id, project_id: project.id, module: 'radar', kind: 'radar.concorrentes_fundidos', subject: { from: ctx.body.fromId, into: ctx.body.intoId }, payload: {} });
  return ok({ merged: true, into: ctx.body.intoId });
}

async function competitorLink(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  if (uuid(ctx.body.removeLinkId)) { const d = await admin.from('radar_links').delete().eq('id', ctx.body.removeLinkId).eq('project_id', project.id); if (d.error) throw d.error; return ok({ removed: true }); }
  if (!uuid(ctx.body.competitorId)) return fail(422, 'competitor_id_required');
  const s = scopeFrom(ctx.body);
  if (!s.focus_id && !s.place_id && !s.node_id) return fail(422, 'target_required');
  const c = await admin.from('radar_competitors').select('id').eq('id', ctx.body.competitorId).eq('project_id', project.id).maybeSingle();
  if (c.error) throw c.error; if (!c.data) return fail(404, 'competitor_not_found');
  for (const [table, id] of [['project_focuses', s.focus_id], ['geo_places', s.place_id], ['project_taxonomy_nodes', s.node_id]] as const) {
    if (!id) continue;
    const r = table === 'geo_places' ? await admin.from(table).select('id').eq('id', id).maybeSingle() : await admin.from(table).select('id').eq('id', id).eq('project_id', project.id).maybeSingle();
    if (r.error) throw r.error; if (!r.data) return fail(404, 'target_not_found');
  }
  const have = linkKeys((await loadAll<{ competitor_id: string; focus_id: string | null; place_id: string | null; node_id: string | null }>(admin, 'radar_links', 'competitor_id,focus_id,place_id,node_id', { col: 'project_id', val: project.id }, UNBOUNDED)).rows);
  const made = await ensureLink(admin, project, have, { competitor_id: ctx.body.competitorId, focus_id: s.focus_id, place_id: s.place_id, node_id: s.node_id, source: 'manual' });
  return ok({ linked: made });
}

// ------------------------------------------------------------------------------------------------------------------ placar, ataque, retrato, árvore, pontas soltas
async function scoreboard(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const scope = scopeFrom(ctx.body);
  const { snap } = await loadSnapshot(admin, project, ctx.deps.now());
  const hist = await scoreHistory(admin, project.id);
  const board = scoreBoard(snap, scope);
  const rows = board.map((r) => ({ competitor_id: r.competitor.id, name: r.competitor.name, is_own: r.competitor.is_own, status: r.competitor.status, score: r.result.score, coverage: r.result.coverage, label: r.result.label, components: r.result.components, trend: trendFor(hist, r.competitor.id, scope) }));
  const own = rows.find((r) => r.is_own) ?? null; const rivals = rows.filter((r) => !r.is_own && r.score !== null);
  return ok({ scope, own, rows, leader: rivals[0] ?? null, gap: own && own.score !== null && rivals[0] ? Math.round(((rivals[0].score as number) - own.score) * 10) / 10 : null, disclaimer: SCORE_DISCLAIMER, weights: WEIGHTS });
}

async function attacks(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const { snap } = await loadSnapshot(admin, project, ctx.deps.now());
  const items = attackList(snap, { minImpressions: Number(ctx.body.minImpressions) || 50, limit: Math.min(200, Number(ctx.body.limit) || 60) });
  const name = (id: string | null) => (id ? snap.focuses.find((f) => f.id === id)?.name ?? null : null);
  return ok({ items: items.map((i) => ({ ...i, focus_name: name(i.focus_id), place_name: i.place_id ? snap.places.get(i.place_id)?.name ?? null : null, node_label: i.node_id ? snap.nodes.find((n) => n.id === i.node_id)?.label ?? null : null })), has_search_console: snap.gsc.length > 0, ctr_note: 'A curva de cliques por posição é genérica (médias do setor), só para ordenar oportunidades: não é previsão do seu site.' });
}

async function landscapeAction(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const by = (['focus', 'place', 'node'] as const).find((x) => x === ctx.body.by) ?? 'focus';
  const { snap } = await loadSnapshot(admin, project, ctx.deps.now());
  const rows = landscape(snap, by);
  const label = (id: string) => (by === 'focus' ? snap.focuses.find((f) => f.id === id)?.name : by === 'place' ? snap.places.get(id)?.name : snap.nodes.find((n) => n.id === id)?.label) ?? null;
  return ok({ by, rows: rows.map((r) => ({ ...r, label: label(r.id) })), disclaimer: SCORE_DISCLAIMER });
}

async function treeOverlap(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const { snap } = await loadSnapshot(admin, project, ctx.deps.now());
  const att = attackList(snap, { limit: 200 });
  return ok({ nodes: overlapByNode(snap, att), disclaimer: SCORE_DISCLAIMER });
}

async function orphans(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const { snap, book } = await loadSnapshot(admin, project, ctx.deps.now());
  return ok({ ...auditOrphans(snap, book), goal: 'zero pontas soltas' });
}

async function orphanFix(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const { snap, book } = await loadSnapshot(admin, project, ctx.deps.now());
  const report = auditOrphans(snap, book);
  const refs = Array.isArray(ctx.body.refs) ? new Set((ctx.body.refs as unknown[]).filter((r): r is string => typeof r === 'string')) : null;
  const have = linkKeys(snap.links.map((l) => ({ competitor_id: l.competitor_id, focus_id: l.focus_id, place_id: l.place_id, node_id: l.node_id })));
  let applied = 0; const skipped: string[] = [];
  for (const o of report.items) {
    const s = o.suggestion;
    if (!s || !s.target_id || (refs ? !refs.has(o.ref) : false)) continue;
    // sem lista explícita: só o que a regra marca como automático e com confiança alta; com lista, a pessoa decidiu (mas a ação precisa ser ligação)
    if (!refs && !(s.auto && s.confidence >= AUTO_LINK_MIN)) continue;
    if (s.action === 'ligar_identidade') { const u = await admin.from('radar_identities').update({ competitor_id: s.target_id, confidence: s.confidence, source: 'manual', evidence: { origem: 'sugestao_aceita', confianca: s.confidence } }).eq('id', o.ref).eq('project_id', project.id); if (u.error) throw u.error; applied++; }
    else if (s.action === 'ligar_no') { if (await ensureLink(admin, project, have, { competitor_id: o.ref, focus_id: null, place_id: null, node_id: s.target_id, source: 'sugestao_aceita', evidence: { confianca: s.confidence } })) applied++; }
    else if (s.action === 'ligar_foco') { if (o.kind === 'concorrente_sem_foco' && await ensureLink(admin, project, have, { competitor_id: o.ref, focus_id: s.target_id, place_id: null, node_id: null, source: 'sugestao_aceita', evidence: { confianca: s.confidence } })) applied++; else skipped.push(o.ref); }
    else if (s.action === 'definir_no') { const u = await admin.from('project_focuses').update({ segment_node_id: s.target_id }).eq('id', o.ref).eq('project_id', project.id); if (u.error) throw u.error; applied++; }
    else skipped.push(o.ref);
  }
  const after = await loadSnapshot(admin, project, ctx.deps.now());
  const rep = auditOrphans(after.snap, after.book);
  if (applied) await recordEvent(admin, { organization_id: project.organization_id, project_id: project.id, module: 'radar', kind: 'radar.pontas_soltas_ligadas', subject: {}, payload: { applied, remaining: rep.total } });
  void liveEntity;
  return ok({ applied, skipped, remaining: rep });
}

// ------------------------------------------------------------------------------------------------------------------ rotinas e visão geral
async function scheduleSave(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const b = ctx.body;
  const cadence = b.cadence as string;
  if (!['diaria', 'semanal', 'mensal'].includes(cadence)) return fail(422, 'cadence_invalid');
  const focusId = b.focusId === undefined || b.focusId === null ? null : uuid(b.focusId) ? b.focusId : 'bad';
  if (focusId === 'bad') return fail(422, 'focus_id_invalid');
  if (focusId && !(await focusOf(admin, project, focusId))) return fail(404, 'focus_not_found');
  const existing = (await loadAll<{ id: string; focus_id: string | null; cadence: string }>(admin, 'radar_schedules', 'id,focus_id,cadence', { col: 'project_id', val: project.id }, 500)).rows.find((s) => s.cadence === cadence && (s.focus_id ?? null) === focusId);
  if (b.delete === true) { if (existing) { const d = await admin.from('radar_schedules').delete().eq('id', existing.id).eq('project_id', project.id); if (d.error) throw d.error; } return ok({ deleted: !!existing }); }
  const budget = b.budgetMicros === undefined ? DEFAULT_RUN_BUDGET_MICROS : Number(b.budgetMicros);
  if (!Number.isInteger(budget) || budget < 0 || budget > 9_200_000) return fail(422, 'budget_invalid');
  const max = b.maxQueries === undefined ? DEFAULT_MAX_QUERIES : Number(b.maxQueries);
  if (!Number.isInteger(max) || max < 1 || max > 1000) return fail(422, 'max_queries_invalid');
  const row = { cadence, focus_id: focusId, enabled: b.enabled !== false, budget_micros: budget, max_queries: max, updated_at: new Date(ctx.deps.now()).toISOString() };
  if (existing) { const u = await admin.from('radar_schedules').update(row).eq('id', existing.id).eq('project_id', project.id); if (u.error) throw u.error; return ok({ id: existing.id, updated: true }); }
  const id = crypto.randomUUID();
  const i = await admin.from('radar_schedules').insert({ id, organization_id: project.organization_id, project_id: project.id, created_by: ctx.userId, next_run_at: new Date(ctx.deps.now()).toISOString(), lock_until: '1970-01-01T00:00:00.000Z', ...row });
  if (i.error) throw i.error;
  return ok({ id, created: true });
}

async function overview(admin: Admin, ctx: RadarCtx, project: ProjectLite): Promise<Reply> {
  const { snap, book } = await loadSnapshot(admin, project, ctx.deps.now());
  const focusRows = (await loadAll<Record<string, unknown>>(admin, 'project_focuses', 'id,name,weight,topics,audiences,segment_node_id,segment_label,modalities,language,status,needs_review,compliance_mode,source,created_at', { col: 'project_id', val: project.id }, UNBOUNDED)).rows;
  const fps = snap.focusPlaces;
  const { flags } = await providerStatus(ctx, project.organization_id);
  const runs = (await loadAll<Record<string, unknown>>(admin, 'radar_runs', 'id,kind,status,queries_planned,queries_done,new_entities,total_entities,cost_micros,stop_reason,started_at,finished_at', { col: 'project_id', val: project.id }, 500, 'started_at')).rows;
  const schedules = (await loadAll<Record<string, unknown>>(admin, 'radar_schedules', 'id,focus_id,cadence,enabled,budget_micros,max_queries,next_run_at,last_run_at,consecutive_failures', { col: 'project_id', val: project.id }, 200)).rows;
  const today = dayKey(ctx.deps.now());
  const radarToday = runs.filter((r) => dayKey(Date.parse(String(r.started_at))) === today).reduce((a, r) => a + Number(r.cost_micros || 0), 0);
  const day = await dayBudgetOf(ctx.deps, project.organization_id);
  const orph = auditOrphans(snap, book);
  const hasOsm = [...snap.places.values()].some((p) => p.source === 'osm');
  const rivals = snap.competitors.filter((c) => !c.merged_into && !c.is_own && c.kind !== 'diretorio');
  const rounds: RoundStat[] = runs.map((r) => ({ queries: Number(r.queries_done), new_entities: Number(r.new_entities), total_entities: Number(r.total_entities) }));
  return ok({
    project: { id: project.id, name: project.name, domain: project.domain }, can_edit: WRITE_ROLES.includes(ctx.roleByOrg.get(project.organization_id) || ''), can_admin: ['owner', 'admin'].includes(ctx.roleByOrg.get(project.organization_id) || ''),
    focuses: focusRows.map((f) => ({ ...f, places: { total: fps.filter((p) => p.focus_id === f.id).length, aprovado: fps.filter((p) => p.focus_id === f.id && p.status === 'aprovado').length, sugerido: fps.filter((p) => p.focus_id === f.id && p.status === 'sugerido').length } })),
    totals: { competitors: rivals.length, identities: snap.identities.length, pages: snap.pages.length, listings: snap.listings.length, scanned_sites: snap.scans.size, links: snap.links.length },
    providers: flags, youtube: { available: flags.youtube, message: flags.youtube ? null : YT_KEY_MISSING_MESSAGE },
    cost: { radar_today_micros: radarToday, day, basis: 'o gasto do Radar hoje é a soma das rodadas (estimado pela tabela de preços e pelo custo informado pelo provedor); o teto diário do sistema vale para tudo' },
    saturation: saturationOf(rounds), runs: runs.slice(-10).reverse(), schedules, orphans: { total: orph.total, counts: orph.counts, zero: orph.zero_orphans },
    limits: { social: THIRD_PARTY_WARNING, score: SCORE_DISCLAIMER, authority: [OPR_NOTE, CC_NOTE], overpass: hasOsm ? OVERPASS_USAGE_NOTE : null, osm_attribution: hasOsm ? OSM_ATTRIBUTION : null, platforms: PLATFORMS.map((p) => ({ id: p.id, label: p.label, metrics: p.metrics })) },
  });
}
void metricsAvailability;
