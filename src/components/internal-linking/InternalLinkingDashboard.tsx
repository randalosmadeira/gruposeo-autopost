import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Link2,
  RefreshCw,
  Plus,
  Trash2,
  Settings,
  Layers,
  FileText,
  Target,
  Sparkles,
  ExternalLink,
  BarChart3,
  ClipboardList,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Wifi,
} from 'lucide-react';
import { useInternalLinking, type KeywordRule, type IndexedArticle, type TopicCluster, type SyncState } from '@/hooks/useInternalLinking';
import { useProjects } from '@/hooks/useProjects';
import { InternalLinkingMetrics } from './InternalLinkingMetrics';
import { InternalLinkingReports } from './InternalLinkingReports';
import { SyncProgressPanel } from './SyncProgressPanel';
import { PluginInstallGuide } from './PluginInstallGuide';
import { AISuggestionsPanel } from './AISuggestionsPanel';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface PluginHealthStatus {
  status: 'unknown' | 'checking' | 'healthy' | 'not_installed' | 'error';
  message?: string;
  version?: string;
  lastChecked?: Date;
}

interface InternalLinkingDashboardProps {
  projectId?: string | null;
  projectName?: string;
}

export function InternalLinkingDashboard({ projectId: externalProjectId, projectName: externalProjectName }: InternalLinkingDashboardProps) {
  const { projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(externalProjectId || null);
  
  // Use external projectId if provided, otherwise use selected
  const projectId = externalProjectId || selectedProjectId;
  const projectName = externalProjectName || projects.find(p => p.id === projectId)?.name;
  const {
    isLoading,
    isSyncing,
    indexedArticles,
    topicClusters,
    keywordRules,
    syncProgress,
    syncState,
    realtimeCounts,
    fetchIndexedArticles,
    fetchTopicClusters,
    fetchKeywordRules,
    fetchRealtimeCounts,
    triggerSync,
    syncAllProjects,
    forceValidateAll,
    generateClusters,
    addKeywordRule,
    deleteKeywordRule,
    toggleKeywordRule,
  } = useInternalLinking(projectId);

  const [useFallbackMode, setUseFallbackMode] = useState(false);
  const [pluginHealth, setPluginHealth] = useState<PluginHealthStatus>({ status: 'unknown' });

  const [newRule, setNewRule] = useState({
    keyword: '',
    target_url: '',
    target_title: '',
    match_type: 'exact' as const,
    max_links_per_article: 1,
  });
  const [isAddRuleOpen, setIsAddRuleOpen] = useState(false);

  // Check plugin health when project changes
  const checkPluginHealth = useCallback(async () => {
    if (!projectId) return;
    
    const project = projects.find(p => p.id === projectId);
    if (!project?.wordpress_url || !project?.wordpress_app_password) {
      setPluginHealth({ status: 'error', message: 'Projeto não configurado' });
      return;
    }

    const isPluginAuth = project.wordpress_username === '__CFRDM_PLUGIN__';
    if (!isPluginAuth) {
      setPluginHealth({ status: 'healthy', message: 'Usando REST API padrão' });
      return;
    }

    setPluginHealth({ status: 'checking' });

    try {
      const { data, error } = await supabase.functions.invoke('test-wordpress-connection', {
        body: {
          wordpress_url: project.wordpress_url,
          use_plugin: true,
          api_key: project.wordpress_app_password,
        },
      });

      if (error) throw new Error(error.message);

      if (data?.success) {
        setPluginHealth({
          status: 'healthy',
          message: 'Plugin ativo e funcionando',
          version: data.site?.version,
          lastChecked: new Date(),
        });
      } else {
        const isNotInstalled = data?.error?.includes('rest_no_route') || 
                                data?.error?.includes('404');
        setPluginHealth({
          status: isNotInstalled ? 'not_installed' : 'error',
          message: isNotInstalled ? 'Plugin não instalado' : data?.error || 'Erro desconhecido',
          lastChecked: new Date(),
        });
      }
    } catch (error) {
      setPluginHealth({
        status: 'error',
        message: error instanceof Error ? error.message : 'Erro ao verificar plugin',
        lastChecked: new Date(),
      });
    }
  }, [projectId, projects]);

  // Auto-check plugin health when project is selected
  useEffect(() => {
    if (projectId) {
      checkPluginHealth();
    }
  }, [projectId, checkPluginHealth]);

  // Load data on mount
  useEffect(() => {
    if (projectId) {
      fetchIndexedArticles();
      fetchTopicClusters();
      fetchKeywordRules();
    }
  }, [projectId, fetchIndexedArticles, fetchTopicClusters, fetchKeywordRules]);

  const handleAddRule = async () => {
    if (!newRule.keyword || !newRule.target_url) return;

    await addKeywordRule({
      ...newRule,
      is_active: true,
    });

    setNewRule({
      keyword: '',
      target_url: '',
      target_title: '',
      match_type: 'exact',
      max_links_per_article: 1,
    });
    setIsAddRuleOpen(false);
  };

  if (!projectId) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Linkagem Interna Inteligente</h2>
          <p className="text-muted-foreground">
            Selecione um projeto para gerenciar a linkagem interna
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Selecionar Projeto</CardTitle>
            <CardDescription>
              Escolha um projeto WordPress conectado para gerenciar links internos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {projects.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Link2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum projeto WordPress configurado.</p>
                <p className="text-sm">Configure um projeto em "Projetos" primeiro.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.filter(p => p.is_connected).map((project) => (
                  <Card 
                    key={project.id} 
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Link2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{project.name}</p>
                          <p className="text-xs text-muted-foreground">{project.domain}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Back Button - only show when not using external projectId */}
          {!externalProjectId && selectedProjectId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedProjectId(null)}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">Linkagem Interna Inteligente</h2>
              {/* Plugin Health Badge */}
              {pluginHealth.status === 'checking' && (
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Verificando...
                </Badge>
              )}
              {pluginHealth.status === 'healthy' && (
                <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" />
                  Plugin OK
                </Badge>
              )}
              {pluginHealth.status === 'not_installed' && (
                <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-800">
                  <XCircle className="w-3 h-3" />
                  Plugin não instalado
                </Badge>
              )}
              {pluginHealth.status === 'error' && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="w-3 h-3" />
                  Erro
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {projectName || 'Projeto'} • <span className="font-semibold text-foreground">{realtimeCounts.indexedArticles}</span> artigos indexados • <span className="font-semibold text-foreground">{realtimeCounts.topicClusters}</span> clusters
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={checkPluginHealth}
            disabled={pluginHealth.status === 'checking'}
          >
            <RefreshCw className={cn(
              "w-4 h-4",
              pluginHealth.status === 'checking' && "animate-spin"
            )} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncAllProjects()}
            disabled={isSyncing}
          >
            <Wifi className="w-4 h-4 mr-2" />
            Sync Todos Projetos
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => forceValidateAll()}
            disabled={isSyncing}
            className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/30"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Validação SEO IA
          </Button>
          <Button
            variant="outline"
            onClick={() => generateClusters()}
            disabled={isLoading || indexedArticles.length === 0}
          >
            <Layers className="w-4 h-4 mr-2" />
            Gerar Clusters
          </Button>
        </div>
      </div>

      {/* Plugin Install Guide - Show when plugin not found via sync OR health check */}
      {(syncState.pluginNotFound || pluginHealth.status === 'not_installed') && (
        <PluginInstallGuide
          showFallbackOption={true}
          onUseFallback={() => {
            setUseFallbackMode(true);
            triggerSync(false, true);
          }}
          isUsingFallback={useFallbackMode}
        />
      )}

      {/* Sync Progress Panel */}
      <SyncProgressPanel
        progress={syncProgress}
        onStartSync={(fullSync) => triggerSync(fullSync, useFallbackMode)}
        isSyncing={isSyncing}
        usedFallback={syncState.usedFallback}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{realtimeCounts.indexedArticles}</p>
                <p className="text-sm text-muted-foreground">Artigos Indexados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Layers className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{realtimeCounts.topicClusters}</p>
                <p className="text-sm text-muted-foreground">Clusters Temáticos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Target className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{keywordRules.filter(r => r.is_active).length}</p>
                <p className="text-sm text-muted-foreground">Regras Ativas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Link2 className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{realtimeCounts.totalInternalLinks}</p>
                <p className="text-sm text-muted-foreground">Links Internos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30">
                <Link2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{realtimeCounts.articlesWithoutLinks}</p>
                <p className="text-sm text-muted-foreground">Sem Links</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                <Sparkles className="w-6 h-6 text-cyan-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{realtimeCounts.avgLinkability}%</p>
                <p className="text-sm text-muted-foreground">Linkabilidade Média</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="suggestions" className="space-y-4">
        <TabsList className="grid grid-cols-6 w-full max-w-3xl">
          <TabsTrigger value="suggestions">
            <Sparkles className="w-4 h-4 mr-2" />
            Sugestões IA
          </TabsTrigger>
          <TabsTrigger value="metrics">
            <BarChart3 className="w-4 h-4 mr-2" />
            Métricas
          </TabsTrigger>
          <TabsTrigger value="reports">
            <ClipboardList className="w-4 h-4 mr-2" />
            Relatórios
          </TabsTrigger>
          <TabsTrigger value="articles">Artigos</TabsTrigger>
          <TabsTrigger value="clusters">Clusters</TabsTrigger>
          <TabsTrigger value="rules">Regras</TabsTrigger>
        </TabsList>

        {/* AI Suggestions Tab */}
        <TabsContent value="suggestions">
          <AISuggestionsPanel projectId={projectId} />
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics">
          <InternalLinkingMetrics
            indexedArticles={indexedArticles}
            topicClusters={topicClusters}
            keywordRules={keywordRules}
            realtimeCounts={realtimeCounts}
          />
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports">
          <InternalLinkingReports
            indexedArticles={indexedArticles}
            topicClusters={topicClusters}
            keywordRules={keywordRules}
          />
        </TabsContent>

        {/* Indexed Articles Tab */}
        <TabsContent value="articles">
          <Card>
            <CardHeader>
              <CardTitle>Artigos Indexados</CardTitle>
              <CardDescription>
                Artigos analisados e disponíveis para linkagem automática
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : indexedArticles.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum artigo indexado ainda.</p>
                  <p className="text-sm">Clique em "Sincronizar" para indexar os artigos do WordPress.</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Keyword Principal</TableHead>
                        <TableHead>Cluster</TableHead>
                        <TableHead className="text-center">Linkabilidade</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {indexedArticles.map((article) => (
                        <TableRow key={article.id}>
                          <TableCell className="font-medium max-w-[300px] truncate">
                            {article.wp_post_title}
                          </TableCell>
                          <TableCell>
                            {article.primary_keyword ? (
                              <Badge variant="secondary">{article.primary_keyword}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {article.topic_cluster ? (
                              <Badge variant="outline">{article.topic_cluster}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    article.linkability_score >= 70 ? "bg-green-500" :
                                    article.linkability_score >= 40 ? "bg-amber-500" : "bg-red-500"
                                  )}
                                  style={{ width: `${article.linkability_score}%` }}
                                />
                              </div>
                              <span className="text-sm text-muted-foreground w-8">
                                {article.linkability_score}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(article.wp_post_url, '_blank')}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Topic Clusters Tab */}
        <TabsContent value="clusters">
          <Card>
            <CardHeader>
              <CardTitle>Clusters Temáticos</CardTitle>
              <CardDescription>
                Agrupamentos automáticos de artigos por tema com recomendações da IA
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topicClusters.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum cluster identificado ainda.</p>
                  <p className="text-sm">Clique em "Gerar Clusters" após indexar os artigos.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {topicClusters.map((cluster) => {
                    // AI Recommendations per cluster
                    const clusterArticles = indexedArticles.filter(a => a.topic_cluster === cluster.name);
                    const articlesWithoutLinks = clusterArticles.filter(a => {
                      // Check if the article has low linkability
                      return (a.linkability_score || 0) < 30;
                    });
                    const needsMoreContent = cluster.article_count < 5;
                    const lowStrength = cluster.cluster_strength < 40;
                    const recommendations: string[] = [];
                    
                    if (needsMoreContent) recommendations.push(`Criar +${5 - cluster.article_count} artigos para fortalecer o cluster`);
                    if (lowStrength) recommendations.push('Aumentar linkagem cruzada entre artigos do cluster');
                    if (articlesWithoutLinks.length > 0) recommendations.push(`${articlesWithoutLinks.length} artigos precisam de mais links internos`);
                    if (cluster.article_count > 0 && !cluster.primary_keywords?.length) recommendations.push('Definir keywords primárias para o cluster');

                    return (
                      <Card key={cluster.id} className="border-2">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-3">
                            <h4 className="font-semibold">{cluster.name}</h4>
                            <Badge variant="outline">{cluster.article_count} artigos</Badge>
                          </div>
                          
                          <div className="mb-3">
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Força do Cluster</span>
                              <span className="font-medium">{cluster.cluster_strength}%</span>
                            </div>
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  cluster.cluster_strength >= 70 ? "bg-green-500" :
                                  cluster.cluster_strength >= 40 ? "bg-amber-500" : "bg-red-500"
                                )}
                                style={{ width: `${cluster.cluster_strength}%` }}
                              />
                            </div>
                          </div>

                          {cluster.primary_keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-3">
                              {cluster.primary_keywords.slice(0, 4).map((kw, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {kw}
                                </Badge>
                              ))}
                              {cluster.primary_keywords.length > 4 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{cluster.primary_keywords.length - 4}
                                </Badge>
                              )}
                            </div>
                          )}

                          {/* AI Recommendations */}
                          {recommendations.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                <Sparkles className="w-3.5 h-3.5" />
                                Recomendações IA
                              </div>
                              {recommendations.map((rec, i) => (
                                <p key={i} className="text-xs text-muted-foreground pl-5">
                                  • {rec}
                                </p>
                              ))}
                            </div>
                          )}

                          {recommendations.length === 0 && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Cluster otimizado
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Keyword Rules Tab */}
        <TabsContent value="rules">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Regras de Linkagem</CardTitle>
                <CardDescription>
                  Defina palavras-chave que linkam automaticamente para URLs específicas
                </CardDescription>
              </div>
              <Dialog open={isAddRuleOpen} onOpenChange={setIsAddRuleOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Nova Regra
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova Regra de Linkagem</DialogTitle>
                    <DialogDescription>
                      Configure uma palavra-chave para linkar automaticamente
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Palavra-chave</Label>
                      <Input
                        placeholder="Ex: SEO WordPress"
                        value={newRule.keyword}
                        onChange={(e) => setNewRule({ ...newRule, keyword: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>URL de Destino</Label>
                      <Input
                        placeholder="https://exemplo.com/artigo"
                        value={newRule.target_url}
                        onChange={(e) => setNewRule({ ...newRule, target_url: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Título (opcional)</Label>
                      <Input
                        placeholder="Título para exibição"
                        value={newRule.target_title}
                        onChange={(e) => setNewRule({ ...newRule, target_title: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tipo de Match</Label>
                        <Select
                          value={newRule.match_type}
                          onValueChange={(v) => setNewRule({ ...newRule, match_type: v as any })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="exact">Exato</SelectItem>
                            <SelectItem value="partial">Parcial</SelectItem>
                            <SelectItem value="regex">Regex</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Máx. links/artigo</Label>
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={newRule.max_links_per_article}
                          onChange={(e) => setNewRule({ ...newRule, max_links_per_article: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddRuleOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleAddRule} disabled={!newRule.keyword || !newRule.target_url}>
                      Criar Regra
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {keywordRules.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma regra de linkagem configurada.</p>
                  <p className="text-sm">Crie regras para automatizar a inserção de links.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Palavra-chave</TableHead>
                      <TableHead>URL de Destino</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Aplicações</TableHead>
                      <TableHead className="text-center">Ativo</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keywordRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">
                          <Badge>{rule.keyword}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          <a
                            href={rule.target_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {rule.target_title || rule.target_url}
                          </a>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{rule.match_type}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {rule.times_applied}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={(checked) => toggleKeywordRule(rule.id, checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteKeywordRule(rule.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default InternalLinkingDashboard;
