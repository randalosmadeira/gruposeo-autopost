import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Link2,
  RefreshCw,
  Sparkles,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Loader2,
  Info,
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useArticles } from '@/hooks/useArticles';
import { useToast } from '@/hooks/use-toast';

interface LinkSuggestion {
  sourceArticle: {
    id: string;
    title: string;
    keyword: string;
  };
  targetArticle: {
    id: string;
    title: string;
    keyword: string;
    url?: string;
  };
  relevance: number;
  anchorText: string;
  position: 'intro' | 'body' | 'conclusion';
}

interface LinkingStats {
  totalLinks: number;
  orphanArticles: number;
  averageLinksPerArticle: number;
  topLinkedArticles: Array<{ title: string; count: number }>;
}

interface InternalLinkingCardProps {
  projectId?: string;
  onProjectSelect?: (projectId: string) => void;
}

export function InternalLinkingCard({ projectId, onProjectSelect }: InternalLinkingCardProps) {
  const [enabled, setEnabled] = useState(false);
  const [selectedProject, setSelectedProject] = useState(projectId || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [stats, setStats] = useState<LinkingStats | null>(null);
  const [progress, setProgress] = useState(0);
  
  const { projects } = useProjects();
  const { articles } = useArticles();
  const { toast } = useToast();

  // Filter articles for selected project
  const projectArticles = articles?.filter(a => 
    selectedProject ? a.project_id === selectedProject : true
  ) || [];

  const publishedArticles = projectArticles.filter(a => a.status === 'published');
  const hasEnoughArticles = publishedArticles.length >= 5;

  // Calculate internal link opportunities
  const analyzeLinks = useCallback(async () => {
    if (!selectedProject || !hasEnoughArticles) return;
    
    setIsAnalyzing(true);
    setProgress(0);
    
    try {
      const newSuggestions: LinkSuggestion[] = [];
      const totalPairs = publishedArticles.length * (publishedArticles.length - 1);
      let processed = 0;
      
      // Analyze each article pair for relevance
      for (const source of publishedArticles) {
        for (const target of publishedArticles) {
          if (source.id === target.id) continue;
          
          const relevance = calculateRelevance(source, target);
          
          if (relevance > 30) {
            const anchorText = generateAnchorText(source, target);
            const position = determinePosition(source, target);
            
            newSuggestions.push({
              sourceArticle: {
                id: source.id,
                title: source.title || source.keyword,
                keyword: source.keyword,
              },
              targetArticle: {
                id: target.id,
                title: target.title || target.keyword,
                keyword: target.keyword,
                url: target.published_url || undefined,
              },
              relevance,
              anchorText,
              position,
            });
          }
          
          processed++;
          setProgress(Math.round((processed / totalPairs) * 100));
        }
      }
      
      // Sort by relevance and take top suggestions
      const sortedSuggestions = newSuggestions
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 50);
      
      setSuggestions(sortedSuggestions);
      
      // Calculate stats
      const linksPerArticle: Record<string, number> = {};
      sortedSuggestions.forEach(s => {
        linksPerArticle[s.sourceArticle.id] = (linksPerArticle[s.sourceArticle.id] || 0) + 1;
      });
      
      const orphanCount = publishedArticles.filter(a => !linksPerArticle[a.id]).length;
      
      setStats({
        totalLinks: sortedSuggestions.length,
        orphanArticles: orphanCount,
        averageLinksPerArticle: publishedArticles.length > 0 
          ? sortedSuggestions.length / publishedArticles.length 
          : 0,
        topLinkedArticles: Object.entries(linksPerArticle)
          .map(([id, count]) => ({
            title: publishedArticles.find(a => a.id === id)?.title || 'Unknown',
            count,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      });
      
      toast({
        title: 'Análise concluída',
        description: `Encontradas ${sortedSuggestions.length} oportunidades de links internos.`,
      });
    } catch (error) {
      console.error('Error analyzing links:', error);
      toast({
        title: 'Erro na análise',
        description: 'Não foi possível analisar os links internos.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
      setProgress(100);
    }
  }, [selectedProject, publishedArticles, hasEnoughArticles, toast]);

  // Calculate relevance between two articles
  const calculateRelevance = (source: typeof projectArticles[0], target: typeof projectArticles[0]): number => {
    let relevance = 0;
    
    const sourceKeyword = source.keyword?.toLowerCase() || '';
    const targetKeyword = target.keyword?.toLowerCase() || '';
    const sourceTitle = source.title?.toLowerCase() || '';
    const targetTitle = target.title?.toLowerCase() || '';
    const sourceSecondary = source.secondary_keywords?.map(k => k.toLowerCase()) || [];
    const targetSecondary = target.secondary_keywords?.map(k => k.toLowerCase()) || [];
    
    // Keywords match
    if (targetKeyword.includes(sourceKeyword) || sourceKeyword.includes(targetKeyword)) {
      relevance += 40;
    }
    
    // Keyword appears in target title
    if (targetTitle.includes(sourceKeyword)) {
      relevance += 25;
    }
    
    // Secondary keywords match
    for (const sk of sourceSecondary) {
      if (targetKeyword.includes(sk) || sk.includes(targetKeyword)) {
        relevance += 15;
        break;
      }
      for (const tk of targetSecondary) {
        if (sk.includes(tk) || tk.includes(sk)) {
          relevance += 10;
          break;
        }
      }
    }
    
    // Title word overlap
    const sourceWords = new Set(sourceTitle.split(/\s+/).filter(w => w.length > 4));
    const targetWords = new Set(targetTitle.split(/\s+/).filter(w => w.length > 4));
    const overlap = [...sourceWords].filter(w => targetWords.has(w)).length;
    relevance += Math.min(overlap * 5, 20);
    
    return Math.min(relevance, 100);
  };

  // Generate appropriate anchor text
  const generateAnchorText = (source: typeof projectArticles[0], target: typeof projectArticles[0]): string => {
    const targetKeyword = target.keyword || '';
    const targetTitle = target.title || '';
    
    // Use keyword if it's short enough
    if (targetKeyword.length <= 50) {
      return targetKeyword;
    }
    
    // Otherwise use a shortened version of the title
    const words = targetTitle.split(' ').slice(0, 6).join(' ');
    return words.length > 50 ? words.substring(0, 47) + '...' : words;
  };

  // Determine best position for the link
  const determinePosition = (source: typeof projectArticles[0], target: typeof projectArticles[0]): 'intro' | 'body' | 'conclusion' => {
    // High relevance links go in the intro
    const relevance = calculateRelevance(source, target);
    if (relevance > 70) return 'intro';
    if (relevance > 50) return 'body';
    return 'conclusion';
  };

  // Handle project change
  const handleProjectChange = (value: string) => {
    setSelectedProject(value);
    setSuggestions([]);
    setStats(null);
    if (onProjectSelect) {
      onProjectSelect(value);
    }
  };

  // Toggle enabled state
  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    if (checked && selectedProject && !suggestions.length) {
      analyzeLinks();
    }
  };

  // Connection status state
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');

  // Check project connection when selected
  const checkProjectConnection = useCallback(async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    setConnectionStatus('checking');
    setConnectionMessage('Verificando conexão...');

    try {
      // Test WordPress connection
      if (project.wordpress_url) {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-wordpress-connection`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wordpress_url: project.wordpress_url,
              username: project.wordpress_username || '',
            }),
          }
        );

        if (response.ok) {
          setConnectionStatus('success');
          setConnectionMessage('Conexão estabelecida com sucesso');
        } else {
          setConnectionStatus('error');
          setConnectionMessage('Falha ao conectar com o site WordPress');
        }
      } else {
        setConnectionStatus('error');
        setConnectionMessage('URL do WordPress não configurada');
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionMessage('Erro ao verificar conexão');
    }
  }, [projects]);

  // Get selected project
  const selectedProjectData = projects.find(p => p.id === selectedProject);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Link2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Linkagem Interna</CardTitle>
              <CardDescription>
                Adicionar automaticamente links internos ao conteúdo relacionado
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={!selectedProject || !hasEnoughArticles}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Project Selector */}
        <div className="space-y-3">
          <label className="text-sm font-medium block">
            Selecionar Projeto Conectado
          </label>
          <Select 
            value={selectedProject} 
            onValueChange={(value) => {
              handleProjectChange(value);
              checkProjectConnection(value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolha um projeto" />
            </SelectTrigger>
            <SelectContent>
              {projects.filter(p => p.is_connected).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-medium">
                      {project.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span>{project.name}</span>
                      <span className="text-xs text-muted-foreground">{project.wordpress_url || project.domain}</span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Connection Status Display */}
          {selectedProject && selectedProjectData && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <div className="w-8 h-8 rounded bg-background flex items-center justify-center">
                <Link2 className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">WordPress</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {selectedProjectData.wordpress_url || selectedProjectData.domain}
                  </span>
                  <a 
                    href={selectedProjectData.wordpress_url || `https://${selectedProjectData.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    Abrir site ↗
                  </a>
                  {/* Status Badge */}
                  {connectionStatus === 'checking' && (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                  {connectionStatus === 'success' && (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                  {connectionStatus === 'error' && (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
                {connectionStatus !== 'idle' && (
                  <p className={`text-xs mt-1 ${connectionStatus === 'success' ? 'text-green-600' : connectionStatus === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {connectionMessage}
                  </p>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Escolha um dos seus projetos conectados. O site precisa ter pelo menos 5 artigos publicados para habilitar a distribuição automática de links internos.
          </p>
        </div>

        {/* Status Alert */}
        {selectedProject && !hasEnoughArticles && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border">
            <AlertCircle className="w-5 h-5 text-warning mt-0.5" />
            <div>
              <p className="text-sm font-medium">Artigos insuficientes</p>
              <p className="text-xs text-muted-foreground mt-1">
                Este projeto tem apenas {publishedArticles.length} artigos publicados. 
                São necessários pelo menos 5 para a análise de links internos.
              </p>
            </div>
          </div>
        )}

        {/* Analysis Progress */}
        {isAnalyzing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Analisando estrutura de conteúdo...</span>
              <span className="text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Stats */}
        {stats && enabled && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold text-primary">{stats.totalLinks}</div>
              <div className="text-xs text-muted-foreground">Oportunidades</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold text-warning">{stats.orphanArticles}</div>
              <div className="text-xs text-muted-foreground">Páginas Órfãs</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold">{stats.averageLinksPerArticle.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Média/Artigo</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold text-success">{publishedArticles.length}</div>
              <div className="text-xs text-muted-foreground">Publicados</div>
            </div>
          </div>
        )}

        {/* Suggestions List */}
        {suggestions.length > 0 && enabled && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Sugestões de Links</h4>
              <Badge variant="secondary">{suggestions.length} oportunidades</Badge>
            </div>
            
            <ScrollArea className="h-[300px] rounded-lg border">
              <div className="p-4 space-y-3">
                {suggestions.slice(0, 20).map((suggestion, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium truncate">
                          {suggestion.sourceArticle.title}
                        </span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-primary truncate">
                          {suggestion.targetArticle.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {suggestion.relevance}% relevância
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Anchor: "{suggestion.anchorText.substring(0, 30)}..."
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {suggestion.position === 'intro' ? 'Introdução' : 
                           suggestion.position === 'body' ? 'Corpo' : 'Conclusão'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Actions */}
        {selectedProject && hasEnoughArticles && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={analyzeLinks}
              disabled={isAnalyzing}
              className="flex-1"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Analisar Links
                </>
              )}
            </Button>
            
            <Button
              onClick={() => {
                toast({
                  title: 'Em desenvolvimento',
                  description: 'A geração automática de links será implementada em breve.',
                });
              }}
              disabled={!suggestions.length || isGenerating}
              className="flex-1"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar Links
                </>
              )}
            </Button>
          </div>
        )}

        {/* Info */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-foreground mb-1">Como funciona a linkagem interna avançada?</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Analisa a estrutura semântica de cada artigo</li>
              <li>Identifica relacionamentos entre temas e keywords</li>
              <li>Sugere links com base na relevância do conteúdo</li>
              <li>Gera anchor texts otimizados para SEO</li>
              <li>Distribui links estrategicamente (intro, corpo, conclusão)</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
