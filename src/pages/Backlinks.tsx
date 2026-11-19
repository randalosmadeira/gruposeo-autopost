import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useProjects } from '@/hooks/useProjects';
import { usePreferredProject } from '@/hooks/usePreferredProject';
import { callBacklinks, backlinkErrorMessage, type BacklinkData, type ImportReport, type VerifyReport } from '@/lib/backlinks-api';
import { LinksTable, SummaryPanel } from '@/components/backlinks/BacklinkBoard';
import { AlertsList } from '@/components/monitor/AlertsList';
import { ORIGINS, STATUS_LABEL, type LinkStatus } from '../../supabase/functions/_shared/backlinks-labels';

type Notice = { kind: 'ok' | 'error'; text: string } | null;
const SELECT = 'mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';
const MAX_ROUNDS = 400;

function importText(r: ImportReport): string {
  const parts = [`${r.added} link(s) novo(s) guardado(s)`];
  if (r.already_there) parts.push(`${r.already_there} já estavam na lista`);
  if (r.duplicates_in_file) parts.push(`${r.duplicates_in_file} repetido(s) no arquivo`);
  if (r.self_links) parts.push(`${r.self_links} do próprio site (ignorados)`);
  if (r.invalid) parts.push(`${r.invalid} linha(s) sem endereço de página válido`);
  if (r.over_limit) parts.push(`${r.over_limit} não couberam no limite do projeto`);
  if (r.file_truncated) parts.push('o arquivo passou de 2.000 linhas: envie o restante em outra parte');
  return `${parts.join('; ')}.`;
}

