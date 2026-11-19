import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  analyzeErrorMessage, callAnalyze,
  type AnalysisCheck, type AnalysisFinding, type AnalysisHistoryItem, type AnalysisReport, type CheckStatus, type FindingSeverity, type FindingState,
} from '@/lib/profile-api';

const CHECK_LABELS: Record<string, string> = {
  cnpj_formato: 'CNPJ: número válido', cnpj_receita: 'CNPJ na Receita Federal', cep: 'CEP e endereço', dominio_rdap: 'Registro do domínio',
  dns: 'DNS e e-mail do domínio', site_resposta: 'Site: resposta e página inicial', robots_txt: 'robots.txt', sitemap: 'Sitemap', llms_txt: 'llms.txt (para IAs)',
  site_idade: 'Idade do site (Wayback Machine)', redes_formato: 'Redes sociais (formato do link)', maps_google_meu_negocio: 'Google Meu Negócio e Maps (paga)', ia_marca: 'O que as IAs dizem da marca (paga)',
};
const STATUS_LABEL: Record<CheckStatus, string> = { ok: 'OK', warn: 'Atenção', fail: 'Problema', skipped: 'Não executada', error: 'Sem resposta' };
const STATUS_STYLE: Record<CheckStatus, string> = {
  ok: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100', warn: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  fail: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100', skipped: 'bg-muted text-muted-foreground', error: 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100',
};
const SEVERITY_LABEL: Record<FindingSeverity, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa', info: 'Informação' };
const SEVERITY_STYLE: Record<FindingSeverity, string> = {
  alta: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100', media: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  baixa: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100', info: 'bg-muted text-muted-foreground',
};
const RUN_LABEL: Record<string, string> = { done: 'concluído', partial: 'concluído com fontes sem resposta', failed: 'não concluído', running: 'em andamento', queued: 'na fila', cancelled: 'cancelado' };

const show = (v: unknown): string => {
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))) return v.length ? v.map((x) => show(x)).join(', ') : 'nenhum';
  const text = JSON.stringify(v) ?? '';
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
};
const measuredLines = (m: Record<string, unknown>): Array<[string, string]> => Object.entries(m).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k.replace(/_/g, ' '), show(v)]);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const newRequestKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `pedido-${Date.now()}-${Math.random().toString(36).slice(2)}`);

interface Props { projectId: string; canWrite: boolean; hasUnsaved: boolean }

