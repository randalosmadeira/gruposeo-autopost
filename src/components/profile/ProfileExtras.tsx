import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import type { ProfilePayload } from '@/lib/profile-api';
import { dimensionScores, profileGapsV2, type Values } from '../../../supabase/functions/_shared/profile-model';

// ------------------------------------------------------------------------------------------------------------ módulos
export function ModulesStep({ payload, busy, onDecide }: { payload: ProfilePayload; busy: boolean; onDecide: (code: string, enabled: boolean, reason: string) => void }) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const decided = new Map(payload.modules.decisions.map((d) => [d.module_code, d]));
  return (
    <div className="space-y-4">
      <p role="note" className="rounded border border-primary/30 bg-primary/5 p-3 text-sm">
        A decisão de cada módulo fica registrada, com quem decidiu e quando. <strong>Por enquanto ela ainda não esconde o item do menu nem pausa rotinas:</strong> esse efeito entra no marco de módulos. Nada é apagado em nenhum caso.
        {!payload.can_modules && ' Só dono e administrador decidem; você vê o estado atual.'}
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {payload.modules.catalog.map((m) => {
          const d = decided.get(m.code);
          const enabled = d ? d.enabled : m.default_enabled;
          const labelId = `mod-${m.code}`;
          return (
            <li key={m.code} className="flex flex-col gap-2 rounded border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id={labelId} className="font-medium">{m.name}{m.core && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">nuclear</span>}</h3>
                  {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
                </div>
                <Switch checked={enabled} disabled={busy || !payload.can_modules || m.core} aria-labelledby={labelId} onCheckedChange={(v) => onDecide(m.code, v, reasons[m.code] || '')} />
              </div>
              <p className="text-xs text-muted-foreground">
                {d ? `Decisão registrada: ${enabled ? 'ligado' : 'desligado'}${d.decided_at ? ` em ${new Date(d.decided_at).toLocaleDateString('pt-BR')}` : ''}.` : `Sem decisão: segue o padrão (${m.default_enabled ? 'ligado' : 'desligado'}).`}
                {d?.reason ? ` Motivo: ${d.reason}` : ''}
              </p>
              {payload.can_modules && !m.core && (
                <Input aria-label={`Motivo para ${m.name} (opcional)`} className="h-8" placeholder="Motivo da decisão (opcional)" maxLength={500} value={reasons[m.code] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [m.code]: e.target.value }))} />
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

export function AnalysisStep({ projectId, hasUnsaved }: { projectId: string; hasUnsaved: boolean }) {
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
      <div className="rounded border p-4">
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
      <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Análise completa (próximo marco).</strong> CNPJ na Receita, domínio, certificado, velocidade, Google Meu Negócio e o que as IAs dizem da marca ainda não rodam aqui. Quando rodarem, cada resultado virá com a evidência e o que não foi medido aparecerá como "sem dados".
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------ caminho
export function PathStep({ values }: { values: Values }) {
  const scores = dimensionScores(values);
  const gaps = profileGapsV2(values);
  const color = (n: number) => (n >= 70 ? 'bg-emerald-500' : n >= 40 ? 'bg-amber-500' : 'bg-red-500');
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 font-medium">Maturidade da marca</h3>
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
        <p className="mt-2 text-xs text-muted-foreground">Calculado só das suas respostas. Ainda não usa medição real do site, do Google nem das IAs.</p>
      </div>
      <div>
        <h3 className="mb-2 font-medium">Lacunas na base</h3>
        {gaps.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b"><th className="p-2">O que falta</th><th className="p-2">Quem faz</th><th className="p-2">Por quê</th></tr></thead>
              <tbody>{gaps.map((g) => <tr key={g.item} className="border-b align-top"><td className="p-2 font-medium">{g.item}</td><td className="p-2">{g.who}</td><td className="p-2">{g.why}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <p className="rounded border p-3 text-sm text-muted-foreground">Nenhuma lacuna apareceu com o que foi respondido até aqui. Quanto mais respostas, mais precisa fica esta lista.</p>
        )}
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
