import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { radar, radarErrorMessage, type CompetitorDetail, type CompetitorRow, type CompetitorsReply, type Overview } from '@/lib/radar-api';
import { Chip, Empty, INPUT, LabelChip, Notice, SECTION, SELECT, ScoreTag, TrendTag, metricText, useRT } from './ui';

const PLATFORMS = ['site', 'gbp', 'instagram', 'tiktok', 'kwai', 'facebook', 'linkedin', 'x', 'youtube', 'pinterest', 'threads'];

function Detail({ projectId, id }: { projectId: string; id: string }) {
  const { t, n } = useRT();
  const q = useQuery<CompetitorDetail>({ queryKey: ['radar-competitor', projectId, id], queryFn: () => radar.competitor(projectId, id), retry: false, refetchOnWindowFocus: false });
  if (q.isLoading) return <p aria-busy="true" className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (q.isError || !q.data) return <Notice kind="error">{radarErrorMessage(q.error)}</Notice>;
  const d = q.data;
  return (
    <div className="space-y-3 border-t pt-3 text-sm">
      <div>
        <h4 className="font-semibold">{t('det.components')}</h4>
        <ul className="mt-1 space-y-1">{d.score.components.map((c) => (
          <li key={c.key} className="break-words"><span className="font-medium">{t(`scomp.${c.key}`)}</span> ({t('det.weight', { w: c.weight })}): {c.value === null ? <span className="text-muted-foreground">{t('det.noData')}</span> : <strong>{n(c.value)}</strong>}
            {c.value !== null && <span className="text-xs text-muted-foreground"> {Object.entries(c.facts).filter(([, v]) => typeof v !== 'object').map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</span>}
          </li>))}</ul>
        <p className="mt-1 text-xs text-muted-foreground">{d.notes.disclaimer}</p>
      </div>
      <div>
        <h4 className="font-semibold">{t('det.identities')}</h4>
        {d.identities.length === 0 ? <Empty>{t('det.noIdentities')}</Empty> : (
          <ul className="mt-1 space-y-2">{d.identities.map((i) => (
            <li key={i.id} className="break-words rounded border bg-background/40 p-2">
              <div className="flex flex-wrap items-center gap-2"><strong>{t(`plat.${i.platform}`)}</strong><span className="text-xs">{i.handle ?? ''}</span><LabelChip label={i.metrics_label} /><Chip title={t('det.confidenceHint')}>{t('det.confidence', { c: Math.round(i.confidence * 100) })}</Chip></div>
              <p className="text-xs text-muted-foreground">{metricText(i.metrics, n, t) || i.availability.text}</p>
              {i.metrics_source && <p className="text-xs text-muted-foreground">{t('det.source')}: {i.metrics_source}</p>}
            </li>))}</ul>
        )}
        <p className="mt-1 break-words text-xs text-muted-foreground">{d.notes.social}</p>
      </div>
      {d.listings.length > 0 && <div><h4 className="font-semibold">{t('det.maps')}</h4><ul className="mt-1 space-y-1">{d.listings.map((l) => <li key={l.name + (l.address ?? '')} className="break-words">{l.name}{l.rating !== null ? ` · ${l.rating} (${n(l.reviews ?? 0)})` : ''}{l.address ? ` · ${l.address}` : ''}</li>)}</ul></div>}
      {d.scan ? (
        <div><h4 className="font-semibold">{t('det.site')}</h4>
          <p className="break-words">{t('det.siteLine', { urls: d.scan.sitemap.urls === null ? '—' : n(d.scan.sitemap.urls), llms: d.scan.llms_txt.present ? t('common.yes') : t('common.no'), schema: d.scan.schema ? d.scan.schema.types.join(', ') : '—' })}{d.scan.tech.length ? ` · ${d.scan.tech.join(', ')}` : ''}</p></div>
      ) : <p className="text-xs text-muted-foreground">{t('det.notScanned')}</p>}
      <div><h4 className="font-semibold">{t('det.tree')}</h4>
        {d.links.length === 0 ? <Empty>{t('det.noLinks')}</Empty> : <ul className="mt-1 space-y-1">{d.links.slice(0, 20).map((l, i) => <li key={i} className="break-words">{[l.focus, l.node, l.place].filter(Boolean).join(' › ')}</li>)}</ul>}
      </div>
      <p className="break-words text-xs text-muted-foreground">{d.notes.authority.join(' ')}</p>
    </div>
  );
}

function Card({ projectId, c, canEdit, onChanged }: { projectId: string; c: CompetitorRow; canEdit: boolean; onChanged: () => Promise<void> }) {
  const { t, n } = useRT();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const setStatus = async (status: string) => { try { await radar.competitorSave(projectId, c.id, { status }); await onChanged(); } catch (e) { setMsg(radarErrorMessage(e)); } };
  const social = c.identities.filter((i) => i.platform !== 'site');
  return (
    <li className="space-y-2 rounded-lg border bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="break-words text-base font-semibold">{c.name}</h3>
        {c.is_own && <Chip tone="info">{t('comp.own')}</Chip>}
        {c.kind === 'diretorio' && <Chip>{t('comp.directory')}</Chip>}
        <Chip tone={c.status === 'acompanhado' ? 'ok' : c.status === 'ignorado' ? 'muted' : 'warn'}>{t(`cstatus.${c.status}`)}</Chip>
      </div>
      {c.primary_host && <p className="break-all text-sm text-muted-foreground">{c.primary_host}</p>}
      <div className="flex flex-wrap items-center gap-3"><ScoreTag value={c.score.value} coverage={c.score.coverage} /><TrendTag trend={c.trend} />
        {c.maps.listings > 0 && <Chip>{t('comp.maps', { rating: c.maps.rating ?? '—', reviews: n(c.maps.reviews) })}</Chip>}
        <Chip>{t('comp.pagesLinks', { p: n(c.pages), l: n(c.links) })}</Chip></div>
      <ul className="flex flex-wrap gap-2" aria-label={t('det.identities')}>
        {c.identities.filter((i) => i.platform === 'site').map((i) => <li key={i.id}><Chip tone="ok">{t('plat.site')}</Chip></li>)}
        {social.map((i) => (
          <li key={i.id} className="max-w-full"><Chip title={metricText(i.metrics, n, t)}>{t(`plat.${i.platform}`)}{i.handle && i.platform !== 'gbp' ? ` ${i.handle.length > 20 ? `${i.handle.slice(0, 18)}…` : i.handle}` : ''}{Object.keys(i.metrics).length ? ` · ${metricText(i.metrics, n, t)}` : ` · ${t('comp.metricsUnavailable')}`} <LabelChip label={i.metrics_label} /></Chip></li>
        ))}
        {c.identities.length === 0 && <li><Empty>{t('det.noIdentities')}</Empty></li>}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? t('comp.hide') : t('comp.details')}</Button>
        {canEdit && !c.is_own && c.status !== 'acompanhado' && <Button size="sm" variant="outline" onClick={() => void setStatus('acompanhado')}>{t('comp.follow')}</Button>}
        {canEdit && !c.is_own && c.status !== 'ignorado' && <Button size="sm" variant="outline" onClick={() => void setStatus('ignorado')}>{t('comp.ignore')}</Button>}
      </div>
      {msg && <Notice kind="error">{msg}</Notice>}
      {open && <Detail projectId={projectId} id={c.id} />}
    </li>
  );
}

