import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function NexusEditorialReview({ articleId, updatedAt, projectId }: { articleId: string; updatedAt: string; projectId: string }) {
  const [hash, setHash] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [checks, setChecks] = useState({ facts: false, benefits: false, urgency: false, destination: false });
  const labels = { facts: 'Conferi fatos, fontes e contexto', benefits: 'Benefícios, oferta e limitações estão corretos', urgency: 'Urgência tem suporte real ou foi omitida', destination: 'A próxima ação e o destino são adequados ao nicho' };
  async function evaluateAutonomously() {
    setBusy(true); setMessage('');
    try {
      const prepared = await supabase.functions.invoke('nexus-intelligence', { body: { action: 'prepare', kind: 'editorial_review', articleId, projectId } });
      if (prepared.error || !prepared.data?.operation?.id) throw new Error('Não foi possível preparar a avaliação.');
      const evaluated = await supabase.functions.invoke('nexus-intelligence', { body: { action: 'execute', operationId: prepared.data.operation.id, projectId } });
      if (evaluated.error) {
        const response = evaluated.error.context instanceof Response ? await evaluated.error.context.json().catch(() => null) : null;
        throw new Error(response?.error === 'budget_paused' ? 'Avaliação autônoma preparada. Orçamento zero: nenhuma IA paga foi acionada.' : 'Avaliação não executada. Confira orçamento, credenciais e configuração do programa NEXUS.');
      }
      setMessage(evaluated.data?.output?.pass ? 'Avaliação autônoma aprovada para esta versão. Nenhum artigo foi publicado.' : 'A IA identificou pendências. O artigo não foi aprovado automaticamente.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha na avaliação.'); }
    finally { setBusy(false); }
  }
  async function run(action: 'inspect' | 'approve') {
    setBusy(true); setMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('nexus-editorial-approval', { body: { action, articleId, expectedUpdatedAt: updatedAt, expectedHash: hash, checks } });
      if (error) {
        let description = 'Não foi possível concluir. Atualize a revisão e tente novamente.';
        if (error.context instanceof Response) {
          const response = await error.context.json().catch(() => null);
          if (response?.error) description = response.error;
        }
        throw new Error(description);
      }
      if (action === 'inspect') {
        setHash(data.hash); setIssues(data.issues || []);
        setChecks({ facts: false, benefits: false, urgency: false, destination: false });
        setMessage('Versão carregada para revisão humana. A análise estrutural não comprova exatidão factual.');
      } else {
        setHash(''); setMessage('Esta versão foi aprovada. Nenhum conteúdo foi publicado. Alterações no texto, fontes ou oferta exigem nova aprovação.');
      }
    } catch (error) { setHash(''); setMessage(error instanceof Error ? error.message : 'Falha na revisão.'); }
    finally { setBusy(false); }
  }
  return <Card className="mb-6 border-primary/25"><CardContent className="space-y-4 p-5">
    <h2 className="text-lg font-semibold">NEXUS · Revisão editorial e conversão</h2>
    <p className="text-sm text-muted-foreground">A avaliação por IA verifica evidências, utilidade, semântica, conversão e adequação ao setor. Com orçamento zero, apenas prepara a operação. A revisão manual abaixo é opcional.</p>
    <Button disabled={busy || !projectId} onClick={evaluateAutonomously}>Avaliação autônoma por IA</Button>
    <Button variant="outline" disabled={busy} onClick={() => run('inspect')}>Carregar versão para revisão</Button>
    {hash && <div className="space-y-3">{Object.entries(labels).map(([key, label]) => <label key={key} className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 accent-primary" checked={checks[key as keyof typeof checks]} onChange={e => setChecks(prev => ({ ...prev, [key]: e.target.checked }))} />{label}</label>)}
      {issues.length > 0 && <ul className="list-disc pl-5 text-sm text-destructive">{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
      <Button disabled={busy || issues.length > 0 || !Object.values(checks).every(Boolean)} onClick={() => run('approve')}>Aprovar esta versão</Button>
    </div>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </CardContent></Card>;
}
