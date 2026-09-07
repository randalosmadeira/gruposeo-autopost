import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, FileImage, Loader2, RotateCcw, Save, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useProjects } from '@/hooks/useProjects';
import { createPlanningIdempotencyKey, estimateEditorialConsumption, prepareEditorialItems, sanitizeRequestedQuantity, type EditorialFrequency, type EditorialKeywordInput } from '@/lib/editorial-planning';
import { createEditorialPlan, type CreateEditorialPlanResult } from '@/services/editorialPlanning';
import { isValidRssUrl, parseEditorialText, parseRssSources, parseSpreadsheetBuffer, selectPlanImages, spreadsheetExtension } from '@/lib/editorial-import';

type Stage = 'input' | 'preview' | 'saved';

export default function BulkKeywordGenerator() {
  const sheetRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const nonce = useRef(crypto.randomUUID());
  const { projects } = useProjects();
  const [stage, setStage] = useState<Stage>('input');
  const [projectId, setProjectId] = useState('');
  const [config, setConfig] = useState({ name: 'Planejamento editorial em massa', portal: 'Blog institucional', category: 'Conteúdo informativo', audience: 'Público geral', city: 'São Paulo', frequency: 'once' as EditorialFrequency });
  const [rawKeywords, setRawKeywords] = useState('');
  const [rssText, setRssText] = useState('');
  const [sourceFileName, setSourceFileName] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [items, setItems] = useState(() => prepareEditorialItems([]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<CreateEditorialPlanResult|null>(null);
  const project = useMemo(() => projects.find((item) => item.id === projectId), [projects, projectId]);
  const selectedItems = useMemo(() => items.filter((item) => selected.has(item.fingerprint) && !item.duplicate), [items, selected]);
  const effectiveQuantity = sanitizeRequestedQuantity(quantity, selectedItems.length);
  const estimate = useMemo(() => estimateEditorialConsumption(effectiveQuantity), [effectiveQuantity]);
  const rssSources = useMemo(() => parseRssSources(rssText), [rssText]);
  const setField = (field: keyof typeof config, value: string) => setConfig((current) => ({ ...current, [field]: value }));

  const applyInputs = (inputs: EditorialKeywordInput[]) => {
    const prepared = prepareEditorialItems(inputs);
    if (!prepared.length) { setError('Nenhuma palavra-chave válida foi encontrada.'); return; }
    setItems(prepared); setSelected(new Set(prepared.filter((item) => !item.duplicate).map((item) => item.fingerprint)));
    setQuantity(prepared.filter((item) => !item.duplicate).length); setStage('preview'); setError('');
  };

  const parseFile = async (file: File) => {
    if (!spreadsheetExtension(file.name)) { setError('Formato não aceito. Use XLSX, XLS ou CSV.'); return; }
    setBusy(true); setError('');
    try {
      const inputs = parseSpreadsheetBuffer(await file.arrayBuffer(), file.name);
      setSourceFileName(file.name); applyInputs(inputs);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao ler a planilha.'); }
    finally { setBusy(false); }
  };

  const chooseImages = (files: FileList | null) => {
    const { accepted, rejected } = selectPlanImages(Array.from(files || []));
    setImages(accepted);
    if (rejected.length) setError(`${rejected.length} arquivo(s) ignorado(s): use JPG, PNG ou WebP de até 15 MB, máximo 100 imagens.`);
  };

  const savePlan = async () => {
    if (!projectId || !project?.organization_id) { setError('Selecione um projeto vinculado a uma organização.'); return; }
    if (Object.values(config).some((value) => value.trim().length < 2)) { setError('Preencha todos os dados editoriais.'); return; }
    const invalidRss = rssSources.find((source) => !isValidRssUrl(source.url));
    if (invalidRss) { setError(`RSS inválido: ${invalidRss.url}`); return; }
    if (!selectedItems.length) { setError('Selecione ao menos uma palavra-chave não duplicada.'); return; }
    setBusy(true); setError('');
    try {
      const result = await createEditorialPlan({ organizationId: project.organization_id, projectId, ...config, quantity: effectiveQuantity, idempotencyKey: createPlanningIdempotencyKey(projectId, selectedItems.map((item) => item.normalizedKeyword), nonce.current), items: selectedItems, rssSources, sourceFileName, ...estimate, images });
      setSaved(result); setStage('saved');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar o planejamento.'); }
    finally { setBusy(false); }
  };

  const reset = () => { nonce.current=crypto.randomUUID(); setStage('input'); setItems([]); setSelected(new Set()); setRawKeywords(''); setSourceFileName(''); setImages([]); setSaved(null); setError(''); };

  if (stage === 'saved' && saved) return <div className="container max-w-5xl py-6"><Card><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="text-success"/>Planejamento salvo para revisão</CardTitle><CardDescription>Nenhum conteúdo foi gerado ou publicado.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2"><Badge>Fila: {saved.ready}</Badge><Badge variant="outline">Duplicados: {saved.duplicates}</Badge><Badge variant="outline">Imagens: {saved.uploadedImages}</Badge><Badge variant="secondary">Revisão</Badge>{saved.idempotentReplay&&<Badge variant="outline">Reenvio idempotente</Badge>}</div><p className="font-mono text-xs">Plano: {saved.planId}</p>{saved.failedImages.length>0&&<p className="text-destructive">Imagens com falha: {saved.failedImages.join(', ')}</p>}{saved.compensationFailures.length>0&&<p role="alert" className="text-destructive">Objetos não removidos após falha de registro (reconciliar manualmente): {saved.compensationFailures.join(', ')}</p>}<div className="flex flex-wrap gap-2"><Button onClick={reset}><RotateCcw className="mr-2 h-4 w-4"/>Novo planejamento</Button><Button variant="outline" asChild><Link to="/keywords/plans">Ver fila e auditoria</Link></Button></div></CardContent></Card></div>;

  return <div className="container max-w-6xl space-y-6 py-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Planejamento editorial em massa</h1><p className="text-muted-foreground">Importe, revise e grave uma fila segura. Publicação permanece bloqueada.</p></div><Button variant="outline" asChild><Link to="/keywords/plans">Fila e auditoria</Link></Button></div>
    {stage === 'input' ? <>
      <Card><CardHeader><CardTitle>1. Destino editorial</CardTitle><CardDescription>Configuração persistida e isolada pela organização do projeto.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Projeto"><Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue placeholder="Selecionar"/></SelectTrigger><SelectContent>{projects.map((item)=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Nome"><Input value={config.name} onChange={(e)=>setField('name',e.target.value)}/></Field><Field label="Portal"><Input value={config.portal} onChange={(e)=>setField('portal',e.target.value)}/></Field>
        <Field label="Categoria"><Input value={config.category} onChange={(e)=>setField('category',e.target.value)}/></Field><Field label="Público"><Input value={config.audience} onChange={(e)=>setField('audience',e.target.value)}/></Field><Field label="Cidade"><Input value={config.city} onChange={(e)=>setField('city',e.target.value)}/></Field>
        <Field label="Frequência"><Select value={config.frequency} onValueChange={(value)=>setField('frequency',value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="once">Uma vez</SelectItem><SelectItem value="daily">Diária</SelectItem><SelectItem value="weekdays">Dias úteis</SelectItem><SelectItem value="weekly">Semanal</SelectItem><SelectItem value="monthly">Mensal</SelectItem></SelectContent></Select></Field>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>2. Palavras-chave</CardTitle><CardDescription>Texto, CSV, XLS ou XLSX. Aceita categoria, intenção, volume, dificuldade e prioridade.</CardDescription></CardHeader><CardContent className="space-y-4"><Button variant="outline" className="w-full" onClick={()=>sheetRef.current?.click()} disabled={busy}>{busy?<Loader2 className="mr-2 animate-spin"/>:<Upload className="mr-2"/>}{sourceFileName||'Selecionar planilha'}</Button><input ref={sheetRef} className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={(e)=>{const file=e.target.files?.[0];if(file)void parseFile(file);}}/><Textarea className="min-h-32 font-mono" value={rawKeywords} onChange={(e)=>setRawKeywords(e.target.value)} placeholder="palavra-chave,categoria,intenção,volume,dificuldade,prioridade"/><Button className="w-full" disabled={!projectId||!rawKeywords.trim()} onClick={()=>applyInputs(parseEditorialText(rawKeywords))}>Preparar prévia</Button></CardContent></Card>
      <Card><CardHeader><CardTitle>3. Fontes e imagens</CardTitle><CardDescription>RSS entra como pendente de validação. Imagens são privadas e vinculadas ao plano.</CardDescription></CardHeader><CardContent className="space-y-4"><Field label="RSS, uma fonte por linha"><Textarea value={rssText} onChange={(e)=>setRssText(e.target.value)} placeholder="Nome,https://exemplo.com/feed.xml"/></Field><Button variant="outline" onClick={()=>imageRef.current?.click()}><FileImage className="mr-2 h-4 w-4"/>Selecionar imagens em lote</Button><input ref={imageRef} className="hidden" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(e)=>chooseImages(e.target.files)}/>{images.length>0&&<p className="text-sm text-muted-foreground">{images.length} imagens selecionadas.</p>}</CardContent></Card>
    </> : <Card><CardHeader className="flex-row items-start justify-between"><div><CardTitle>Prévia e consumo</CardTitle><CardDescription>{selectedItems.length} válidas, {items.filter((item)=>item.duplicate).length} duplicadas na importação.</CardDescription></div><Button variant="outline" onClick={()=>setStage('input')}><RotateCcw className="mr-2 h-4 w-4"/>Editar</Button></CardHeader><CardContent className="space-y-5"><div className="flex flex-wrap gap-2"><Badge>Tokens: {estimate.estimatedTotalTokens.toLocaleString('pt-BR')}</Badge><Badge variant="outline">Créditos: {estimate.estimatedCredits}</Badge><Badge variant="outline">RSS: {rssSources.length}</Badge><Badge variant="outline">Imagens: {images.length}</Badge></div><Field label="Quantidade"><Input type="number" min={1} max={selectedItems.length} value={quantity} onChange={(e)=>setQuantity(Number(e.target.value))}/></Field><div className="max-h-[500px] overflow-auto rounded border"><Table><TableHeader><TableRow><TableHead/><TableHead>Palavra-chave</TableHead><TableHead>Categoria</TableHead><TableHead>Intenção</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{items.map((item)=><TableRow key={`${item.fingerprint}-${item.keyword}`}><TableCell><Checkbox disabled={item.duplicate} checked={selected.has(item.fingerprint)&&!item.duplicate} onCheckedChange={()=>setSelected((current)=>{const next=new Set(current);if(next.has(item.fingerprint)) next.delete(item.fingerprint); else next.add(item.fingerprint);return next;})}/></TableCell><TableCell>{item.keyword}</TableCell><TableCell>{item.category||config.category}</TableCell><TableCell>{item.intent||'A classificar'}</TableCell><TableCell><Badge variant={item.duplicate?'destructive':'outline'}>{item.duplicate?'Duplicada':'Pronta'}</Badge></TableCell></TableRow>)}</TableBody></Table></div><Button size="lg" className="w-full" disabled={busy||effectiveQuantity===0} onClick={()=>void savePlan()}>{busy?<Loader2 className="mr-2 animate-spin"/>:<Save className="mr-2"/>}{busy?'Salvando...':'Salvar fila para revisão'}</Button></CardContent></Card>}
    {error&&<p role="alert" className="flex items-center gap-2 rounded border border-destructive/30 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4"/>{error}</p>}
    <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="pt-5 text-sm"><strong>Trava de segurança:</strong> este módulo não chama geração, WordPress, agendamento ou publicação.</CardContent></Card>
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
