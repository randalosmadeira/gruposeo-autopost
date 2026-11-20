import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Adapter, BriefInput, PageType } from '@/lib/studio-api';
import { useStudioT, type StudioKey } from '@/lib/i18n/studio-dict';

const INPUT = 'mt-1 h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm';
const TYPES: PageType[] = ['pagina', 'landing', 'hub', 'servico', 'local', 'guia', 'comparativo'];
const ADAPTERS: Adapter[] = ['wordpress_plugin', 'site_manifest', 'zica_hosted'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface FactRow { text: string; source_url: string; source_label: string; kind: string; approved: boolean }
interface SourceRow { url: string; label: string; official: boolean }

/** Briefing de uma nova página: a partir de um Foco, nó da árvore ou território (ids opcionais), com fatos de campo (com fonte) e fontes oficiais. */
export function BriefForm({ busy, defaultLanguage, onSubmit }: { busy: boolean; defaultLanguage: string; onSubmit: (b: BriefInput) => void }) {
  const { t } = useStudioT();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<PageType | ''>('');
  const [language, setLanguage] = useState(defaultLanguage);
  const [place, setPlace] = useState('');
  const [subject, setSubject] = useState('');
  const [slug, setSlug] = useState('');
  const [adapter, setAdapter] = useState<Adapter>('wordpress_plugin');
  const [focusId, setFocusId] = useState(''); const [nodeId, setNodeId] = useState(''); const [geoId, setGeoId] = useState('');
  const [facts, setFacts] = useState<FactRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: BriefInput = { query: query.trim(), language: language.trim() || undefined, adapter };
    if (type) body.type = type; if (place.trim()) body.place = place.trim(); if (subject.trim()) body.subject = subject.trim(); if (slug.trim()) body.slugPath = slug.trim();
    if (UUID.test(focusId.trim())) body.focusId = focusId.trim(); if (UUID.test(nodeId.trim())) body.nodeId = nodeId.trim(); if (UUID.test(geoId.trim())) body.geoScopeId = geoId.trim();
    const f = facts.filter((x) => x.text.trim().length >= 5).map((x, i) => ({ id: `m${i + 1}`, kind: x.kind || 'outro', text: x.text.trim(), source_url: x.source_url.trim() || null, source_label: x.source_label.trim() || null, place: place.trim() || null, approved: x.approved }));
    if (f.length) body.fieldFacts = f;
    const s = sources.filter((x) => x.url.trim() && x.label.trim()).map((x) => ({ url: x.url.trim(), label: x.label.trim(), official: x.official }));
    if (s.length) body.sources = s;
    onSubmit(body);
  };
  const upFact = (i: number, patch: Partial<FactRow>) => setFacts((l) => l.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const upSrc = (i: number, patch: Partial<SourceRow>) => setSources((l) => l.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card/40 p-3 sm:p-5" aria-labelledby="bf-title">
      <h2 id="bf-title" className="text-lg font-semibold">{t('new.title')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label htmlFor="bf-query" className="block text-xs text-muted-foreground">{t('new.query')}</label>
          <input id="bf-query" className={INPUT} required minLength={2} maxLength={300} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('new.queryPh')} /></div>
        <div><label htmlFor="bf-type" className="block text-xs text-muted-foreground">{t('new.type')}</label>
          <select id="bf-type" className={INPUT} value={type} onChange={(e) => setType(e.target.value as PageType | '')}><option value="">{t('new.auto')}</option>{TYPES.map((x) => <option key={x} value={x}>{t(`type.${x}` as StudioKey)}</option>)}</select></div>
        <div><label htmlFor="bf-lang" className="block text-xs text-muted-foreground">{t('new.language')}</label>
          <input id="bf-lang" className={INPUT} required value={language} onChange={(e) => setLanguage(e.target.value)} placeholder={t('new.languagePh')} list="bf-langs" />
          <datalist id="bf-langs">{['pt-BR', 'pt-PT', 'en', 'en-GB', 'es', 'fr', 'it', 'de', 'nl'].map((l) => <option key={l} value={l} />)}</datalist></div>
        <div><label htmlFor="bf-place" className="block text-xs text-muted-foreground">{t('new.place')}</label><input id="bf-place" className={INPUT} maxLength={200} value={place} onChange={(e) => setPlace(e.target.value)} /></div>
        <div><label htmlFor="bf-subject" className="block text-xs text-muted-foreground">{t('new.subject')}</label><input id="bf-subject" className={INPUT} maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div><label htmlFor="bf-slug" className="block text-xs text-muted-foreground">{t('new.slug')}</label><input id="bf-slug" className={INPUT} maxLength={200} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="servico/lugar" /></div>
        <div><label htmlFor="bf-adapter" className="block text-xs text-muted-foreground">{t('new.adapter')}</label>
          <select id="bf-adapter" className={INPUT} value={adapter} onChange={(e) => setAdapter(e.target.value as Adapter)}>{ADAPTERS.map((a) => <option key={a} value={a}>{t(`adapter.${a}` as StudioKey)}</option>)}</select></div>
      </div>
      <details className="rounded border p-2"><summary className="cursor-pointer text-sm">{t('new.advanced')}</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <div><label htmlFor="bf-focus" className="block text-xs text-muted-foreground">{t('new.focus')}</label><input id="bf-focus" className={INPUT} value={focusId} onChange={(e) => setFocusId(e.target.value)} /></div>
          <div><label htmlFor="bf-node" className="block text-xs text-muted-foreground">{t('new.node')}</label><input id="bf-node" className={INPUT} value={nodeId} onChange={(e) => setNodeId(e.target.value)} /></div>
          <div><label htmlFor="bf-geo" className="block text-xs text-muted-foreground">{t('new.geo')}</label><input id="bf-geo" className={INPUT} value={geoId} onChange={(e) => setGeoId(e.target.value)} /></div>
        </div></details>
      <fieldset className="space-y-2 rounded border p-2"><legend className="px-1 text-sm font-medium">{t('new.facts')}</legend>
        <p className="text-xs text-muted-foreground">{t('new.factsHelp')}</p>
        {facts.map((f, i) => (
          <div key={i} className="space-y-2 rounded border bg-background/40 p-2">
            <label className="block text-xs text-muted-foreground" htmlFor={`bf-ft-${i}`}>{t('new.factText')}</label>
            <textarea id={`bf-ft-${i}`} className="min-h-[3.5rem] w-full min-w-0 rounded-md border bg-background p-2 text-sm" maxLength={500} value={f.text} onChange={(e) => upFact(i, { text: e.target.value })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <input aria-label={t('new.factUrl')} placeholder={t('new.factUrl')} className={INPUT} value={f.source_url} onChange={(e) => upFact(i, { source_url: e.target.value })} />
              <input aria-label={t('new.factLabel')} placeholder={t('new.factLabel')} className={INPUT} value={f.source_label} onChange={(e) => upFact(i, { source_label: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <select aria-label="tipo" className="h-9 rounded-md border bg-background px-2 text-sm" value={f.kind} onChange={(e) => upFact(i, { kind: e.target.value })}>{['orgao', 'local', 'prazo', 'documento', 'numero', 'norma', 'outro'].map((k) => <option key={k} value={k}>{k}</option>)}</select>
              <label className="flex items-center gap-1"><input type="checkbox" checked={f.approved} onChange={(e) => upFact(i, { approved: e.target.checked })} />{t('new.factApproved')}</label>
              <Button type="button" size="sm" variant="ghost" onClick={() => setFacts((l) => l.filter((_, k) => k !== i))}>{t('new.remove')}</Button>
            </div>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => setFacts((l) => [...l, { text: '', source_url: '', source_label: '', kind: 'outro', approved: false }])}>{t('new.addFact')}</Button>
      </fieldset>
      <fieldset className="space-y-2 rounded border p-2"><legend className="px-1 text-sm font-medium">{t('new.sources')}</legend>
        {sources.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input aria-label={t('new.srcUrl')} placeholder={t('new.srcUrl')} className={`${INPUT} flex-1`} value={s.url} onChange={(e) => upSrc(i, { url: e.target.value })} />
            <input aria-label={t('new.srcLabel')} placeholder={t('new.srcLabel')} className={`${INPUT} flex-1`} value={s.label} onChange={(e) => upSrc(i, { label: e.target.value })} />
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={s.official} onChange={(e) => upSrc(i, { official: e.target.checked })} />{t('new.srcOfficial')}</label>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSources((l) => l.filter((_, k) => k !== i))}>{t('new.remove')}</Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => setSources((l) => [...l, { url: '', label: '', official: false }])}>{t('new.addSource')}</Button>
      </fieldset>
      <Button type="submit" disabled={busy || query.trim().length < 2}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{t('new.busy')}</> : t('new.submit')}</Button>
    </form>
  );
}
