/**
 * Rodada do monitor (chamada pelo cron a cada 10 minutos pela função `site-monitor`).
 *
 *  1) Velocidade: mede o que está agendado e vencido (página inicial + extras, aparelhos escolhidos, concorrentes se pedido),
 *     compara com a mediana das medições anteriores e cria aviso quando a piora é real.
 *  2) Backlinks: reverifica os links mais antigos dos projetos com a reverificação ligada e avisa quando links que estavam no ar sumiram.
 *
 * Segurança de execução: cada agendamento é "reservado" (lock_until) antes de rodar, então duas rodadas nunca medem o mesmo projeto ao mesmo tempo.
 * Se o tempo da rodada acabar no meio, o progresso é guardado e a próxima rodada continua de onde parou.
 * Cota do Google esgotada: para tudo, espera 30 minutos e não conta como falha do site.
 */
import { normalizeSiteInput, type Deps } from './profile-analyze-core.ts';
import { evaluateSpeedAlerts, buildTargets, nextRunAt, type Devices, type Frequency, type Target } from './monitor-core.ts';
import { measureAndStore, type SpeedDeps } from './speed-handler.ts';
import { loadLinks, verifyAndStore } from './backlinks-handler.ts';

export interface MonitorDeps extends Deps { apiKey: string | null }
export interface MonitorReport {
  speed: { schedules: number; measured: number; failed: number; alerts: number; quota_hit: boolean };
  backlinks: { projects: number; checked: number; alerts: number };
  elapsed_ms: number;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
const EPOCH = '1970-01-01T00:00:00.000Z';
export const SPEED_STAGE_BUDGET_MS = 60_000;
export const BACKLINK_STAGE_START_MS = 75_000;
export const SCHEDULES_PER_TICK = 3;
export const BACKLINK_PROJECTS_PER_TICK = 2;
export const BACKLINK_LINKS_PER_PROJECT = 12;
const LOCK_MS = 5 * 60_000;
const QUOTA_BACKOFF_MS = 30 * 60_000;
const ROUND = 3;

interface ScheduleRow { project_id: string; organization_id: string; frequency: Frequency; devices: Devices; extra_urls: string[]; include_competitors: boolean; alert_drop_points: number; progress: number; consecutive_failures: number }

export async function runMonitor(admin: Admin, deps: MonitorDeps): Promise<MonitorReport> {
  const t0 = deps.now();
  const report: MonitorReport = { speed: { schedules: 0, measured: 0, failed: 0, alerts: 0, quota_hit: false }, backlinks: { projects: 0, checked: 0, alerts: 0 }, elapsed_ms: 0 };
  if (deps.apiKey) await speedStage(admin, deps, t0, report);
  if (deps.now() - t0 < BACKLINK_STAGE_START_MS) await backlinkStage(admin, deps, report);
  report.elapsed_ms = deps.now() - t0;
  return report;
}

async function speedStage(admin: Admin, deps: MonitorDeps, t0: number, report: MonitorReport): Promise<void> {
  const nowIso = new Date(deps.now()).toISOString();
  const due = await admin.from('project_speed_schedules').select('project_id,organization_id,frequency,devices,extra_urls,include_competitors,alert_drop_points,progress,consecutive_failures').eq('enabled', true).lte('next_run_at', nowIso).lt('lock_until', nowIso).order('next_run_at', { ascending: true }).limit(SCHEDULES_PER_TICK);
  if (due.error) throw due.error;
  const speedDeps: SpeedDeps = { fetchFn: deps.fetchFn, now: deps.now, apiKey: deps.apiKey };
  for (const sch of (due.data || []) as ScheduleRow[]) {
    if (deps.now() - t0 >= SPEED_STAGE_BUDGET_MS || report.speed.quota_hit) break;
    const claim = await admin.from('project_speed_schedules').update({ lock_until: new Date(deps.now() + LOCK_MS).toISOString() }).eq('project_id', sch.project_id).lt('lock_until', nowIso).select('project_id');
    if (claim.error) throw claim.error;
    if (!claim.data || !claim.data.length) continue;
    report.speed.schedules++;
    try { await runSchedule(admin, deps, speedDeps, sch, t0, report); }
    catch (_e) { console.error('[site-monitor] schedule_failed'); }
    await admin.from('project_speed_schedules').update({ lock_until: report.speed.quota_hit ? new Date(deps.now() + QUOTA_BACKOFF_MS).toISOString() : EPOCH }).eq('project_id', sch.project_id);
  }
}

async function runSchedule(admin: Admin, deps: MonitorDeps, speedDeps: SpeedDeps, sch: ScheduleRow, t0: number, report: MonitorReport): Promise<void> {
  const pr = await admin.from('projects').select('id,name,domain,organization_id,wordpress_url').eq('id', sch.project_id).maybeSingle();
  if (pr.error) throw pr.error;
  const project = pr.data as Record<string, unknown> | null;
  const own = project ? normalizeSiteInput(project.domain) || normalizeSiteInput(project.wordpress_url) : null;
  if (!project || !own) { await admin.from('project_speed_schedules').update({ next_run_at: nextRunAt(sch.frequency, deps.now()), progress: 0 }).eq('project_id', sch.project_id); return; }

  let competitorUrls: string[] = [];
  if (sch.include_competitors) {
    const cr = await admin.from('project_speed_runs').select('url,host,fetched_at').eq('project_id', sch.project_id).eq('kind', 'competitor').order('fetched_at', { ascending: false }).limit(80);
    if (cr.error) throw cr.error;
    const seen = new Set<string>();
    for (const r of (cr.data || []) as Array<{ url: string; host: string }>) if (!seen.has(r.host)) { seen.add(r.host); competitorUrls.push(r.url); }
  }
  competitorUrls = competitorUrls.slice(0, 20);
  const targets: Target[] = buildTargets(sch, own.host, competitorUrls);
  let done = Math.min(sch.progress, targets.length);
  let okOwn = 0; let triedOwn = 0;
  while (done < targets.length && deps.now() - t0 < SPEED_STAGE_BUDGET_MS && !report.speed.quota_hit) {
    const batch = targets.slice(done, done + ROUND);
    const results = await Promise.all(batch.map(async (t) => ({ t, m: await measureAndStore(admin, speedDeps, project, t.url, new URL(t.url).hostname, t.strategy, t.kind, null) })));
    let advance = results.length;
    for (const [i, { t, m }] of results.entries()) {
      if (t.kind === 'own') triedOwn++;
      if (m.ok === false) {
        if (m.reply.body.error === 'google_quota') { report.speed.quota_hit = true; advance = Math.min(advance, i); continue; }
        report.speed.failed++;
        continue;
      }
      report.speed.measured++;
      if (t.kind === 'own') okOwn++;
      for (const a of evaluateSpeedAlerts(m.saved, m.priors, sch.alert_drop_points)) {
        const ins = await admin.from('project_alerts').insert({ organization_id: project.organization_id, project_id: project.id, source: 'speed', kind: a.kind, title: a.title.slice(0, 200), detail: a.detail, ref_url: a.ref_url });
        if (ins.error) throw ins.error;
        report.speed.alerts++;
      }
    }
    done += advance;
  }
  const nowMs = deps.now();
  if (done < targets.length) { await admin.from('project_speed_schedules').update({ progress: done }).eq('project_id', sch.project_id); return; }
  // rodada completa
  const failures = triedOwn > 0 && okOwn === 0 ? sch.consecutive_failures + 1 : 0;
  if (failures === 2) {
    const ins = await admin.from('project_alerts').insert({ organization_id: project.organization_id, project_id: project.id, source: 'speed', kind: 'measure_failed', title: `Não consegui medir a velocidade de ${own.host} nas últimas 2 rodadas`, detail: { host: own.host, rounds: 2, hint: 'O site pode estar fora do ar ou bloqueando o teste do Google.' }, ref_url: `https://${own.host}/` });
    if (ins.error) throw ins.error;
    report.speed.alerts++;
  }
  await admin.from('project_speed_schedules').update({ last_run_at: new Date(nowMs).toISOString(), next_run_at: nextRunAt(sch.frequency, nowMs), progress: 0, consecutive_failures: failures }).eq('project_id', sch.project_id);
}

async function backlinkStage(admin: Admin, deps: MonitorDeps, report: MonitorReport): Promise<void> {
  const nowMs = deps.now();
  const nowIso = new Date(nowMs).toISOString();
  const due = await admin.from('project_backlink_settings').select('project_id,organization_id,recheck_days').eq('enabled', true).lt('lock_until', nowIso).order('last_run_at', { ascending: true }).limit(BACKLINK_PROJECTS_PER_TICK);
  if (due.error) throw due.error;
  for (const s of (due.data || []) as Array<{ project_id: string; organization_id: string; recheck_days: number }>) {
    const claim = await admin.from('project_backlink_settings').update({ lock_until: new Date(nowMs + LOCK_MS).toISOString() }).eq('project_id', s.project_id).lt('lock_until', nowIso).select('project_id');
    if (claim.error) throw claim.error;
    if (!claim.data || !claim.data.length) continue;
    try {
      const links = await loadLinks(admin, s.project_id);
      const limit = new Date(nowMs - s.recheck_days * 86_400_000).toISOString();
      const dueLinks = links.filter((l) => !l.last_checked_at || l.last_checked_at < limit)
        .sort((a, b) => ((a.last_checked_at || '') < (b.last_checked_at || '') ? -1 : (a.last_checked_at || '') > (b.last_checked_at || '') ? 1 : 0)).slice(0, BACKLINK_LINKS_PER_PROJECT);
      if (dueLinks.length) {
        report.backlinks.projects++;
        const res = await verifyAndStore(admin, deps, dueLinks);
        report.backlinks.checked += res.checked;
        const ownIds = new Set(dueLinks.filter((l) => l.kind === 'own').map((l) => l.id));
        const lost = res.transitions.filter((t) => ownIds.has(t.id) && t.from === 'live' && (t.to === 'lost' || t.to === 'dead'));
        if (lost.length) {
          const ins = await admin.from('project_alerts').insert({
            organization_id: s.organization_id, project_id: s.project_id, source: 'backlinks', kind: 'links_lost',
            title: `${lost.length} backlink(s) que estava(m) no ar deixou(aram) de aparecer`, detail: { count: lost.length, items: lost.slice(0, 5).map((t) => ({ source_url: t.source_url, now: t.to })), note: 'Verificação feita no HTML da página; links inseridos por JavaScript podem não aparecer.' }, ref_url: lost[0].source_url,
          });
          if (ins.error) throw ins.error;
          report.backlinks.alerts++;
        }
      }
    } catch (_e) { console.error('[site-monitor] backlink_recheck_failed'); }
    await admin.from('project_backlink_settings').update({ last_run_at: new Date(deps.now()).toISOString(), lock_until: EPOCH }).eq('project_id', s.project_id);
  }
}
