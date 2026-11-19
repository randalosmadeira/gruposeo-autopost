import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { callSpeed, speedErrorMessage, type SpeedSchedule } from '@/lib/speed-api';
import { DEFAULT_DROP_POINTS, DEVICES, DEVICES_LABEL, FREQUENCIES, FREQUENCY_LABEL, MAX_EXTRA_URLS, type Devices, type Frequency } from '../../../supabase/functions/_shared/monitor-labels';
import type { SpeedRunRow, Strategy } from '../../../supabase/functions/_shared/speed-core';

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Evolução da nota de laboratório do site (só as medições do próprio site, mesma página e mesmo aparelho). */
export function Trend({ runs, url, strategy }: { runs: SpeedRunRow[]; url: string; strategy: Strategy }) {
  const pts = runs.filter((r) => r.kind === 'own' && r.url === url && r.strategy === strategy && r.performance_score !== null).sort((a, b) => a.fetched_at.localeCompare(b.fetched_at)).slice(-30);
  if (pts.length < 2) return <p className="text-sm text-muted-foreground">A evolução da nota aparece a partir da segunda medição desta página neste aparelho.</p>;
  const W = 300; const H = 80; const PAD = 6;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (pts.length - 1);
  const y = (v: number) => H - PAD - (v / 100) * (H - PAD * 2);
  const first = pts[0]; const last = pts[pts.length - 1];
  const label = `Evolução da nota de desempenho: de ${first.performance_score} em ${when(first.fetched_at)} para ${last.performance_score} em ${when(last.fetched_at)}, ${pts.length} medições.`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-24 w-full max-w-xl">
        {[50, 90].map((g) => <line key={g} x1={PAD} x2={W - PAD} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="3 3" />)}
        <polyline fill="none" stroke="#34d399" strokeWidth={2} points={pts.map((p, i) => `${x(i)},${y(p.performance_score as number)}`).join(' ')} />
        {pts.map((p, i) => <circle key={p.id || i} cx={x(i)} cy={y(p.performance_score as number)} r={2.5} fill="#34d399" />)}
      </svg>
      <p className="text-xs text-muted-foreground">{label} Linhas pontilhadas: 50 e 90 (a partir de 90 a nota é boa).</p>
    </div>
  );
}

const FIELD = 'mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';
const pad = (list: string[]) => [...list, '', ''].slice(0, MAX_EXTRA_URLS);

