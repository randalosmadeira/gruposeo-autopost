import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, Newspaper, Rocket, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useNewsRewriter } from '@/hooks/useNewsRewriter';
import { useProjects } from '@/hooks/useProjects';
import { useUrlAnalysis } from '@/hooks/useUrlAnalysis';

const URL_PATTERN = /^https?:\/\//i;

export default function NewsRewriter() {
  const navigate = useNavigate();
  const { projects, isLoading: isLoadingProjects } = useProjects();
  const { rewriteNews, isRewriting, progress, lastResult, lastAudit } = useNewsRewriter();
  const [projectId, setProjectId] = useState('');
  const [source, setSource] = useState('');
  const [autoPilot, setAutoPilot] = useState(true);

  const project = useMemo(() => projects.find((item) => item.id === projectId), [projectId, projects]);
  const { analyzeUrl, isAnalyzing } = useUrlAnalysis({
    projectName: project?.name,
    projectNiche: project?.description || undefined,
  });

  const isBusy = isRewriting || isAnalyzing;
  const canSubmit = Boolean(projectId && source.trim() && !isBusy);

  const handleProcess = async () => {
    if (!canSubmit) return;
    const input = source.trim();

    if (URL_PATTERN.test(input)) {
      const analysis = await analyzeUrl(input);
      if (!analysis) return;
      await rewriteNews({
        projectId,
        sourceUrl: input,
        sourceContent: analysis.content,
        sourceName: analysis.source,
        autoPilot,
      });
      return;
    }

    await rewriteNews({
      projectId,
      sourceContent: input,
      sourceName: 'Texto fornecido pelo operador',
      autoPilot,
    });
  };

  return (
    <div className="container max-w-4xl space-y-6 py-6">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Newspaper className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Republicação inteligente em 1 clique</h1>
          <p className="text-muted-foreground">A Zica extrai, contextualiza, reescreve, audita e prepara a notícia para publicação.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova republicação</CardTitle>
          <CardDescription>Selecione o destino e informe uma URL pública ou cole o texto bruto da matéria.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="project">1. Destino da publicação</Label>
            <Select value={projectId} onValueChange={setProjectId} disabled={isLoadingProjects || isBusy}>
              <SelectTrigger id="project"><SelectValue placeholder="Selecionar projeto WordPress" /></SelectTrigger>
              <SelectContent>
                {projects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">2. Fonte da notícia</Label>
            <Textarea id="source" value={source} onChange={(event) => setSource(event.target.value)} disabled={isBusy} className="min-h-44" placeholder="Cole a URL da notícia ou o texto bruto da matéria" />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-4">
            <div>
              <Label htmlFor="auto-pilot" className="font-semibold">Piloto Automático Zica</Label>
              <p className="mt-1 text-sm text-muted-foreground">Extrai fatos, aplica a persona do projeto, gera SEO, links, schema e solicitação de imagem.</p>
            </div>
            <Switch id="auto-pilot" checked={autoPilot} onCheckedChange={setAutoPilot} disabled={isBusy} />
          </div>

          <Button size="lg" className="w-full gap-2" disabled={!canSubmit} onClick={handleProcess}>
            {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
            {isBusy ? progress || 'Processando notícia...' : 'Processar e gerar artigo pronto'}
          </Button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> A publicação depende da auditoria factual, das fontes e das regras do projeto.
          </div>
        </CardContent>
      </Card>

      {lastResult && (
        <Alert className="border-success/40 bg-success/5">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span><strong>{lastResult.title}</strong><br />Status: {lastAudit?.status === 'approved' ? 'pronto para revisão/publicação' : 'revisão humana necessária'}.</span>
            <Button variant="outline" onClick={() => navigate(`/articles/${lastResult.id}`)}>Abrir artigo</Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
