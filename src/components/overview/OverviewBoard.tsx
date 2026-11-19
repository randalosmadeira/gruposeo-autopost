import { AGENT_LABEL, type Delta, type Diagnostic, type TreeHost } from '../../../supabase/functions/_shared/overview-core';
import type { OverviewData } from '@/lib/overview-api';

const n = (v: number | null | undefined) => (v === null || v === undefined ? 'sem dados' : v.toLocaleString('pt-BR'));
const day = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '');
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Variação contra o período anterior. `lowerIsBetter` vale para a posição no Google (1 é melhor que 20). */
function Change({ d, lowerIsBetter = false, unit = '' }: { d: Delta; lowerIsBetter?: boolean; unit?: string }) {
  if (d.abs === null) return <span className="text-xs text-muted-foreground">{d.value === null ? 'sem dados' : 'sem período anterior para comparar'}</span>;
  if (d.abs === 0) return <span className="text-xs text-muted-foreground">igual ao período anterior</span>;
  const better = lowerIsBetter ? d.abs < 0 : d.abs > 0;
  const pct = d.pct === null ? '' : ` (${d.pct > 0 ? '+' : ''}${d.pct.toLocaleString('pt-BR')}%)`;
  return <span className={`text-xs ${better ? 'text-emerald-400' : 'text-red-400'}`}>{better ? 'melhorou' : 'piorou'} {d.abs > 0 ? '+' : ''}{d.abs.toLocaleString('pt-BR')}{unit}{pct} vs. o período anterior</span>;
}

function Tile({ label, value, d, lowerIsBetter, unit, hint }: { label: string; value: string; d?: Delta; lowerIsBetter?: boolean; unit?: string; hint?: string }) {
  return (
    <li className="rounded-lg border bg-background/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
      {d ? <Change d={d} lowerIsBetter={lowerIsBetter} unit={unit} /> : hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </li>
  );
}

/** Indicadores do Google (Search Console), do GA4 e dos cliques de contato, cada um com a fonte e o período. */
export function KpiGrid({ data }: { data: OverviewData }) {
  const k = data.kpis; const w = data.windows;
  return (
    <div className="space-y-3">
      <section aria-labelledby="kpi-google" className="rounded-xl border bg-card/40 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2"><h2 id="kpi-google" className="text-base font-semibold">No Google</h2><span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">Search Console{w.gsc ? ` · ${day(w.gsc.cur_from)} a ${day(w.gsc.cur_to)}` : ''}</span></div>
        {k.gsc ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Cliques" value={n(k.gsc.clicks.value)} d={k.gsc.clicks} />
            <Tile label="Impressões" value={n(k.gsc.impressions.value)} d={k.gsc.impressions} />
            <Tile label="Posição média" value={k.gsc.position.value === null ? 'sem dados' : k.gsc.position.value.toLocaleString('pt-BR')} d={k.gsc.position} lowerIsBetter />
            <Tile label="Taxa de clique" value={k.gsc.ctr.value === null ? 'sem dados' : `${k.gsc.ctr.value.toLocaleString('pt-BR')}%`} d={k.gsc.ctr} unit=" p.p." />
          </ul>
        ) : <p role="note" className="mt-2 text-sm text-muted-foreground">Sem dados do Search Console para este projeto.</p>}
      </section>
      <section aria-labelledby="kpi-ga4" className="rounded-xl border bg-card/40 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2"><h2 id="kpi-ga4" className="text-base font-semibold">No site</h2><span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">Google Analytics (GA4){w.ga4 ? ` · ${day(w.ga4.cur_from)} a ${day(w.ga4.cur_to)}` : ''}</span></div>
        {k.ga4 ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Visitas (sessões)" value={n(k.ga4.sessions.value)} d={k.ga4.sessions} />
            <Tile label="Páginas vistas" value={n(k.ga4.views.value)} d={k.ga4.views} />
            <Tile label="Pessoas" value={n(k.ga4.users.value)} d={k.ga4.users} />
            <Tile label="Visitas vindas de IA" value={n(k.ga4.ai_sessions.value)} d={k.ga4.ai_sessions} />
          </ul>
        ) : <p role="note" className="mt-2 text-sm text-muted-foreground">Sem dados do Google Analytics para este projeto.</p>}
      </section>
      <section aria-labelledby="kpi-cta" className="rounded-xl border bg-card/40 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2"><h2 id="kpi-cta" className="text-base font-semibold">Contatos medidos no site</h2><span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">Cliques em WhatsApp, telefone, e-mail e formulário · últimos {data.days} dias</span></div>
        {k.cta.total > 0 ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Total de cliques de contato" value={n(k.cta.total)} hint="clique não é contrato: mede interesse" />
            {Object.entries(k.cta.by_agent).sort((a, b) => b[1] - a[1]).map(([agent, hits]) => <Tile key={agent} label={AGENT_LABEL[agent] || agent} value={n(hits)} />)}
          </ul>
        ) : <p role="note" className="mt-2 text-sm text-muted-foreground">Ainda não há cliques de contato medidos. Veja o aviso abaixo.</p>}
        <p className="mt-2 text-xs text-muted-foreground">Mede só o tipo do contato e a página; nunca o número, o e-mail ou o que a pessoa digitou.</p>
      </section>
      {k.articles && <p className="text-xs text-muted-foreground">{n(k.articles.published)} artigos publicados de {n(k.articles.total)}{k.articles.last_published_at ? `; o último em ${new Date(k.articles.last_published_at).toLocaleDateString('pt-BR')}` : ''}.</p>}
    </div>
  );
}

