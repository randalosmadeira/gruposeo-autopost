import { useCallback, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Play, RotateCcw, Sparkles, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useBulkGeneration } from '@/hooks/useBulkGeneration';
import { useProjects } from '@/hooks/useProjects';
import { analyzeKeywords, type AnalyzedKeyword, type KeywordData } from '@/lib/keyword-analyzer';
import { defaultBulkConfig } from '@/types/bulk-generation';

type Stage = 'input' | 'review';
type SpreadsheetRow = Record<string, unknown>;

const ACCEPTED_EXTENSIONS = ['xlsx', 'xls', 'csv', 'tsv', 'ods'];
const HEADER_ALIASES = {
  keyword: ['keyword', 'palavra-chave', 'palavra chave', 'termo', 'query', 'search term'],
  volume: ['volume', 'search volume', 'vol', 'buscas mensais'],
  dificuldade: ['difficulty', 'kd', 'dificuldade'],
  intencao: ['intent', 'intenção', 'intencao'],
  prioridade: ['priority', 'prioridade'],
  categoria: ['category', 'categoria', 'grupo', 'cluster'],
} as const;

const normalizeHeader = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const asText = (value: unknown) => value == null ? '' : String(value).trim();

function findColumn(headers: string[], aliases: readonly string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.find((header) => normalizedAliases.includes(normalizeHeader(header)));
}

function rowsToKeywords(rows: SpreadsheetRow[]): KeywordData[] {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  const keywordColumn = findColumn(headers, HEADER_ALIASES.keyword) || headers.find((header) => rows.some((row) => asText(row[header]))) || headers[0];
  const volumeColumn = findColumn(headers, HEADER_ALIASES.volume);
  const difficultyColumn = findColumn(headers, HEADER_ALIASES.dificuldade);
  const intentColumn = findColumn(headers, HEADER_ALIASES.intencao);
  const priorityColumn = findColumn(headers, HEADER_ALIASES.prioridade);
  const categoryColumn = findColumn(headers, HEADER_ALIASES.categoria);

  return rows.map((row) => ({
    keyword: asText(row[keywordColumn]),
    volume: volumeColumn ? asText(row[volumeColumn]) : undefined,
    dificuldade: difficultyColumn ? asText(row[difficultyColumn]) : undefined,
    intencao: intentColumn ? asText(row[intentColumn]) : undefined,
    prioridade: priorityColumn ? asText(row[priorityColumn]) : undefined,
    categoria: categoryColumn ? asText(row[categoryColumn]) : undefined,
  })).filter((row) => row.keyword);
}

function parsePastedKeywords(text: string): KeywordData[] {
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  return parsed.data.map((parts) => ({
    keyword: asText(parts[0]),
    categoria: asText(parts[1]) || undefined,
    volume: asText(parts[2]) || undefined,
    dificuldade: asText(parts[3]) || undefined,
    prioridade: asText(parts[4]) || undefined,
    intencao: asText(parts[5]) || undefined,
  })).filter((row) => row.keyword);
}

