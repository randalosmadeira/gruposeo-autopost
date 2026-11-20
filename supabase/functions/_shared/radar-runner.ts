/**
 * Rotinas do Radar (chamadas de hora em hora pela função `radar-run`, no padrão do site-monitor).
 *
 * Cada rotina (diária, semanal ou mensal; por Foco ou do projeto todo) tem orçamento por rodada e número máximo de consultas. A rodada:
 *  1) reserva a rotina (lock_until) para duas execuções nunca rodarem juntas;
 *  2) descobre (executeBatch): usa o fetch guardado do teto diário e PARA na hora em que o teto nega (alerta `radar_budget_stop`);
 *  3) enriquece 2 concorrentes (varredura educada) e, na rotina semanal/mensal, guarda a foto semanal do placar (tendência);
 *  4) avisa: concorrente novo, concorrente subindo (>= 8 pontos), pontas soltas, parada no teto. Alertas em project_alerts e fatos em project_events.
 * Se o tempo da rodada acaba, a rotina volta para a fila (lock liberado, próxima janela mais cedo).
 */
import type { Admin } from './engine-kernel.ts';
import { loadAll, UNBOUNDED } from './taxonomy-shared.ts';
import { recordEvent } from './project-events.ts';
import { enrichCompetitors, executeBatch, historyKey, scoreHistory, storeScoreSnapshot, type BatchDeps } from './radar-batch.ts';
import { auditOrphans, scoreBoard, trendOf } from './radar-score-core.ts';
import { loadSnapshot, type ProjectLite } from './radar-store.ts';

export interface RunnerReport { schedules: number; runs: number; queries: number; new_competitors: number; alerts: number; stopped_at_cap: boolean; elapsed_ms: number }
const DAY = 86_400_000;
export const CADENCE_MS: Record<string, number> = { diaria: DAY, semanal: 7 * DAY, mensal: 30 * DAY };
export const SCHEDULES_PER_TICK = 2;
const LOCK_MS = 10 * 60_000;
const EPOCH = '1970-01-01T00:00:00.000Z';
export const RISING_DELTA = 8;

interface ScheduleRow { id: string; organization_id: string; project_id: string; focus_id: string | null; cadence: 'diaria' | 'semanal' | 'mensal'; budget_micros: number; max_queries: number; consecutive_failures: number }

async function alert(admin: Admin, project: ProjectLite, kind: string, title: string, detail: Record<string, unknown>): Promise<boolean> {
  const dup = await admin.from('project_alerts').select('id').eq('project_id', project.id).eq('source', 'radar').eq('kind', kind).eq('title', title.slice(0, 200)).is('dismissed_at', null).limit(1);
  if (dup.error) throw dup.error;
  if (dup.data && dup.data.length) return false;
  const ins = await admin.from('project_alerts').insert({ organization_id: project.organization_id, project_id: project.id, source: 'radar', kind, title: title.slice(0, 200), detail, ref_url: null });
  if (ins.error) throw ins.error;
  return true;
}