/** O que está estranho e por quê, com os números. */
export function Diagnostics({ items }: { items: Diagnostic[] }) {
  if (!items.length) return <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">Nenhum ponto de atenção encontrado nos dados disponíveis.</p>;
  return (
    <section aria-labelledby="diag" className="space-y-2">
      <h2 id="diag" className="text-base font-semibold">Pontos de atenção</h2>
      <ul className="space-y-2">
        {items.map((d) => <li key={d.key} className={`rounded-lg border p-3 text-sm ${d.level === 'atencao' ? 'border-amber-500/50 bg-amber-500/10 text-amber-100' : 'bg-background/40 text-muted-foreground'}`}>{d.text}</li>)}
      </ul>
    </section>
  );
}

const FLAG_TEXT = { sem_busca: 'Está no sitemap e não aparece no Google', fora_do_mapa: 'Aparece no Google e não está no sitemap' } as const;

/** Árvore do domínio: site, subdomínios e seções, com tráfego do Google e URLs do sitemap lado a lado. */
export function DomainTree({ tree }: { tree: TreeHost[] }) {
  if (!tree.length) return <p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Ainda não há site cadastrado nem dados do Google para montar a árvore.</p>;
  return (
    <div className="space-y-3">
      {tree.map((h) => (
        <section key={h.host} aria-label={`Endereço ${h.host}`} className="rounded-xl border bg-card/40 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-all text-base font-semibold">{h.host}</h3>
            <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{h.primary ? 'site principal' : 'subdomínio'}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {h.gsc ? `No Google: ${n(h.gsc.pages)} página(s), ${n(h.gsc.impressions)} impressões, ${n(h.gsc.clicks)} cliques${h.gsc.position ? `, posição média ${h.gsc.position.toLocaleString('pt-BR')}` : ''}. ` : 'Sem dados do Google para este endereço. '}
            {h.map ? <>Mapa lido em {when(h.map.fetched_at)}: {h.map.sitemap_found ? `sitemap com ${n(h.map.sitemap_urls)} URL(s) em ${h.map.files} arquivo(s)` : 'sem sitemap encontrado'}; llms.txt {h.map.llms_found ? 'existe' : 'não existe'}; robots.txt {h.map.robots_found ? 'existe' : 'não existe'}.</> : 'Mapa do domínio ainda não lido.'}
          </p>
          {h.sections.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-lg border" tabIndex={0} role="region" aria-label={`Seções de ${h.host} (role para o lado se precisar)`}>
              <table className="w-full min-w-[36rem] border-collapse text-sm">
                <thead><tr className="border-b bg-muted/30 text-left text-xs"><th scope="col" className="px-3 py-2 font-medium">Seção</th><th scope="col" className="px-3 py-2 text-right font-medium">Páginas no Google</th><th scope="col" className="px-3 py-2 text-right font-medium">URLs no sitemap</th><th scope="col" className="px-3 py-2 text-right font-medium">Impressões</th><th scope="col" className="px-3 py-2 text-right font-medium">Cliques</th><th scope="col" className="px-3 py-2 text-right font-medium">Posição</th><th scope="col" className="px-3 py-2 font-medium">Observação</th></tr></thead>
                <tbody>
                  {h.sections.map((s) => (
                    <tr key={s.section} className="border-b last:border-0">
                      <th scope="row" className="px-3 py-2 text-left font-medium"><span className="break-all">/{s.section.startsWith('(') ? s.section : `${s.section}/`}</span></th>
                      <td className="px-3 py-2 text-right tabular-nums">{n(s.gsc_pages)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.sitemap_urls === null ? <span className="text-muted-foreground">mapa não lido</span> : n(s.sitemap_urls)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{n(s.impressions)}</td><td className="px-3 py-2 text-right tabular-nums">{n(s.clicks)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.position === null ? '—' : s.position.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2 text-xs">{s.flag ? <span className="rounded-full border border-amber-500/50 px-2 py-0.5 text-amber-200">{FLAG_TEXT[s.flag]}</span> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">O Google Analytics não informa o endereço do site, só o caminho da página; por isso a árvore usa o Search Console. Seções vêm do primeiro nível do endereço.</p>
    </div>
  );
}
