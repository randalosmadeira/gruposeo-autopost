import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { ProfileAnalysis } from '@/components/profile/ProfileAnalysis';
import { callAnalyze, type AnalysisReport, type ModuleEffectPreview, type ProfilePayload } from '@/lib/profile-api';
import { createClientRequest } from '@/lib/nexus-management-api';
import { providerErrorMessage } from '@/lib/nexus-providers';
import { buildHelpSummary, isDelegable, measuredGaps, measuredGroups, type PathGap } from '@/lib/profile-path';
import { dimensionScores, profileGapsV2, type Values } from '../../../supabase/functions/_shared/profile-model';

// ------------------------------------------------------------------------------------------------------------ módulos
const PAUSED_LABEL: Record<string, string> = {
  news_agents: 'agente(s) de notícias', monitored_portals: 'portal(is) monitorado(s)', rss_schedules: 'agenda(s) de RSS',
  keyword_link_rules: 'regra(s) de links', nexus_prompts: 'pergunta(s) de acompanhamento às IAs', electoral_portal_resources: 'recurso(s) editorial(is) do portal',
};

export function ModulesStep({ payload, busy, onDecide, onPreview }: {
  payload: ProfilePayload; busy: boolean;
  onDecide: (code: string, enabled: boolean, reason: string) => void;
  onPreview: (code: string) => Promise<ModuleEffectPreview[]>;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ code: string; effects: ModuleEffectPreview[] | null; error: boolean } | null>(null);
  const decided = new Map(payload.modules.decisions.map((d) => [d.module_code, d]));

  async function askToDisable(code: string) {
    setPending({ code, effects: null, error: false });
    try {
      setPending({ code, effects: await onPreview(code), error: false });
    } catch {
      setPending({ code, effects: null, error: true });
    }
  }
  const pausedText = (paused: Record<string, number> | undefined) => Object.entries(paused || {}).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${PAUSED_LABEL[t] || t}`).join(', ');

  return (
    <div className="space-y-4">
      <p role="note" className="rounded border border-primary/30 bg-primary/5 p-3 text-sm">
        Cada projeto liga só o que tem finalidade. <strong>Desligar</strong> um módulo pausa as rotinas dele <em>neste projeto</em> e, quando todos os seus projetos o desligam, tira o atalho do menu. <strong>Nada é apagado</strong>: ao religar, voltam a rodar exatamente as rotinas que foram pausadas. Módulo sem decisão registrada continua como está.
        {!payload.can_modules && ' Só dono e administrador decidem; você vê o estado atual.'}
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {payload.modules.catalog.map((m) => {
          const d = decided.get(m.code);
          const enabled = d ? d.enabled : m.default_enabled;
          const labelId = `mod-${m.code}`;
          const paused = pausedText(d?.paused);
          const asking = pending?.code === m.code ? pending : null;
          return (
            <li key={m.code} className="flex flex-col gap-2 rounded border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id={labelId} className="font-medium">{m.name}{m.core && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">nuclear</span>}</h3>
                  {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
                </div>
                <Switch checked={enabled} disabled={busy || !payload.can_modules || m.core || !!asking} aria-labelledby={labelId}
                  onCheckedChange={(v) => (v ? onDecide(m.code, true, reasons[m.code] || '') : void askToDisable(m.code))} />
              </div>
              <p className="text-xs text-muted-foreground">
                {d ? `Decisão registrada: ${enabled ? 'ligado' : 'desligado'}${d.decided_at ? ` em ${new Date(d.decided_at).toLocaleDateString('pt-BR')}` : ''}.` : `Sem decisão registrada (padrão do sistema: ${m.default_enabled ? 'ligado' : 'desligado'}).`}
                {d?.reason ? ` Motivo: ${d.reason}` : ''}
              </p>
              {!enabled && paused && <p className="text-xs"><strong>Pausado neste projeto:</strong> {paused}. Voltam ao religar.</p>}
              {payload.can_modules && !m.core && (
                <Input aria-label={`Motivo para ${m.name} (opcional)`} className="h-8" placeholder="Motivo da decisão (opcional)" maxLength={500} value={reasons[m.code] || ''} onChange={(e) => setReasons((r) => ({ ...r, [m.code]: e.target.value }))} />
              )}
              {asking && (
                <div role="alertdialog" aria-label={`Confirmar desligamento de ${m.name}`} className="space-y-2 rounded border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
                  {asking.error ? (
                    <p>Não foi possível conferir o que seria pausado agora. Nada foi alterado.</p>
                  ) : asking.effects === null ? (
                    <p aria-busy="true">Conferindo o que seria pausado…</p>
                  ) : asking.effects.some((e) => e.active > 0) ? (
                    <p>Desligar vai pausar agora: <strong>{asking.effects.filter((e) => e.active > 0).map((e) => `${e.active} ${PAUSED_LABEL[e.table] || e.label}`).join(', ')}</strong>. Nada é apagado e, ao religar, voltam a rodar.</p>
                  ) : (
                    <p>Este módulo não tem nenhuma rotina ativa neste projeto: desligar só registra a decisão (e pode tirar o atalho do menu).</p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy || (!asking.error && asking.effects === null)} onClick={() => { const code = m.code; setPending(null); onDecide(code, false, reasons[code] || ''); }}>Confirmar desligamento</Button>
                    <Button size="sm" variant="outline" onClick={() => setPending(null)}>Cancelar</Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------ pente fino (só a verificação pública sem custo)
interface DiagnoseResult { url: string; state: string; http_status?: number; status?: number; title?: string | null; h1_count?: number }

export function AnalysisStep({ projectId, hasUnsaved, canWrite }: { projectId: string; hasUnsaved: boolean; canWrite: boolean }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DiagnoseResult[] | null>(null);
  const [declared, setDeclared] = useState<number | null>(null);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true);
    setError('');
    try {
      const { data, error: err } = await supabase.functions.invoke('nexus-business', { body: { action: 'diagnose', projectId } });
      if (err) throw err;
      setResults((data?.results as DiagnoseResult[]) || []);
      setDeclared(typeof data?.declared_assets === 'number' ? data.declared_assets : null);
    } catch {
      setError('Não foi possível verificar agora. Tente de novo em instantes.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <ProfileAnalysis projectId={projectId} canWrite={canWrite} hasUnsaved={hasUnsaved} />
      <details className="rounded border p-4">
        <summary className="cursor-pointer font-medium">Amostra rápida de endereços (versão anterior)</summary>
      <div className="mt-3">
        <h3 className="font-medium">Verificação pública, sem custo</h3>
        <p className="mt-1 text-sm text-muted-foreground">Visita até quatro endereços salvos no perfil (site, blog, redes), lê no máximo 512 KB de cada um e mostra o que encontrou. Não mede Google, Bing, redes privadas nem IAs.</p>
        {hasUnsaved && <p role="status" className="mt-2 text-sm text-amber-600 dark:text-amber-400">Há alterações não salvas: salve antes, porque a verificação usa os endereços já salvos.</p>}
        <Button className="mt-3" variant="outline" disabled={busy} onClick={run}>{busy ? 'Verificando…' : 'Verificar amostra pública sem gasto'}</Button>
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
      {results && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm text-muted-foreground">{results.length ? `${results.length} de ${declared ?? results.length} endereço(s) declarado(s) verificados.` : 'Nenhum endereço salvo para verificar. Informe o site na etapa Presença online e salve.'}</p>
          {results.map((r, i) => (
            <div key={i} className="rounded border p-3 text-sm">
              <p className="break-all font-medium">{r.url}</p>
              <p>Estado: {r.state} · HTTP: {String(r.http_status ?? r.status ?? 'não verificado')} · Título: {r.title || 'não coletado'} · H1: {r.h1_count ?? 'não medido'}</p>
            </div>
          ))}
        </div>
      )}
      </details>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------ caminho
const phase2Key = (projectId: string) => `zica:perfil-fase2:v1:${projectId}`;
const readSent = (projectId: string): string | null => { try { return localStorage.getItem(phase2Key(projectId)); } catch { return null; } };
const writeSent = (projectId: string, iso: string) => { try { localStorage.setItem(phase2Key(projectId), iso); } catch { /* sem armazenamento: só não lembra do envio */ } };
const shortDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : null);

export function PathStep({ values, projectId, projectName, canWrite }: { values: Values; projectId: string; projectName: string; canWrite: boolean }) {
  const scores = dimensionScores(values);
  const declaredGaps = profileGapsV2(values);
  const color = (n: number) => (n >= 70 ? 'bg-emerald-500' : n >= 40 ? 'bg-amber-500' : 'bg-red-500');

  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [reportLoaded, setReportLoaded] = useState(false);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(() => readSent(projectId));
  const [help, setHelp] = useState('');

  useEffect(() => {
    let alive = true;
    callAnalyze<AnalysisReport>('get', { projectId })
      .then((r) => { if (alive) setReport(r); })
      .catch(() => { /* sem relatório: o caminho mostra só o declarado e convida a rodar o pente fino */ })
      .finally(() => { if (alive) setReportLoaded(true); });
    return () => { alive = false; };
  }, [projectId]);

  const run = report?.run ?? null;
  const groups = measuredGroups(report?.checks || []);
  const measuredTotal = groups.reduce((n, g) => n + g.measured, 0);
  const gaps: PathGap[] = [
    ...declaredGaps.map((g) => ({ ...g, source: 'respostas' as const })),
    ...measuredGaps(report?.findings || []),
  ];
  const delegable = gaps.filter((g) => isDelegable(g.who)).map((g) => g.item);
  const high = (report?.findings || []).filter((f) => f.state === 'open' && f.severity === 'alta').map((f) => f.title);
  const summary = buildHelpSummary({ projectName, delegable, highFindings: high, measuredAt: shortDate(run?.finished_at || run?.created_at) });

  async function send() {
    if (sending) return;
    setSending(true);
    setHelp('');
    try {
      await createClientRequest(projectId, { kind: 'other', message: summary });
      const iso = new Date().toISOString();
      writeSent(projectId, iso);
      setSentAt(iso);
      setPreview(false);
      setHelp('Pedido enviado ao gestor. A resposta aparece no painel, em Motores, na aba Solicitações.');
    } catch (e) {
      setHelp(providerErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 font-medium">Maturidade da marca</h3>
        <h4 className="mb-1 text-sm font-medium text-muted-foreground">Declarada (das suas respostas)</h4>
        <ul className="grid gap-2 md:grid-cols-2">
          {scores.map((s) => (
            <li key={s.name} className="flex items-center gap-3 rounded border p-3">
              <span className="w-40 text-sm">{s.name}</span>
              {s.score === null ? (
                <span className="text-sm italic text-muted-foreground">sem dados ainda</span>
              ) : (
                <>
                  <span className="w-8 text-sm tabular-nums">{s.score}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded bg-muted" role="img" aria-label={`${s.name}: ${s.score} de 100`}><span className={`block h-full ${color(s.score)}`} style={{ width: `${s.score}%` }} /></span>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Calculado só das suas respostas: onde você não respondeu aparece "sem dados", nunca um número inventado.</p>
      </div>

      <div>
        <h4 className="mb-1 text-sm font-medium text-muted-foreground">Medida (do pente fino)</h4>
        {!reportLoaded && <p className="text-sm text-muted-foreground" aria-busy="true">Carregando a última medição…</p>}
        {reportLoaded && (!run || measuredTotal === 0) && (
          <p className="rounded border p-3 text-sm text-muted-foreground">{run ? 'A última medição não obteve resposta das fontes. Rode o pente fino de novo na etapa 10.' : 'Ainda não há medição. Rode o pente fino (etapa 10) para ver a maturidade medida do site, do domínio e da empresa.'}</p>
        )}
        {run && measuredTotal > 0 && (
          <>
            <ul className="grid gap-2 md:grid-cols-2">
              {groups.map((g) => (
                <li key={g.key} className="flex items-center gap-3 rounded border p-3">
                  <span className="w-40 text-sm">{g.name}</span>
                  {g.score === null ? (
                    <span className="text-sm italic text-muted-foreground">sem medição</span>
                  ) : (
                    <>
                      <span className="w-8 text-sm tabular-nums">{g.score}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded bg-muted" role="img" aria-label={`${g.name} (medido): ${g.score} de 100`}><span className={`block h-full ${color(g.score)}`} style={{ width: `${g.score}%` }} /></span>
                      <span className="text-[11px] text-muted-foreground">{g.measured} medida(s){g.unmeasured ? `, ${g.unmeasured} sem resposta` : ''}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Medido em {shortDate(run.finished_at || run.created_at)} com fontes públicas. Verificação sem resposta não conta, nem como zero. Google Meu Negócio e o que as IAs dizem da marca são pagos e ainda não foram medidos.</p>
          </>
        )}
      </div>

      <div>
        <h3 className="mb-2 font-medium">Lacunas e quem faz</h3>
        {gaps.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b"><th className="p-2">O que falta</th><th className="p-2">Quem faz</th><th className="p-2">Por quê</th><th className="p-2">Origem</th></tr></thead>
              <tbody>{gaps.map((g) => <tr key={`${g.source}:${g.item}`} className="border-b align-top"><td className="p-2 font-medium">{g.item}</td><td className="p-2">{g.who}</td><td className="p-2 text-muted-foreground">{g.why}</td><td className="p-2 text-xs text-muted-foreground">{g.source === 'medido' ? 'medido no pente fino' : 'suas respostas'}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <p className="rounded border p-3 text-sm text-muted-foreground">Nenhuma lacuna apareceu com o que foi respondido e medido até aqui. Quanto mais respostas e medições, mais precisa fica esta lista.</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">"Quem faz" é uma sugestão fixa por tipo de item, não uma promessa. Achados de gravidade baixa e informações ficam só no relatório do pente fino.</p>
      </div>

      <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <h3 className="font-medium">Fase 2: quer ajuda com o que vale delegar?</h3>
        <p className="text-sm text-muted-foreground">Delegar o que exige especialista costuma sair mais barato que errar e refazer. O GRUPO SEO MKT pode assumir esses itens. O pedido vai para a fila do gestor com o resumo abaixo, gerado do seu perfil: <strong>sem dados financeiros, metas ou campos privados</strong>. Nada é contratado por esse envio.</p>
        {sentAt && <p role="status" className="text-sm">Você já enviou um pedido em {shortDate(sentAt)}. Enviar de novo cria um novo pedido.</p>}
        {!canWrite && <p className="text-sm text-muted-foreground">Seu papel permite ver o caminho, mas não enviar o pedido.</p>}
        {canWrite && !preview && <Button variant="outline" onClick={() => setPreview(true)}>{delegable.length || high.length ? 'Pedir orçamento do que vale delegar' : 'Pedir ajuda geral'}</Button>}
        {canWrite && preview && (
          <div role="dialog" aria-label="Revisar pedido de orçamento" className="space-y-2 rounded border bg-background p-3">
            <p className="text-sm font-medium">Este é o texto que será enviado:</p>
            <p className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-sm">{summary}</p>
            <p className="text-xs text-muted-foreground">{summary.length}/1000 caracteres</p>
            <div className="flex gap-2">
              <Button size="sm" disabled={sending} onClick={send}>{sending ? 'Enviando…' : 'Enviar pedido'}</Button>
              <Button size="sm" variant="outline" disabled={sending} onClick={() => setPreview(false)}>Cancelar</Button>
            </div>
          </div>
        )}
        {help && <p role="status" className="text-sm">{help}</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------ versões
export function VersionsPanel({ payload, busy, onRestore }: { payload: ProfilePayload; busy: boolean; onRestore: (version: number) => void }) {
  const [confirming, setConfirming] = useState<number | null>(null);
  if (!payload.snapshots.length) return <p className="text-sm text-muted-foreground">Ainda não há versões guardadas. Cada salvamento cria uma.</p>;
  return (
    <ul className="space-y-2">
      {payload.snapshots.map((s) => (
        <li key={s.version} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
          <span>Versão {s.version} · {new Date(s.created_at).toLocaleString('pt-BR')}{s.reason ? ` · ${s.reason}` : ''}</span>
          {payload.can_write && s.version !== payload.extended.version && (
            confirming === s.version ? (
              <span className="flex items-center gap-2">
                <span>Substituir o perfil atual por esta versão? (o financeiro não muda)</span>
                <Button size="sm" disabled={busy} onClick={() => { setConfirming(null); onRestore(s.version); }}>Restaurar</Button>
                <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>Cancelar</Button>
              </span>
            ) : (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(s.version)}>Restaurar…</Button>
            )
          )}
        </li>
      ))}
    </ul>
  );
}
