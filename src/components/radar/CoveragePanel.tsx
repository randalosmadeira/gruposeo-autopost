import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { radar, radarErrorMessage, usd, type CoverageReply, type EnrichReply, type Overview, type PlanReply, type RunReport } from '@/lib/radar-api';
import { Chip, Empty, INPUT, Notice, SECTION, SELECT, useRT } from './ui';

type Msg = { kind: 'ok' | 'error' | 'warn'; text: string } | null;

export function CoveragePanel({ projectId, data, onChanged }: { projectId: string; data: Overview; onChanged: () => Promise<void> }) {
  const { t, n, date } = useRT();
  const cache = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [confirm, setConfirm] = useState(false);
  const [budget, setBudget] = useState('0.50');
  const [maxQ, setMaxQ] = useState('40');
  const [focusId, setFocusId] = useState('');
  const [report, setReport] = useState<RunReport | null>(null);
  const [enrich, setEnrich] = useState<EnrichReply | null>(null);
  const plan = useQuery<PlanReply>({ queryKey: ['radar-plan', projectId, focusId], queryFn: () => radar.plan(projectId, focusId || undefined), retry: false, refetchOnWindowFocus: false });
  const cov = useQuery<CoverageReply>({ queryKey: ['radar-coverage', projectId], queryFn: () => radar.coverage(projectId), retry: false, refetchOnWindowFocus: false });
  const canEdit = data.can_edit;
  const refresh = async () => { for (const k of ['radar', 'radar-plan', 'radar-coverage', 'radar-competitors', 'radar-score', 'radar-attack', 'radar-landscape', 'radar-orphans']) await cache.invalidateQueries({ queryKey: [k] }); await onChanged(); };
  const run = async <T,>(key: string, fn: () => Promise<T>, after: (r: T) => void) => {
    setBusy(key); setMsg(null);
    try { const r = await fn(); after(r); await refresh(); } catch (e) { setMsg({ kind: 'error', text: radarErrorMessage(e) }); } finally { setBusy(null); setConfirm(false); }
  };
  const budgetMicros = Math.max(0, Math.round(Number(budget.replace(',', '.')) * 1_000_000)) || 0;
  const spin = (k: string, label: string) => (busy === k ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{t('common.working')}</> : label);
  const p = plan.data; const c = cov.data;
  const dayLeft = data.cost.day?.remaining_micros;

  return (
    <div className="space-y-4">
      <section aria-labelledby="rd-cost" className={SECTION}>
        <h2 id="rd-cost" className="text-lg font-semibold">{t('cost.title')}</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded border bg-background/40 p-2"><dt className="text-xs text-muted-foreground">{t('cost.radarToday')}</dt><dd className="text-lg font-semibold">{usd(data.cost.radar_today_micros)}</dd></div>
          <div className="rounded border bg-background/40 p-2"><dt className="text-xs text-muted-foreground">{t('cost.dayLeft')}</dt><dd className="text-lg font-semibold">{dayLeft === undefined ? t('cost.unknown') : usd(dayLeft)}</dd></div>
          <div className="rounded border bg-background/40 p-2"><dt className="text-xs text-muted-foreground">{t('cost.dayCap')}</dt><dd className="text-lg font-semibold">{data.cost.day ? usd(data.cost.day.cap_micros) : t('cost.unknown')}</dd></div>
          <div className="rounded border bg-background/40 p-2"><dt className="text-xs text-muted-foreground">{t('cost.estimateAll')}</dt><dd className="text-lg font-semibold">{p ? usd(p.estimated_total_micros) : '…'}</dd></div>
        </dl>
        <p className="break-words text-xs text-muted-foreground">{t('cost.basis')}</p>
        <div className="flex flex-wrap gap-2" aria-label={t('prov.title')}>
          {([['serper', 'Serper'], ['dataforseo', 'DataForSEO'], ['brave', 'Brave'], ['youtube', 'YouTube'], ['open_pagerank', 'Open PageRank']] as const).map(([k, label]) => <Chip key={k} tone={data.providers[k] ? 'ok' : 'muted'}>{label}: {data.providers[k] ? t('prov.on') : t('prov.off')}</Chip>)}
        </div>
      </section>

      <section aria-labelledby="rd-run" className={SECTION}>
        <h2 id="rd-run" className="text-lg font-semibold">{t('run.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('run.help')}</p>
        {p?.blocked_reason && <Notice kind="warn">{t('run.noProvider')}</Notice>}
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">{t('run.focus')}
            <select className={`${SELECT} mt-1 block`} value={focusId} onChange={(e) => setFocusId(e.target.value)}><option value="">{t('run.allFocuses')}</option>{data.focuses.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          </label>
          <label className="text-xs text-muted-foreground">{t('run.budget')}<input inputMode="decimal" className={`${INPUT} mt-1 max-w-[8rem]`} value={budget} onChange={(e) => { setBudget(e.target.value); setConfirm(false); }} /></label>
          <label className="text-xs text-muted-foreground">{t('run.maxQueries')}<input inputMode="numeric" className={`${INPUT} mt-1 max-w-[8rem]`} value={maxQ} onChange={(e) => { setMaxQ(e.target.value); setConfirm(false); }} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          {!confirm ? (
            <Button disabled={!canEdit || busy !== null || !p || !!p.blocked_reason} onClick={() => setConfirm(true)}>{t('run.start')}</Button>
          ) : (
            <>
              <Button disabled={busy !== null} onClick={() => void run('run', () => radar.runBatch(projectId, { budgetMicros, maxQueries: Math.max(1, Math.round(Number(maxQ)) || 40), ...(focusId ? { focusId } : {}) }), (r) => { setReport(r); setMsg({ kind: r.stopped === 'teto_diario' ? 'warn' : 'ok', text: r.stopped === 'teto_diario' ? t('run.stoppedCap') : t('run.done', { done: r.queries_done, cost: usd(r.cost_micros) }) }); })}>{spin('run', t('run.confirm', { cost: usd(budgetMicros) }))}</Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => setConfirm(false)}>{t('common.cancel')}</Button>
            </>
          )}
          <Button variant="outline" disabled={!canEdit || busy !== null} onClick={() => void run('enrich', () => radar.enrich(projectId, 3), (r) => { setEnrich(r); setMsg({ kind: 'ok', text: t('enrich.done', { n: r.scanned, left: r.remaining_unscanned }) }); })}>{spin('enrich', t('enrich.button'))}</Button>
          <Button variant="outline" disabled={!canEdit || busy !== null} onClick={() => void run('yt', () => radar.youtubeDiscover(projectId, focusId || undefined), (r) => { setMsg(r.status === 'ok' ? { kind: 'ok', text: t('yt.done', { c: r.channels, v: r.videos }) } : { kind: 'warn', text: r.message ?? t('yt.unavailable') }); })}>{spin('yt', t('yt.button'))}</Button>
        </div>
        <p className="break-words text-xs text-muted-foreground">{t('run.polite')}</p>
        {!canEdit && <p role="note" className="text-sm text-muted-foreground">{t('common.readonly')}</p>}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {report && (
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-label={t('run.result')}>
            {([['run.queries', n(report.queries_done)], ['run.newCompetitors', n(report.new_entities)], ['run.errors', n(report.errors)], ['run.cost', usd(report.cost_micros)]] as const).map(([k, v]) => <div key={k} className="rounded border bg-background/40 p-2"><dt className="text-xs text-muted-foreground">{t(k)}</dt><dd className="font-semibold">{v}</dd></div>)}
          </dl>
        )}
        {report?.stopped === 'teto_diario' && <Notice kind="warn">{t('run.capReason', { reason: report.stop_reason ?? '' })}</Notice>}
        {enrich && enrich.youtube.status !== 'ok' && enrich.youtube.message && <Notice kind="warn">{enrich.youtube.message}</Notice>}
      </section>

      <section aria-labelledby="rd-cov" className={SECTION}>
        <h2 id="rd-cov" className="text-lg font-semibold">{t('cov.title')}</h2>
        {cov.isLoading && <p aria-busy="true" className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {cov.isError && <Notice kind="error">{radarErrorMessage(cov.error)}</Notice>}
        {c && (
          <>
            <div className="h-3 w-full overflow-hidden rounded bg-muted" role="img" aria-label={t('cov.barAria', { pct: c.coverage.pct_done })}><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, c.coverage.pct_done)}%` }} /></div>
            <p className="text-sm">{t('cov.line', { done: n(c.coverage.done), total: n(c.coverage.planned_total), pending: n(c.coverage.pending), pct: c.coverage.pct_done })}{c.coverage.last_queried_at ? ` ${t('cov.last', { date: date(c.coverage.last_queried_at) })}` : ''}</p>
            <p className="text-sm"><strong>{t('sat.title')}:</strong> {t(`sat.${c.saturation.message_key}`)}{c.saturation.recent_new_rate !== null ? ` (${t('sat.rate', { pct: Math.round(c.saturation.recent_new_rate * 1000) / 10 })})` : ''}</p>
            <p className="break-words text-xs text-muted-foreground">{t('cov.honesty')}</p>
            {c.coverage.by_focus.length > 0 && (
              <ul className="space-y-1 text-sm">{c.coverage.by_focus.map((f) => <li key={f.focus_id ?? 'x'} className="break-words">{f.name ?? '—'}: {t('cov.focusLine', { done: n(f.done), total: n(f.total) })}</li>)}</ul>
            )}
            <h3 className="pt-2 text-base font-semibold">{t('runs.title')}</h3>
            {c.runs.length === 0 ? <Empty>{t('runs.empty')}</Empty> : (
              <ul className="space-y-1 text-sm">{c.runs.map((r) => <li key={r.id} className="break-words rounded border bg-background/40 p-2">{date(r.started_at)} · {t(`rkind.${r.kind}`)} · {t(`rstatus.${r.status}`)} · {t('runs.line', { q: n(r.queries_done), news: n(r.new_entities), cost: usd(r.cost_micros) })}{r.stop_reason ? ` · ${r.stop_reason}` : ''}</li>)}</ul>
            )}
          </>
        )}
      </section>

      <ScheduleBox projectId={projectId} data={data} onDone={refresh} />
    </div>
  );
}

function ScheduleBox({ projectId, data, onDone }: { projectId: string; data: Overview; onDone: () => Promise<void> }) {
  const { t, n, date } = useRT();
  const [cadence, setCadence] = useState('semanal');
  const [focusId, setFocusId] = useState('');
  const [budget, setBudget] = useState('0.50');
  const [maxQ, setMaxQ] = useState('40');
  const [msg, setMsg] = useState<Msg>(null);
  const save = async (body: Record<string, unknown>) => {
    setMsg(null);
    try { await radar.scheduleSave(projectId, { cadence, focusId: focusId || null, ...body } as never); await onDone(); setMsg({ kind: 'ok', text: t('sched.saved') }); } catch (e) { setMsg({ kind: 'error', text: radarErrorMessage(e) }); }
  };
  const name = (id: string | null) => (id ? data.focuses.find((f) => f.id === id)?.name ?? '—' : t('run.allFocuses'));
  return (
    <section aria-labelledby="rd-sched" className={SECTION}>
      <h2 id="rd-sched" className="text-lg font-semibold">{t('sched.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('sched.help')}</p>
      {data.schedules.length === 0 ? <Empty>{t('sched.empty')}</Empty> : (
        <ul className="space-y-2 text-sm">
          {data.schedules.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 break-words rounded border bg-background/40 p-2">
              <strong>{t(`cad.${s.cadence}`)}</strong><span>{name(s.focus_id)}</span><span>{usd(s.budget_micros)} · {n(s.max_queries)} {t('sched.queries')}</span>
              <span className="text-xs text-muted-foreground">{t('sched.next', { date: date(s.next_run_at) })}</span>
              {!s.enabled && <Chip tone="warn">{t('sched.paused')}</Chip>}
              {data.can_edit && <><Button size="sm" variant="outline" onClick={() => { setCadence(s.cadence); setFocusId(s.focus_id ?? ''); void save({ cadence: s.cadence, focusId: s.focus_id, enabled: !s.enabled, budgetMicros: s.budget_micros, maxQueries: s.max_queries }); }}>{s.enabled ? t('sched.pause') : t('sched.resume')}</Button><Button size="sm" variant="outline" onClick={() => void save({ cadence: s.cadence, focusId: s.focus_id, delete: true })}>{t('sched.delete')}</Button></>}
            </li>
          ))}
        </ul>
      )}
      {data.can_edit && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">{t('sched.cadence')}<select className={`${SELECT} mt-1 block`} value={cadence} onChange={(e) => setCadence(e.target.value)}>{(['diaria', 'semanal', 'mensal'] as const).map((c) => <option key={c} value={c}>{t(`cad.${c}`)}</option>)}</select></label>
          <label className="text-xs text-muted-foreground">{t('run.focus')}<select className={`${SELECT} mt-1 block`} value={focusId} onChange={(e) => setFocusId(e.target.value)}><option value="">{t('run.allFocuses')}</option>{data.focuses.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label className="text-xs text-muted-foreground">{t('run.budget')}<input inputMode="decimal" className={`${INPUT} mt-1 max-w-[8rem]`} value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
          <label className="text-xs text-muted-foreground">{t('run.maxQueries')}<input inputMode="numeric" className={`${INPUT} mt-1 max-w-[8rem]`} value={maxQ} onChange={(e) => setMaxQ(e.target.value)} /></label>
          <Button onClick={() => void save({ budgetMicros: Math.max(0, Math.round(Number(budget.replace(',', '.')) * 1_000_000)) || 0, maxQueries: Math.max(1, Math.round(Number(maxQ)) || 40), enabled: true })}>{t('sched.save')}</Button>
        </div>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </section>
  );
}
