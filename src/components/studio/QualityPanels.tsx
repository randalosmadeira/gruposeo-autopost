import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GateStatus, PageDetail, PageImage, Quality } from '@/lib/studio-api';
import { usd } from '@/lib/studio-api';
import { useStudioT, type StudioKey } from '@/lib/i18n/studio-dict';

const STYLE: Record<GateStatus, string> = {
  ok: 'border-emerald-500/50 bg-emerald-500/10', aviso: 'border-amber-500/50 bg-amber-500/10', falha: 'border-red-500/50 bg-red-500/10', info: 'border-slate-500/40 bg-slate-500/10', desligado: 'border-slate-500/30 bg-transparent opacity-70',
};
const ORDER: GateStatus[] = ['falha', 'aviso', 'ok', 'info', 'desligado'];

/** Painel de completude técnica: um cartão por portão, com nível (do perfil de regras), nota e COMO CORRIGIR. */
export function GatesPanel({ q }: { q: Quality }) {
  const { t } = useStudioT();
  const sorted = [...q.results].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  return (
    <section aria-labelledby="gp-title" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="gp-title" className="text-lg font-semibold">{t('q.title')}</h2>
      <p className="text-sm" role="status">{t('q.score', { n: q.score })} · {q.blocking.length ? <span className="text-red-300">{t('q.blocking', { n: q.blocking.length })}</span> : <span className="text-emerald-300">{t('q.complete')}</span>} · {t('q.warnings', { n: q.warnings.length })}</p>
      {q.doorway.verdict === 'porta' && (
        <div role="alert" className="space-y-1 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm"><p className="font-semibold">{t('q.doorway')}</p>
          <ul className="list-disc pl-5">{q.doorway.reasons.map((r, i) => <li key={i} className="break-words">{r}</li>)}</ul>
          {q.doorway.proposal && <p className="break-words">{q.doorway.proposal}</p>}</div>
      )}
      {q.invention.some((i) => i.severity === 'bloqueia') && (
        <div role="alert" className="space-y-1 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm"><p className="font-semibold">{t('q.invention')}</p>
          <ul className="list-disc pl-5">{q.invention.filter((i) => i.severity === 'bloqueia').map((i, k) => <li key={k} className="break-words">{i.why} <em>“{i.excerpt}”</em></li>)}</ul></div>
      )}
      {q.pendings.length > 0 && <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><p className="font-semibold">{t('q.pendings')}</p><ul className="list-disc pl-5">{q.pendings.map((p, i) => <li key={i} className="break-words">{p}</li>)}</ul></div>}
      <ul className="space-y-2">
        {sorted.map((g) => (
          <li key={g.id} className={`rounded-lg border p-3 ${STYLE[g.status]}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="break-words text-sm font-medium">{g.label}</p>
              <span className="text-xs">{t(`q.s.${g.status}` as StudioKey)} · {t(`q.level.${g.level}` as StudioKey)}</span></div>
            {g.note && g.status !== 'desligado' && <p className="break-words text-xs text-muted-foreground">{g.note}</p>}
            {g.details && g.details.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{g.details.map((d, i) => <li key={i} className="break-words">{d}</li>)}</ul>}
            {g.fix && <p className="mt-1 break-words text-xs"><strong>{t('q.fix')}:</strong> {g.fix}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Detector anti-IA: nota, métricas, achados com o trecho e como corrigir, e o texto com os trechos marcados (em iframe isolado). */
export function AiDetectorPanel({ d }: { d: PageDetail }) {
  const { t } = useStudioT();
  const ai = d.quality.ai;
  const markedDoc = `<!doctype html><meta charset="utf-8"><style>body{font:15px/1.6 system-ui;margin:12px;color:#1c1c1e}mark{background:#fde68a;padding:0 2px;border-radius:2px}</style>${d.marked_html}`;
  return (
    <section aria-labelledby="ai-title" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="ai-title" className="text-lg font-semibold">{t('ai.title')}</h2>
      <p className="text-sm" role="status">{t('ai.score', { n: ai.score })} · {t('ai.coverage', { c: ai.coverage })}</p>
      <div className="h-2 w-full overflow-hidden rounded bg-slate-500/20" aria-hidden><div className={`h-full ${ai.score > 35 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${ai.score}%` }} /></div>
      <p className="text-xs text-muted-foreground">{t('ai.metrics', { r: ai.metrics.sentenceCv === null || ai.metrics.sentenceCv === undefined ? '—' : String(ai.metrics.sentenceCv.toFixed(2)), s: String(ai.metrics.specificityPer100 ?? '—') })} · {t('ai.note')}</p>
      {ai.findings.length === 0 ? <p className="text-sm text-emerald-300">{t('ai.none')}</p> : (
        <ul className="space-y-2">{ai.findings.map((f, i) => (
          <li key={i} className="rounded-lg border bg-background/40 p-2 text-sm"><p className="font-medium">{f.label}</p><p className="break-words text-xs italic text-muted-foreground">“{f.excerpt}”</p><p className="break-words text-xs">{f.fix}</p></li>))}</ul>
      )}
      <h3 className="text-sm font-semibold">{t('ai.marked')}</h3>
      <iframe title={t('ai.marked')} sandbox="" srcDoc={markedDoc} className="h-72 w-full max-w-full rounded border bg-white" />
    </section>
  );
}

/** Plano de links: internos (hub, páginas fortes, órfãs), de entrada sugeridos e externos (oficiais ou verificados). */
export function LinksPanel({ d, busy, onPlan }: { d: PageDetail; busy: string | null; onPlan: (verify: boolean) => void }) {
  const { t } = useStudioT();
  const saida = d.links.filter((l) => l.direction === 'saida');
  const entrada = d.links.filter((l) => l.direction === 'entrada');
  const internos = saida.filter((l) => l.kind === 'interno'); const externos = saida.filter((l) => l.kind === 'externo');
  const can = d.can_edit && busy === null;
  return (
    <section aria-labelledby="ln-title" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="ln-title" className="text-lg font-semibold">{t('ln.title')}</h2>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!can} onClick={() => onPlan(false)}>{busy === 'links' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{t('common.loading')}</> : t('ln.plan')}</Button>
        <Button variant="outline" disabled={!can} onClick={() => onPlan(true)}>{t('ln.planVerify')}</Button>
      </div>
      {saida.length === 0 && <p className="text-sm text-muted-foreground">{t('ln.empty')}</p>}
      {internos.length > 0 && <div><h3 className="text-sm font-semibold">{t('ln.internal')}</h3><ul className="space-y-1 text-sm">{internos.map((l, i) => <li key={i} className="break-words"><strong>{l.anchor}</strong> → <span className="break-all text-xs">{l.url}</span> <span className="text-xs text-muted-foreground">({l.reason})</span></li>)}</ul></div>}
      {externos.length > 0 && <div><h3 className="text-sm font-semibold">{t('ln.external')}</h3><ul className="space-y-1 text-sm">{externos.map((l, i) => <li key={i} className="break-words"><strong>{l.anchor}</strong> → <span className="break-all text-xs">{l.url}</span> <span className="text-xs text-muted-foreground">({l.reason}; {l.verified === true ? t('ln.verified') : t('ln.unverified')})</span></li>)}</ul></div>}
      {entrada.length > 0 && <div><h3 className="text-sm font-semibold">{t('ln.inbound')}</h3><ul className="space-y-1 text-sm">{entrada.map((l, i) => <li key={i} className="break-all">{l.url} <span className="text-xs text-muted-foreground">({l.reason})</span></li>)}</ul></div>}
    </section>
  );
}

/** Imagens: acervo ou geração dentro da política e do teto; cada slot mostra origem, alt, tamanho e formato; pendente é pendência. */
export function ImagesPanel({ d, busy, canGenerate, onRun }: { d: PageDetail; busy: string | null; canGenerate: boolean; onRun: (o: { generate?: boolean; scene?: { sceneEn: string; alt: string } }) => void }) {
  const { t } = useStudioT();
  const [scene, setScene] = useState(''); const [alt, setAlt] = useState('');
  const can = d.can_edit && busy === null;
  const imgs: PageImage[] = d.doc.images;
  return (
    <section aria-labelledby="im-title" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="im-title" className="text-lg font-semibold">{t('im.title')}</h2>
      <p className="text-xs text-muted-foreground">{t('im.rules')}</p>
      <Button disabled={!can} onClick={() => onRun({})}>{busy === 'images' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{t('common.loading')}</> : t('im.select')}</Button>
      <div className="space-y-2 rounded border p-2">
        <label htmlFor="im-scene" className="block text-xs text-muted-foreground">{t('im.sceneEn')}</label>
        <input id="im-scene" className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={scene} maxLength={400} onChange={(e) => setScene(e.target.value)} />
        <label htmlFor="im-alt" className="block text-xs text-muted-foreground">{t('im.alt')}</label>
        <input id="im-alt" className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} />
        <Button variant="outline" disabled={!can || !canGenerate || !scene.trim() || !alt.trim()} onClick={() => onRun({ generate: true, scene: { sceneEn: scene.trim(), alt: alt.trim() } })}>{t('im.generate')}</Button>
        {!canGenerate && <p className="text-xs text-muted-foreground">{t('cap.images')}: {t('cap.off')}</p>}
        <p className="text-xs text-muted-foreground">{t('honest.cost')} ({usd(d.cost.perPageMicros.images)})</p>
      </div>
      <ul className="space-y-2">{imgs.map((i, k) => (
        <li key={k} className="rounded-lg border bg-background/40 p-2 text-sm"><p className="break-words"><strong>{i.slot}</strong> · {t(`im.origin.${i.origin}` as StudioKey)} · {i.width}×{i.height} · {i.format}</p>
          {i.origin === 'pendente' ? <p className="text-xs text-amber-300">{t('im.pending')}</p> : <><p className="break-words text-xs">{i.alt}</p><p className="break-all text-xs text-muted-foreground">{i.filename}</p></>}</li>))}</ul>
    </section>
  );
}
