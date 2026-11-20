import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AutoOptimizeError, callAutoOptimize, type AutoOptimizeState, type PilotJob, type PilotReport, type Progress,
} from '@/lib/auto-optimize-api';

export const AUTOPILOT_KEY = 'auto-optimize-state';
const MAX_STEPS = 30;

export type Phase = 'idle' | 'running' | 'review' | 'applying' | 'error';
export interface StepView { label: string; status: 'em_andamento' | 'feito' | 'parou' | 'falhou'; detail?: string }

export interface AutoPilot {
  state: AutoOptimizeState | undefined;
  loading: boolean;
  loadError: unknown;
  phase: Phase;
  steps: StepView[];
  progress: Progress | null;
  report: PilotReport | null;
  error: unknown;
  run: () => Promise<void>;
  stop: () => void;
  apply: () => Promise<boolean>;
  discard: () => Promise<void>;
  setAuto: (v: { auto?: boolean; apply_without_review?: boolean; plugin_gate?: 'avisar' | 'exigir' }) => Promise<void>;
  refresh: () => Promise<unknown>;
}

/**
 * Controlador do Piloto Automático no editor. A execução é PASSO A PASSO: `start` (bloco que não gasta IA), depois `step` repetido (no máximo
 * uma chamada pequena de IA por vez), depois `finish` (grava o rascunho de revisão). Assim cada chamada é curta e a tela mostra o progresso real.
 * `onApplied` recebe título, conteúdo e meta do artigo quando o rascunho é aplicado, para o editor refletir o novo texto.
 */
export function useAutoPilot(articleId: string, onApplied?: (fields: { title: string; content: string; excerpt: string }) => void): AutoPilot {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: [AUTOPILOT_KEY, articleId], enabled: !!articleId, staleTime: 15_000, retry: false,
    queryFn: () => callAutoOptimize<AutoOptimizeState>('get', { articleId }),
  });
  const [phase, setPhase] = useState<Phase>('idle');
  const [steps, setSteps] = useState<StepView[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<PilotReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  const stopRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const safe = <T,>(fn: (v: T) => void) => (v: T) => { if (mounted.current) fn(v); };
  const sPhase = safe(setPhase); const sSteps = safe(setSteps); const sProgress = safe(setProgress); const sReport = safe(setReport); const sError = safe(setError);
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: [AUTOPILOT_KEY, articleId] }), [qc, articleId]);

  const run = useCallback(async () => {
    stopRef.current = false;
    sError(null); sReport(null); sPhase('running'); sSteps([{ label: 'Lendo o artigo e as regras do projeto', status: 'em_andamento' }]);
    try {
      const started = await callAutoOptimize<{ job: PilotJob; progress: Progress }>('start', { articleId });
      let job = started.job; let prog = started.progress;
      sProgress(prog);
      let views: StepView[] = [{ label: 'Lendo o artigo e as regras do projeto', status: 'feito' }];
      for (let i = 0; i < MAX_STEPS && !job.done; i++) {
        if (stopRef.current) break;
        const label = prog.next[0] || (job.deterministicDone ? 'Próximo passo' : 'Correções que não gastam IA');
        views = [...views, { label, status: 'em_andamento' }]; sSteps(views);
        const r = await callAutoOptimize<{ job: PilotJob; progress: Progress }>('step', { articleId, job });
        job = r.job; prog = r.progress; sProgress(prog);
        const last = job.steps[job.steps.length - 1];
        const status: StepView['status'] = !last ? 'feito' : last.status === 'aplicado' || last.status === 'pulado' ? 'feito' : last.status === 'teto' ? 'parou' : last.status === 'rejeitado' ? 'falhou' : 'falhou';
        views = [...views.slice(0, -1), { label, status, detail: last?.detail }]; sSteps(views);
      }
      sSteps(views);
      const fin = await callAutoOptimize<{ report: PilotReport; proposal: string }>('finish', { articleId, job });
      sReport(fin.report); sPhase('review');
      await refresh();
    } catch (e) { sError(e); sPhase('error'); }
  }, [articleId, refresh]);

  const stop = useCallback(() => { stopRef.current = true; }, []);

  const apply = useCallback(async () => {
    sPhase('applying'); sError(null);
    try {
      const prop = await callAutoOptimize<{ proposal: { title: string; content: string; excerpt: string } }>('get_proposal', { articleId });
      await callAutoOptimize('apply', { articleId });
      onApplied?.({ title: prop.proposal.title, content: prop.proposal.content, excerpt: prop.proposal.excerpt });
      sPhase('idle'); await refresh();
      return true;
    } catch (e) { sError(e); sPhase('error'); return false; }
  }, [articleId, onApplied, refresh]);

  const discard = useCallback(async () => {
    try { await callAutoOptimize('discard', { articleId }); sReport(null); sPhase('idle'); await refresh(); } catch (e) { sError(e); sPhase('error'); }
  }, [articleId, refresh]);

  const setAuto = useCallback(async (v: { auto?: boolean; apply_without_review?: boolean; plugin_gate?: 'avisar' | 'exigir' }) => {
    const projectId = query.data?.article.project_id;
    if (!projectId) throw new AutoOptimizeError('project_id_required');
    await callAutoOptimize('set_auto', { projectId, ...v });
    await refresh();
  }, [query.data, refresh]);

  return { state: query.data, loading: query.isLoading, loadError: query.error, phase, steps, progress, report, error, run, stop, apply, discard, setAuto, refresh };
}