/** Pente fino gratuito (P4): lê só fontes públicas, mostra só o que foi medido e registra cada achado com evidência. */
export function ProfileAnalysis({ projectId, canWrite, hasUnsaved }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [r, h] = await Promise.all([callAnalyze<AnalysisReport>('get', { projectId }), callAnalyze<{ runs: AnalysisHistoryItem[] }>('history', { projectId })]);
      setReport(r);
      setHistory(h.runs || []);
    } catch (e) {
      setNotice(analyzeErrorMessage(e));
    } finally {
      setLoaded(true);
    }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  async function start() {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const r = await callAnalyze<AnalysisReport>('start', { projectId, requestKey: newRequestKey() });
      setReport(r);
      const h = await callAnalyze<{ runs: AnalysisHistoryItem[] }>('history', { projectId }).catch(() => null);
      if (h) setHistory(h.runs || []);
    } catch (e) {
      setNotice(analyzeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function openRun(runId: string) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      setReport(await callAnalyze<AnalysisReport>('get', { projectId, runId }));
    } catch (e) {
      setNotice(analyzeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function decide(finding: AnalysisFinding, state: FindingState) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      await callAnalyze('decide_finding', { projectId, findingId: finding.id, state });
      setReport((r) => (r ? { ...r, findings: r.findings.map((f) => (f.id === finding.id ? { ...f, state } : f)) } : r));
    } catch (e) {
      setNotice(analyzeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const run = report?.run ?? null;
  const open = (report?.findings || []).filter((f) => f.state === 'open');
  const decided = (report?.findings || []).filter((f) => f.state !== 'open');

  return (
    <section aria-labelledby="pf-title" className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 id="pf-title" className="text-lg font-semibold">Pente fino gratuito</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Confere, em fontes públicas e <strong>sem custo</strong>, o CNPJ, o CEP, o registro e o DNS do domínio, o site (HTTPS, velocidade, título, mobile), o robots.txt, o sitemap, o llms.txt, a idade do site e o formato dos links das redes.
          <strong> Só aparece o que foi medido</strong>: se uma fonte não responder, a verificação mostra "sem resposta" em vez de um número inventado. As redes sociais não são acessadas, só o formato do link é conferido.
        </p>
        {hasUnsaved && <p role="status" className="mt-2 text-sm text-amber-600 dark:text-amber-400">Há alterações não salvas: salve antes, porque o pente fino usa o que já está salvo no perfil.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {canWrite ? (
            <Button disabled={busy} onClick={start} aria-busy={busy}>{busy ? 'Verificando… (até 40 segundos)' : 'Rodar o pente fino'}</Button>
          ) : <p className="text-sm text-muted-foreground">Seu papel permite ver o relatório, mas não rodar o pente fino.</p>}
          {history.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span>Execuções anteriores</span>
              <select className="rounded border bg-background px-2 py-1" value={run?.id || ''} disabled={busy} onChange={(e) => void openRun(e.target.value)}>
                {history.map((h) => <option key={h.id} value={h.id}>{when(h.created_at)} · {RUN_LABEL[h.status] || h.status}</option>)}
              </select>
            </label>
          )}
        </div>
        {notice && <p role="alert" className="mt-2 text-sm text-destructive">{notice}</p>}
      </div>

      {!loaded && <p className="text-sm text-muted-foreground" aria-busy="true">Carregando o último relatório…</p>}
      {loaded && !run && <p className="text-sm text-muted-foreground">Nenhum pente fino foi rodado neste projeto ainda.</p>}

      {run && (
        <div className="space-y-4" aria-live="polite">
          <p className="text-sm">
            Relatório de {when(run.finished_at || run.created_at)} · {RUN_LABEL[run.status] || run.status}
            {run.error ? ` (${run.error})` : ''} · {open.length} achado(s) em aberto
          </p>

          <div className="space-y-2">
            <h4 className="font-medium">O que encontramos</h4>
            {!report?.findings.length && <p className="text-sm text-muted-foreground">{run.status === 'failed' ? 'A execução não terminou.' : 'Nenhum problema encontrado nas verificações que responderam.'}</p>}
            <ul className="space-y-2">
              {open.map((f) => <FindingCard key={f.id} f={f} canWrite={canWrite} busy={busy} onDecide={decide} />)}
            </ul>
            {decided.length > 0 && (
              <details className="rounded border p-3">
                <summary className="cursor-pointer text-sm font-medium">Já resolvidos ou ignorados ({decided.length})</summary>
                <ul className="mt-2 space-y-2">{decided.map((f) => <FindingCard key={f.id} f={f} canWrite={canWrite} busy={busy} onDecide={decide} />)}</ul>
              </details>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">O que foi verificado</h4>
            <ul className="space-y-2">
              {(report?.checks || []).map((c) => <CheckCard key={c.check_key} c={c} />)}
            </ul>
            <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">
              <strong className="text-foreground">Verificações pagas não rodam aqui.</strong> Google Meu Negócio/Maps e o que as IAs dizem da marca só serão feitos depois de passar pelo portão de custo da organização.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function FindingCard({ f, canWrite, busy, onDecide }: { f: AnalysisFinding; canWrite: boolean; busy: boolean; onDecide: (f: AnalysisFinding, s: FindingState) => void }) {
  return (
    <li className="rounded border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SEVERITY_STYLE[f.severity]}`}>{SEVERITY_LABEL[f.severity]}</span>
        <span className="text-xs text-muted-foreground">{CHECK_LABELS[f.check_key] || f.check_key}</span>
        {f.state !== 'open' && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{f.state === 'applied' ? 'resolvido' : 'ignorado'}</span>}
      </div>
      <p className="mt-1 text-sm font-medium">{f.title}</p>
      {f.detail && <p className="text-sm text-muted-foreground">{f.detail}</p>}
      {f.suggested_action && <p className="mt-1 text-sm"><strong>O que fazer:</strong> {f.suggested_action}</p>}
      {canWrite && (
        <div className="mt-2 flex flex-wrap gap-2">
          {f.state === 'open' ? (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide(f, 'applied')}>Marcar como resolvido</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide(f, 'ignored')}>Ignorar</Button>
            </>
          ) : <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide(f, 'open')}>Reabrir</Button>}
        </div>
      )}
    </li>
  );
}

function CheckCard({ c }: { c: AnalysisCheck }) {
  const lines = measuredLines(c.measured || {});
  return (
    <li className="rounded border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
        <span className="text-sm font-medium">{CHECK_LABELS[c.check_key] || c.check_key}</span>
        <span className="text-xs text-muted-foreground">fonte: {c.source}{typeof c.duration_ms === 'number' && c.duration_ms > 0 ? ` · ${c.duration_ms} ms` : ''}</span>
      </div>
      {c.error && <p className="mt-1 text-sm text-muted-foreground">{c.error}</p>}
      {lines.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-muted-foreground">Ver o que foi medido</summary>
          <dl className="mt-1 grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
            {lines.map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></div>))}
          </dl>
        </details>
      )}
      {c.evidence_url && /^https?:\/\//i.test(c.evidence_url) && <p className="mt-1 break-all text-xs"><a className="underline" href={c.evidence_url} target="_blank" rel="noopener noreferrer">Fonte da medição</a></p>}
    </li>
  );
}
