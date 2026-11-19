import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useProjects } from '@/hooks/useProjects';
import { usePreferredProject } from '@/hooks/usePreferredProject';
import { callSpeed, speedErrorMessage, STRATEGY_LABEL, type SpeedHistory, type SpeedRunResult } from '@/lib/speed-api';
import { CompareTable, RunResult } from '@/components/speed/SpeedBoard';
import { ScheduleCard, Trend } from '@/components/speed/SpeedMonitor';
import { AlertsList } from '@/components/monitor/AlertsList';
import type { Strategy } from '../../supabase/functions/_shared/speed-core';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

/** Velocidade e Core Web Vitals: mede com as ferramentas oficiais do Google, separa laboratório de visitantes reais e acompanha ao longo do tempo. */
export default function Speed() {
  const { projects, isLoading: loadingProjects } = useProjects();
  const { selected, select } = usePreferredProject(projects || []);
  const cache = useQueryClient();
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [rival, setRival] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('mobile');
  const [busy, setBusy] = useState<'own' | 'competitor' | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [result, setResult] = useState<SpeedRunResult | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const key = useMemo(() => ['site-speed', selected], [selected]);
  const q = useQuery<SpeedHistory>({ queryKey: key, queryFn: () => callSpeed<SpeedHistory>('history', { projectId: selected }), enabled: !!selected, retry: false, refetchOnWindowFocus: false });
  const data = q.data;
  useEffect(() => { setResult(null); setNotice(null); setUrl(''); setRival(''); }, [selected]);
  const ownUrl = url.trim() || (data?.project.domain ? `https://${data.project.domain}/` : '');
  const latestOwn = data?.runs.find((r) => r.kind === 'own' && r.strategy === strategy) || null;
  const shown: SpeedRunResult | null = result || (latestOwn ? { run: latestOwn, previous: null, delta: null, field_note: latestOwn.field ? null : 'no_field_data', lab_fetched_at: null } : null);

  async function dismiss(alertId?: string) {
    setDismissing(true);
    try {
      await callSpeed('alerts_dismiss', alertId ? { projectId: selected, alertId } : { projectId: selected, all: true });
      await cache.invalidateQueries({ queryKey: key });
    } catch (e) {
      setNotice({ kind: 'error', text: speedErrorMessage(e) });
    } finally { setDismissing(false); }
  }

  async function measure(kind: 'own' | 'competitor') {
    const target = kind === 'own' ? ownUrl : rival.trim();
    if (!target) { setNotice({ kind: 'error', text: kind === 'own' ? 'Informe o endereço da página (ou cadastre o site do projeto).' : 'Informe o endereço do site do concorrente.' }); return; }
    setBusy(kind); setNotice(null);
    try {
      const r = await callSpeed<SpeedRunResult>('run', { projectId: selected, url: target, strategy, kind });
      if (kind === 'own') setResult(r);
      await cache.invalidateQueries({ queryKey: key });
      const text = `${kind === 'own' ? 'Medição concluída' : 'Concorrente medido'}: nota ${r.run.performance_score ?? 'sem dados'}.`;
      setNotice({ kind: 'ok', text });
      toast({ title: text });
      if (kind === 'competitor') setRival('');
    } catch (e) {
      const text = speedErrorMessage(e);
      setNotice({ kind: 'error', text });
      toast({ title: 'Não consegui medir', description: text, variant: 'destructive' });
    } finally { setBusy(null); }
  }

  const shell = 'mx-auto w-full max-w-7xl space-y-4 px-4 py-5 pb-32 sm:px-6 md:pb-10 lg:px-8';
  if (loadingProjects && !projects) return <div className={shell} aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!projects?.length) return <div className={shell}><h1 className="text-2xl font-bold">Velocidade</h1><p className="text-muted-foreground">Crie um projeto para medir a velocidade do site dele.</p></div>;
  const canRun = !!data?.can_run;
  return (
    <div className={shell}>
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-primary">Velocidade e Core Web Vitals</p>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Seu site é rápido de verdade?</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Meço com as ferramentas oficiais do Google e separo duas coisas que costumam ser misturadas: o <strong>teste simulado agora</strong> (laboratório) e o que os <strong>visitantes reais</strong> sentiram nos últimos 28 dias. Onde não houver dado, aparece "sem dados", nunca um número inventado.</p>
        <div><label htmlFor="speed-project" className="block text-xs text-muted-foreground">Projeto</label>
          <select id="speed-project" className="mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm" value={selected} onChange={(e) => select(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      </header>

      {data && <AlertsList alerts={data.alerts ?? []} canEdit={canRun} busy={dismissing} onDismiss={(id) => void dismiss(id)} onDismissAll={() => void dismiss()} />}
      {q.isError && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{speedErrorMessage(q.error)} <Button size="sm" variant="outline" className="ml-2" onClick={() => q.refetch()}>Tentar de novo</Button></p>}
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded border p-3 text-sm ${notice.kind === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'}`}>{notice.text}</p>}

      <form className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5" onSubmit={(e) => { e.preventDefault(); void measure('own'); }}>
        <div>
          <label htmlFor="speed-url" className="text-sm font-medium">Página para medir</label>
          <Input id="speed-url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="mt-1 h-11" placeholder={data?.project.domain ? `https://${data.project.domain}/` : 'https://meusite.com.br/'} value={url} disabled={!canRun || !!busy} onChange={(e) => setUrl(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">Deixe em branco para medir a página inicial do projeto. Pode ser qualquer página ou subdomínio do mesmo site.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1" role="group" aria-label="Aparelho">
            {(['mobile', 'desktop'] as Strategy[]).map((s) => <Button key={s} type="button" size="sm" variant={strategy === s ? 'default' : 'outline'} aria-pressed={strategy === s} disabled={!!busy} onClick={() => { setStrategy(s); setResult(null); }}>{STRATEGY_LABEL[s]}</Button>)}
          </div>
          <Button type="submit" size="lg" disabled={!canRun || !!busy}>{busy === 'own' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Medindo (até 30 s)…</> : <><Timer className="mr-2 h-4 w-4" aria-hidden />Medir agora</>}</Button>
          {data && !canRun && <p role="note" className="text-sm text-muted-foreground">Seu papel permite ver as medições, mas não fazer novas.</p>}
        </div>
      </form>

      {q.isLoading && <div aria-busy="true"><Skeleton className="h-48 w-full" /></div>}
      {!q.isLoading && !shown && <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">Ainda não há medições deste projeto no aparelho "{STRATEGY_LABEL[strategy]}". Clique em "Medir agora".</p>}
      {shown && <RunResult result={shown} />}
      {data && shown && (
        <section aria-labelledby="speed-trend" className="space-y-2 rounded-xl border bg-card/40 p-3 sm:p-5">
          <h2 id="speed-trend" className="text-lg font-semibold">Evolução da nota</h2>
          <Trend runs={data.runs} url={shown.run.url} strategy={strategy} />
        </section>
      )}
      {data && <ScheduleCard projectId={selected} domain={data.project.domain} schedule={data.schedule ?? null} canEdit={canRun} onSaved={() => cache.invalidateQueries({ queryKey: key })} />}

      <section aria-labelledby="speed-compare" className="space-y-3">
        <h2 id="speed-compare" className="text-lg font-semibold">Comparar com concorrentes</h2>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void measure('competitor'); }}>
          <div className="min-w-[14rem] flex-1">
            <label htmlFor="speed-rival" className="text-sm font-medium">Site do concorrente</label>
            <Input id="speed-rival" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="mt-1 h-11" placeholder="https://concorrente.com.br/" value={rival} disabled={!canRun || !!busy} onChange={(e) => setRival(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" size="lg" disabled={!canRun || !!busy}>{busy === 'competitor' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Medindo…</> : 'Medir concorrente'}</Button>
        </form>
        <p className="text-xs text-muted-foreground">Mede só páginas públicas, com o mesmo método do seu site, para a comparação ser justa. Até 10 concorrentes por projeto.</p>
        {data && <CompareTable runs={data.runs} ownHost={data.project.domain} />}
      </section>
    </div>
  );
}
