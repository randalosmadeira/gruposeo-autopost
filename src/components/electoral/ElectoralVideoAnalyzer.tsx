import { useState } from 'react';
import { FileVideo, Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  candidateName: string;
  ballotName: string;
  ballotNumber: string;
  politicalParty: string;
  campaignCnpj: string;
  fixedIssues: string[];
  selectedCities: string[];
  selectedDistricts: string[];
}

interface AnalysisResult {
  matched_issue?: string;
  title?: string;
  description?: string;
  geo_context?: string;
  tags?: string[];
  schema?: Record<string, unknown>;
  compliance?: string[];
}

export function ElectoralVideoAnalyzer(props: Props) {
  const [videoUrl, setVideoUrl] = useState('');
  const [context, setContext] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    if (!videoUrl.trim() || !context.trim()) {
      toast({ title: 'Informe a URL e o teor/contexto do vídeo.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada.');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-electoral-video-context`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          videoUrl,
          context,
          campaign: {
            candidateName: props.candidateName,
            ballotName: props.ballotName,
            ballotNumber: props.ballotNumber,
            politicalParty: props.politicalParty,
            campaignCnpj: props.campaignCnpj,
            fixedIssues: props.fixedIssues,
          },
          geography: {
            cities: props.selectedCities,
            districts: props.selectedDistricts,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setResult(payload);
    } catch (error) {
      toast({
        title: 'Falha na análise do vídeo',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><FileVideo className="h-5 w-5" /> Vídeo + análise semântica factual</CardTitle>
          <CardDescription>
            Classifica o teor informado, relaciona-o a uma pauta cadastrada e prepara metadados editoriais. Não recomenda voto nem cria persuasão personalizada por localidade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div><Label>URL do vídeo *</Label><Input placeholder="YouTube / Shorts / Instagram Reels" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} /></div>
          <div><Label>Teor / contexto rápido *</Label><Textarea rows={5} placeholder="Descreva objetivamente o que foi dito no vídeo." value={context} onChange={(event) => setContext(event.target.value)} /></div>
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Contexto territorial atual: {[...props.selectedCities, ...props.selectedDistricts].join(', ') || 'nenhum selecionado'}. A localidade é usada apenas para contextualização factual e metadados editoriais.
          </div>
          <Button onClick={handleAnalyze} disabled={isLoading || !videoUrl.trim() || !context.trim()}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Analisar vídeo
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado semântico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {result.matched_issue && <div><strong>Pauta relacionada:</strong> {result.matched_issue}</div>}
            {result.title && <div><strong>Título factual:</strong> {result.title}</div>}
            {result.description && <div><strong>Descrição:</strong> {result.description}</div>}
            {result.geo_context && <div><strong>Contexto GEO:</strong> {result.geo_context}</div>}
            {result.tags?.length ? <div className="flex flex-wrap gap-1.5">{result.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div> : null}
            {result.compliance?.length ? (
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                {result.compliance.map((item) => <div key={item}>• {item}</div>)}
              </div>
            ) : null}
            {result.schema && (
              <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">{JSON.stringify(result.schema, null, 2)}</pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