export function CompetitorsPanel({ projectId, data, onChanged }: { projectId: string; data: Overview; onChanged: () => Promise<void> }) {
  const { t, n } = useRT();
  const cache = useQueryClient();
  const [focusId, setFocusId] = useState(''); const [platform, setPlatform] = useState(''); const [status, setStatus] = useState(''); const [text, setText] = useState('');
  const q = useQuery<CompetitorsReply>({ queryKey: ['radar-competitors', projectId, focusId, platform, status, text], queryFn: () => radar.competitors(projectId, { ...(focusId ? { focusId } : {}), ...(platform ? { platform } : {}), ...(status ? { status } : {}), ...(text.trim() ? { q: text.trim() } : {}) }), retry: false, refetchOnWindowFocus: false });
  const reload = async () => { await cache.invalidateQueries({ queryKey: ['radar-competitors'] }); await onChanged(); };
  return (
    <section aria-labelledby="rd-comp" className={SECTION}>
      <h2 id="rd-comp" className="text-lg font-semibold">{t('comp.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('comp.help')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">{t('run.focus')}<select className={`${SELECT} mt-1 block`} value={focusId} onChange={(e) => setFocusId(e.target.value)}><option value="">{t('run.allFocuses')}</option>{data.focuses.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">{t('comp.platform')}<select className={`${SELECT} mt-1 block`} value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">{t('comp.allPlatforms')}</option>{PLATFORMS.map((p) => <option key={p} value={p}>{t(`plat.${p}`)}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">{t('comp.statusLabel')}<select className={`${SELECT} mt-1 block`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('comp.allStatus')}</option>{(['sugerido', 'acompanhado', 'ignorado'] as const).map((s) => <option key={s} value={s}>{t(`cstatus.${s}`)}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">{t('comp.search')}<input className={`${INPUT} mt-1`} value={text} onChange={(e) => setText(e.target.value)} /></label>
      </div>
      <p className="break-words text-xs text-muted-foreground">{q.data?.disclaimer ?? t('score.disclaimer')}</p>
      {q.isLoading && <p aria-busy="true" className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {q.isError && <Notice kind="error">{radarErrorMessage(q.error)}</Notice>}
      {q.data && (q.data.competitors.length === 0 ? <Empty>{t('comp.empty')}</Empty> : (
        <>
          <p className="text-sm text-muted-foreground">{t('comp.total', { n: n(q.data.total) })}</p>
          <ul className="space-y-3">{q.data.competitors.map((c) => <Card key={c.id} projectId={projectId} c={c} canEdit={data.can_edit} onChanged={reload} />)}</ul>
        </>
      ))}
    </section>
  );
}
