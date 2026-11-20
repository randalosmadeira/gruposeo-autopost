import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PageDetail } from '@/lib/studio-api';
import { usd } from '@/lib/studio-api';
import { useStudioT } from '@/lib/i18n/studio-dict';

const INPUT = 'mt-1 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm';
const firstParagraph = (html: string): string => {
  const m = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
};

export interface EditorFields { title: string; metaDescription: string; h1: string; slugPath: string; bodyHtml: string }

/** Editor da página: campos, corpo em HTML, pré-visualização no computador e no celular (iframe isolado), como aparece na busca e a resposta que uma IA pode citar. */
export function EditorPane({ d, busy, onSave, onGenerate, onCheck }: { d: PageDetail; busy: string | null; onSave: (f: EditorFields) => void; onGenerate: (restart: boolean) => void; onCheck: (verify: boolean) => void }) {
  const { t, n } = useStudioT();
  const p = d.page;
  const [f, setF] = useState<EditorFields>({ title: p.title, metaDescription: p.meta_description, h1: p.h1, slugPath: p.slug_path, bodyHtml: p.body_html });
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop');
  useEffect(() => { setF({ title: p.title, metaDescription: p.meta_description, h1: p.h1, slugPath: p.slug_path, bodyHtml: p.body_html }); }, [p.id, p.version, p.title, p.meta_description, p.h1, p.slug_path, p.body_html]);
  const can = d.can_edit && busy === null;
  const dirty = f.title !== p.title || f.metaDescription !== p.meta_description || f.h1 !== p.h1 || f.slugPath !== p.slug_path || f.bodyHtml !== p.body_html;
  const answer = firstParagraph(f.bodyHtml);
  const set = (k: keyof EditorFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const spin = (k: string, label: string, busyLabel: string) => (busy === k ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{busyLabel}</> : label);
  const titleMin = d.rules.gates.title_unique;
  const metaRule = d.rules.gates.meta_description;
  return (
    <section aria-labelledby="ep-title" className="space-y-4 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="ep-title" className="text-lg font-semibold">{t('tab.editor')}</h2>
      {!d.can_edit && <p role="note" className="text-sm text-muted-foreground">{t('ed.readonly')}</p>}
      {!d.pipeline.done && d.pipeline.stopped && <p role="status" className="break-words rounded border border-amber-500/40 bg-amber-500/10 p-2 text-sm">{t('ed.stopped', { msg: d.pipeline.stopped.message })}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!can} onClick={() => onGenerate(false)}>{spin('generate', t('ed.generate'), t('ed.generating'))}</Button>
        <Button variant="outline" disabled={!can} onClick={() => onGenerate(true)}>{t('ed.restart')}</Button>
        <Button variant="outline" disabled={!can} onClick={() => onCheck(false)}>{spin('check', t('ed.check'), t('common.loading'))}</Button>
        <Button variant="outline" disabled={!can} onClick={() => onCheck(true)}>{t('ed.checkLinks')}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('ed.cost')}: {usd(d.cost.perPageMicros.total)} · {t('ed.costDay', { n: n(d.cost.pagesPerDayWithinCap), cap: usd(d.cost.capMicros) })}. {t('honest.cost')}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label htmlFor="ep-title-f" className="block text-xs text-muted-foreground">{t('ed.title')} · {t('ed.chars', { n: f.title.length })}{titleMin?.value ? ` (${titleMin.value}–${titleMin.max ?? '…'})` : ''}</label>
          <input id="ep-title-f" className={INPUT} value={f.title} maxLength={300} disabled={!d.can_edit} onChange={set('title')} /></div>
        <div className="sm:col-span-2"><label htmlFor="ep-meta" className="block text-xs text-muted-foreground">{t('ed.meta')} · {t('ed.chars', { n: f.metaDescription.length })}{metaRule?.value ? ` (${metaRule.value}–${metaRule.max ?? '…'})` : ''}</label>
          <textarea id="ep-meta" className={`${INPUT} min-h-[4rem]`} value={f.metaDescription} maxLength={500} disabled={!d.can_edit} onChange={set('metaDescription')} /></div>
        <div><label htmlFor="ep-h1" className="block text-xs text-muted-foreground">{t('ed.h1')}</label><input id="ep-h1" className={INPUT} value={f.h1} maxLength={300} disabled={!d.can_edit} onChange={set('h1')} /></div>
        <div><label htmlFor="ep-slug" className="block text-xs text-muted-foreground">{t('ed.slug')}</label><input id="ep-slug" className={INPUT} value={f.slugPath} maxLength={200} disabled={!d.can_edit} onChange={set('slugPath')} /></div>
        <div className="sm:col-span-2"><label htmlFor="ep-body" className="block text-xs text-muted-foreground">{t('ed.body')}</label>
          <textarea id="ep-body" className={`${INPUT} min-h-[16rem] font-mono text-xs`} spellCheck={false} value={f.bodyHtml} disabled={!d.can_edit} onChange={set('bodyHtml')} /></div>
      </div>
      <Button disabled={!can || !dirty} onClick={() => onSave(f)}>{spin('revise', t('common.save'), t('common.loading'))}</Button>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="min-w-0 space-y-2 rounded-lg border bg-background/40 p-3"><h3 className="text-sm font-semibold">{t('ed.serp')}</h3>
          <div className="rounded border bg-white p-3 text-slate-900">
            <p className="break-all text-xs text-slate-600">{d.serp.display_url}</p>
            <p className="break-words text-base text-blue-700">{f.title || d.serp.title}</p>
            <p className="break-words text-sm text-slate-700">{f.metaDescription || d.serp.description}</p>
          </div>
          <h3 className="pt-2 text-sm font-semibold">{t('ed.ai')}</h3>
          <p className="break-words rounded border p-2 text-sm">{answer || '—'}</p>
        </div>
        <div className="min-w-0 space-y-2 rounded-lg border bg-background/40 p-3"><h3 className="text-sm font-semibold">{t('ed.preview')}</h3>
          <div className="flex gap-2" role="group" aria-label={t('ed.preview')}>
            <Button size="sm" variant={view === 'desktop' ? 'default' : 'outline'} aria-pressed={view === 'desktop'} onClick={() => setView('desktop')}>{t('ed.desktop')}</Button>
            <Button size="sm" variant={view === 'mobile' ? 'default' : 'outline'} aria-pressed={view === 'mobile'} onClick={() => setView('mobile')}>{t('ed.mobile')}</Button>
          </div>
          <div className="overflow-x-auto"><iframe title={t('ed.preview')} sandbox="" srcDoc={d.preview_html} className="h-[28rem] max-w-full rounded border bg-white" style={{ width: view === 'mobile' ? 375 : '100%', minWidth: view === 'mobile' ? 375 : undefined }} /></div>
        </div>
      </div>
      {!d.pipeline.done && d.pipeline.sections.length > 0 && <ul className="text-xs text-muted-foreground">{d.pipeline.sections.map((s) => <li key={s.id} className="break-words">{s.heading || '·'}: {s.status}{s.reason ? ` — ${s.reason.slice(0, 80)}` : ''}</li>)}</ul>}
    </section>
  );
}
