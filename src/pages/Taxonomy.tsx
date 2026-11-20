import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useProjects } from '@/hooks/useProjects';
import { usePreferredProject } from '@/hooks/usePreferredProject';
import {
  callTaxonomy, taxonomyErrorMessage, type CompetitorsReply, type DistrictsReport, type GeoOverview, type ImportReport, type NodeRow, type PackReport, type PlanReport, type SuggestReport, type SyncReport, type TailReport, type TaxonomyOverview, type WarningsReply,
} from '@/lib/taxonomy-api';
import { AddNodeForm, AreaTree } from '@/components/taxonomy/AreaTree';
import { GeoBoard } from '@/components/taxonomy/GeoBoard';
import { PlannerBoard, type PlanParams } from '@/components/taxonomy/PlannerBoard';
import { CompetitorsBoard, type CompetitorQuery } from '@/components/taxonomy/CompetitorsBoard';
import { TailBoard } from '@/components/taxonomy/TailBoard';

type Notice = { kind: 'ok' | 'error'; text: string } | null;
const SELECT = 'mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';

function suggestText(r: SuggestReport): string {
  const parts = [`${r.classified} item(ns) classificado(s) (${r.analyzed.secoes} seções do mapa, ${r.analyzed.paginas} páginas e ${r.analyzed.consultas} buscas do Google nos últimos ${r.analyzed.dias} dias)`, `${r.nodes_new} área(s) nova(s) sugerida(s)`];
  if (r.nodes_updated) parts.push(`${r.nodes_updated} atualizada(s) com mais evidência`);
  if (r.edges_new) parts.push(`${r.edges_new} correlação(ões) nova(s)`);
  if (r.geo_new) parts.push(`${r.geo_new} lugar(es) sugerido(s)`);
  if (r.unclassified.count) parts.push(`${r.unclassified.count} item(ns) sem área identificada`);
  if (r.skipped_rejected) parts.push(`${r.skipped_rejected} já rejeitado(s) (mantidos assim)`);
  return `${parts.join('; ')}.${r.warnings.length ? ` Atenção: ${r.warnings.join(' ')}` : ''}`;
}

