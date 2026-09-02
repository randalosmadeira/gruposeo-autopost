import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Bot, FileCheck2, Loader2, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const PRESET = 'madeira-1470-sp-2026';

type Source = {
  id: string; slug: string; title: string; source_type: string; source_filename: string | null;
  authority_level: string; factual_use_status: string; source_sha256: string; metadata: any; active: boolean;
};
type Unit = {
  id: string; unit_key: string; unit_type: string; title: string; body: string; topic: string; tags: string[];
  verification_status: string; usage_scope: string; risk_flags: string[]; priority: number; source_locator: any;
};
type Variation = {
  title: string; format: string; editorial_angle: string; summary: string; outline: string[];
  source_units: string[]; verification_notes: string[]; human_review_required: boolean;
};

const statusLabel: Record<string, string> = {
  campaign_official: 'Proposta oficial',
  campaign_authored: 'Material da campanha',
  needs_primary_source: 'Verificar fonte primária',
  needs_external_verification: 'Reconsultar fonte externa',
  prohibited_as_fact: 'Proibido como fato',
};

export default function ElectoralKnowledgeBase() {
  const { toast } = useToast();
  const db = supabase as any;
  const [sources, setSources] = useState<Source[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [verification, setVerification] = useState('all');
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('mixed');
  const [generating, setGenerating] = useState(false);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [corpusUsed, setCorpusUsed] = useState<Array<{ unit_key: string; title: string; verification_status: string; source_slug: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [{ data: sourceRows, error: sourceError }, { data: unitRows, error: unitError }] = await Promise.all([
          db.from('electoral_content_sources').select('id,slug,title,source_type,source_filename,authority_level,factual_use_status,source_sha256,metadata,active').eq('campaign_preset_id', PRESET).order('title'),
          db.from('electoral_content_units').select('id,unit_key,unit_type,title,body,topic,tags,verification_status,usage_scope,risk_flags,priority,source_locator').eq('campaign_preset_id', PRESET).order('priority', { ascending: false }).order('title'),
        ]);
        if (sourceError) throw sourceError;
        if (unitError) throw unitError;
        if (!cancelled) { setSources(sourceRows || []); setUnits(unitRows || []); }
      } catch (error) {
        toast({ title: 'Falha ao carregar a base editorial', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [db, toast]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return units.filter((unit) => {
      if (verification !== 'all' && unit.verification_status !== verification) return false;
      if (!term) return true;
      return [unit.title, unit.topic, unit.body, ...(unit.tags || [])].join(' ').toLowerCase().includes(term);
    });
  }, [search, units, verification]);

  const safeCount = units.filter((unit) => unit.usage_scope !== 'archive_only' && unit.verification_status !== 'prohibited_as_fact').length;
  const archiveCount = units.filter((unit) => unit.usage_scope === 'archive_only').length;
  const prohibitedCount = units.filter((unit) => unit.verification_status === 'prohibited_as_fact').length;

  const generateVariations = async () => {
    const q = query.trim();
    if (q.length < 3) return toast({ title: 'Informe uma pauta para criar variações.', variant: 'destructive' });
    setGenerating(true); setVariations([]); setCorpusUsed([]);
    try {
      const formats = format === 'mixed' ? ['article','faq','video-outline','carousel-outline','press-release'] : [format];
      const { data, error } = await supabase.functions.invoke('electoral-content-variations', { body: { query: q, formats, variationCount: 5 } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Agente não concluiu a geração.');
      setVariations(data.variations || []);
      setCorpusUsed(data.corpus_units_used || []);
      toast({ title: 'Variações informativas geradas', description: 'A saída continua sujeita à revisão humana e às notas de verificação.' });
    } catch (error) {
      toast({ title: 'Falha ao gerar variações', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setGenerating(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black"><BookOpen className="h-6 w-6" /> Base Editorial IA — Eleitoral</h1>
        <p className="mt-1 text-sm text-muted-foreground">Corpus versionado da campanha, classificação de confiabilidade e geração de variações editoriais com rastreabilidade de origem.</p>
      </div>

      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex gap-3 p-4 text-sm"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Regra do corpus:</strong> os arquivos brutos são preservados, mas os agentes automáticos só recebem a view segura. Trechos de persuasão política, previsões sem dados e alegações marcadas como proibidas ficam fora do contexto automático.</div></CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardContent className="p-4"><div className="text-2xl font-black">{sources.length}</div><div className="text-xs text-muted-foreground">Fontes integrais</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-black">{units.length}</div><div className="text-xs text-muted-foreground">Unidades estruturadas</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-black">{safeCount}</div><div className="text-xs text-muted-foreground">Liberadas aos agentes</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-black">{archiveCount}</div><div className="text-xs text-muted-foreground">Somente arquivo/auditoria</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-black">{prohibitedCount}</div><div className="text-xs text-muted-foreground">Proibidas como fato</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="h-5 w-5" /> Agente de variações</CardTitle><CardDescription>Cria ângulos e estruturas informativas a partir da base segura. Não produz recomendação de voto, microtargeting ou personalização persuasiva.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_240px_auto]">
            <div><Label>Pauta</Label><Textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ex.: explicar o PerifaTech; perguntas e respostas sobre a decisão do TRE-SP; economia criativa e cultura periférica" rows={3} /></div>
            <div><Label>Formato</Label><Select value={format} onValueChange={setFormat}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mixed">Pacote misto</SelectItem><SelectItem value="article">Artigo</SelectItem><SelectItem value="faq">FAQ</SelectItem><SelectItem value="video-outline">Roteiro informativo</SelectItem><SelectItem value="carousel-outline">Carrossel informativo</SelectItem><SelectItem value="press-release">Press release factual</SelectItem><SelectItem value="social-caption-informative">Legenda informativa</SelectItem></SelectContent></Select></div>
            <div className="flex items-end"><Button onClick={() => void generateVariations()} disabled={generating}>{generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Gerar variações</Button></div>
          </div>
          {corpusUsed.length > 0 && <div className="rounded-md border p-3 text-xs text-muted-foreground"><strong>Unidades usadas:</strong> {corpusUsed.map((item) => item.unit_key).join(' · ')}</div>}
          {variations.length > 0 && <div className="grid gap-3 lg:grid-cols-2">{variations.map((item, index) => <Card key={`${item.title}-${index}`} className="bg-muted/20"><CardHeader><div className="flex flex-wrap gap-2"><Badge variant="outline">{item.format}</Badge><Badge variant="secondary">revisão humana</Badge></div><CardTitle className="text-base">{item.title}</CardTitle><CardDescription>{item.editorial_angle}</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><p>{item.summary}</p><div><strong>Estrutura:</strong><ul className="mt-1 list-disc space-y-1 pl-5">{item.outline.map((line, i) => <li key={i}>{line}</li>)}</ul></div>{item.verification_notes?.length > 0 && <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3"><strong>Verificações:</strong><ul className="mt-1 list-disc pl-5">{item.verification_notes.map((note, i) => <li key={i}>{note}</li>)}</ul></div>}</CardContent></Card>)}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Fontes incorporadas</CardTitle><CardDescription>Cada fonte mantém identificação, nível de autoridade e hash do arquivo de origem.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">{loading ? <div className="text-sm text-muted-foreground">Carregando...</div> : sources.map((source) => <div key={source.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center gap-2"><strong>{source.title}</strong><Badge variant="outline">{source.source_type}</Badge><Badge variant="secondary">{source.authority_level}</Badge></div><div className="mt-2 text-xs text-muted-foreground">{source.source_filename || source.slug}</div><div className="mt-2 break-all font-mono text-[10px] text-muted-foreground">SHA-256 origem: {source.source_sha256}</div></div>)}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Unidades editoriais</CardTitle><CardDescription>Filtros ajudam a distinguir proposta oficial, conteúdo que exige fonte e material bloqueado.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_260px]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar tema, título ou tag" /></div><Select value={verification} onValueChange={setVerification}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="campaign_official">Proposta oficial</SelectItem><SelectItem value="campaign_authored">Material da campanha</SelectItem><SelectItem value="needs_primary_source">Fonte primária pendente</SelectItem><SelectItem value="needs_external_verification">Fonte externa pendente</SelectItem><SelectItem value="prohibited_as_fact">Proibido como fato</SelectItem></SelectContent></Select></div>
          <div className="space-y-2">{filtered.map((unit) => <div key={unit.id} className={`rounded-lg border p-3 ${unit.verification_status === 'prohibited_as_fact' ? 'border-red-500/30 bg-red-500/5' : ''}`}><div className="flex flex-wrap items-center gap-2"><FileCheck2 className="h-4 w-4" /><strong className="text-sm">{unit.title}</strong><Badge variant="outline">{unit.unit_type}</Badge><Badge variant={unit.verification_status === 'prohibited_as_fact' ? 'destructive' : 'secondary'}>{statusLabel[unit.verification_status] || unit.verification_status}</Badge>{unit.usage_scope === 'archive_only' && <Badge variant="destructive">fora dos agentes</Badge>}</div><p className="mt-2 text-sm text-muted-foreground">{unit.body}</p>{unit.risk_flags?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{unit.risk_flags.map((risk) => <Badge key={risk} variant="outline" className="text-[10px]"><AlertTriangle className="mr-1 h-3 w-3" />{risk}</Badge>)}</div>}</div>)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