export async function runRadar(admin: Admin, deps: BatchDeps): Promise<RunnerReport> {
  const t0 = deps.now(); const nowIso = new Date(t0).toISOString();
  const report: RunnerReport = { schedules: 0, runs: 0, queries: 0, new_competitors: 0, alerts: 0, stopped_at_cap: false, elapsed_ms: 0 };
  const due = await admin.from('radar_schedules').select('id,organization_id,project_id,focus_id,cadence,budget_micros,max_queries,consecutive_failures').eq('enabled', true).lte('next_run_at', nowIso).lt('lock_until', nowIso).order('next_run_at', { ascending: true }).limit(SCHEDULES_PER_TICK);
  if (due.error) throw due.error;
  for (const sch of (due.data || []) as ScheduleRow[]) {
    if (report.stopped_at_cap) break; // o teto é por organização e já parou: não adianta tentar a próxima agora
    const claim = await admin.from('radar_schedules').update({ lock_until: new Date(deps.now() + LOCK_MS).toISOString() }).eq('id', sch.id).lt('lock_until', nowIso).select('id');
    if (claim.error) throw claim.error;
    if (!claim.data || !claim.data.length) continue;
    report.schedules++;
    let failures = 0;
    try {
      const pr = await admin.from('projects').select('id,name,domain,wordpress_url,organization_id').eq('id', sch.project_id).maybeSingle();
      if (pr.error) throw pr.error;
      const project = pr.data as ProjectLite | null;
      if (!project || project.organization_id !== sch.organization_id) throw new Error('project_mismatch');
      const run = await executeBatch(admin, deps, project, { kind: sch.cadence, budgetMicros: sch.budget_micros, maxQueries: sch.max_queries, focusId: sch.focus_id, userId: null });
      if (run.ok) {
        report.runs++; report.queries += run.queries_done; report.new_competitors += run.new_entities;
        if (run.new_entities > 0 && await alert(admin, project, 'radar_competitor_new', `${run.new_entities} concorrente(s) novo(s) no radar`, { novos: run.new_entities, rodada: run.run_id })) report.alerts++;
        if (run.stopped === 'teto_diario') {
          report.stopped_at_cap = true;
          if (await alert(admin, project, 'radar_budget_stop', 'O radar parou no teto diário de gasto', { motivo: run.stop_reason, consultas_feitas: run.queries_done })) report.alerts++;
        }
      } else if (run.error !== 'radar_no_provider_key' && run.error !== 'radar_no_active_focus') failures = sch.consecutive_failures + 1;
      if (deps.now() - t0 < 80_000) await enrichCompetitors(admin, deps, project, { limit: 2 });
      if (sch.cadence !== 'diaria' && deps.now() - t0 < 100_000) {
        const { snap, book } = await loadSnapshot(admin, project, deps.now());
        await storeScoreSnapshot(admin, project, snap, deps.now());
        const hist = await scoreHistory(admin, project.id);
        let n = 0;
        for (const f of snap.focuses.filter((x) => x.status === 'ativo')) {
          for (const r of scoreBoard(snap, { focus_id: f.id, place_id: null }, { includeOwn: false })) {
            const tr = trendOf(hist.get(historyKey(r.competitor.id, { focus_id: f.id, place_id: null })) ?? []);
            if (tr.direction === 'subindo' && (tr.delta ?? 0) >= RISING_DELTA && n < 3 && await alert(admin, project, 'radar_competitor_rising', `${r.competitor.name} está subindo em ${f.name}`, { delta: tr.delta, foco: f.name, rotulo: 'estimado' })) { n++; report.alerts++; }
          }
        }
        const orph = auditOrphans(snap, book);
        if (orph.total > 0 && await alert(admin, project, 'radar_orphans', `${orph.total} ponta(s) solta(s) no radar`, { por_tipo: orph.counts })) report.alerts++;
      }
      await recordEvent(admin, { organization_id: project.organization_id, project_id: project.id, module: 'radar', kind: 'radar.rotina_executada', subject: { schedule_id: sch.id }, payload: { cadence: sch.cadence, queries: run.queries_done, new_competitors: run.new_entities, stopped: run.stopped } });
    } catch (e) {
      failures = sch.consecutive_failures + 1;
      console.error(`[radar-run] schedule_failed ${(e as { name?: string })?.name ?? 'erro'}`);
    }
    const next = new Date((report.stopped_at_cap ? deps.now() + 6 * 3_600_000 : deps.now() + (CADENCE_MS[sch.cadence] ?? DAY))).toISOString();
    await admin.from('radar_schedules').update({ last_run_at: new Date(deps.now()).toISOString(), next_run_at: next, lock_until: EPOCH, consecutive_failures: failures }).eq('id', sch.id);
  }
  void loadAll; void UNBOUNDED;
  report.elapsed_ms = deps.now() - t0;
  return report;
}
