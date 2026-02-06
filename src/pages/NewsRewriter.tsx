import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// Layout is provided by parent route
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  ExternalLink
} from 'lucide-react';
import { useNewsRewriter } from '@/hooks/useNewsRewriter';
import { useProjects } from '@/hooks/useProjects';

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
  const { rewriteNews, isRewriting, progress } = useNewsRewriter();
  const { projects } = useProjects();
  
  // Form state
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceContent, setSourceContent] = useState('');
  const [selectedAngle, setSelectedAngle] = useState('impacto_brasil');
  const [customAngle, setCustomAngle] = useState('');
  const [keyword, setKeyword] = useState('');
  const [projectId, setProjectId] = useState<string>('');

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
      projectId: projectId && projectId !== 'none' ? projectId : undefined,
      language: 'pt-BR',
    });

    if (result) {
      // Navigate to edit the new article
      navigate(`/articles/${result.id}/edit`);
    }
  };

  return (
    <>
      <div className="container max-w-4xl py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Newspaper className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Repostagem Jornalística</h1>
            <p className="text-muted-foreground">
              Reescreva notícias com compliance Lei 9.610/98 e ângulo de análise próprio
            </p>
          </div>
        </div>

        {/* Compliance Alert */}
        <Alert className="border-warning/50 bg-warning/10">
          <Scale className="h-4 w-4 text-warning" />
          <AlertDescription>
            <strong>Lei 9.610/98 (Direitos Autorais):</strong> O sistema reescreve 100% do conteúdo, 
            mantém citações curtas (máx 2-3 frases) com aspas e credita a fonte original no rodapé.
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
                    />
                  </div>
                </div>

                {/* Content */}
                <div className="space-y-2">
                  <Label htmlFor="sourceContent">Texto da Notícia *</Label>
                  <Textarea
                    id="sourceContent"
                    placeholder="Cole aqui o texto completo da notícia que deseja reescrever..."
                    className="min-h-[250px] font-mono text-sm"
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
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedAngle === angle.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setSelectedAngle(angle.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selectedAngle === angle.id ? 'border-primary' : 'border-muted-foreground'
                        }`}>
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
                    className="min-h-[80px]"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Options Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Opções</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Keyword */}
                <div className="space-y-2">
                  <Label htmlFor="keyword">Palavra-chave SEO</Label>
                  <Input
                    id="keyword"
                    placeholder="Ex: marketing jurídico"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Otimiza o artigo para esta keyword
                  </p>
                </div>

                {/* Project */}
                {projects && projects.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="project">Projeto (opcional)</Label>
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger>
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
                <CardTitle className="text-base">Checklist Compliance</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-3">
                    {[
                      { check: !!sourceName, label: 'Fonte identificada' },
                      { check: isContentValid, label: 'Conteúdo com 200+ caracteres' },
                      { check: selectedAngle !== 'custom' || !!customAngle, label: 'Ângulo de análise definido' },
                      { check: true, label: 'Créditos automáticos no rodapé' },
                      { check: true, label: 'Reescrita 100% original pela IA' },
                      { check: true, label: 'Citações limitadas (2-3 frases)' },
                    ].map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        {item.check ? (
                          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                        )}
                        <span className={`text-sm ${item.check ? 'text-foreground' : 'text-muted-foreground'}`}>
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

            {/* What happens */}
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <h4 className="font-medium text-sm mb-2">O que acontece:</h4>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>IA identifica pontos principais</li>
                  <li>Reescreve com estrutura nova</li>
                  <li>Adiciona análise e contexto (40%+)</li>
                  <li>Gera imagem destacada</li>
                  <li>Insere créditos da fonte</li>
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
