import type { Brief } from '@/lib/studio-api';
import { useStudioT, type StudioKey } from '@/lib/i18n/studio-dict';

const BOX = 'space-y-2 rounded-lg border bg-background/40 p-3';
const H = 'text-sm font-semibold';

/** Briefing de Superação: as seis partes + o mapa de fontes citadas pelas IAs. Só leitura; tudo vem do servidor (nada é calculado aqui). */
export function BriefPanel({ brief }: { brief: Brief }) {
  const { t, n } = useStudioT();
  const b = brief;
  const gaps = b.gaps;
  const partial = b.benchmark.depth === 'so_titulos';
  return (
    <section aria-labelledby="bp-title" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <header className="space-y-1">
        <h2 id="bp-title" className="text-lg font-semibold">{t('brief.title')}</h2>
        <p className="break-words text-sm text-muted-foreground">“{b.query}” · {t(`type.${b.type}` as StudioKey)} · <span>{t(`brief.radar.${b.radarSource}` as StudioKey)}</span></p>
        <p className="text-xs text-muted-foreground">{t('brief.noCopy')}</p>
      </header>

      <div className={BOX}><h3 className={H}>{t('brief.intent')}</h3>
        <p className="break-words text-sm">{b.intent.rationale}</p>
        <p className="text-xs text-muted-foreground">{t('brief.recommended')}: <strong>{t(`type.${b.intent.recommendedType}` as StudioKey)}</strong>{b.intent.extraSurfaces.length > 0 ? ` · + ${b.intent.extraSurfaces.join(', ')}` : ''}</p>
        {Object.keys(b.intent.mix).length > 0 && <ul className="flex flex-wrap gap-2 text-xs">{Object.entries(b.intent.mix).map(([k, v]) => <li key={k} className="rounded border px-2 py-0.5">{k}: {v}%</li>)}</ul>}
      </div>

      <div className={BOX}><h3 className={H}>{t('brief.benchmark')}</h3>
        {b.benchmark.n === 0 ? <p className="text-sm text-muted-foreground">{t('brief.noGaps')}</p> : (
          <>
            <p className="text-xs text-muted-foreground">{b.benchmark.n} · {t('brief.median')}: {b.benchmark.medianWords !== null ? n(b.benchmark.medianWords) : '—'} · {t('brief.p75')}: {b.benchmark.p75Words !== null ? n(b.benchmark.p75Words) : '—'} · {b.benchmark.mediaShare.videos}% {t('brief.videoShare')} · {t('brief.age')}: {b.benchmark.medianAgeDays ?? '—'}</p>
            {partial && <p role="note" className="text-xs text-amber-300">{t('brief.depthPartial')}</p>}
            {Object.keys(b.benchmark.schemaPrevalence).length > 0 && <p className="break-words text-xs">schema: {Object.entries(b.benchmark.schemaPrevalence).map(([k, v]) => `${k} ${v}%`).join(' · ')}</p>}
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><tbody>
              {b.benchmark.pages.map((p, i) => <tr key={i} className="border-t"><td className="py-1 pr-2">#{p.position ?? '?'}</td><td className="break-all pr-2">{p.host}</td><td className="break-words pr-2">{p.title}</td><td>{p.words ?? '—'}</td></tr>)}
            </tbody></table></div>
            {b.benchmark.topEntities.length > 0 && <p className="break-words text-xs">{b.benchmark.topEntities.map((e) => `${e.entity} (${e.pages})`).join(' · ')}</p>}
            {b.benchmark.socialSummary.identities > 0 && <p className="text-xs text-muted-foreground">{b.benchmark.socialSummary.identities} · {b.benchmark.socialSummary.topFormats.map((f) => `${f.format} ${f.identities}`).join(' · ')}{b.benchmark.socialSummary.medianPostsPerMonth !== null ? ` · ${b.benchmark.socialSummary.medianPostsPerMonth}/mês` : ''}</p>}
          </>
        )}
      </div>

      <div className={BOX}><h3 className={H}>{t('brief.gaps')}</h3>
        {gaps.basis === 'sem_dados' ? <p className="text-sm text-muted-foreground">{t('brief.noGaps')}</p> : (
          <>
            <p className="text-xs font-medium">{t('brief.theyCover')}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">{gaps.theyCoverWeDont.map((g, i) => <li key={i} className="break-words">{g.topic} <span className="text-xs text-muted-foreground">({g.coveredBy}/{g.of})</span></li>)}</ul>
            <p className="text-xs font-medium">{t('brief.nobody')}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">{gaps.nobodyCovers.map((g, i) => <li key={i} className="break-words">{g.topic} <span className="text-xs text-muted-foreground">({g.source})</span></li>)}</ul>
            {gaps.weCoverTheyDont.length > 0 && <><p className="text-xs font-medium">{t('brief.weOnly')}</p><p className="break-words text-sm">{gaps.weCoverTheyDont.join(' · ')}</p></>}
          </>
        )}
      </div>

      <div className={BOX}><h3 className={H}>{t('brief.angles')}</h3>
        <ul className="space-y-2">{b.angles.map((a) => (
          <li key={a.id} className="rounded border p-2 text-sm">
            <p className="break-words"><span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${a.status === 'pronto' ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>{a.status === 'pronto' ? t('brief.ready') : t('brief.pending')}</span>{a.angle}</p>
            {a.proof.length > 0 && <p className="break-all text-xs text-muted-foreground">{t('brief.proof')}: {a.proof.join(' · ')}</p>}
            {a.missing && <p className="text-xs text-amber-300">{t('brief.missing')}: {a.missing}</p>}
          </li>))}</ul>
      </div>

      <div className={BOX}><h3 className={H}>{t('brief.surfaces')}</h3>
        <ul className="space-y-1 text-sm">{b.surfaces.map((s) => <li key={s.kind} className="break-words"><strong>{s.title}</strong> <span className="text-xs text-muted-foreground">[{s.status}]</span><br /><span className="text-xs text-muted-foreground">{s.notes}{s.prerequisites.length ? ` · ${s.prerequisites.join('; ')}` : ''}</span></li>)}</ul>
      </div>

      <div className={BOX}><h3 className={H}>{t('brief.goals')}</h3>
        <ul className="space-y-1 text-sm">{b.goals.goals.map((g) => <li key={g.key} className="break-words"><strong>{g.label}</strong>: {g.current === null ? '—' : String(g.current)} <span className="text-xs text-muted-foreground">({g.status === 'medido' ? t('brief.measured') : t('brief.pending')} · {g.source}) → {g.target}</span></li>)}</ul>
      </div>

      <div className={BOX}><h3 className={H}>{t('brief.cited')}</h3>
        {b.citedSources.byHost.length === 0 ? <p className="text-sm text-muted-foreground">{b.citedSources.notes[0] || '—'}</p> : (
          <>
            <p className="text-xs text-muted-foreground">{t('brief.hosts')} ({n(b.citedSources.total)}) · {t('brief.ownShare', { share: b.citedSources.own.share })}</p>
            <ul className="space-y-1 text-sm">{b.citedSources.byHost.slice(0, 8).map((h) => <li key={h.host} className="break-all">{h.host} <span className="text-xs text-muted-foreground">{h.kind} · {h.count} ({h.share}%) · {h.engines.join(', ')}{h.ownedByUs ? ' · nosso' : ''}</span></li>)}</ul>
            {b.citedSources.presenceTargets.length > 0 && <><p className="text-xs font-medium">{t('brief.targets')}</p><ul className="space-y-1 text-sm">{b.citedSources.presenceTargets.map((p) => <li key={p.host} className="break-words"><strong className="break-all">{p.host}</strong>: {p.action}</li>)}</ul></>}
          </>
        )}
      </div>

      <div className={BOX}><h3 className={H}>{t('brief.outline')}</h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm">{b.outline.map((o, i) => <li key={i} className="break-words">{o.heading} <span className="text-xs text-muted-foreground">({o.purpose})</span></li>)}</ol>
      </div>

      {b.pendings.length > 0 && <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"><h3 className={H}>{t('brief.pendings')}</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">{b.pendings.map((p) => <li key={p.id} className="break-words"><strong>{p.label}</strong>: {p.reason}</li>)}</ul></div>}
    </section>
  );
}
