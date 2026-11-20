import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { PageDetail, StaticPackage } from '@/lib/studio-api';
import { useStudioT, type StudioKey } from '@/lib/i18n/studio-dict';

/** Aprovar e publicar. Publicar só existe depois de uma PESSOA aprovar; o servidor confere de novo (hash, portões, limites). Mostra versões e publicações. */
export function PublishPanel({ d, busy, onStep, onPublish, onUnpublish, pkg }: {
  d: PageDetail; busy: string | null; pkg: StaticPackage | null;
  onStep: (s: 'enviar' | 'aprovar' | 'devolver') => void;
  onPublish: (o: { target?: 'publish' | 'draft'; confirmDeployed?: boolean }) => void; onUnpublish: (confirmRemoved: boolean) => void;
}) {
  const { t, date } = useStudioT();
  const [showInstr, setShowInstr] = useState(false);
  const p = d.page;
  const can = d.can_edit && busy === null;
  const status = p.status;
  const hosted = p.adapter === 'zica_hosted';
  const download = (name: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name.replace(/[^\w.-]+/g, '_'); a.click(); URL.revokeObjectURL(url);
  };
  return (
    <section aria-labelledby="pp-title" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="pp-title" className="text-lg font-semibold">{t('pub.title')}</h2>
      <p className="text-sm" role="status"><strong>{t(`status.${status}` as StudioKey)}</strong> · {t(`adapter.${p.adapter}` as StudioKey)}{p.approved_at ? ` · ${t('pub.approvedBy', { date: date(p.approved_at) })}` : ''}</p>
      {p.approved_hash && <p className="break-all text-xs text-muted-foreground">{t('pub.hash', { h: p.approved_hash.slice(0, 16) })}</p>}
      {p.last_error && <p role="alert" className="break-words text-sm text-red-300">{p.last_error}</p>}
      <p className="text-xs text-muted-foreground">{t('honest.approval')}</p>
      {hosted && <p role="note" className="text-sm text-amber-300">{t('pub.hosted')}</p>}
      <div className="flex flex-wrap gap-2">
        {(status === 'rascunho') && <Button disabled={!can} onClick={() => onStep('enviar')}>{t('pub.send')}</Button>}
        {(status === 'em_revisao') && <Button disabled={!can} onClick={() => onStep('aprovar')}>{t('pub.approve')}</Button>}
        {(status === 'em_revisao' || status === 'aprovada') && <Button variant="outline" disabled={!can} onClick={() => onStep('devolver')}>{t('pub.return')}</Button>}
      </div>
      {status !== 'aprovada' && status !== 'publicada' && <p className="text-xs text-muted-foreground">{t('pub.needApproval')}</p>}
      {status === 'aprovada' && !hosted && (
        <div className="flex flex-wrap gap-2">
          {p.adapter === 'wordpress_plugin' && <><Button disabled={!can} onClick={() => onPublish({ target: 'publish' })}>{t('pub.publish')}</Button><Button variant="outline" disabled={!can} onClick={() => onPublish({ target: 'draft' })}>{t('pub.draft')}</Button></>}
          {p.adapter === 'site_manifest' && <><Button disabled={!can} onClick={() => onPublish({})}>{t('pub.package')}</Button><Button variant="outline" disabled={!can} onClick={() => onPublish({ confirmDeployed: true })}>{t('pub.confirm')}</Button></>}
        </div>
      )}
      {status === 'publicada' && <div className="space-y-1">{p.public_url && <p className="break-all text-sm"><a className="text-primary underline" href={p.public_url} target="_blank" rel="noopener noreferrer">{p.public_url}</a></p>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!can} onClick={() => onUnpublish(false)}>{t('pub.unpublish')}</Button>{p.adapter === 'site_manifest' && <Button variant="outline" disabled={!can} onClick={() => onUnpublish(true)}>{t('pub.confirmRemoved')}</Button>}</div></div>}
      {pkg && (
        <div className="space-y-2 rounded-lg border bg-background/40 p-3"><p className="text-sm font-medium">{t('pub.pkgFiles', { n: pkg.files.length })}</p>
          {pkg.warnings.length > 0 && <ul className="list-disc pl-5 text-xs text-amber-300">{pkg.warnings.map((w, i) => <li key={i} className="break-words">{w}</li>)}</ul>}
          <ul className="space-y-1 text-sm">{pkg.files.map((f) => <li key={f.path} className="flex flex-wrap items-center justify-between gap-2"><span className="break-all">{f.path}</span><Button size="sm" variant="outline" onClick={() => download(f.path.split('/').join('__'), f.content)}>{t('pub.download', { name: f.path.split('/').pop() || f.path })}</Button></li>)}</ul>
          <Button size="sm" variant="ghost" onClick={() => setShowInstr((s) => !s)}>{t('pub.instructions')}</Button>
          {showInstr && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs">{pkg.instructions}</pre>}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <div><h3 className="text-sm font-semibold">{t('pub.versions')}</h3><ul className="space-y-1 text-xs">{d.versions.map((v) => <li key={v.version} className="break-words">v{v.version} · {date(v.created_at)} · {v.reason || '—'}</li>)}</ul></div>
        <div><h3 className="text-sm font-semibold">{t('pub.history')}</h3>
          {d.publications.length === 0 ? <p className="text-xs text-muted-foreground">—</p> : <ul className="space-y-1 text-xs">{d.publications.map((x, i) => <li key={i} className="break-words">{date(x.created_at)} · {x.action} · {x.adapter} · {x.status}{x.final_url ? ` · ${x.final_url}` : ''}{x.error ? ` · ${x.error}` : ''}{x.indexation && Object.keys(x.indexation).length ? ` · ${t('pub.indexation')}: ${JSON.stringify(x.indexation)}` : ''}</li>)}</ul>}</div>
      </div>
    </section>
  );
}
