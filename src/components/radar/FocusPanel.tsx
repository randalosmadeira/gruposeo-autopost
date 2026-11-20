import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { radar, radarErrorMessage, type FocusDraftReply, type FocusRow, type Overview, type TerritoryReply } from '@/lib/radar-api';
import { Chip, Empty, INPUT, Notice, SECTION, SELECT, useRT } from './ui';

type Msg = { kind: 'ok' | 'error' | 'warn'; text: string } | null;

function TerritoryList({ projectId, focus, canEdit }: { projectId: string; focus: FocusRow; canEdit: boolean }) {
  const { t, n } = useRT();
  const cache = useQueryClient();
  const [msg, setMsg] = useState<Msg>(null);
  const [filter, setFilter] = useState<'todos' | 'sugerido' | 'aprovado' | 'rejeitado'>('todos');
  const q = useQuery<TerritoryReply>({ queryKey: ['radar-territory', projectId, focus.id], queryFn: () => radar.territory(projectId, focus.id), retry: false, refetchOnWindowFocus: false });
  const decide = async (id: string, status: string) => {
    try { await radar.territoryDecide(projectId, focus.id, [id], { status }); await cache.invalidateQueries({ queryKey: ['radar-territory'] }); await cache.invalidateQueries({ queryKey: ['radar'] }); } catch (e) { setMsg({ kind: 'error', text: radarErrorMessage(e) }); }
  };
  const bulk = async (status: 'aprovado' | 'rejeitado') => {
    const ids = (q.data?.places ?? []).filter((p) => p.status === 'sugerido').map((p) => p.id);
    if (!ids.length) return;
    try { await radar.territoryDecide(projectId, focus.id, ids, { status }); await cache.invalidateQueries({ queryKey: ['radar-territory'] }); await cache.invalidateQueries({ queryKey: ['radar'] }); } catch (e) { setMsg({ kind: 'error', text: radarErrorMessage(e) }); }
  };
  if (q.isLoading) return <p aria-busy="true" className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (q.isError) return <Notice kind="error">{radarErrorMessage(q.error)}</Notice>;
  const places = (q.data?.places ?? []).filter((p) => filter === 'todos' || p.status === filter);
  return (
    <div className="space-y-2" aria-label={t('terr.title')}>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <p className="text-xs text-muted-foreground">{t('terr.counts', { total: n(q.data!.counts.total), ok: n(q.data!.counts.aprovado), sug: n(q.data!.counts.sugerido), inf: n(q.data!.counts.inferido) })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t('terr.filter')} className={SELECT} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          {(['todos', 'sugerido', 'aprovado', 'rejeitado'] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
        {canEdit && <><Button size="sm" variant="outline" onClick={() => void bulk('aprovado')}>{t('terr.approveAll')}</Button><Button size="sm" variant="outline" onClick={() => void bulk('rejeitado')}>{t('terr.rejectAll')}</Button></>}
      </div>
      {places.length === 0 ? <Empty>{t('terr.empty')}</Empty> : (
        <ul className="space-y-2">
          {places.map((p) => (
            <li key={p.id} className="rounded border bg-background/40 p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="break-words">{p.place.label}</strong>
                <Chip>{t(`level.${p.place.level}`)}</Chip>
                <Chip tone={p.status === 'aprovado' ? 'ok' : p.status === 'rejeitado' ? 'bad' : 'warn'}>{t(`status.${p.status}`)}</Chip>
                {p.inferred && <Chip tone="warn" title={t('terr.inferredHint')}>{t('terr.inferred')}</Chip>}
              </div>
              <p className="mt-1 break-words text-xs text-muted-foreground"><span className="font-medium">{t('terr.why')}:</span> {p.why.map((w) => `${t(`why.${w.rule}`)}${w.via ? ` (${w.via})` : ''}`).join('; ')}</p>
              <p className="break-words text-xs text-muted-foreground">{p.why.map((w) => w.detail).join('; ')}</p>
              {p.place.attribution && <p className="break-words text-xs text-muted-foreground">{p.place.attribution}{p.place.license ? ` · ${p.place.license}` : ''}</p>}
              {canEdit && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {p.status !== 'aprovado' && <Button size="sm" variant="outline" onClick={() => void decide(p.id, 'aprovado')}>{t('terr.approve')}</Button>}
                  {p.status !== 'rejeitado' && <Button size="sm" variant="outline" onClick={() => void decide(p.id, 'rejeitado')}>{t('terr.reject')}</Button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {q.data!.attributions.length > 0 && <p className="break-words text-xs text-muted-foreground">{q.data!.attributions.join(' · ')}</p>}
    </div>
  );
}

function FocusCard({ projectId, focus, canEdit, onChanged }: { projectId: string; focus: FocusRow; canEdit: boolean; onChanged: () => Promise<void> }) {
  const { t } = useRT();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const save = async (patch: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try { await radar.focusSave(projectId, { focusId: focus.id, ...patch }); await onChanged(); setMsg({ kind: 'ok', text: t('focus.saved') }); } catch (e) { setMsg({ kind: 'error', text: radarErrorMessage(e) }); } finally { setBusy(false); }
  };
  return (
    <li className="space-y-2 rounded-lg border bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="break-words text-base font-semibold">{focus.name}</h3>
        <Chip tone={focus.status === 'ativo' ? 'ok' : 'muted'}>{t(`fstatus.${focus.status}`)}</Chip>
        {focus.needs_review && <Chip tone="warn">{t('focus.needsReview')}</Chip>}
        {focus.segment_node_id ? <Chip tone="info">{t('focus.inTree')}</Chip> : <Chip tone="warn">{t('focus.noNode')}</Chip>}
      </div>
      {focus.topics.length > 0 && <p className="break-words text-sm text-muted-foreground">{focus.topics.join(' · ')}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">{t('focus.weight')}
          <select className={`${SELECT} mt-1 block`} value={focus.weight} disabled={!canEdit || busy} onChange={(e) => void save({ weight: Number(e.target.value) })} aria-label={t('focus.weight')}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">{t('focus.statusLabel')}
          <select className={`${SELECT} mt-1 block`} value={focus.status} disabled={!canEdit || busy} onChange={(e) => void save({ status: e.target.value })} aria-label={t('focus.statusLabel')}>
            {(['ativo', 'pausado', 'arquivado'] as const).map((s) => <option key={s} value={s}>{t(`fstatus.${s}`)}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">{t('focus.places', { total: focus.places.total, ok: focus.places.aprovado, sug: focus.places.sugerido })}</p>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? t('focus.hideTerritory') : t('focus.showTerritory')}</Button>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {open && <TerritoryList projectId={projectId} focus={focus} canEdit={canEdit} />}
    </li>
  );
}

export function FocusPanel({ projectId, data, onChanged }: { projectId: string; data: Overview; onChanged: () => Promise<void> }) {
  const { t, n } = useRT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [reply, setReply] = useState<FocusDraftReply | null>(null);
  const [region, setRegion] = useState('');
  const canEdit = data.can_edit;

  const create = async () => {
    setBusy('focus'); setMsg(null); setReply(null);
    try { const r = await radar.focusFromText(projectId, text.trim()); setReply(r); await onChanged(); setMsg({ kind: r.source === 'ia' ? 'ok' : 'warn', text: r.source === 'ia' ? t('focus.createdAi', { n: r.focuses.length }) : t('focus.createdNoAi', { n: r.focuses.length }) }); } catch (e) { setMsg({ kind: 'error', text: radarErrorMessage(e) }); } finally { setBusy(null); }
  };
  const sync = async (sources: string[], body: Record<string, unknown> = {}) => {
    setBusy('sync'); setMsg(null);
    try { const r = await radar.territorySync(projectId, sources, body); setMsg({ kind: 'ok', text: r.results.map((x) => `${x.source}: ${x.ok ? t('common.done') : t('common.failedShort')} (${n(x.places)} ${t('terr.places')}, ${n(x.members)} ${t('terr.links')})${x.notes.length ? ` ${x.notes.join(', ')}` : ''}`).join(' | ') }); await onChanged(); } catch (e) { setMsg({ kind: 'error', text: radarErrorMessage(e) }); } finally { setBusy(null); }
  };
  const spin = (k: string, label: string) => (busy === k ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{t('common.working')}</> : label);

  return (
    <div className="space-y-4">
      <section aria-labelledby="rd-focus-new" className={SECTION}>
        <h2 id="rd-focus-new" className="text-lg font-semibold">{t('focus.newTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('focus.newHelp')}</p>
        <label htmlFor="rd-focus-text" className="sr-only">{t('focus.newTitle')}</label>
        <textarea id="rd-focus-text" className="min-h-[96px] w-full rounded-md border bg-background p-3 text-sm" placeholder={t('focus.placeholder')} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} disabled={!canEdit || busy !== null} />
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!canEdit || busy !== null || text.trim().length < 8} onClick={() => void create()}>{spin('focus', t('focus.create'))}</Button>
          {!canEdit && <p role="note" className="text-sm text-muted-foreground">{t('common.readonly')}</p>}
        </div>
        <p className="text-xs text-muted-foreground">{t('focus.aiNote')}</p>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {reply && (
          <div className="space-y-2" aria-label={t('focus.result')}>
            {reply.geo_hint && <Notice kind="warn">{t('focus.geoEmpty')}</Notice>}
            {reply.ai_note && reply.source === 'heuristica' && <Notice kind="warn">{t(`focus.aiNote.${reply.ai_note}`)}</Notice>}
            <ul className="space-y-2">
              {reply.focuses.map((f) => (
                <li key={f.name} className="rounded border bg-background/40 p-2 text-sm">
                  <strong className="break-words">{f.name}</strong> <Chip>{t('focus.weightShort', { w: f.weight })}</Chip>
                  <p className="break-words text-xs text-muted-foreground">{f.resolved.map((r) => `${r.text} → ${r.places.map((p) => p.name).join(', ')}${r.places.some((p) => p.inferred) ? ` (${t('terr.inferred')})` : ''}`).join('; ') || t('terr.none')}</p>
                  {f.unresolved.length > 0 && <p className="break-words text-xs text-amber-300">{t('focus.unresolved', { list: f.unresolved.map((u) => `${u.mention.text} (${u.note ?? u.status})`).join('; ') })}</p>}
                  {f.expansion.added > 0 && <p className="text-xs text-muted-foreground">{t('focus.expanded', { n: n(f.expansion.added) })}{f.expansion.truncated ? ` ${t('focus.truncated')}` : ''}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="rd-focus-list" className={SECTION}>
        <h2 id="rd-focus-list" className="text-lg font-semibold">{t('focus.listTitle')}</h2>
        {data.focuses.length === 0 ? <Empty>{t('focus.empty')}</Empty> : <ul className="space-y-3">{data.focuses.map((f) => <FocusCard key={f.id} projectId={projectId} focus={f} canEdit={canEdit} onChanged={onChanged} />)}</ul>}
      </section>

      {data.can_admin && (
        <section aria-labelledby="rd-terr-sync" className={SECTION}>
          <h2 id="rd-terr-sync" className="text-lg font-semibold">{t('sync.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('sync.help')}</p>
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void sync(['br_municipios'])}>{spin('sync', t('sync.municipios'))}</Button>
            <label className="text-xs text-muted-foreground">{t('sync.regionName')}<input className={`${INPUT} mt-1`} value={region} onChange={(e) => setRegion(e.target.value)} placeholder={t('sync.regionPlaceholder')} /></label>
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void sync(['br_regioes'], { kinds: ['metropolitana'], ...(region.trim() ? { name: region.trim() } : {}) })}>{t('sync.regions')}</Button>
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void sync(['br_zonas_sp'])}>{t('sync.zones')}</Button>
          </div>
          <p className="break-words text-xs text-muted-foreground">{t('sync.limits')}</p>
        </section>
      )}
    </div>
  );
}