/** Taxonomia e mercado: áreas matriz > subáreas > nichos do negócio, onde ele atua, e o planejador de campanha de buscas (concorrentes). */
export default function Taxonomy() {
  const { projects, isLoading: loadingProjects } = useProjects();
  const { selected, select } = usePreferredProject(projects || []);
  const cache = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState('areas');
  const [segment, setSegment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [plan, setPlan] = useState<PlanReport | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorsReply | null>(null);
  const [tail, setTail] = useState<TailReport | null>(null);
  const [loadingComp, setLoadingComp] = useState(false);
  const [compFor, setCompFor] = useState<string | null>(null);

  const q = useQuery<TaxonomyOverview>({ queryKey: ['taxonomy', selected], queryFn: () => callTaxonomy<TaxonomyOverview>('overview', { projectId: selected }), enabled: !!selected, retry: false, refetchOnWindowFocus: false });
  const geoQ = useQuery<GeoOverview>({ queryKey: ['taxonomy-geo', selected], queryFn: () => callTaxonomy<GeoOverview>('geo_overview', { projectId: selected }), enabled: !!selected && tab === 'geo', retry: false, refetchOnWindowFocus: false });
  const data = q.data;
  const canEdit = !!data?.can_edit;
  const refresh = async () => { await cache.invalidateQueries({ queryKey: ['taxonomy', selected] }); await cache.invalidateQueries({ queryKey: ['taxonomy-geo', selected] }); };
  useEffect(() => { setNotice(null); setPlan(null); setImportReport(null); setCompetitors(null); setTail(null); setCompFor(null); }, [selected]);
  useEffect(() => { if (!segment && data) setSegment(data.segments.find((s) => s.status === 'validado')?.id ?? ''); }, [data, segment]);

  const fail = (e: unknown) => { const t = taxonomyErrorMessage(e); setNotice({ kind: 'error', text: t }); toast({ title: 'Não consegui concluir', description: t, variant: 'destructive' }); };
  /** Roda uma chamada, mostra erro em português e atualiza a tela. Devolve o resultado ou null. */
  async function run<T>(key: string, fn: () => Promise<T>, okText?: (r: T) => string): Promise<T | null> {
    setBusy(key); setNotice(null);
    try {
      const r = await fn();
      const w = (r as WarningsReply | null)?.warnings;
      if (okText) setNotice({ kind: 'ok', text: `${okText(r)}${w?.length && !(r as { analyzed?: unknown }).analyzed ? ` Atenção: ${w.join(' ')}` : ''}` });
      else if (w?.length) setNotice({ kind: 'ok', text: `Feito. Atenção: ${w.join(' ')}` });
      await refresh(); return r;
    } catch (e) { fail(e); return null; } finally { setBusy(null); }
  }
  const P = { projectId: selected };

  const suggest = () => run('suggest', () => callTaxonomy<SuggestReport>('suggest', { ...P, segment }), suggestText);
  const packLoad = () => run('pack', () => callTaxonomy<PackReport>('pack_load', { ...P, segment }), (r) => `Pacote carregado: ${r.nodes_new} área(s) e ${r.edges_new} correlação(ões) novas, todas como "sugerido" para você revisar.`);
  const decide = (ids: string[], decision: NodeRow['status']) => void run('decide', () => callTaxonomy('review', { ...P, nodeIds: ids, decision }));
  const rename = (id: string, label: string) => void run('decide', () => callTaxonomy('review', { ...P, nodeId: id, label }));
  const create = async (kind: NodeRow['kind'], parentId: string | null, label: string) => (await run('create', () => callTaxonomy('review', { ...P, create: { kind, parentId, label } }), () => 'Criado e aprovado.')) !== null;
  const sync = () => void run('sync', () => callTaxonomy<SyncReport>('geo_sync', P), (r) => `${r.municipios.toLocaleString('pt-BR')} municípios carregados do IBGE${r.population_available ? ` (com a população de ${r.population_year})` : ' (sem população: a base de estimativa não respondeu)'}.`);
  const scopeDecide = (ids: string[], status: string) => void run('scope', () => callTaxonomy('scope_save', { ...P, decide: { ids, status } }));
  const scopeRemove = (ids: string[]) => void run('scope', () => callTaxonomy('scope_save', { ...P, remove_ids: ids }));
  const scopeAdd = async (e: { role: string; uf: string | null; municipio: string | null; bairro: string | null; regiao: string | null; country: string; language: string }) => (await run('scope', () => callTaxonomy('scope_save', { ...P, entries: [e] }), () => 'Lugar adicionado e aprovado.')) !== null;
  const districts = () => void run('districts', () => callTaxonomy<DistrictsReport>('geo_districts', P), (r) => `${r.added} bairro(s) sugerido(s) (distritos do IBGE) em ${r.cities} município(s) aprovado(s)${r.remaining ? `; faltam ${r.remaining} município(s): clique de novo` : ''}.`);
  const tailImport = async (text: string) => { const r = await run('tail', () => callTaxonomy<TailReport>('tail_import', { ...P, text, segment: segment || undefined })); if (r) setTail(r); return r !== null; };

  async function doPlan(p: PlanParams): Promise<boolean> {
    const paid = p.mode === 'auto';
    const r = await run('plan', () => callTaxonomy<PlanReport>('campaign_plan', {
      ...P, name: p.name, provider: p.mode, segment: segment || undefined, budget_cap_cents: paid ? p.budgetCents : 0, pages_per_query: paid ? p.pages : 1, price_table: paid && Object.keys(p.prices).length ? p.prices : undefined,
    }), (x) => (x.campaign.status === 'aprovada' ? 'Plano gerado e aprovado (custo zero). Nada foi executado nem cobrado.' : 'Plano gerado em rascunho: aprove o custo para liberar. Nada foi executado nem cobrado.'));
    if (r) setPlan(r);
    return r !== null;
  }
  const approve = (id: string) => void run(id, () => callTaxonomy('campaign_approve', { ...P, campaignId: id }), () => 'Custo aprovado. Nada foi executado.');
  const cancel = (id: string) => void run(id, () => callTaxonomy('campaign_cancel', { ...P, campaignId: id }), () => 'Campanha cancelada.');
  async function doImport(campaignId: string, text: string, createMissing: boolean): Promise<boolean> {
    const r = await run('import', () => callTaxonomy<ImportReport>('campaign_results_import', { ...P, campaignId, text, create_missing: createMissing, segment: segment || undefined }));
    if (r) { setImportReport(r); void loadCompetitors({ filter: {}, kind: 'concorrente' }); }
    return r !== null;
  }
  const loadCompetitors = useCallback(async (cq: CompetitorQuery) => {
    setLoadingComp(true);
    try { setCompetitors(await callTaxonomy<CompetitorsReply>('competitors_list', { projectId: selected, filter: cq.filter, kind: cq.kind, segment: segment || undefined })); } catch (e) {
      const t = taxonomyErrorMessage(e); setNotice({ kind: 'error', text: t }); toast({ title: 'Não consegui concluir', description: t, variant: 'destructive' });
    } finally { setLoadingComp(false); }
  }, [selected, segment, toast]);
  // carrega a lista uma vez por projeto ao abrir a aba (uma falha não fica tentando de novo sozinha)
  useEffect(() => { if (tab === 'competitors' && selected && compFor !== selected) { setCompFor(selected); void loadCompetitors({ filter: {}, kind: 'concorrente' }); } }, [tab, selected, compFor, loadCompetitors]);

  const shell = 'mx-auto w-full max-w-7xl space-y-4 px-4 py-5 pb-32 sm:px-6 md:pb-10 lg:px-8';
  if (loadingProjects && !projects) return <div className={shell} aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!projects?.length) return <div className={shell}><h1 className="text-2xl font-bold">Taxonomia e mercado</h1><p className="text-muted-foreground">Crie um projeto para mapear as áreas, os lugares e os concorrentes do negócio.</p></div>;
  const seg = data?.segments.find((s) => s.id === segment);
  return (
    <div className={shell}>
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-primary">Taxonomia e mercado</p>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Quais são as áreas, os lugares e os concorrentes do seu negócio?</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Eu leio o seu site e o Google Search Console, sugiro as <strong>áreas matriz, subáreas e nichos</strong> e os <strong>lugares</strong> onde você atua ou tem demanda, e você aprova o que está certo. Depois monto sozinho um <strong>plano de buscas</strong> para descobrir os concorrentes por área, bairro, cidade, região, estado e país, com teto de custo. Só o que custa dinheiro pede a sua aprovação; onde não há dado, aparece "sem dados".</p>
        <div className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="tx-project" className="block text-xs text-muted-foreground">Projeto</label>
            <select id="tx-project" className={SELECT} value={selected} onChange={(e) => select(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label htmlFor="tx-segment" className="block text-xs text-muted-foreground">Tipo de negócio (segmento)</label>
            <select id="tx-segment" className={`${SELECT} w-64`} value={segment} onChange={(e) => setSegment(e.target.value)}>
              {!data && <option value="">Carregando…</option>}
              {(data?.segments ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}{s.status !== 'validado' ? ' — rascunho (aviso)' : ''}</option>)}
            </select></div>
        </div>
        {seg && <p className="text-xs text-muted-foreground">{seg.description}{seg.status !== 'validado' ? ' Este pacote é um rascunho de exemplo: funciona, mas revise o que ele sugerir.' : ''}</p>}
      </header>

      {q.isError && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{taxonomyErrorMessage(q.error)} <Button size="sm" variant="outline" className="ml-2" onClick={() => q.refetch()}>Tentar de novo</Button></p>}
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded border p-3 text-sm ${notice.kind === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'}`}>{notice.text}</p>}
      {q.isLoading && <div aria-busy="true"><Skeleton className="h-64 w-full" /></div>}

      {data && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="areas">Áreas</TabsTrigger>
            <TabsTrigger value="geo">Onde atua</TabsTrigger>
            <TabsTrigger value="planner">Planejador de buscas</TabsTrigger>
            <TabsTrigger value="competitors">Concorrentes</TabsTrigger>
          </TabsList>

          <TabsContent value="areas" className="space-y-4">
            <section aria-labelledby="tx-areas" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
              <h2 id="tx-areas" className="text-lg font-semibold">Áreas matriz, subáreas e nichos</h2>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={!canEdit || !segment || busy === 'suggest'} onClick={() => void suggest()}>{busy === 'suggest' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Lendo o site e o Google…</> : <><Sparkles className="mr-2 h-4 w-4" aria-hidden />Sugerir a partir do site e do Google</>}</Button>
                <Button variant="outline" disabled={!canEdit || !segment || busy === 'pack'} onClick={() => void packLoad()}>Carregar o pacote do segmento</Button>
                {!canEdit && <p role="note" className="text-sm text-muted-foreground">Seu papel permite ver, mas não alterar.</p>}
              </div>
              <p className="text-xs text-muted-foreground">Tudo entra como <strong>sugerido</strong>, com as evidências (quantas páginas e buscas apontam para a área). Nada vira plano de busca antes de você aprovar.</p>
              <AreaTree nodes={data.nodes} edges={data.edges} canEdit={canEdit} busy={busy === 'decide'} onDecide={decide} onRename={rename} />
              {canEdit && <div className="border-t pt-3"><h3 className="mb-2 text-sm font-semibold">Adicionar à mão</h3><AddNodeForm nodes={data.nodes} disabled={busy === 'create'} onCreate={create} /></div>}
              <TailBoard canEdit={canEdit} busy={busy === 'tail'} paidBlocked={data.paid_blocked} report={tail} hasSegment={!!segment} onImport={tailImport} />
            </section>
          </TabsContent>

          <TabsContent value="geo">
            <section aria-labelledby="tx-geo" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
              <h2 id="tx-geo" className="text-lg font-semibold">Onde o negócio atua e onde há demanda</h2>
              {geoQ.isError && <p role="alert" className="text-sm text-red-300">{taxonomyErrorMessage(geoQ.error)}</p>}
              <GeoBoard geo={geoQ.data} scope={data.geo_scope} ibge={data.ibge} canEdit={canEdit} busy={busy === 'scope'} syncing={busy === 'sync'} onSync={sync} onDecide={scopeDecide} onRemove={scopeRemove} onAdd={scopeAdd} onDistricts={districts} districting={busy === 'districts'} />
            </section>
          </TabsContent>

          <TabsContent value="planner">
            <section aria-labelledby="tx-plan" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
              <h2 id="tx-plan" className="text-lg font-semibold">Planejador de buscas</h2>
              <PlannerBoard data={data} canEdit={canEdit} busy={busy} plan={plan} importReport={importReport} onPlan={doPlan} onApprove={approve} onCancel={cancel} onImport={doImport} />
            </section>
          </TabsContent>

          <TabsContent value="competitors">
            <section aria-labelledby="tx-comp" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
              <h2 id="tx-comp" className="text-lg font-semibold">Concorrentes por área e lugar</h2>
              <CompetitorsBoard nodes={data.nodes} reply={competitors} loading={loadingComp} onFilter={(c) => void loadCompetitors(c)} />
            </section>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