export default function BulkKeywordGenerator() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('input');
  const [projectId, setProjectId] = useState('');
  const [rawKeywords, setRawKeywords] = useState('');
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState('');
  const [keywords, setKeywords] = useState<AnalyzedKeyword[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { projects } = useProjects();
  const bulk = useBulkGeneration();

  const project = useMemo(() => projects.find((item) => item.id === projectId), [projectId, projects]);
  const selectedKeywords = useMemo(() => keywords.filter((item) => selected.has(item.keyword)), [keywords, selected]);
  const pendingCount = bulk.jobs.filter((job) => job.status === 'pending' || job.status === 'generating').length;
  const queueProgress = bulk.jobs.length ? Math.round((bulk.completedCount / bulk.jobs.length) * 100) : 0;

  const applyKeywords = useCallback((items: KeywordData[]) => {
    const unique = Array.from(new Map(items.map((item) => [item.keyword.toLowerCase(), item])).values());
    const analyzed = analyzeKeywords(unique);
    setKeywords(analyzed);
    setSelected(new Set(analyzed.map((item) => item.keyword)));
    setStage('review');
    setError('');
  }, []);

  const parseFile = useCallback(async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError('Formato não aceito. Use XLSX, XLS, CSV, TSV ou ODS.');
      return;
    }
    setIsParsing(true);
    setError('');
    try {
      const buffer = await file.arrayBuffer();
      let rows: SpreadsheetRow[];
      if (extension === 'csv' || extension === 'tsv') {
        const text = new TextDecoder().decode(buffer);
        const parsed = Papa.parse<SpreadsheetRow>(text, { header: true, skipEmptyLines: true, delimiter: extension === 'tsv' ? '\t' : '' });
        if (parsed.errors.length && !parsed.data.length) throw new Error(parsed.errors[0].message);
        rows = parsed.data;
      } else {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!firstSheet) throw new Error('A planilha não contém uma aba legível.');
        rows = XLSX.utils.sheet_to_json<SpreadsheetRow>(firstSheet, { defval: '' });
      }
      const parsedKeywords = rowsToKeywords(rows);
      if (!parsedKeywords.length) throw new Error('Nenhuma palavra-chave foi encontrada.');
      setFileName(file.name);
      applyKeywords(parsedKeywords);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao ler a planilha.');
    } finally {
      setIsParsing(false);
    }
  }, [applyKeywords]);

  const analyzePasted = () => {
    const parsed = parsePastedKeywords(rawKeywords);
    if (!parsed.length) { setError('Cole ao menos uma palavra-chave.'); return; }
    applyKeywords(parsed);
  };

  const toggleKeyword = (keyword: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(keyword)) next.delete(keyword); else next.add(keyword);
    return next;
  });

  const startGeneration = () => {
    if (!projectId || !selectedKeywords.length) return;
    const config = {
      ...defaultBulkConfig,
      projectId,
      internalLinking: true,
      generateImages: true,
      companyName: project?.name || '',
    };
    bulk.initializeJobs(selectedKeywords);
    bulk.startGeneration(projectId, config);
  };

  const reset = () => {
    setStage('input'); setKeywords([]); setSelected(new Set()); setRawKeywords(''); setFileName(''); setError('');
  };

  return (
    <div className="container max-w-6xl space-y-6 py-6">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10"><FileSpreadsheet className="h-6 w-6 text-primary" /></div>
        <div><h1 className="text-2xl font-bold">Palavras-chave em massa</h1><p className="text-muted-foreground">Projeto, planilha, triagem e fila em duas etapas.</p></div>
      </div>

      {stage === 'input' ? (
        <Card>
          <CardHeader><CardTitle>1. Projeto e importação</CardTitle><CardDescription>O projeto fornece persona, geografia, CTA, links, política visual e conexão WordPress.</CardDescription></CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Projeto obrigatório</Label>
              <Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue placeholder="Selecionar projeto" /></SelectTrigger><SelectContent>{projects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <button type="button" className="flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/30 p-6 text-center transition hover:border-primary" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void parseFile(file); }} disabled={isParsing}>
              {isParsing ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-primary" />}
              <span className="font-semibold">Arraste a planilha ou clique para selecionar</span>
              <span className="text-sm text-muted-foreground">XLSX, XLS, CSV, TSV e ODS. Compatível com exportações comuns de ferramentas SEO.</span>
              {fileName && <Badge variant="secondary">{fileName}</Badge>}
            </button>
            <input ref={inputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv,.tsv,.ods" onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseFile(file); }} />
            <div className="space-y-2"><Label>Ou cole uma lista</Label><Textarea className="min-h-36 font-mono text-sm" value={rawKeywords} onChange={(event) => setRawKeywords(event.target.value)} placeholder="Uma palavra-chave por linha ou CSV/TSV" /></div>
            {error && <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</p>}
            <Button className="w-full gap-2" size="lg" disabled={!projectId || !rawKeywords.trim() || isParsing} onClick={analyzePasted}><Sparkles className="h-5 w-5" />Analisar lista</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>2. Revisão da fila</CardTitle><CardDescription>{selectedKeywords.length} de {keywords.length} palavras-chave selecionadas para {project?.name}.</CardDescription></div><Button variant="outline" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />Reimportar</Button></CardHeader>
            <CardContent>
              <div className="max-h-[520px] overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead className="w-12" /><TableHead>Palavra-chave</TableHead><TableHead>Tipo sugerido</TableHead><TableHead>Intenção</TableHead><TableHead>CTA/Destino</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{keywords.map((item) => <TableRow key={item.keyword}><TableCell><Checkbox checked={selected.has(item.keyword)} onCheckedChange={() => toggleKeyword(item.keyword)} /></TableCell><TableCell className="font-medium">{item.keyword}</TableCell><TableCell><Badge variant="outline">{item.tipoConteudoLabel}</Badge></TableCell><TableCell>{item.intencao}</TableCell><TableCell>{project?.name || 'Projeto'}</TableCell><TableCell><span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" />Pronto para fila</span></TableCell></TableRow>)}</TableBody></Table></div>
              <Button className="mt-6 w-full gap-2" size="lg" disabled={!selectedKeywords.length || bulk.isRunning} onClick={startGeneration}>{bulk.isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}{bulk.isRunning ? 'Gerando artigos...' : `Iniciar geração em massa (${selectedKeywords.length})`}</Button>
            </CardContent>
          </Card>

          {bulk.jobs.length > 0 && <Card><CardHeader><CardTitle>Progresso da fila</CardTitle><CardDescription>{bulk.completedCount} concluídos, {bulk.errorCount} erros, {pendingCount} pendentes.</CardDescription></CardHeader><CardContent className="space-y-3"><Progress value={queueProgress} /><div className="grid gap-2 text-sm md:grid-cols-2">{bulk.jobs.map((job) => <div key={job.id} className="flex items-center justify-between rounded border p-3"><span className="truncate">{job.keyword.keyword}</span><Badge variant={job.status === 'error' ? 'destructive' : 'secondary'}>{job.status}</Badge></div>)}</div></CardContent></Card>}
        </div>
      )}
    </div>
  );
}