/** Backlinks: o cliente traz a lista (Search Console, Bing, Ahrefs, Semrush, Moz, planilha) e o sistema verifica cada página ao vivo. */
export default function Backlinks() {
  const { projects, isLoading: loadingProjects } = useProjects();
  const { selected, select } = usePreferredProject(projects || []);
  const cache = useQueryClient();
  const { toast } = useToast();
  const [target, setTarget] = useState('');
  const [status, setStatus] = useState<'' | LinkStatus>('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [page, setPage] = useState(0);
  const [text, setText] = useState('');
  const [origin, setOrigin] = useState('google_search_console');
  const [importTarget, setImportTarget] = useState('');
  const [busy, setBusy] = useState<'import' | 'settings' | 'alerts' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; left: number } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const stop = useRef(false);

  const key = useMemo(() => ['backlinks', selected, target, status, search, page], [selected, target, status, search, page]);
  const q = useQuery<BacklinkData>({ queryKey: key, queryFn: () => callBacklinks<BacklinkData>('get', { projectId: selected, target: target || undefined, status: status || undefined, q: search || undefined, page }), enabled: !!selected, retry: false, refetchOnWindowFocus: false });
  const data = q.data;
  const refresh = () => cache.invalidateQueries({ queryKey: ['backlinks', selected] });
  useEffect(() => { setTarget(''); setStatus(''); setSearch(''); setSearchDraft(''); setPage(0); setText(''); setImportTarget(''); setNotice(null); setProgress(null); stop.current = true; }, [selected]);
  useEffect(() => { setImportTarget(target); setPage(0); }, [target]);

  const canEdit = !!data?.can_edit;
  const ownHost = data?.project.domain ?? null;
  const fail = (e: unknown) => { const t = backlinkErrorMessage(e); setNotice({ kind: 'error', text: t }); toast({ title: 'Não consegui concluir', description: t, variant: 'destructive' }); };

  async function doImport() {
    setBusy('import'); setNotice(null);
    try {
      const r = await callBacklinks<ImportReport>('import', { projectId: selected, text, origin, target: importTarget.trim() || undefined });
      setNotice({ kind: 'ok', text: importText(r) });
      if (r.added > 0) setText('');
      setPage(0);
      if (importTarget.trim() && importTarget.trim() !== target) setTarget(importTarget.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./, ''));
      await refresh();
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  async function verifyAll() {
    setVerifying(true); setNotice(null); stop.current = false;
    let done = 0; let changes = 0; let failed = 0;
    try {
      for (let i = 0; i < MAX_ROUNDS && !stop.current; i++) {
        const r = await callBacklinks<VerifyReport>('verify', { projectId: selected, target: target || undefined });
        done += r.checked; changes += r.changes; failed += r.failed;
        setProgress({ done, left: r.remaining_pending });
        if (r.checked === 0 || r.remaining_pending === 0) break;
      }
      await refresh();
      setNotice({ kind: 'ok', text: stop.current ? `Verificação interrompida: ${done} página(s) verificada(s).` : `Verificação concluída: ${done} página(s) verificada(s), ${changes} mudança(s) de situação${failed ? `, ${failed} não consegui ler` : ''}.` });
    } catch (e) { await refresh(); fail(e); } finally { setVerifying(false); setProgress(null); }
  }

  async function verifyOne(id: string) {
    setBusyId(id); setNotice(null);
    try { await callBacklinks<VerifyReport>('verify', { projectId: selected, target: target || undefined, ids: [id] }); await refresh(); } catch (e) { fail(e); } finally { setBusyId(null); }
  }
  async function removeOne(id: string) {
    setBusyId(id); setNotice(null);
    try { await callBacklinks('remove', { projectId: selected, ids: [id] }); await refresh(); } catch (e) { fail(e); } finally { setBusyId(null); }
  }
  async function saveSettings(enabled: boolean, days: number) {
    setBusy('settings'); setNotice(null);
    try { await callBacklinks('settings_save', { projectId: selected, enabled, recheck_days: days }); await refresh(); toast({ title: enabled ? 'Reverificação automática ligada.' : 'Reverificação automática desligada.' }); } catch (e) { fail(e); } finally { setBusy(null); }
  }
  async function dismiss(alertId?: string) {
    setBusy('alerts');
    try { await callBacklinks('alerts_dismiss', alertId ? { projectId: selected, alertId } : { projectId: selected, all: true }); await refresh(); } catch (e) { fail(e); } finally { setBusy(null); }
  }

  const shell = 'mx-auto w-full max-w-7xl space-y-4 px-4 py-5 pb-32 sm:px-6 md:pb-10 lg:px-8';
  if (loadingProjects && !projects) return <div className={shell} aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!projects?.length) return <div className={shell}><h1 className="text-2xl font-bold">Backlinks</h1><p className="text-muted-foreground">Crie um projeto para acompanhar os backlinks do site dele.</p></div>;
  const pages = data ? Math.max(1, Math.ceil(data.filtered_total / data.page_size)) : 1;
  const pending = data ? data.summary.by_status.unverified : 0;
  const settings = data?.settings;
  return (
    <div className={shell}>
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-primary">Backlinks</p>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Quem está linkando para o seu site?</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Traga a lista de links que o <strong>Google Search Console</strong>, o <strong>Bing Webmaster</strong>, o Ahrefs, o Semrush ou o Moz mostram para o seu site (ou uma lista própria). Eu verifico <strong>cada página ao vivo</strong>: se ela abre, se o link continua lá, com qual texto e com qual tipo (normal, nofollow, patrocinado). Não invento links nem estimo números: só conto o que foi importado e o que a verificação viu.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="bl-project" className="block text-xs text-muted-foreground">Projeto</label>
            <select id="bl-project" className={SELECT} value={selected} onChange={(e) => select(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label htmlFor="bl-target" className="block text-xs text-muted-foreground">Site que recebe os links</label>
            <select id="bl-target" className={SELECT} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{ownHost ? `Meu site (${ownHost})` : 'Meu site'}</option>
              {(data?.targets || []).filter((t) => t.kind === 'competitor').map((t) => <option key={t.host} value={t.host}>Concorrente: {t.host} ({t.count})</option>)}
            </select></div>
        </div>
      </header>

      {data && <AlertsList alerts={data.alerts ?? []} canEdit={canEdit} busy={busy === 'alerts'} onDismiss={(id) => void dismiss(id)} onDismissAll={() => void dismiss()} />}
      {q.isError && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{backlinkErrorMessage(q.error)} <Button size="sm" variant="outline" className="ml-2" onClick={() => q.refetch()}>Tentar de novo</Button></p>}
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded border p-3 text-sm ${notice.kind === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'}`}>{notice.text}</p>}

      <section aria-labelledby="bl-import" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
        <h2 id="bl-import" className="text-lg font-semibold">1. Trazer a lista de links</h2>
        <p className="text-xs text-muted-foreground">Cole uma página por linha (o endereço da <strong>página que tem o link</strong>, não só o site) ou o conteúdo de um arquivo CSV exportado. Se o arquivo tiver colunas de âncora e tipo de link, eu aproveito. Até 2.000 linhas por vez e 5.000 links por projeto.</p>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void doImport(); }}>
          <div className="sm:col-span-2"><label htmlFor="bl-text" className="text-sm font-medium">Lista de páginas</label>
            <Textarea id="bl-text" className="mt-1 min-h-32 font-mono text-xs" placeholder={'https://blog-parceiro.com.br/artigo-sobre-direito-penal\nhttps://noticias.exemplo.com/materia-123'} value={text} disabled={!canEdit || busy === 'import'} onChange={(e) => setText(e.target.value)} /></div>
          <div><label htmlFor="bl-origin" className="text-sm font-medium">De onde veio a lista</label>
            <select id="bl-origin" className={`${SELECT} w-full`} value={origin} disabled={!canEdit || busy === 'import'} onChange={(e) => setOrigin(e.target.value)}>{Object.entries(ORIGINS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label htmlFor="bl-itarget" className="text-sm font-medium">Site que recebe os links (em branco = seu site)</label>
            <Input id="bl-itarget" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="mt-1 h-10" placeholder="concorrente.com.br" value={importTarget} disabled={!canEdit || busy === 'import'} onChange={(e) => setImportTarget(e.target.value)} /></div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={!canEdit || busy === 'import' || !text.trim()}>{busy === 'import' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Guardando…</> : <><Link2 className="mr-2 h-4 w-4" aria-hidden />Guardar lista</>}</Button>
            {data && !canEdit && <p role="note" className="text-sm text-muted-foreground">Seu papel permite ver os backlinks, mas não alterar.</p>}
            {data && <span className="text-xs text-muted-foreground">{data.limits.total_links} de {data.limits.max_links} links usados neste projeto.</span>}
          </div>
        </form>
      </section>

      <section aria-labelledby="bl-verify" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
        <h2 id="bl-verify" className="text-lg font-semibold">2. Verificar ao vivo</h2>
        <p className="text-xs text-muted-foreground">Abro cada página como um robô comum, procuro links para {data?.target.host || 'o site'} e registro a situação, o texto da âncora e o tipo. Limite honesto: eu leio o HTML que o servidor entrega; links criados por JavaScript depois do carregamento aparecem como "Link não encontrado".</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!canEdit || verifying || pending === 0} onClick={() => void verifyAll()}>{verifying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Verificando…</> : `Verificar os ${pending} ainda não verificados`}</Button>
          {verifying && <Button variant="outline" onClick={() => { stop.current = true; }}>Parar</Button>}
          {progress && <p role="status" className="text-sm text-muted-foreground">{progress.done} verificada(s); faltam {progress.left}.</p>}
          {data && pending === 0 && data.summary.total > 0 && !verifying && <p className="text-sm text-muted-foreground">Todos os links já foram verificados pelo menos uma vez.</p>}
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t pt-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={!!settings?.enabled} disabled={!canEdit || busy === 'settings'} onChange={(e) => void saveSettings(e.target.checked, settings?.recheck_days ?? 14)} />Reverificar sozinho e avisar quando um link sumir</label>
          <div><label htmlFor="bl-days" className="block text-xs text-muted-foreground">A cada</label>
            <select id="bl-days" className={SELECT} value={settings?.recheck_days ?? 14} disabled={!canEdit || busy === 'settings'} onChange={(e) => void saveSettings(!!settings?.enabled, Number(e.target.value))}>{[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}</select></div>
          <p className="text-xs text-muted-foreground">Só links do seu site geram aviso de perda. {settings?.last_run_at ? `Última rodada automática: ${new Date(settings.last_run_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.` : ''}</p>
        </div>
      </section>

      {q.isLoading && <div aria-busy="true"><Skeleton className="h-48 w-full" /></div>}
      {data && data.summary.total === 0 && <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">Ainda não há backlinks guardados para {data.target.host}. Traga a primeira lista acima.</p>}
      {data && data.summary.total > 0 && (
        <section aria-labelledby="bl-summary" className="space-y-3">
          <h2 id="bl-summary" className="text-lg font-semibold">3. O que a verificação mostra{data.target.kind === 'competitor' ? ` (concorrente ${data.target.host})` : ''}</h2>
          {data.target.kind === 'competitor' && <p className="text-xs text-muted-foreground">Esta é a lista que o senhor importou para o concorrente (por exemplo, os 100 principais links que o verificador gratuito do Ahrefs mostra). Não é o total de links dele.</p>}
          <SummaryPanel summary={data.summary} />
          <div className="flex flex-wrap items-end gap-3">
            <div><label htmlFor="bl-status" className="block text-xs text-muted-foreground">Situação</label>
              <select id="bl-status" className={SELECT} value={status} onChange={(e) => { setStatus(e.target.value as '' | LinkStatus); setPage(0); }}><option value="">Todas</option>{(Object.keys(STATUS_LABEL) as LinkStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div>
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); setPage(0); }}>
              <div><label htmlFor="bl-search" className="block text-xs text-muted-foreground">Buscar por endereço ou âncora</label>
                <Input id="bl-search" className="mt-1 h-10 w-64 max-w-full" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} /></div>
              <Button type="submit" variant="outline">Buscar</Button>
            </form>
            <p className="text-xs text-muted-foreground">{data.filtered_total} link(s) nesta visão.</p>
          </div>
          <LinksTable links={data.links} canEdit={canEdit} busyId={busyId} onVerify={(id) => void verifyOne(id)} onRemove={(id) => void removeOne(id)} />
          {pages > 1 && (
            <nav aria-label="Páginas da lista" className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 0} onClick={() => setPage(page - 1)}>Anterior</Button>
              <span className="text-sm tabular-nums">Página {page + 1} de {pages}</span>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Próxima</Button>
            </nav>
          )}
        </section>
      )}
    </div>
  );
}
