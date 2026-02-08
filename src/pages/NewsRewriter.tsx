import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  Newspaper, 
  Sparkles, 
  Loader2, 
  AlertTriangle, 
  CheckCircle2,
  Link as LinkIcon,
  Building2,
  Target,
  FileText,
  Scale,
  Briefcase,
  Heart,
  Palette,
  Cpu,
  TrendingUp,
  Globe,
  FileCheck,
  BarChart3,
  Rss,
  PenTool,
  History,
  Calendar,
  Wand2,
  Lightbulb,
} from 'lucide-react';
import { useNewsRewriter, type RewriteResult, type ComplianceCheck } from '@/hooks/useNewsRewriter';
import { useProjects } from '@/hooks/useProjects';
import { useUrlAnalysis } from '@/hooks/useUrlAnalysis';
import { cn } from '@/lib/utils';
import { RSSNewsImporter, type RSSItem, AutoAuditPanel, RepostHistory, RSSScheduler } from '@/components/news-rewriter';
import { FeedMonitorDashboard, ContentPerformanceAnalytics } from '@/components/feed-monitor';

// Niche options with icons
const NICHE_OPTIONS = [
  { id: 'geral', label: 'Geral', description: 'Notícias gerais e variedades', icon: Globe },
  { id: 'advocacia', label: 'Advocacia / Jurídico', description: 'Direito, leis e jurisprudência', icon: Briefcase },
  { id: 'saude', label: 'Saúde / Medicina', description: 'Saúde, tratamentos e bem-estar', icon: Heart },
  { id: 'beleza', label: 'Beleza / Estética', description: 'Estética, cuidados e tendências', icon: Palette },
  { id: 'tecnologia', label: 'Tecnologia', description: 'Tech, inovação e digital', icon: Cpu },
  { id: 'marketing', label: 'Marketing', description: 'Estratégias, ROI e tendências', icon: TrendingUp },
];

// Article length options
const ARTICLE_LENGTHS = [
  { id: 'short', label: 'Curto', description: '400-600 palavras', wordRange: '400-600' },
  { id: 'medium', label: 'Médio', description: '600-1000 palavras', wordRange: '600-1000' },
  { id: 'long', label: 'Longo', description: '1000-1500 palavras', wordRange: '1000-1500' },
];

// Analysis angle presets
const ANALYSIS_ANGLES = [
  { id: 'impacto_brasil', label: 'Impacto no Brasil', description: 'Análise do impacto para o mercado brasileiro' },
  { id: 'analise_juridica', label: 'Análise Jurídica', description: 'Perspectiva legal e implicações jurídicas' },
  { id: 'visao_consumidor', label: 'Visão do Consumidor', description: 'Como afeta o consumidor final' },
  { id: 'tendencia_mercado', label: 'Tendência de Mercado', description: 'Contexto e tendências do setor' },
  { id: 'opiniao_especialista', label: 'Opinião de Especialista', description: 'Comentário técnico especializado' },
  { id: 'custom', label: 'Personalizado', description: 'Defina seu próprio ângulo' },
];

