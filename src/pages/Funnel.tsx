import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useProjects } from '@/hooks/useProjects';
import { usePreferredProject } from '@/hooks/usePreferredProject';
import { callFunnel, funnelErrorMessage, FunnelError, type FunnelPayload } from '@/lib/funnel-api';
import { FunnelBars, MonthlyTable, StageCards } from '@/components/funnel/FunnelBoard';
import { monthLabel } from '@/lib/funnel-format';
import { ConfigEditor } from '@/components/funnel/ConfigEditor';
import { PasteImport } from '@/components/funnel/PasteImport';
import { analyze, configFromTemplate, TEMPLATE_LABEL, TEMPLATES, type FunnelConfig, type FunnelMetric } from '../../supabase/functions/_shared/funnel-core';

type Notice = { kind: 'ok' | 'error'; text: string } | null;
const UNIT: Record<string, string> = { minutes: 'minutos', days: 'dias', number: 'número', count: 'quantidade' };

function TemplatePicker({ data, busy, onPick }: { data: FunnelPayload; busy: boolean; onPick: (config: FunnelConfig) => void }) {
  const ids = Object.keys(TEMPLATES);
  return (
    <section className="space-y-3 rounded-xl border bg-card/40 p-4 sm:p-6" aria-labelledby="funnel-pick">
      <div>
        <h2 id="funnel-pick" className="text-xl font-semibold">Escolha o ponto de partida do funil</h2>
        <p className="mt-1 text-sm text-muted-foreground">É só um modelo: depois você renomeia as etapas e ajusta o que medir. {data.segment ? <>Pelo segmento do Perfil (<strong>{data.segment}</strong>) eu sugiro o modelo marcado.</> : 'Preencha o segmento no Perfil do projeto para eu sugerir o melhor modelo.'}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ids.map((id) => {
          const t = TEMPLATES[id];
          const suggested = data.suggested.template === id;
          return (
            <li key={id} className={`flex flex-col rounded-lg border p-3 sm:p-4 ${suggested ? 'border-primary/60 bg-primary/5' : ''}`}>
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{TEMPLATE_LABEL[id] || id}</h3>{suggested && <span className="rounded-full border border-primary/50 px-2 py-0.5 text-[11px] text-primary">sugerido para este projeto</span>}</div>
              <p className="mt-1 text-sm text-muted-foreground">{t.stages.length} etapas: {t.stages.map((s) => s.label.replace(/^\d+\.\s*/, '')).join(', ')}.</p>
              <p className="mt-1 text-xs text-muted-foreground">Colunas: {t.counts.map((c) => c.label).join(' → ')}.</p>
              <Button type="button" className="mt-3 self-start" variant={suggested ? 'default' : 'outline'} disabled={busy || !data.can_write} onClick={() => onPick(configFromTemplate(id, data.council))}>Usar este modelo</Button>
            </li>
          );
        })}
      </ul>
      {!data.can_write && <p role="note" className="text-sm text-muted-foreground">Seu papel permite ver, mas não configurar o funil.</p>}
    </section>
  );
}

