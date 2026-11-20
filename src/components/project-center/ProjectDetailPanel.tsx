import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Loader2, PauseCircle, PlayCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { callLifecycle, lifecycleErrorMessage, type HealthDetail, type IntegrityResponse, type PurgeResult } from '@/lib/project-center-api';
import { ConnectionMapView } from './ConnectionMapView';
import { DeleteFlow } from './DeleteFlow';
import { ITEM_STYLE, STATE_STYLE, fmtDateTime } from './state-style';

const AREAS: Array<{ key: string; label: string }> = [
  { key: 'conexoes', label: 'Conexões' }, { key: 'atividade', label: 'Atividade' }, { key: 'resultado', label: 'Resultado' }, { key: 'estrutura', label: 'Estrutura' }, { key: 'risco', label: 'Risco' },
];
const LEVEL: Record<string, string> = { critico: 'text-red-300', atencao: 'text-amber-300', info: 'text-sky-300' };

/** Detalhe de um projeto na Central: saúde item a item, sugestões, mapa de conexões, integridade, linha do tempo e ações do ciclo de vida. */
export function ProjectDetailPanel({ projectId, canManage, canDelete, onChanged, onDeleted }: { projectId: string; canManage: boolean; canDelete: boolean; onChanged: () => void; onDeleted: (r: PurgeResult) => void }) {
  const { toast } = useToast();
  const cache = useQueryClient();
  const q = useQuery<HealthDetail>({ queryKey: ['project-center', 'detail', projectId], queryFn: () => callLifecycle<HealthDetail>('health_detail', { projectId }), retry: false, refetchOnWindowFocus: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [mergeHelp, setMergeHelp] = useState(false);
  const [integrity, setIntegrity] = useState<IntegrityResponse | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function run(action: 'pause' | 'resume' | 'archive' | 'restore', done: string) {
    setBusy(action); setNotice(null);
    try {
      await callLifecycle(action, { projectId, ...(action === 'pause' && reason.trim() ? { reason: reason.trim() } : {}) });
      setNotice({ kind: 'ok', text: done }); toast({ title: done });
      setReason('');
      await cache.invalidateQueries({ queryKey: ['project-center'] });
      await cache.invalidateQueries({ queryKey: ['projects'] });
      onChanged();
    } catch (e) { const text = lifecycleErrorMessage(e); setNotice({ kind: 'error', text }); toast({ title: 'Não consegui concluir', description: text, variant: 'destructive' }); } finally { setBusy(null); }
  }
  async function verify() {
    setBusy('integrity'); setNotice(null);
    try { setIntegrity(await callLifecycle<IntegrityResponse>('integrity_report', { projectId })); }
    catch (e) { setNotice({ kind: 'error', text: lifecycleErrorMessage(e) }); } finally { setBusy(null); }
  }

  if (q.isLoading) return <div aria-busy="true"><Skeleton className="h-64 w-full" /></div>;
  if (q.isError || !q.data) return <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{lifecycleErrorMessage(q.error)} <Button size="sm" variant="outline" className="ml-2" onClick={() => q.refetch()}>Tentar de novo</Button></p>;

  const { health, map, timeline } = q.data;
  const st = STATE_STYLE[health.state];
  const status = health.lifecycle_status;
  const archived = status === 'arquivado';

  return (
    <article aria-label={`Detalhe de ${health.name}`} className="min-w-0 space-y-5 rounded-xl border bg-card/40 p-3 sm:p-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-bold">{health.name}</h2>
            <p className="break-all text-sm text-muted-foreground">{health.domain || 'sem domínio'}</p>
          </div>
          <div className="text-right">
            <span className="block text-3xl font-bold tabular-nums leading-none">{health.score === null ? '–' : health.score}</span>
            <span className="text-xs text-muted-foreground">{health.score === null ? 'sem nota' : 'de 100'}</span>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${st.badge}`}><span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden />{st.label}</span>
        <p className="break-words text-sm">{health.reason}</p>
        <p className="text-xs text-muted-foreground">Última atividade conhecida: {health.last_activity_at ? `${fmtDateTime(health.last_activity_at)}${health.days_inactive !== null ? ` (há ${health.days_inactive} dia(s))` : ''}` : 'sem dados'}.</p>
      </header>

      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded border p-2 text-sm ${notice.kind === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'}`}>{notice.text}</p>}

      <section aria-labelledby="pc-actions" className="space-y-2">
        <h3 id="pc-actions" className="text-base font-semibold">Ações</h3>
        {!canManage && <p role="note" className="text-sm text-muted-foreground">Seu papel permite ver, mas não pausar, arquivar ou excluir.</p>}
        <div className="flex flex-wrap items-end gap-2">
          {status === 'ativo' && (
            <div className="flex min-w-0 flex-wrap items-end gap-2">
              <div className="min-w-0"><label htmlFor="pc-reason" className="block text-xs text-muted-foreground">Motivo da pausa (opcional)</label><Input id="pc-reason" className="h-10 w-full sm:w-64" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} disabled={!canManage} /></div>
              <Button type="button" variant="outline" disabled={!canManage || busy !== null} onClick={() => void run('pause', 'Projeto pausado: agendamentos e agentes desligados.')}>{busy === 'pause' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <PauseCircle className="mr-2 h-4 w-4" aria-hidden />}Pausar</Button>
            </div>
          )}
          {status === 'pausado' && <Button type="button" variant="outline" disabled={!canManage || busy !== null} onClick={() => void run('resume', 'Projeto retomado: o que estava ligado voltou a ligar.')}>{busy === 'resume' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <PlayCircle className="mr-2 h-4 w-4" aria-hidden />}Retomar</Button>}
          {!archived && <Button type="button" variant="outline" disabled={!canManage || busy !== null} onClick={() => void run('archive', 'Projeto arquivado. Dá para restaurar quando quiser.')}>{busy === 'archive' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Archive className="mr-2 h-4 w-4" aria-hidden />}Arquivar</Button>}
          {archived && <Button type="button" variant="outline" disabled={!canManage || busy !== null} onClick={() => void run('restore', 'Projeto restaurado.')}>{busy === 'restore' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden />}Restaurar</Button>}
          {canDelete && !deleting && <Button type="button" variant="ghost" className="text-red-300 hover:text-red-200" disabled={busy !== null} onClick={() => setDeleting(true)}><Trash2 className="mr-2 h-4 w-4" aria-hidden />Excluir definitivamente…</Button>}
        </div>
        <p className="text-xs text-muted-foreground">Pausar desliga os agendamentos e agentes do projeto e guarda o que estava ligado. Arquivar tira o projeto das listas; nada é apagado e dá para restaurar.</p>
      </section>

      {deleting && canDelete && (
        <DeleteFlow projectId={projectId} projectName={health.name} archived={archived}
          onArchive={() => void run('archive', 'Projeto arquivado. Agora você pode seguir com a exclusão.')}
          onCancel={() => setDeleting(false)}
          onDeleted={(r) => { setDeleting(false); toast({ title: 'Projeto excluído definitivamente', description: `${r.total_rows.toLocaleString('pt-BR')} linha(s) removidas.` }); void cache.invalidateQueries({ queryKey: ['project-center'] }); void cache.invalidateQueries({ queryKey: ['projects'] }); onDeleted(r); }} />
      )}

      {health.suggestions.length > 0 && (
        <section aria-labelledby="pc-sug" className="space-y-2">
          <h3 id="pc-sug" className="text-base font-semibold">Sugestões (você decide)</h3>
          <ul className="space-y-2">
            {health.suggestions.map((s) => (
              <li key={s.key} className="min-w-0 rounded-lg border border-amber-400/30 bg-amber-400/5 p-2.5 text-sm">
                <span className="break-words">{s.text}</span>
                <span className="mt-2 flex flex-wrap gap-2">
                  {s.kind === 'arquivar' && canManage && !archived && <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void run('archive', 'Projeto arquivado. Dá para restaurar quando quiser.')}>Arquivar</Button>}
                  {s.kind === 'mesclar' && <Button type="button" size="sm" variant="outline" onClick={() => setMergeHelp((v) => !v)}>Mesclar manualmente</Button>}
                </span>
              </li>
            ))}
          </ul>
          {mergeHelp && <p role="note" className="rounded border p-2 text-sm text-muted-foreground">O Zica não mescla projetos sozinho, para não perder dado. Para juntar: confira os dois projetos, reconecte o Google e o WordPress no que você vai manter, copie o que for útil (perfil, taxonomia, funil) e depois arquive o outro. Se fosse só um teste, basta arquivar.</p>}
        </section>
      )}

      {!archived && (
        <section aria-labelledby="pc-items" className="space-y-3">
          <h3 id="pc-items" className="text-base font-semibold">Saúde, item a item</h3>
          {AREAS.map((a) => {
            const items = health.items.filter((i) => i.area === a.key);
            if (!items.length) return null;
            return (
              <div key={a.key}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{a.label}</h4>
                <ul className="mt-1 space-y-1.5">
                  {items.map((i) => (
                    <li key={i.key} className="min-w-0 rounded-lg border bg-background/40 p-2 text-sm">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2"><span className="font-medium">{i.label}</span><span className={`text-xs ${ITEM_STYLE[i.status].cls}`}>{ITEM_STYLE[i.status].label}</span></span>
                      <span className="block break-words text-muted-foreground">{i.detail}</span>
                      <span className="block text-xs text-muted-foreground">Fonte: {i.source}{i.date ? ` · ${fmtDateTime(i.date)}` : ''}</span>
                      {i.action && <span className="mt-0.5 block break-words text-xs text-amber-200">O que fazer: {i.action}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      <section aria-labelledby="pc-map" className="space-y-2">
        <h3 id="pc-map" className="text-base font-semibold">Mapa de conexões</h3>
        <ConnectionMapView map={map} />
      </section>

      <section aria-labelledby="pc-int" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="pc-int" className="text-base font-semibold">Verificador de integridade</h3>
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void verify()}>{busy === 'integrity' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />}Verificar agora</Button>
        </div>
        {!integrity && <p className="text-sm text-muted-foreground">Procura dado sem projeto, vínculos quebrados e módulos com dado parado. Nada é alterado.</p>}
        {integrity && (
          <div className="space-y-1.5">
            <p role="status" className="text-sm">{integrity.intact ? 'Nenhum problema de integridade encontrado.' : `${integrity.totals.critico} crítico(s), ${integrity.totals.atencao} de atenção, ${integrity.totals.info} informativo(s).`}{integrity.orphan_scan === 'indisponivel' && ' A busca por dados sem projeto não pôde rodar agora.'}</p>
            <ul className="space-y-1.5">
              {integrity.issues.map((i) => <li key={i.key} className="min-w-0 rounded-lg border bg-background/40 p-2 text-sm"><span className={`mr-2 text-xs ${LEVEL[i.level]}`}>[{i.level === 'critico' ? 'crítico' : i.level === 'atencao' ? 'atenção' : 'info'}]</span><span className="break-words">{i.text}</span>{i.action && <span className="mt-0.5 block break-words text-xs text-amber-200">O que fazer: {i.action}</span>}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="pc-time" className="space-y-2">
        <h3 id="pc-time" className="text-base font-semibold">Linha do tempo</h3>
        {timeline.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> : (
          <ol className="space-y-1.5 text-sm">
            {timeline.slice(0, 40).map((t, i) => <li key={`${t.at}-${i}`} className="min-w-0 border-l-2 pl-3"><span className="block text-xs text-muted-foreground">{fmtDateTime(t.at)} · {t.source}</span><span className="break-words">{t.text}</span></li>)}
          </ol>
        )}
      </section>
    </article>
  );
}
