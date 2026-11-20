import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  buildExportPackage, callLifecycle, downloadPackage, lifecycleErrorMessage, recordExportDone,
  type DeletePlan, type ExportPackage, type PurgeResult,
} from '@/lib/project-center-api';

const ON_DELETE: Record<string, string> = { cascade: 'apagado junto', 'set null': 'ficaria sem projeto (será apagado)', restrict: 'bloquearia a exclusão (será apagado antes)', 'no action': 'bloquearia a exclusão (será apagado antes)' };
const n = (v: number) => v.toLocaleString('pt-BR');

/**
 * Exclusão definitiva em etapas: 1) resumo do que será apagado, 2) exportar, 3) digitar o nome, 4) excluir.
 * Só chega aqui projeto arquivado ou totalmente vazio; o servidor confere tudo de novo (nome, exportação, papel).
 */
export function DeleteFlow({ projectId, projectName, archived, onArchive, onDeleted, onCancel }: {
  projectId: string; projectName: string; archived: boolean; onArchive: () => void; onDeleted: (r: PurgeResult) => void; onCancel: () => void;
}) {
  const plan = useQuery<DeletePlan>({ queryKey: ['project-center', 'delete-plan', projectId], queryFn: () => callLifecycle<DeletePlan>('delete_plan', { projectId }), retry: false, refetchOnWindowFocus: false, gcTime: 0 });
  const [pkg, setPkg] = useState<ExportPackage | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [exporting, setExporting] = useState(false);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const d = plan.data;
  const needsExport = !!d && !d.empty;
  const nameOk = typed.trim() === projectName.trim() && typed.trim() !== '';
  const canDelete = !!d && d.can_purge_now && nameOk && (!needsExport || ack) && !busy;

  async function doExport() {
    setExporting(true); setError(null);
    try {
      const built = await buildExportPackage(projectId, setProgress);
      const name = downloadPackage(built);
      await recordExportDone(projectId, built).catch(() => undefined);
      setPkg(built); setFileName(name);
    } catch (e) { setError(lifecycleErrorMessage(e)); } finally { setExporting(false); setProgress(''); }
  }

  async function doPurge() {
    setBusy(true); setError(null);
    try {
      const r = await callLifecycle<PurgeResult>('purge', { projectId, confirm_name: typed, export_acknowledged: ack });
      onDeleted(r);
    } catch (e) { setError(lifecycleErrorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="del-title" className="space-y-4 rounded-xl border border-red-500/40 bg-red-500/5 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="del-title" className="text-base font-semibold">Excluir definitivamente: {projectName}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
      </div>

      {plan.isLoading && <div aria-busy="true"><Skeleton className="h-24 w-full" /></div>}
      {plan.isError && <p role="alert" className="text-sm text-red-300">{lifecycleErrorMessage(plan.error)}</p>}

      {d && (
        <>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">1. O que será apagado</h4>
            {d.empty ? (
              <p className="text-sm text-muted-foreground">Este projeto está vazio (sem artigos, dados do Google, taxonomia ou medições). Pode ser excluído direto, sem arquivar e sem exportar.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{n(d.total_rows)} linha(s) em {d.groups.length} módulo(s). Isto não pode ser desfeito.</p>
                <ul className="space-y-2 text-sm">
                  {d.groups.map((g) => (
                    <li key={g.module} className="min-w-0 rounded-lg border bg-background/40 p-2">
                      <span className="flex flex-wrap justify-between gap-x-2"><span className="font-medium">{g.label}</span><span className="tabular-nums text-muted-foreground">{n(g.rows)} linhas</span></span>
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {g.tables.map((t) => <li key={t.table} className="break-words">{t.table}: {n(t.rows)} ({ON_DELETE[t.on_delete] || t.on_delete})</li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
                {d.would_orphan.length > 0 && <p role="note" className="rounded border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-200">Atenção: {d.would_orphan.map((t) => `${t.table} (${n(t.rows)})`).join(', ')} ficariam sem projeto em uma exclusão comum. Aqui eles são apagados junto, para não sobrar dado órfão.</p>}
              </>
            )}
            {d.without_fk.length > 0 && <p role="note" className="text-xs text-muted-foreground">Tabelas com dados deste projeto sem vínculo formal (não serão apagadas, confira depois): {d.without_fk.map((t) => `${t.table}${t.rows === null ? '' : ` (${n(t.rows)})`}`).join(', ')}.</p>}
          </div>

          {d.requires_archive ? (
            <div className="space-y-2">
              <p role="note" className="text-sm">Para excluir, primeiro <strong>arquive</strong> o projeto. Arquivar é reversível e é o passo de segurança antes da exclusão.</p>
              <Button type="button" variant="outline" onClick={onArchive}>Arquivar agora</Button>
            </div>
          ) : (
            <>
              {needsExport && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">2. Exportar os dados</h4>
                  <p className="text-xs text-muted-foreground">Gera um arquivo .json no seu computador, com o conteúdo de cada módulo. Senhas, tokens e chaves nunca entram. O arquivo não é enviado a ninguém.</p>
                  <Button type="button" variant="outline" disabled={exporting} onClick={() => void doExport()}>
                    {exporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Montando… {progress}</> : <><Download className="mr-2 h-4 w-4" aria-hidden />{pkg ? 'Exportar de novo' : 'Exportar e baixar'}</>}
                  </Button>
                  {pkg && <p role="status" className="text-sm text-emerald-300">Arquivo {fileName} gerado: {n(pkg.totals.rows)} linha(s) em {n(pkg.totals.tables)} tabela(s).</p>}
                  {pkg && pkg.warnings.length > 0 && <ul role="note" className="space-y-0.5 text-xs text-amber-200">{pkg.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                  <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>Confirmo que exportei os dados (ou que não preciso deles).</span></label>
                </div>
              )}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">{needsExport ? '3' : '2'}. Digite o nome do projeto para confirmar</h4>
                <label htmlFor="del-name" className="block text-xs text-muted-foreground">Digite exatamente: <strong className="break-all text-foreground">{projectName}</strong></label>
                <Input id="del-name" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} className="h-11" />
                <Button type="button" variant="destructive" disabled={!canDelete} onClick={() => void doPurge()}>
                  {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Excluindo…</> : <><Trash2 className="mr-2 h-4 w-4" aria-hidden />Excluir definitivamente</>}
                </Button>
                {!archived && !d.empty && <p className="text-xs text-muted-foreground">O projeto precisa estar arquivado.</p>}
              </div>
            </>
          )}
        </>
      )}
      {error && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}
    </section>
  );
}
