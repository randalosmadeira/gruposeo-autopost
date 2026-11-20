import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CampaignRow, ImportReport, PlanReport, TaxonomyOverview } from '@/lib/taxonomy-api';

const SELECT = 'mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';
export const CAMPAIGN_STATUS: Record<CampaignRow['status'], string> = { rascunho: 'Aguardando aprovação do custo', aprovada: 'Aprovada', executando: 'Executando', concluida: 'Concluída', cancelada: 'Cancelada' };
const PROVIDER_NOTE = 'Preço NÃO verificado';
export const money = (cents: number | null, currency = ''): string => (cents === null ? 'desconhecido (preço não verificado)' : `${currency ? `${currency} ` : ''}${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

export interface PlanParams { name: string; mode: 'manual' | 'auto'; prices: Record<string, { price_per_1000_cents: number; verified: boolean; checked_at: string | null }>; budgetCents: number; pages: number }
interface Props {
  data: TaxonomyOverview; canEdit: boolean; busy: string | null; plan: PlanReport | null; importReport: ImportReport | null;
  onPlan: (p: PlanParams) => Promise<boolean>; onApprove: (id: string) => void; onCancel: (id: string) => void;
  onImport: (campaignId: string, text: string, createMissing: boolean) => Promise<boolean>;
}

export function PlanResult({ plan }: { plan: PlanReport }) {
  const d = plan.dry_run; const cur = d.cost.currency;
  const providers = Object.entries(d.cost.by_provider);
  return (
    <div className="space-y-2 rounded-lg border bg-background/40 p-3" aria-label="Ensaio do plano (nada foi executado)">
      <h4 className="text-sm font-semibold">Ensaio do plano: nada foi executado nem cobrado</h4>
      <p className="text-xs text-muted-foreground">Gerado sozinho com os motores <strong>{d.engines.join(', ')}</strong> e os mercados <strong>{d.markets.map((m) => m.replace(/\|/g, ':').replace(/:$/, '')).join(', ')}</strong>.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="text-xs text-muted-foreground"><th className="py-1 pr-3 font-medium">Fase</th><th className="py-1 pr-3 font-medium">Consultas</th><th className="py-1 font-medium">Custo estimado</th></tr></thead>
        <tbody>{d.per_phase.map((p) => <tr key={p.phase} className="border-t"><td className="py-1 pr-3">{p.label}</td><td className="py-1 pr-3 tabular-nums">{p.queries.toLocaleString('pt-BR')}</td><td className="py-1">{d.cost.paid ? money(p.cost_cents, cur) : 'zero'}</td></tr>)}</tbody>
      </table></div>
      <p className="text-sm"><strong>Total:</strong> {d.total_queries.toLocaleString('pt-BR')} consultas · custo estimado {d.cost.paid ? money(plan.campaign.estimated_cost_cents, cur) : 'zero'}</p>
      {d.cost.paid && providers.length > 0 && <ul className="space-y-0.5 text-xs text-muted-foreground">{providers.map(([p, b]) => <li key={p}>{p}: {b.queries.toLocaleString('pt-BR')} consultas · {b.verified ? money(b.cents, b.currency) : `${PROVIDER_NOTE} (custo desconhecido)`}</li>)}</ul>}
      {!d.cost.verified && d.cost.paid && <p role="note" className="rounded border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-300">{PROVIDER_NOTE}: o valor por consulta de algum provedor não foi conferido, então o custo é desconhecido e a campanha não pode ser aprovada.</p>}
      {d.cap.cost_known && d.cost.paid ? <p className="text-sm">Teto de {money(d.cap.budget_cap_cents, cur)}: cabem {d.cap.fits_queries?.toLocaleString('pt-BR')} de {d.total_queries.toLocaleString('pt-BR')} consultas{d.cap.fits_all ? ' (tudo cabe)' : ''}.</p> : null}
      {!d.cost.paid && <p className="text-sm">Você traz os resultados: custo zero para o sistema, e a campanha já nasceu aprovada.</p>}
      {d.warnings.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{d.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Exemplos de consulta ({d.sample.length})</summary><ul className="mt-1 space-y-0.5 break-words">{d.sample.map((q) => <li key={q}>{q}</li>)}</ul></details>
      <p className="text-xs text-muted-foreground">{d.persisted.toLocaleString('pt-BR')} consulta(s) guardada(s){d.truncated ? ' (o limite técnico de gravação por pedido cortou o resto; o plano completo está contado acima)' : ''}.</p>
    </div>
  );
}

/** Planejador: o plano sai sozinho do que está aprovado; só o que custa dinheiro pede aprovação. Também recebe os resultados de busca já obtidos (custo zero). */
export function PlannerBoard({ data, canEdit, busy, plan, importReport, onPlan, onApprove, onCancel, onImport }: Props) {
  const providers = Object.entries(data.price_table).filter(([k]) => k !== 'manual');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [price, setPrice] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [cap, setCap] = useState('0');
  const [pages, setPages] = useState('1');
  const [campaignId, setCampaignId] = useState('');
  const [text, setText] = useState('');
  const [create, setCreate] = useState(true);
  const paid = mode === 'auto';
  const priceCents = (k: string) => (price[k] === undefined || price[k].trim() === '' ? 0 : Math.round(Number(price[k].replace(',', '.')) * 100));
  const capCents = Math.round(Number(cap.replace(',', '.')) * 100);
  const valid = name.trim().length >= 2 && Number.isFinite(capCents) && capCents >= 0 && providers.every(([k]) => Number.isFinite(priceCents(k)) && priceCents(k) >= 0);
  const open = data.campaigns.filter((c) => c.status !== 'cancelada');
  const approved = data.nodes.filter((n) => n.status === 'aprovado');
  const places = data.geo_scope.filter((s) => s.status === 'aprovado').length;

  return (
    <div className="space-y-5">
      <section aria-labelledby="pl-new" className="space-y-3">
        <h3 id="pl-new" className="text-base font-semibold">Plano de buscas automático</h3>
        <p className="text-xs text-muted-foreground">Eu cruzo sozinho o que você aprovou ({approved.length} item(ns) na árvore, incluindo a cauda do agente, e {places} lugar(es) do escopo: bairros, cidades, regiões, estados e países) com os motores de busca que o projeto já usa e com as 4 fases (Brasil, capitais, maiores cidades, estado de SP e Brasil inteiro). Você não escolhe fase, cidade nem motor. Planejar é grátis: <strong>só o que custa dinheiro pede a sua aprovação</strong>. {data.paid_blocked ? 'As buscas pagas estão bloqueadas globalmente; o plano pode ser salvo.' : ''}</p>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const prices: PlanParams['prices'] = {};
          if (paid) for (const [k] of providers) if (priceCents(k) > 0) prices[k] = { price_per_1000_cents: priceCents(k), verified: !!verified[k], checked_at: verified[k] ? new Date().toISOString().slice(0, 10) : null };
          await onPlan({ name, mode, prices, budgetCents: paid ? capCents : 0, pages: Number(pages) || 1 });
        }}>
          <div className="sm:col-span-2"><label htmlFor="pl-name" className="text-sm font-medium">Nome da campanha</label>
            <Input id="pl-name" className="mt-1 h-10" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} /></div>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">Quem faz as buscas</legend>
            <label className="mt-1 flex items-start gap-2 text-sm"><input type="radio" name="pl-mode" className="mt-1 h-4 w-4" checked={mode === 'manual'} disabled={!canEdit} onChange={() => setMode('manual')} /><span>Eu trago os resultados (custo zero: já nasce aprovada)</span></label>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="pl-mode" className="mt-1 h-4 w-4" checked={mode === 'auto'} disabled={!canEdit} onChange={() => setMode('auto')} /><span>O sistema busca (custa dinheiro: pede a sua aprovação do custo e do teto)</span></label></fieldset>
          {paid && providers.map(([k, v]) => (
            <div key={k}><label htmlFor={`pl-price-${k}`} className="text-sm font-medium">{v.label}: preço por 1.000 consultas ({v.currency})</label>
              <Input id={`pl-price-${k}`} inputMode="decimal" className="mt-1 h-10" placeholder="Informe o valor da página de preços" value={price[k] ?? ''} disabled={!canEdit} onChange={(e) => { setPrice((p) => ({ ...p, [k]: e.target.value })); setVerified((p) => ({ ...p, [k]: false })); }} />
              <label className="mt-1 flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 h-4 w-4" aria-label={`Conferi o preço de ${v.label} hoje`} checked={!!verified[k]} disabled={!canEdit || !(priceCents(k) > 0)} onChange={(e) => setVerified((p) => ({ ...p, [k]: e.target.checked }))} />Conferi este preço na página do provedor hoje.</label>
              <p className="mt-1 text-xs text-muted-foreground">{v.verified ? `Verificado${v.checked_at ? ` em ${v.checked_at}` : ''}.` : `${PROVIDER_NOTE}: enquanto não for conferido, o custo aparece como desconhecido.`}</p></div>
          ))}
          {paid && <div><label htmlFor="pl-cap" className="text-sm font-medium">Teto de gasto (mesma moeda do preço)</label>
            <Input id="pl-cap" inputMode="decimal" className="mt-1 h-10" value={cap} disabled={!canEdit} onChange={(e) => setCap(e.target.value)} /></div>}
          {paid && <div><label htmlFor="pl-pages" className="text-sm font-medium">Páginas de resultado por consulta</label>
            <Input id="pl-pages" inputMode="numeric" className="mt-1 h-10" value={pages} disabled={!canEdit} onChange={(e) => setPages(e.target.value)} /></div>}
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canEdit || !valid || busy === 'plan'}>{busy === 'plan' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Gerando o plano…</> : 'Gerar o plano (não executa nada)'}</Button>
            {!canEdit && <p role="note" className="text-sm text-muted-foreground">Seu papel permite ver, mas não planejar.</p>}
          </div>
        </form>
        {plan && <PlanResult plan={plan} />}
      </section>

      <section aria-labelledby="pl-list" className="space-y-3">
        <h3 id="pl-list" className="text-base font-semibold">Campanhas</h3>
        {data.campaigns.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados. Nenhuma campanha planejada ainda.</p> : (
          <ul className="space-y-2">{data.campaigns.map((c) => {
            const cur = c.config?.price?.currency ?? '';
            const free = c.provider === 'manual';
            return (
              <li key={c.id} className="rounded-lg border bg-background/40 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{c.name}</span><span className="rounded-full border px-2 py-0.5 text-[11px]">{CAMPAIGN_STATUS[c.status]}</span><span className="text-xs text-muted-foreground">{free ? 'você traz os resultados' : 'o sistema busca (pago)'}</span></div>
                <p className="mt-1 text-xs text-muted-foreground">{c.queries.total.toLocaleString('pt-BR')} consulta(s) · {c.queries.executada.toLocaleString('pt-BR')} com resultado · custo estimado {free ? 'zero' : c.config?.cost_known ? money(c.estimated_cost_cents, cur) : 'desconhecido (preço não verificado)'} · teto {free ? 'não se aplica' : money(c.budget_cap_cents, cur)} · gasto {free ? 'zero' : money(c.spent_cents, cur)}</p>
                {canEdit && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.status === 'rascunho' && <Button size="sm" variant="outline" disabled={busy === c.id} aria-label={`Aprovar o custo da campanha ${c.name}`} onClick={() => onApprove(c.id)}>Aprovar o custo</Button>}
                    {['rascunho', 'aprovada', 'executando'].includes(c.status) && <Button size="sm" variant="ghost" disabled={busy === c.id} aria-label={`Cancelar campanha ${c.name}`} onClick={() => onCancel(c.id)}>Cancelar</Button>}
                    {!free && c.status === 'aprovada' && <Button size="sm" variant="outline" disabled aria-label={`Executar campanha ${c.name}`}>Executar buscas</Button>}
                  </div>
                )}
                {!free && c.status === 'aprovada' && <p className="mt-1 text-xs text-muted-foreground">{data.paid_blocked ? 'Execução bloqueada: os serviços pagos estão bloqueados globalmente.' : 'A execução das buscas pagas ainda não foi construída.'} Enquanto isso, traga os resultados abaixo.</p>}
              </li>
            );
          })}</ul>
        )}
      </section>

      <section aria-labelledby="pl-import" className="space-y-3">
        <h3 id="pl-import" className="text-base font-semibold">Trazer resultados de busca já obtidos (custo zero)</h3>
        <p className="text-xs text-muted-foreground">Cole o resultado das buscas que você mesmo fez ou exportou: JSON no formato do Serper (com "organic", "places" e "ads") ou CSV com cabeçalho (<code>consulta;posicao;url;titulo;tipo;motor</code>). Reimportar uma consulta substitui os resultados dela. O site do próprio projeto não entra na lista de concorrentes.</p>
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await onImport(campaignId, text, create)) setText(''); }}>
          <div><label htmlFor="im-campaign" className="block text-xs text-muted-foreground">Campanha</label>
            <select id="im-campaign" className={`${SELECT} w-full sm:w-96`} value={campaignId} disabled={!canEdit} onChange={(e) => setCampaignId(e.target.value)}><option value="">Escolha…</option>{open.map((c) => <option key={c.id} value={c.id}>{c.name} ({CAMPAIGN_STATUS[c.status]})</option>)}</select></div>
          <div><label htmlFor="im-text" className="text-sm font-medium">Resultados</label>
            <Textarea id="im-text" className="mt-1 min-h-32 font-mono text-xs" value={text} disabled={!canEdit} placeholder={'consulta;posicao;url;titulo\nadvogado criminalista em Guarulhos;1;https://exemplo.com.br/;Exemplo Advogados'} onChange={(e) => setText(e.target.value)} /></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={create} disabled={!canEdit} onChange={(e) => setCreate(e.target.checked)} />Criar as consultas que não estão no plano (eu descubro a área e o lugar pelo texto da consulta)</label>
          <Button type="submit" disabled={!canEdit || !campaignId || !text.trim() || busy === 'import'}>{busy === 'import' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Importando…</> : 'Importar resultados'}</Button>
        </form>
        {importReport && (
          <p role="status" className="rounded border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            {importReport.results_added.toLocaleString('pt-BR')} resultado(s) guardado(s) em {importReport.queries_with_results.toLocaleString('pt-BR')} consulta(s){importReport.queries_created ? ` (${importReport.queries_created} consulta(s) nova(s))` : ''}. {importReport.competitors.toLocaleString('pt-BR')} domínio(s) na lista de concorrentes.{importReport.invalid ? ` ${importReport.invalid} linha(s) inválida(s) ignorada(s).` : ''}{importReport.duplicates ? ` ${importReport.duplicates} repetida(s).` : ''}{importReport.ignored_rows ? ` ${importReport.ignored_rows} linha(s) de consultas fora da campanha.` : ''}{importReport.truncated ? ' O arquivo passou do limite: envie o restante em outra parte.' : ''}
          </p>
        )}
      </section>
    </div>
  );
}