function MonthForm({ config, month, values, canWrite, busy, onSave }: { config: FunnelConfig; month: string; values: Record<string, number> | undefined; canWrite: boolean; busy: boolean; onSave: (changes: Record<string, string | null>) => void }) {
  const initial = useMemo(() => Object.fromEntries([...config.counts, ...config.extras].map((m) => [m.key, values && typeof values[m.key] === 'number' ? String(values[m.key]).replace('.', ',') : ''])), [config, values]);
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  useEffect(() => setDraft(initial), [initial, month]);
  const changed = Object.keys(draft).filter((k) => draft[k].trim() !== initial[k]);
  const field = (m: FunnelMetric) => {
    const id = `funnel-${m.key}`;
    return (
      <div key={m.key} className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium leading-snug">{m.label}</label>
        <Input id={id} inputMode="decimal" autoComplete="off" disabled={!canWrite || busy} value={draft[m.key] ?? ''} placeholder={m.kind === 'count' ? '0' : UNIT[m.kind]}
          aria-describedby={m.hint ? `${id}-hint` : undefined} className="mt-1 h-11 tabular-nums" onChange={(e) => setDraft((d) => ({ ...d, [m.key]: e.target.value }))} />
        {m.hint && <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted-foreground">{m.hint}</p>}
      </div>
    );
  };
  return (
    <form className="space-y-4 rounded-xl border bg-card/40 p-3 sm:p-5" onSubmit={(e) => { e.preventDefault(); onSave(Object.fromEntries(changed.map((k) => [k, draft[k].trim() === '' ? null : draft[k].trim()]))); }}>
      <div>
        <h2 className="text-lg font-semibold">Lançar os números de <span className="first-letter:uppercase">{monthLabel(month)}</span></h2>
        <p className="text-sm text-muted-foreground">Deixe em branco o que ainda não souber: aparece como "sem dados", nunca como zero. Contagens são números inteiros.</p>
      </div>
      <fieldset className="space-y-3"><legend className="mb-2 text-sm font-semibold text-primary">Colunas do funil</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{config.counts.map(field)}</div></fieldset>
      {config.extras.length > 0 && <fieldset className="space-y-3"><legend className="mb-2 text-sm font-semibold text-primary">Números de apoio</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{config.extras.map(field)}</div></fieldset>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">{changed.length ? `${changed.length} alteração(ões) não salva(s)` : 'Nada para salvar'}</p>
        <Button type="submit" disabled={!canWrite || busy || !changed.length}>{busy ? 'Salvando…' : 'Salvar os números do mês'}</Button>
      </div>
    </form>
  );
}

/** Funil de captação com números: onde o contato entra, onde ele fica pelo caminho e o que melhorou ou piorou desde o mês passado. */
export default function Funnel() {
  const { projects, isLoading: loadingProjects } = useProjects();
  const { selected, select } = usePreferredProject(projects || []);
  const cache = useQueryClient();
  const { toast } = useToast();
  const [month, setMonth] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const key = useMemo(() => ['funnel', selected], [selected]);
  const q = useQuery<FunnelPayload>({ queryKey: key, queryFn: () => callFunnel('get', { projectId: selected }), enabled: !!selected, retry: false, refetchOnWindowFocus: false });
  const data = q.data;
  const active = month && data?.months.includes(month) ? month : data?.current_month || '';
  const analysis = useMemo(() => (data?.config ? analyze(data.config, data.entries, active) : null), [data, active]);

  async function run(action: string, body: Record<string, unknown>, ok: string) {
    setBusy(true); setNotice(null);
    try {
      await callFunnel(action, { projectId: selected, ...body });
      await cache.invalidateQueries({ queryKey: key });
      setNotice({ kind: 'ok', text: ok });
      toast({ title: ok });
    } catch (e) {
      if (e instanceof FunnelError && e.code === 'funnel_changed_reload') await cache.invalidateQueries({ queryKey: key });
      const text = funnelErrorMessage(e);
      setNotice({ kind: 'error', text });
      toast({ title: 'Não consegui salvar', description: text, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  // importação da planilha: um mês por vez (cada mês é validado pelo servidor); relata o que entrou e o que foi recusado
  async function importMonths(months: Record<string, Record<string, string>>) {
    setBusy(true); setNotice(null);
    const done: string[] = [];
    const failed: string[] = [];
    for (const m of Object.keys(months).sort()) {
      try { await callFunnel('save_month', { projectId: selected, month: m, values: months[m] }); done.push(m); }
      catch (e) { failed.push(`${monthLabel(m)}: ${funnelErrorMessage(e)}`); }
    }
    await cache.invalidateQueries({ queryKey: key });
    if (failed.length) setNotice({ kind: 'error', text: `${done.length} mês(es) importado(s). Não entraram: ${failed.join(' | ')}` });
    else setNotice({ kind: 'ok', text: `${done.length} mês(es) importado(s) da planilha.` });
    toast({ title: failed.length ? 'Importação parcial' : 'Importação concluída', description: `${done.length} mês(es) importado(s)${failed.length ? `, ${failed.length} recusado(s)` : ''}.`, variant: failed.length ? 'destructive' : undefined });
    setBusy(false);
  }

  const shell = 'mx-auto w-full max-w-7xl space-y-4 px-4 py-5 pb-32 sm:px-6 md:pb-10 lg:px-8';
  if (loadingProjects && !projects) return <div className={shell} aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!projects?.length) return <div className={shell}><h1 className="text-2xl font-bold">Funil de captação</h1><p className="text-muted-foreground">Crie um projeto para medir o funil dele.</p></div>;

  const idx = data ? data.months.indexOf(active) : -1;
  return (
    <div className={shell}>
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-primary">Funil de captação</p>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Onde o contato entra, onde ele fica pelo caminho</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Lance os números do mês e veja a conversão de cada passo, o que mudou desde o mês passado e onde o funil vaza. A comparação é sempre com o histórico do próprio projeto: não uso médias de mercado inventadas.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="funnel-project" className="block text-xs text-muted-foreground">Projeto</label>
            <select id="funnel-project" className="mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm" value={selected} onChange={(e) => { select(e.target.value); setMonth(''); setNotice(null); }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          {data?.configured && analysis && (
            <div className="flex items-center gap-1" role="group" aria-label="Mês">
              <Button type="button" variant="outline" size="icon" aria-label="Mês anterior" disabled={idx < 0 || idx >= data.months.length - 1} onClick={() => setMonth(data.months[idx + 1])}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-[10rem] text-center text-sm font-semibold first-letter:uppercase" aria-live="polite">{monthLabel(active)}</span>
              <Button type="button" variant="outline" size="icon" aria-label="Próximo mês" disabled={idx <= 0} onClick={() => setMonth(data.months[idx - 1])}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      </header>

      {q.isLoading && <div aria-busy="true"><Skeleton className="h-64 w-full" /></div>}
      {q.isError && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{funnelErrorMessage(q.error)} <Button size="sm" variant="outline" className="ml-2" onClick={() => q.refetch()}>Tentar de novo</Button></p>}
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded border p-3 text-sm ${notice.kind === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'}`}>{notice.text}</p>}

      {data && !data.configured && <TemplatePicker data={data} busy={busy} onPick={(config) => run('save_config', { config, expectedVersion: data.version }, 'Funil criado. Agora lance os números do mês.')} />}

      {data?.configured && data.config && analysis && (
        <>
          {analysis.filled === 0 && <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">Ainda não há números em <span className="first-letter:uppercase">{monthLabel(active)}</span>. Preencha o quadro abaixo ("Lançar os números") e o funil aparece aqui.</p>}
          {analysis.leak && <p role="status" className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm"><strong>Onde vaza:</strong> {analysis.leak.text}</p>}
          {analysis.warnings.map((w) => <p key={w} role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">{w}</p>)}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <section aria-labelledby="funnel-bars" className="min-w-0 space-y-2"><h2 id="funnel-bars" className="text-lg font-semibold">O funil do mês</h2><FunnelBars config={data.config} analysis={analysis} values={data.entries[active]} /></section>
            <section aria-labelledby="funnel-stages" className="min-w-0 space-y-2"><h2 id="funnel-stages" className="text-lg font-semibold">Cada etapa, com o seu indicador</h2><StageCards analysis={analysis} /></section>
          </div>

          <MonthForm config={data.config} month={active} values={data.entries[active]} canWrite={data.can_write} busy={busy} onSave={(values) => run('save_month', { month: active, values }, 'Números do mês salvos.')} />

          <section aria-labelledby="funnel-table" className="space-y-2"><h2 id="funnel-table" className="text-lg font-semibold">Mês a mês</h2><MonthlyTable config={data.config} entries={data.entries} months={data.months.slice(0, 6)} /></section>

          <PasteImport config={data.config} canWrite={data.can_write} busy={busy} onImport={importMonths} />

          <ConfigEditor config={data.config} version={data.version} busy={busy} canWrite={data.can_write} templateLabel={TEMPLATE_LABEL[data.config.template] || 'Personalizado'}
            onSave={(config) => run('save_config', { config, expectedVersion: data.version }, 'Ajustes do funil salvos.')}
            onReset={(id) => run('save_config', { config: configFromTemplate(id, data.council), expectedVersion: data.version }, 'Modelo trocado. Os números já lançados continuam guardados.')} />
        </>
      )}
    </div>
  );
}
