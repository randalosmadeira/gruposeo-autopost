import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { radar, radarErrorMessage, type AttackReply, type LandscapeRow, type OrphansReply, type Overview, type ScoreboardReply, type ScoreRow } from '@/lib/radar-api';
import { Chip, Empty, Notice, SECTION, SELECT, ScoreTag, TrendTag, useRT } from './ui';

/** Placar por Foco: score ESTIMADO com componentes transparentes e tendência semanal. */
export function ScoreboardPanel({ projectId, data }: { projectId: string; data: Overview }) {
  const { t, n } = useRT();
  const [focusId, setFocusId] = useState('');
  const q = useQuery<ScoreboardReply>({ queryKey: ['radar-score', projectId, focusId], queryFn: () => radar.scoreboard(projectId, focusId || undefined), retry: false, refetchOnWindowFocus: false });
  const Row = ({ r }: { r: ScoreRow }) => (
    <li className={`space-y-2 rounded-lg border p-3 ${r.is_own ? 'border-sky-500/50 bg-sky-500/10' : 'bg-background/40'}`}>
      <div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-base font-semibold">{r.name}</h3>{r.is_own && <Chip tone="info">{t('comp.own')}</Chip>}<ScoreTag value={r.score} coverage={r.coverage} /><TrendTag trend={r.trend} /></div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">{r.components.map((c) => (
        <li key={c.key} className="break-words"><span className="text-muted-foreground">{t(`scomp.${c.key}`)}:</span> {c.value === null ? <span className="text-muted-foreground">{t('det.noData')}</span> : <strong>{n(c.value)}</strong>}</li>))}</ul>
    </li>
  );
  return (
    <section aria-labelledby="rd-score" className={SECTION}>
      <h2 id="rd-score" className="text-lg font-semibold">{t('score.title')}</h2>
      <label className="block text-xs text-muted-foreground">{t('run.focus')}<select className={`${SELECT} mt-1 block`} value={focusId} onChange={(e) => setFocusId(e.target.value)}><option value="">{t('run.allFocuses')}</option>{data.focuses.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <Notice kind="warn">{q.data?.disclaimer ?? t('score.disclaimer')}</Notice>
      {q.isLoading && <p aria-busy="true" className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {q.isError && <Notice kind="error">{radarErrorMessage(q.error)}</Notice>}
      {q.data && (
        <>
          {q.data.gap !== null && q.data.own?.score !== null && q.data.leader && <p className="text-sm">{t('score.gap', { leader: q.data.leader.name, gap: n(q.data.gap) })}</p>}
          {q.data.rows.length === 0 ? <Empty>{t('score.empty')}</Empty> : <ul className="space-y-3">{q.data.rows.map((r) => <Row key={r.competitor_id} r={r} />)}</ul>}
        </>
      )}
    </section>
  );
}

/** Lista "onde atacar": cada item diz POR QUE e O QUE FAZER. */
export function AttackPanel({ projectId }: { projectId: string }) {
  const { t } = useRT();
  const q = useQuery<AttackReply>({ queryKey: ['radar-attack', projectId], queryFn: () => radar.attack(projectId), retry: false, refetchOnWindowFocus: false });
  return (
    <section aria-labelledby="rd-attack" className={SECTION}>
      <h2 id="rd-attack" className="text-lg font-semibold">{t('attack.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('attack.help')}</p>
      {q.isLoading && <p aria-busy="true" className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {q.isError && <Notice kind="error">{radarErrorMessage(q.error)}</Notice>}
      {q.data && !q.data.has_search_console && <Notice kind="warn">{t('attack.noGsc')}</Notice>}
      {q.data && (q.data.items.length === 0 ? <Empty>{t('attack.empty')}</Empty> : (
        <ol className="space-y-3">{q.data.items.map((i, idx) => (
          <li key={i.id} className="space-y-1 rounded-lg border bg-background/40 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">#{idx + 1}</span><Chip tone="info">{t(`atk.${i.kind}`)}</Chip><strong className="break-words">{i.title}</strong></div>
            {(i.focus_name || i.place_name || i.node_label) && <p className="break-words text-xs text-muted-foreground">{[i.focus_name, i.node_label, i.place_name].filter(Boolean).join(' › ')}</p>}
            <p className="break-words"><span className="font-medium">{t('attack.why')}:</span> {i.why}</p>
            <p className="break-words"><span className="font-medium">{t('attack.what')}:</span> {i.what}</p>
          </li>))}</ol>
      ))}
      {q.data && <p className="break-words text-xs text-muted-foreground">{q.data.ctr_note}</p>}
    </section>
  );
}

const COUNTS: Array<[keyof LandscapeRow, string]> = [['competitors', 'land.competitors'], ['with_site', 'land.site'], ['with_maps', 'land.maps'], ['with_instagram', 'plat.instagram'], ['with_tiktok', 'plat.tiktok'], ['with_kwai', 'plat.kwai'], ['with_youtube', 'plat.youtube'], ['with_facebook', 'plat.facebook'], ['with_linkedin', 'plat.linkedin']];

/** Retrato agregado (quantos concorrem, com site, mapas, redes, vídeos) e sobreposição na árvore. */
export function LandscapePanel({ projectId }: { projectId: string }) {
  const { t, n } = useRT();
  const [by, setBy] = useState<'focus' | 'place' | 'node'>('focus');
  const q = useQuery({ queryKey: ['radar-landscape', projectId, by], queryFn: () => radar.landscape(projectId, by), retry: false, refetchOnWindowFocus: false });
  const o = useQuery({ queryKey: ['radar-landscape-tree', projectId], queryFn: () => radar.overlap(projectId), retry: false, refetchOnWindowFocus: false });
  return (
    <div className="space-y-4">
      <section aria-labelledby="rd-land" className={SECTION}>
        <h2 id="rd-land" className="text-lg font-semibold">{t('land.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('land.help')}</p>
        <div role="tablist" aria-label={t('land.by')} className="flex flex-wrap gap-2">
          {(['focus', 'place', 'node'] as const).map((k) => <button key={k} role="tab" aria-selected={by === k} onClick={() => setBy(k)} className={`rounded border px-3 py-1 text-sm ${by === k ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>{t(`land.by.${k}`)}</button>)}
        </div>
        {q.isLoading && <p aria-busy="true" className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {q.isError && <Notice kind="error">{radarErrorMessage(q.error)}</Notice>}
        {q.data && (q.data.rows.length === 0 ? <Empty>{t('land.empty')}</Empty> : (
          <ul className="space-y-3">{q.data.rows.map((r) => (
            <li key={r.id} className="space-y-2 rounded-lg border bg-background/40 p-3">
              <h3 className="break-words text-base font-semibold">{r.label ?? '—'}</h3>
              <dl className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-5">{COUNTS.map(([k, label]) => <div key={k} className="rounded border bg-background/40 p-2"><dt className="break-words text-xs text-muted-foreground">{t(label as never)}</dt><dd className="text-lg font-semibold">{n(r[k] as number)}</dd></div>)}</dl>
              <p className="break-words text-xs text-muted-foreground">{t('land.extra', { videos: r.videos_total === null ? t('det.noData') : n(r.videos_total), posts: r.posts_30d === null ? t('det.noData') : n(r.posts_30d), reviews: n(r.reviews_total), rating: r.rating_avg ?? '—', strength: r.strength_avg === null ? '—' : n(r.strength_avg) })}</p>
            </li>))}</ul>
        ))}
      </section>
      <section aria-labelledby="rd-tree" className={SECTION}>
        <h2 id="rd-tree" className="text-lg font-semibold">{t('tree.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('tree.help')}</p>
        {o.isError && <Notice kind="error">{radarErrorMessage(o.error)}</Notice>}
        {o.data && (o.data.nodes.length === 0 ? <Empty>{t('tree.empty')}</Empty> : (
          <ul className="space-y-2">{o.data.nodes.map((nd) => (
            <li key={nd.node_id} className="break-words rounded border bg-background/40 p-2 text-sm" style={{ marginLeft: `${Math.min(nd.depth, 4) * 12}px` }}>
              <strong>{nd.label}</strong> <Chip>{t(`nkind.${nd.kind}`)}</Chip>{' '}
              {nd.empty ? <Chip tone="warn">{t('tree.noCompetitor')}</Chip> : <Chip>{t('tree.competitors', { n: nd.competitors.length })}</Chip>}
              <p className="text-xs text-muted-foreground">{t('tree.scores', { own: nd.own_score === null ? t('det.noData') : n(nd.own_score), leader: nd.leader_score === null ? t('det.noData') : n(nd.leader_score), gap: nd.gap === null ? '—' : n(nd.gap), attacks: nd.attacks })}</p>
              {nd.competitors.length > 0 && <p className="text-xs">{nd.competitors.slice(0, 6).map((c) => `${c.name}${c.score !== null ? ` (${n(c.score)})` : ''}`).join(' · ')}</p>}
            </li>))}</ul>
        ))}
      </section>
    </div>
  );
}

/** Livro de pontas soltas: tudo o que não está ligado à árvore. Meta: zero. */
export function OrphansPanel({ projectId, canEdit, onChanged }: { projectId: string; canEdit: boolean; onChanged: () => Promise<void> }) {
  const { t, n } = useRT();
  const cache = useQueryClient();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery<OrphansReply>({ queryKey: ['radar-orphans', projectId], queryFn: () => radar.orphans(projectId), retry: false, refetchOnWindowFocus: false });
  const fix = async (refs?: string[]) => {
    setBusy(true); setMsg(null);
    try { const r = await radar.orphanFix(projectId, refs); setMsg({ kind: 'ok', text: t('orph.applied', { n: r.applied, left: r.remaining.total }) }); await cache.invalidateQueries({ queryKey: ['radar-orphans'] }); await onChanged(); } catch (e) { setMsg({ kind: 'error', text: radarErrorMessage(e) }); } finally { setBusy(false); }
  };
  return (
    <section aria-labelledby="rd-orph" className={SECTION}>
      <h2 id="rd-orph" className="text-lg font-semibold">{t('orph.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('orph.help')}</p>
      {q.isLoading && <p aria-busy="true" className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {q.isError && <Notice kind="error">{radarErrorMessage(q.error)}</Notice>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {q.data && (q.data.zero_orphans ? <Notice kind="ok">{t('orph.zero')}</Notice> : (
        <>
          <p className="text-sm font-medium">{t('orph.total', { n: n(q.data.total) })}</p>
          <ul className="flex flex-wrap gap-2">{Object.entries(q.data.counts).filter(([, v]) => v > 0).map(([k, v]) => <li key={k}><Chip tone="warn">{t(`orphan.${k}`)}: {n(v)}</Chip></li>)}</ul>
          {canEdit && q.data.auto_fixable > 0 && <Button disabled={busy} onClick={() => void fix()}>{t('orph.applyAuto', { n: q.data.auto_fixable })}</Button>}
          <ul className="space-y-2">{q.data.items.slice(0, 200).map((i) => (
            <li key={`${i.kind}:${i.ref}`} className="space-y-1 break-words rounded border bg-background/40 p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Chip tone="warn">{t(`orphan.${i.kind}`)}</Chip><strong>{i.label}</strong></div>
              {i.suggestion ? <p className="text-xs text-muted-foreground">{t('orph.suggest', { action: t(`oact.${i.suggestion.action}`), target: i.suggestion.target_label ?? '—', conf: Math.round(i.suggestion.confidence * 100) })}</p> : <p className="text-xs text-muted-foreground">{t('orph.noSuggestion')}</p>}
              {canEdit && i.suggestion?.target_id && ['ligar_identidade', 'ligar_no', 'ligar_foco', 'definir_no'].includes(i.suggestion.action) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void fix([i.ref])}>{t('orph.link')}</Button>}
            </li>))}</ul>
        </>
      ))}
    </section>
  );
}