/** Acompanhamento automático: o monitor mede sozinho no ritmo escolhido e avisa quando a nota cai de verdade. */
export function ScheduleCard({ projectId, domain, schedule, canEdit, onSaved }: { projectId: string; domain: string | null; schedule: SpeedSchedule | null; canEdit: boolean; onSaved: () => Promise<unknown> | void }) {
  const { toast } = useToast();
  const [frequency, setFrequency] = useState<Frequency>(schedule?.frequency ?? 'weekly');
  const [devices, setDevices] = useState<Devices>(schedule?.devices ?? 'mobile');
  const [extra, setExtra] = useState<string[]>(() => pad(schedule?.extra_urls ?? []));
  const [competitors, setCompetitors] = useState(schedule?.include_competitors ?? false);
  const [drop, setDrop] = useState(String(schedule?.alert_drop_points ?? DEFAULT_DROP_POINTS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setFrequency(schedule?.frequency ?? 'weekly'); setDevices(schedule?.devices ?? 'mobile'); setExtra(pad(schedule?.extra_urls ?? []));
    setCompetitors(schedule?.include_competitors ?? false); setDrop(String(schedule?.alert_drop_points ?? DEFAULT_DROP_POINTS)); setError(null);
  }, [projectId, schedule]);

  async function save(next: boolean) {
    setBusy(true); setError(null);
    try {
      await callSpeed('schedule_save', { projectId, schedule: { enabled: next, frequency, devices, extra_urls: extra.map((u) => u.trim()).filter(Boolean), include_competitors: competitors, alert_drop_points: Number(drop) } });
      await onSaved();
      toast({ title: next ? 'Acompanhamento automático ligado.' : 'Acompanhamento automático desligado.' });
    } catch (e) {
      const text = speedErrorMessage(e);
      setError(text);
      toast({ title: 'Não consegui salvar', description: text, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  const active = !!schedule?.enabled;
  const due = active && !!schedule && new Date(schedule.next_run_at).getTime() <= Date.now();
  return (
    <section aria-labelledby="schedule-title" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="schedule-title" className="text-lg font-semibold">Acompanhamento automático</h2>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${active ? 'border-emerald-500/50 text-emerald-300' : 'text-muted-foreground'}`}>{active ? 'Ligado' : 'Desligado'}</span>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">O sistema mede sozinho, no ritmo que o senhor escolher, e guarda cada resultado no histórico. Se a nota cair de verdade, aparece um aviso aqui. Para não dar alarme falso, comparo com a <strong>mediana das últimas 3 medições</strong>, porque a nota do laboratório oscila alguns pontos sem o site ter mudado.</p>
      {error && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(true); }}>
        <div><label htmlFor="sch-freq" className="text-sm font-medium">Frequência</label>
          <select id="sch-freq" className={FIELD} value={frequency} disabled={!canEdit || busy} onChange={(e) => setFrequency(e.target.value as Frequency)}>{FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}</select></div>
        <div><label htmlFor="sch-dev" className="text-sm font-medium">Aparelhos medidos</label>
          <select id="sch-dev" className={FIELD} value={devices} disabled={!canEdit || busy} onChange={(e) => setDevices(e.target.value as Devices)}>{DEVICES.map((d) => <option key={d} value={d}>{DEVICES_LABEL[d]}</option>)}</select></div>
        <div className="sm:col-span-2"><p className="text-sm font-medium">Páginas medidas</p>
          <p className="text-xs text-muted-foreground">A página inicial{domain ? ` (https://${domain}/)` : ''} sempre entra. Se quiser, acrescente até {MAX_EXTRA_URLS} páginas do mesmo site.</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {extra.map((u, i) => <Input key={i} aria-label={`Página extra ${i + 1}`} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="h-10" placeholder={`https://${domain || 'meusite.com.br'}/contato`} value={u} disabled={!canEdit || busy} onChange={(e) => setExtra((cur) => cur.map((v, j) => (j === i ? e.target.value : v)))} />)}
          </div></div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1 h-4 w-4" checked={competitors} disabled={!canEdit || busy} onChange={(e) => setCompetitors(e.target.checked)} /><span>Medir também os concorrentes já cadastrados (até 4, no aparelho escolhido). Usa mais medições do Google.</span></label>
        <div><label htmlFor="sch-drop" className="text-sm font-medium">Avisar quando a nota cair pelo menos</label>
          <div className="mt-1 flex items-center gap-2"><Input id="sch-drop" type="number" min={3} max={50} step={1} inputMode="numeric" className="h-10 w-24" value={drop} disabled={!canEdit || busy} onChange={(e) => setDrop(e.target.value)} /><span className="text-sm text-muted-foreground">pontos (de 3 a 50)</span></div></div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <Button type="submit" disabled={!canEdit || busy}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Salvando…</> : active ? 'Salvar mudanças' : 'Ligar acompanhamento'}</Button>
          {active && <Button type="button" variant="outline" disabled={!canEdit || busy} onClick={() => void save(false)}>Desligar</Button>}
          {!canEdit && <p role="note" className="text-sm text-muted-foreground">Seu papel permite ver o acompanhamento, mas não alterar.</p>}
        </div>
      </form>
      {schedule && <p className="text-xs text-muted-foreground" role="status">
        {active ? (due ? 'Próxima medição: na próxima rodada do monitor (roda a cada 10 minutos).' : `Próxima medição: ${when(schedule.next_run_at)}.`) : 'Desligado: nenhuma medição automática será feita.'}
        {schedule.last_run_at ? ` Última rodada completa: ${when(schedule.last_run_at)}.` : ' Nenhuma rodada completa ainda.'}
        {schedule.consecutive_failures > 0 ? ` Atenção: as últimas ${schedule.consecutive_failures} rodada(s) não conseguiram medir o site.` : ''}
      </p>}
    </section>
  );
}