export default function NewsRewriter() {
  const navigate = useNavigate();
  const { rewriteNews, isRewriting, progress, lastResult, lastCompliance, lastAudit } = useNewsRewriter();
  const { projects } = useProjects();
  
  // Form state
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceContent, setSourceContent] = useState('');
  const [selectedAngle, setSelectedAngle] = useState('impacto_brasil');
  const [customAngle, setCustomAngle] = useState('');
  const [keyword, setKeyword] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [niche, setNiche] = useState('geral');
  const [articleLength, setArticleLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [inputTab, setInputTab] = useState<'manual' | 'rss'>('manual');
  const [mainTab, setMainTab] = useState<'new' | 'history' | 'schedule' | 'monitor' | 'analytics'>('new');
  const [autoPublish, setAutoPublish] = useState(false);
  const [showAISuggestions, setShowAISuggestions] = useState(false);

  // Get current project info for AI analysis
  const currentProject = projects?.find(p => p.id === projectId);
  
  // URL Analysis hook
  const { analyzeUrl, isAnalyzing, analysisResult, clearAnalysis } = useUrlAnalysis({
    projectNiche: currentProject?.description || niche,
    projectName: currentProject?.name,
  });

  // Handle URL analysis
  const handleAnalyzeUrl = async () => {
    if (!sourceUrl.trim()) return;
    
    const result = await analyzeUrl(sourceUrl);
    if (result) {
      // Auto-fill form with AI suggestions
      if (result.content) setSourceContent(result.content);
      if (result.source) setSourceName(result.source);
      if (result.suggestedNiche) {
        const matchingNiche = NICHE_OPTIONS.find(n => 
          n.id.toLowerCase() === result.suggestedNiche.toLowerCase()
        );
        if (matchingNiche) setNiche(matchingNiche.id);
      }
      if (result.suggestedKeyword) setKeyword(result.suggestedKeyword);
      if (result.suggestedAngle) {
        setSelectedAngle('custom');
        setCustomAngle(result.suggestedAngle);
      }
      setShowAISuggestions(true);
    }
  };

  // Apply AI suggestion
  const applySuggestion = (field: string, value: string) => {
    switch (field) {
      case 'niche':
        const matchingNiche = NICHE_OPTIONS.find(n => 
          n.id.toLowerCase() === value.toLowerCase()
        );
        if (matchingNiche) setNiche(matchingNiche.id);
        break;
      case 'angle':
        setSelectedAngle('custom');
        setCustomAngle(value);
        break;
      case 'keyword':
        setKeyword(value);
        break;
    }
  };

  // Validation
  const contentLength = sourceContent.length;
  const wordCount = sourceContent.trim().split(/\s+/).filter(Boolean).length;
  const isContentValid = contentLength >= 200 && contentLength <= 10000;
  const isFormValid = sourceContent.trim() && sourceName.trim() && (selectedAngle !== 'custom' || customAngle.trim());

  const getAnalysisAngle = () => {
    if (selectedAngle === 'custom') return customAngle;
    const preset = ANALYSIS_ANGLES.find(a => a.id === selectedAngle);
    return preset?.label || selectedAngle;
  };

  const handleSubmit = async () => {
    if (!isFormValid) return;

    const result = await rewriteNews({
      sourceUrl,
      sourceContent,
      sourceName,
      analysisAngle: getAnalysisAngle(),
      keyword: keyword || undefined,
      niche,
      articleLength,
      projectId: projectId && projectId !== 'none' ? projectId : undefined,
      language: 'pt-BR',
      autoPublish: autoPublish && projectId && projectId !== 'none',
    });

    if (result) {
      // Navigate to edit the new article
      navigate(`/articles/${result.id}/edit`);
    }
  };

  const handleRSSSelect = (news: RSSItem) => {
    setSourceUrl(news.link);
    setSourceName(news.source);
    // Clean HTML from description/content
    const cleanContent = (news.content || news.description || '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
    
    setSourceContent(`${news.title}\n\n${cleanContent}`);
    setInputTab('manual');
  };

  const selectedNiche = NICHE_OPTIONS.find(n => n.id === niche);
  const NicheIcon = selectedNiche?.icon || Globe;

  return (
    <>
      <div className="container max-w-6xl py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Newspaper className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Repostagem Jornalística</h1>
              <p className="text-muted-foreground">
                Reescreva notícias com compliance Lei 9.610/98, otimização SEO e ângulo de análise próprio
              </p>
            </div>
          </div>
          
          {/* Main Tabs */}
          <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'new' | 'history' | 'schedule' | 'monitor' | 'analytics')}>
            <TabsList className="grid grid-cols-5 w-auto">
              <TabsTrigger value="new" className="gap-2">
                <PenTool className="w-4 h-4" />
                <span className="hidden sm:inline">Nova</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <History className="w-4 h-4" />
                <span className="hidden sm:inline">Histórico</span>
              </TabsTrigger>
              <TabsTrigger value="schedule" className="gap-2">
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline">Agenda</span>
              </TabsTrigger>
              <TabsTrigger value="monitor" className="gap-2">
                <Rss className="w-4 h-4" />
                <span className="hidden sm:inline">Monitor</span>
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-2">
                <TrendingUp className="w-4 h-4" />
                <span className="hidden sm:inline">Analytics</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* History Tab */}
        {mainTab === 'history' && (
          <RepostHistory limit={20} />
        )}

        {/* Schedule Tab */}
        {mainTab === 'schedule' && (
          <RSSScheduler projectId={projectId && projectId !== 'none' ? projectId : undefined} />
        )}

        {/* Monitor Tab */}
        {mainTab === 'monitor' && (
          <FeedMonitorDashboard />
        )}

        {/* Analytics Tab */}
        {mainTab === 'analytics' && (
          <ContentPerformanceAnalytics />
        )}

        {/* New Repost Tab */}
        {mainTab === 'new' && (
          <>
            {/* Compliance Alert */}
            <Alert className="border-warning/50 bg-warning/10">
              <Scale className="h-4 w-4 text-warning" />
              <AlertDescription>
                <strong>Lei 9.610/98 (Direitos Autorais):</strong> O sistema reescreve 100% do conteúdo, 
                mantém citações curtas (máx 2-3 frases) com aspas e credita a fonte original no rodapé.
                Originalidade garantida ≥95%.
              </AlertDescription>
            </Alert>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Main Form */}
              <div className="lg:col-span-2 space-y-6">
                {/* Input Source Tabs */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Fonte do Conteúdo
                      </CardTitle>
                      <Tabs value={inputTab} onValueChange={(v) => setInputTab(v as 'manual' | 'rss')}>
                        <TabsList className="h-8">
                          <TabsTrigger value="manual" className="text-xs gap-1 px-3">
                            <PenTool className="w-3 h-3" />
                            Manual
                          </TabsTrigger>
                          <TabsTrigger value="rss" className="text-xs gap-1 px-3">
                            <Rss className="w-3 h-3" />
                            Feed RSS
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {inputTab === 'rss' ? (
                      <RSSNewsImporter onSelectNews={handleRSSSelect} />
                    ) : (
                      <div className="space-y-4">
                        {/* Source Name */}
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="sourceName" className="flex items-center gap-2">
                              <Building2 className="w-4 h-4" />
                              Veículo / Fonte *
                            </Label>
                            <Input
                              id="sourceName"
                              placeholder="Ex: Folha de São Paulo, G1, Estadão..."
                              value={sourceName}
                              onChange={(e) => setSourceName(e.target.value)}
                              className="border-border bg-background"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="sourceUrl" className="flex items-center gap-2">
                              <LinkIcon className="w-4 h-4" />
                              URL da Notícia
                              <Badge variant="secondary" className="text-xs ml-1">
                                <Wand2 className="w-3 h-3 mr-1" />
                                Auto-análise
                              </Badge>
                            </Label>
                            <div className="flex gap-2">
                              <Input
                                id="sourceUrl"
                                type="url"
                                placeholder="https://... (cole a URL e clique em Analisar)"
                                value={sourceUrl}
                                onChange={(e) => {
                                  setSourceUrl(e.target.value);
                                  clearAnalysis();
                                  setShowAISuggestions(false);
                                }}
                                className="border-border bg-background flex-1"
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={handleAnalyzeUrl}
                                disabled={!sourceUrl.trim() || isAnalyzing}
                                className="shrink-0"
                              >
                                {isAnalyzing ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <Sparkles className="w-4 h-4 mr-1" />
                                    Analisar
                                  </>
                                )}
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Cole a URL e clique em "Analisar" para extrair conteúdo e sugestões via IA
                            </p>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="space-y-2">
                          <Label htmlFor="sourceContent">Texto da Notícia *</Label>
                          <Textarea
                            id="sourceContent"
                            placeholder="Cole aqui o texto completo da notícia que deseja reescrever..."
                            className="min-h-[220px] font-mono text-sm border-border bg-background"
                            value={sourceContent}
                            onChange={(e) => setSourceContent(e.target.value)}
                          />
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>{wordCount} palavras</span>
                            <span className={!isContentValid && contentLength > 0 ? 'text-destructive' : ''}>
                              {contentLength}/10.000 caracteres
                            </span>
                          </div>
                          {contentLength > 0 && contentLength < 200 && (
                            <p className="text-sm text-destructive">
                              Mínimo de 200 caracteres para uma repostagem de qualidade
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* AI Suggestions Panel */}
                {showAISuggestions && analysisResult && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Lightbulb className="w-5 h-5 text-primary" />
                        Sugestões da IA
                        <Badge variant="secondary" className="ml-auto">
                          Baseado no projeto WordPress
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {analysisResult.summary}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Main suggestions grid */}
                      <div className="grid sm:grid-cols-2 gap-3">
                        {/* Suggested Niche */}
                        <div className="p-3 rounded-lg border bg-background">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-muted-foreground">Nicho Sugerido</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() => applySuggestion('niche', analysisResult.suggestedNiche)}
                            >
                              Aplicar
                            </Button>
                          </div>
                          <p className="text-sm font-medium">{analysisResult.suggestedNiche}</p>
                        </div>

                        {/* Suggested Keyword */}
                        <div className="p-3 rounded-lg border bg-background">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-muted-foreground">Palavra-chave SEO</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() => applySuggestion('keyword', analysisResult.suggestedKeyword)}
                            >
                              Aplicar
                            </Button>
                          </div>
                          <p className="text-sm font-medium">{analysisResult.suggestedKeyword}</p>
                        </div>
                      </div>

                      {/* Suggested Angle */}
                      <div className="p-3 rounded-lg border bg-background">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-muted-foreground">Ângulo de Análise Sugerido</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => applySuggestion('angle', analysisResult.suggestedAngle)}
                          >
                            Aplicar
                          </Button>
                        </div>
                        <p className="text-sm">{analysisResult.suggestedAngle}</p>
                      </div>

                      {/* Topics and Audience */}
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg border bg-background">
                          <span className="text-xs font-medium text-muted-foreground block mb-2">Tópicos Principais</span>
                          <div className="flex flex-wrap gap-1">
                            {analysisResult.mainTopics.map((topic, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {topic}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border bg-background">
                          <span className="text-xs font-medium text-muted-foreground block mb-2">Público-Alvo</span>
                          <p className="text-xs">{analysisResult.targetAudience}</p>
                        </div>
                      </div>

                      {/* Publishing Strategy */}
                      <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
                        <span className="text-xs font-medium text-primary block mb-1">💡 Estratégia de Publicação</span>
                        <p className="text-xs text-muted-foreground">{analysisResult.publishingStrategy}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <NicheIcon className="w-5 h-5" />
                      Nicho de Conteúdo
                    </CardTitle>
                    <CardDescription>
                      Selecione o nicho para aplicar tom e estilo específico
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {NICHE_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        return (
                          <div
                            key={option.id}
                            className={cn(
                              "p-3 rounded-lg border-2 cursor-pointer transition-all",
                              niche === option.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            )}
                            onClick={() => setNiche(option.id)}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className={cn(
                                "w-4 h-4",
                                niche === option.id ? "text-primary" : "text-muted-foreground"
                              )} />
                              <span className="font-medium text-sm">{option.label}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 ml-6">
                              {option.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Analysis Angle Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Ângulo de Análise
                    </CardTitle>
                    <CardDescription>
                      Escolha como você quer abordar a notícia (adiciona 40%+ de conteúdo original)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-3">
                      {ANALYSIS_ANGLES.map((angle) => (
                        <div
                          key={angle.id}
                          className={cn(
                            "p-3 rounded-lg border-2 cursor-pointer transition-all",
                            selectedAngle === angle.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          )}
                          onClick={() => setSelectedAngle(angle.id)}
                        >
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                              selectedAngle === angle.id ? 'border-primary' : 'border-muted-foreground'
                            )}>
                              {selectedAngle === angle.id && (
                                <div className="w-2 h-2 rounded-full bg-primary" />
                              )}
                            </div>
                            <span className="font-medium text-sm">{angle.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 ml-6">
                            {angle.description}
                          </p>
                        </div>
                      ))}
                    </div>

                    {selectedAngle === 'custom' && (
                      <Textarea
                        placeholder="Descreva seu ângulo de análise personalizado..."
                        value={customAngle}
                        onChange={(e) => setCustomAngle(e.target.value)}
                        className="min-h-[80px] border-border bg-background"
                      />
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Article Length */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Tamanho do Artigo
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {ARTICLE_LENGTHS.map((length) => (
                      <div
                        key={length.id}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-all",
                          articleLength === length.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        )}
                        onClick={() => setArticleLength(length.id as 'short' | 'medium' | 'long')}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{length.label}</span>
                          <Badge variant="secondary" className="text-xs">
                            {length.wordRange}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Options Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Opções SEO & Publicação</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Keyword */}
                    <div className="space-y-2">
                      <Label htmlFor="keyword">Palavra-chave Principal</Label>
                      <Input
                        id="keyword"
                        placeholder="Ex: marketing jurídico"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        className="border-border bg-background"
                      />
                      <p className="text-xs text-muted-foreground">
                        Otimiza título, meta e conteúdo
                      </p>
                    </div>

                    {/* Project */}
                    {projects && projects.length > 0 && (
                      <div className="space-y-2">
                        <Label htmlFor="project">Projeto WordPress</Label>
                        <Select value={projectId} onValueChange={setProjectId}>
                          <SelectTrigger className="border-border bg-background">
                            <SelectValue placeholder="Selecionar projeto" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum projeto</SelectItem>
                            {projects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Auto Publish Toggle */}
                    {projectId && projectId !== 'none' && (
                      <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                        <div className="space-y-0.5">
                          <Label htmlFor="auto-publish" className="text-sm font-medium">
                            Auto-publicar se aprovado
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Publica automaticamente quando score ≥95%
                          </p>
                        </div>
                        <Switch
                          id="auto-publish"
                          checked={autoPublish}
                          onCheckedChange={setAutoPublish}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Checklist Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileCheck className="w-4 h-4" />
                      Checklist Compliance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[150px]">
                      <div className="space-y-2">
                        {[
                          { check: !!sourceName, label: 'Fonte identificada' },
                          { check: isContentValid, label: 'Conteúdo com 200+ caracteres' },
                          { check: selectedAngle !== 'custom' || !!customAngle, label: 'Ângulo de análise definido' },
                          { check: true, label: 'Créditos automáticos (Lei 9.610)' },
                          { check: true, label: 'Reescrita 100% original (≥95%)' },
                          { check: true, label: 'SEO otimizado (título ≤60, meta ≤160)' },
                        ].map((item, index) => (
                          <div key={index} className="flex items-center gap-2">
                            {item.check ? (
                              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                            )}
                            <span className={cn(
                              "text-xs",
                              item.check ? 'text-foreground' : 'text-muted-foreground'
                            )}>
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Submit Button */}
                <Button 
                  className="w-full gap-2" 
                  size="lg"
                  disabled={!isFormValid || isRewriting}
                  onClick={handleSubmit}
                >
                  {isRewriting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {progress || 'Processando...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Gerar Repostagem
                    </>
                  )}
                </Button>

                {/* Auto Audit Panel */}
                {lastCompliance && (
                  <AutoAuditPanel 
                    compliance={lastCompliance} 
                    qualityScore={lastResult?.quality_score}
                  />
                )}

                {/* What happens */}
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <h4 className="font-medium text-sm mb-2">O que acontece:</h4>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>IA analisa nicho e tom adequado</li>
                      <li>Reescreve com estrutura nova (95%+ original)</li>
                      <li>Adiciona análise e contexto (40%+)</li>
                      <li>Otimiza SEO (título ≤60, meta ≤160)</li>
                      <li>Gera imagem destacada por nicho</li>
                      <li>Auditoria automática de qualidade</li>
                      {autoPublish && projectId && projectId !== 'none' && (
                        <li className="text-primary font-medium">Auto-publica se aprovado ✓</li>
                      )}
                    </ol>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
