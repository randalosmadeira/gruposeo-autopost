import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Layers,
  Upload,
  FileSpreadsheet,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Target,
  FileText,
  BarChart3,
  Filter,
  Trash2
} from 'lucide-react';
import { 
  KeywordData, 
  AnalyzedKeyword, 
  analyzeKeywords, 
  filterPriorityKeywords,
  generateSummary 
} from '@/lib/keyword-analyzer';
import { useBulkGeneration } from '@/hooks/useBulkGeneration';
import { useProjects } from '@/hooks/useProjects';

export default function BulkKeywordGenerator() {
  const [activeTab, setActiveTab] = useState<'input' | 'analysis' | 'generation'>('input');
  const [rawKeywords, setRawKeywords] = useState('');
  const [analyzedKeywords, setAnalyzedKeywords] = useState<AnalyzedKeyword[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  
  const { projects } = useProjects();
  const bulkGen = useBulkGeneration();

  // Parse keywords from textarea (one per line or CSV format)
  const parseKeywords = useCallback((text: string): KeywordData[] => {
    const lines = text.trim().split('\n').filter(Boolean);
    
    return lines.map(line => {
      const parts = line.split(/[,\t;]/).map(p => p.trim());
      
      // Simple format: just keyword
      if (parts.length === 1) {
        return { keyword: parts[0] };
      }
      
      // Extended format: keyword, categoria, volume, dificuldade, prioridade
      return {
        keyword: parts[0],
        categoria: parts[1] || undefined,
        volume: parts[2] || undefined,
        dificuldade: parts[3] || undefined,
        prioridade: parts[4] || undefined,
        intencao: parts[5] || undefined
      };
    });
  }, []);

  const handleAnalyze = () => {
    const keywords = parseKeywords(rawKeywords);
    const analyzed = analyzeKeywords(keywords);
    setAnalyzedKeywords(analyzed);
    setSelectedKeywords(new Set(analyzed.map(k => k.keyword)));
    setActiveTab('analysis');
  };

  const handleToggleKeyword = (keyword: string) => {
    setSelectedKeywords(prev => {
      const next = new Set(prev);
      if (next.has(keyword)) {
        next.delete(keyword);
      } else {
        next.add(keyword);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const filtered = getFilteredKeywords();
    setSelectedKeywords(new Set(filtered.map(k => k.keyword)));
  };

  const handleDeselectAll = () => {
    setSelectedKeywords(new Set());
  };

  const getFilteredKeywords = () => {
    if (filterType === 'all') return analyzedKeywords;
    return analyzedKeywords.filter(k => k.tipoConteudo === filterType);
  };

  const handleStartGeneration = () => {
    const selected = analyzedKeywords.filter(k => selectedKeywords.has(k.keyword));
    bulkGen.initializeJobs(selected);
    setActiveTab('generation');
    bulkGen.startGeneration(projectId && projectId !== 'none' ? projectId : undefined);
  };

  const summary = analyzedKeywords.length > 0 ? generateSummary(analyzedKeywords) : null;
  const filteredKeywords = getFilteredKeywords();
  const selectedCount = selectedKeywords.size;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-destructive" />;
      case 'generating': return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTypeIcon = (tipo: string) => {
    switch (tipo) {
      case 'landing_page': return <Target className="w-4 h-4" />;
      case 'conteudo_misto': return <BarChart3 className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getTypeBadge = (tipo: string) => {
    const variants: Record<string, string> = {
      landing_page: 'bg-primary/10 text-primary',
      conteudo_misto: 'bg-warning/10 text-warning',
      artigo_blog: 'bg-info/10 text-info'
    };
    const labels: Record<string, string> = {
      landing_page: 'Landing',
      conteudo_misto: 'Misto',
      artigo_blog: 'Blog'
    };
    return (
      <Badge variant="outline" className={variants[tipo]}>
        {getTypeIcon(tipo)}
        <span className="ml-1">{labels[tipo]}</span>
      </Badge>
    );
  };

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Layers className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Geração em Massa</h1>
          <p className="text-muted-foreground">
            Analise keywords e gere conteúdo automaticamente com IA
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="input" className="gap-2">
            <Upload className="w-4 h-4" />
            Importar
          </TabsTrigger>
          <TabsTrigger value="analysis" disabled={analyzedKeywords.length === 0} className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Análise ({analyzedKeywords.length})
          </TabsTrigger>
          <TabsTrigger value="generation" disabled={bulkGen.jobs.length === 0} className="gap-2">
            <Sparkles className="w-4 h-4" />
            Geração
          </TabsTrigger>
        </TabsList>

        {/* Input Tab */}
        <TabsContent value="input" className="space-y-6">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5" />
                    Importar Keywords
                  </CardTitle>
                  <CardDescription>
                    Cole suas keywords (uma por linha) ou no formato CSV
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Keywords</Label>
                    <Textarea
                      placeholder={`Formato simples (uma por linha):
marketing jurídico
agência advogados
seo para escritório

Formato CSV (keyword, categoria, volume, dificuldade, prioridade):
marketing jurídico, Marketing, Alto, Média, ALTA
agência advogados, Serviços, Médio, Baixa, MÉDIA`}
                      className="min-h-[300px] font-mono text-sm"
                      value={rawKeywords}
                      onChange={(e) => setRawKeywords(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {rawKeywords.trim().split('\n').filter(Boolean).length} keywords detectadas
                    </p>
                  </div>

                  <Button 
                    className="w-full gap-2" 
                    onClick={handleAnalyze}
                    disabled={!rawKeywords.trim()}
                  >
                    <Sparkles className="w-4 h-4" />
                    Analisar Keywords
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Formato Aceito</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  <div>
                    <p className="font-medium">Simples:</p>
                    <code className="text-xs bg-muted p-1 rounded">uma keyword por linha</code>
                  </div>
                  <div>
                    <p className="font-medium">CSV/TSV:</p>
                    <code className="text-xs bg-muted p-1 rounded block">
                      keyword, categoria, volume, dificuldade, prioridade
                    </code>
                  </div>
                  <div>
                    <p className="font-medium">Volume:</p>
                    <span className="text-muted-foreground">Alto, Médio, Baixo</span>
                  </div>
                  <div>
                    <p className="font-medium">Prioridade:</p>
                    <span className="text-muted-foreground">ALTA, MÉDIA, BAIXA</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <h4 className="font-medium text-sm mb-2">Análise Automática:</h4>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Detecta intenção de busca</li>
                    <li>Calcula score de conversão</li>
                    <li>Define tipo de conteúdo ideal</li>
                    <li>Identifica foco local</li>
                    <li>Sugere estratégias de persuasão</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="space-y-6">
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold">{summary.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-primary">{summary.landingPages}</p>
                  <p className="text-xs text-muted-foreground">Landing Pages</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-warning">{summary.conteudoMisto}</p>
                  <p className="text-xs text-muted-foreground">Conteúdo Misto</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-info">{summary.artigosBlog}</p>
                  <p className="text-xs text-muted-foreground">Artigos Blog</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-success">{summary.avgScore}</p>
                  <p className="text-xs text-muted-foreground">Score Médio</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold">{summary.highPriority}</p>
                  <p className="text-xs text-muted-foreground">Alta Prioridade</p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Keywords Analisadas</CardTitle>
                <CardDescription>{selectedCount} de {filteredKeywords.length} selecionadas</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[150px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="landing_page">Landing Pages</SelectItem>
                    <SelectItem value="conteudo_misto">Conteúdo Misto</SelectItem>
                    <SelectItem value="artigo_blog">Artigos Blog</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  Selecionar Todos
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Keyword</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                      <TableHead>Intenção</TableHead>
                      <TableHead>Prioridade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredKeywords.map((kw) => (
                      <TableRow key={kw.keyword}>
                        <TableCell>
                          <Checkbox
                            checked={selectedKeywords.has(kw.keyword)}
                            onCheckedChange={() => handleToggleKeyword(kw.keyword)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {kw.keyword}
                          {kw.ehLocal && (
                            <Badge variant="outline" className="ml-2 text-xs">Local</Badge>
                          )}
                        </TableCell>
                        <TableCell>{getTypeBadge(kw.tipoConteudo)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={kw.scoreConversao >= 70 ? 'default' : 'secondary'}>
                            {kw.scoreConversao}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {kw.intencao}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            (kw.prioridade || '').toUpperCase() === 'ALTA' 
                              ? 'border-destructive text-destructive' 
                              : ''
                          }>
                            {kw.prioridade || 'N/A'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex items-center gap-4">
            {projects && projects.length > 0 && (
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Selecionar projeto (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum projeto</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button 
              className="gap-2 flex-1" 
              size="lg"
              onClick={handleStartGeneration}
              disabled={selectedCount === 0}
            >
              <Play className="w-4 h-4" />
              Gerar {selectedCount} Artigos
            </Button>
          </div>
        </TabsContent>

        {/* Generation Tab */}
        <TabsContent value="generation" className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Progresso da Geração</CardTitle>
                <CardDescription>
                  {bulkGen.completedCount + bulkGen.errorCount} de {bulkGen.jobs.length} processados
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {bulkGen.isRunning ? (
                  <Button variant="outline" onClick={bulkGen.stopGeneration}>
                    <Pause className="w-4 h-4 mr-2" />
                    Pausar
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    onClick={() => bulkGen.startGeneration(projectId || undefined)}
                    disabled={bulkGen.jobs.every(j => j.status !== 'pending')}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Continuar
                  </Button>
                )}
                <Button variant="ghost" onClick={bulkGen.resetJobs}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress 
                value={(bulkGen.completedCount + bulkGen.errorCount) / bulkGen.jobs.length * 100} 
              />
              
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  {bulkGen.completedCount} concluídos
                </span>
                <span className="flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  {bulkGen.errorCount} erros
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  {bulkGen.jobs.filter(j => j.status === 'pending').length} pendentes
                </span>
              </div>

              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Status</TableHead>
                      <TableHead>Keyword</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="w-[200px]">Progresso</TableHead>
                      <TableHead>Resultado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkGen.jobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>{getStatusIcon(job.status)}</TableCell>
                        <TableCell className="font-medium">{job.keyword.keyword}</TableCell>
                        <TableCell>{getTypeBadge(job.keyword.tipoConteudo)}</TableCell>
                        <TableCell>
                          {job.status === 'generating' && (
                            <div className="space-y-1">
                              <Progress value={job.progress || 0} className="h-2" />
                              <span className="text-xs text-muted-foreground">
                                {job.currentStep || 'Iniciando...'} ({Math.round(job.progress || 0)}%)
                              </span>
                            </div>
                          )}
                          {job.status === 'completed' && (
                            <div className="flex items-center gap-1 text-success text-xs">
                              <CheckCircle2 className="w-3 h-3" />
                              100%
                            </div>
                          )}
                          {job.status === 'pending' && (
                            <span className="text-xs text-muted-foreground">Aguardando</span>
                          )}
                          {job.status === 'error' && (
                            <span className="text-xs text-destructive">Falhou</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {job.status === 'completed' && job.articleId && (
                            <a 
                              href={`/articles/${job.articleId}/edit`}
                              className="text-primary hover:underline"
                            >
                              Editar artigo
                            </a>
                          )}
                          {job.status === 'error' && (
                            <span className="text-destructive text-xs">{job.error}</span>
                          )}
                          {job.status === 'generating' && job.content && (
                            <span className="text-muted-foreground text-xs">
                              {job.content.split(/\s+/).length} palavras
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
