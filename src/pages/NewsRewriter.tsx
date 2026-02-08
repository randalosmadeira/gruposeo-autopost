import { useState } from 'react';
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
import { Progress } from '@/components/ui/progress';
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
  Zap,
  BarChart3,
  ExternalLink,
} from 'lucide-react';
import { useNewsRewriter, type RewriteResult, type ComplianceCheck } from '@/hooks/useNewsRewriter';
import { useProjects } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';

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

// Compliance result component
function ComplianceResult({ result, compliance }: { result: RewriteResult; compliance: ComplianceCheck }) {
  return (
    <Card className="border-success/50 bg-success/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-success" />
          <CardTitle className="text-base">Artigo Gerado com Sucesso!</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="font-medium text-sm mb-1">{result.title}</p>
          <p className="text-xs text-muted-foreground">{result.reading_time} de leitura • {result.word_count} palavras</p>
        </div>

        {/* Quality Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span>Originalidade</span>
              <span className={cn(
                "font-medium",
                compliance.originalityScore >= 95 ? "text-success" : 
                compliance.originalityScore >= 90 ? "text-warning" : "text-destructive"
              )}>
                {compliance.originalityScore}%
              </span>
            </div>
            <Progress 
              value={compliance.originalityScore} 
              className="h-1.5" 
            />
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span>Qualidade</span>
              <span className="font-medium text-primary">{result.quality_score}%</span>
            </div>
            <Progress value={result.quality_score} className="h-1.5" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span>Legibilidade</span>
              <span className="font-medium">{compliance.readabilityScore}%</span>
            </div>
            <Progress value={compliance.readabilityScore} className="h-1.5" />
          </div>

          <div className="flex items-center gap-2">
            {compliance.seoOptimized && (
              <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                <Zap className="w-3 h-3 mr-1" />
                SEO OK
              </Badge>
            )}
            {compliance.citationCompliance && (
              <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                <Scale className="w-3 h-3 mr-1" />
                Lei 9.610
              </Badge>
            )}
          </div>
        </div>

        {/* Tags & Keywords */}
        {result.tags && result.tags.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Tags:</p>
            <div className="flex flex-wrap gap-1">
              {result.tags.slice(0, 5).map((tag, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">{result.credits}</p>
      </CardContent>
    </Card>
  );
}

export default function NewsRewriter() {
  const navigate = useNavigate();
  const { rewriteNews, isRewriting, progress, lastResult, lastCompliance } = useNewsRewriter();
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
    });

    if (result) {
      // Navigate to edit the new article
      navigate(`/articles/${result.id}/edit`);
    }
  };

  const selectedNiche = NICHE_OPTIONS.find(n => n.id === niche);
  const NicheIcon = selectedNiche?.icon || Globe;

  return (
    <>
      <div className="container max-w-5xl py-6 space-y-6">
        {/* Header */}
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
            {/* Source Content Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Conteúdo Original
                </CardTitle>
                <CardDescription>
                  Cole o texto da notícia que você deseja reescrever
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                      URL da Notícia (opcional)
                    </Label>
                    <Input
                      id="sourceUrl"
                      type="url"
                      placeholder="https://..."
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      className="border-border bg-background"
                    />
                  </div>
                </div>

                {/* Content */}
                <div className="space-y-2">
                  <Label htmlFor="sourceContent">Texto da Notícia *</Label>
                  <Textarea
                    id="sourceContent"
                    placeholder="Cole aqui o texto completo da notícia que deseja reescrever..."
                    className="min-h-[250px] font-mono text-sm border-border bg-background"
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
              </CardContent>
            </Card>

            {/* Niche Selection */}
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
                <CardTitle className="text-base">Opções SEO</CardTitle>
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
                    <Label htmlFor="project">Projeto (opcional)</Label>
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
                <ScrollArea className="h-[180px]">
                  <div className="space-y-3">
                    {[
                      { check: !!sourceName, label: 'Fonte identificada' },
                      { check: isContentValid, label: 'Conteúdo com 200+ caracteres' },
                      { check: selectedAngle !== 'custom' || !!customAngle, label: 'Ângulo de análise definido' },
                      { check: true, label: 'Créditos automáticos no rodapé' },
                      { check: true, label: 'Reescrita 100% original (≥95%)' },
                      { check: true, label: 'Citações limitadas (2-3 frases)' },
                      { check: true, label: 'SEO otimizado (título ≤60, meta ≤160)' },
                    ].map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        {item.check ? (
                          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                        )}
                        <span className={cn(
                          "text-sm",
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

            {/* Result Preview */}
            {lastResult && lastCompliance && (
              <ComplianceResult result={lastResult} compliance={lastCompliance} />
            )}

            {/* What happens */}
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <h4 className="font-medium text-sm mb-2">O que acontece:</h4>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>IA analisa nicho e tom adequado</li>
                  <li>Identifica pontos principais</li>
                  <li>Reescreve com estrutura nova (95%+ original)</li>
                  <li>Adiciona análise e contexto (40%+)</li>
                  <li>Otimiza SEO (título ≤60, meta ≤160)</li>
                  <li>Gera imagem destacada por nicho</li>
                  <li>Insere créditos conforme Lei 9.610/98</li>
                  <li>Artigo salvo como rascunho</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
