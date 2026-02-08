import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Link2, 
  RefreshCw, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  Target,
  Zap,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjects } from '@/hooks/useProjects';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface LinkingStats {
  totalArticles: number;
  articlesWithLinks: number;
  articlesWithoutLinks: number;
  totalInternalLinks: number;
  averageLinksPerArticle: number;
  topClusters: Array<{
    name: string;
    articleCount: number;
    strength: number;
  }>;
  recentSuggestions: number;
  appliedSuggestions: number;
  pendingSuggestions: number;
  linkHealthScore: number;
}

export function InternalLinkingStatsWidget() {
  const { user } = useAuth();
  const { projects } = useProjects();
  const { toast } = useToast();
  const [stats, setStats] = useState<LinkingStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Get connected projects
  const connectedProjects = projects?.filter(p => p.is_connected) || [];

  useEffect(() => {
    if (connectedProjects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(connectedProjects[0].id);
    }
  }, [connectedProjects, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId && user) {
      fetchStats();
    }
  }, [selectedProjectId, user]);

  const fetchStats = async () => {
    if (!selectedProjectId || !user) return;

    setIsLoading(true);
    try {
      // Fetch article index stats
      const { data: indexData, error: indexError } = await supabase
        .from('wordpress_article_index')
        .select('id, internal_links_count, external_links_count, topic_cluster, linkability_score')
        .eq('project_id', selectedProjectId)
        .eq('user_id', user.id);

      if (indexError) throw indexError;

      // Fetch topic clusters
      const { data: clusterData, error: clusterError } = await supabase
        .from('topic_clusters')
        .select('name, article_count, cluster_strength')
        .eq('project_id', selectedProjectId)
        .eq('user_id', user.id)
        .order('cluster_strength', { ascending: false })
        .limit(5);

      if (clusterError) throw clusterError;

      // Fetch link suggestions
      const { data: suggestionsData, error: suggestionsError } = await supabase
        .from('internal_link_suggestions')
        .select('id, status')
        .eq('project_id', selectedProjectId)
        .eq('user_id', user.id);

      if (suggestionsError) throw suggestionsError;

      const articles = indexData || [];
      const articlesWithLinks = articles.filter(a => (a.internal_links_count || 0) > 0);
      const totalInternalLinks = articles.reduce((sum, a) => sum + (a.internal_links_count || 0), 0);
      
      const suggestions = suggestionsData || [];
      const appliedSuggestions = suggestions.filter(s => s.status === 'applied').length;
      const pendingSuggestions = suggestions.filter(s => s.status === 'pending').length;

      // Calculate link health score (0-100)
      const coverageScore = articles.length > 0 
        ? (articlesWithLinks.length / articles.length) * 40 
        : 0;
      const densityScore = articles.length > 0 
        ? Math.min(40, (totalInternalLinks / articles.length) * 10)
        : 0;
      const clusterScore = (clusterData?.length || 0) * 4;
      const linkHealthScore = Math.round(coverageScore + densityScore + clusterScore);

      // Map cluster data to expected format
      const mappedClusters = (clusterData || []).map(c => ({
        name: c.name,
        articleCount: c.article_count || 0,
        strength: c.cluster_strength || 0,
      }));

      setStats({
        totalArticles: articles.length,
        articlesWithLinks: articlesWithLinks.length,
        articlesWithoutLinks: articles.length - articlesWithLinks.length,
        totalInternalLinks,
        averageLinksPerArticle: articles.length > 0 
          ? Math.round((totalInternalLinks / articles.length) * 10) / 10 
          : 0,
        topClusters: mappedClusters,
        recentSuggestions: suggestions.length,
        appliedSuggestions,
        pendingSuggestions,
        linkHealthScore,
      });
    } catch (error) {
      console.error('Error fetching linking stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const runBacklinkAnalysis = async () => {
    if (!selectedProjectId || !user) return;

    setIsAnalyzing(true);
    try {
      // Call the edge function to generate backlink suggestions
      const { data, error } = await supabase.functions.invoke('analyze-wp-articles', {
        body: {
          action: 'generate_backlink_suggestions',
          project_id: selectedProjectId,
        },
      });

      if (error) throw error;

      toast({
        title: 'Análise concluída',
        description: `${data?.suggestions_created || 0} sugestões de backlinks geradas.`,
      });

      // Refresh stats
      fetchStats();
    } catch (error: any) {
      console.error('Error running backlink analysis:', error);
      toast({
        title: 'Erro na análise',
        description: error.message || 'Falha ao analisar backlinks',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (connectedProjects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Linkagem Interna
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Link2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Conecte um projeto WordPress para ver estatísticas de linkagem</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Linkagem Interna
            </CardTitle>
            <CardDescription>
              Estatísticas e sugestões de backlinks
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {connectedProjects.length > 1 && (
              <select
                value={selectedProjectId || ''}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="text-xs border rounded-md px-2 py-1 bg-background"
              >
                {connectedProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={runBacklinkAnalysis}
              disabled={isAnalyzing || isLoading}
            >
              <Zap className={cn("w-4 h-4 mr-1", isAnalyzing && "animate-pulse")} />
              {isAnalyzing ? 'Analisando...' : 'Analisar'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : stats ? (
          <>
            {/* Link Health Score */}
            <div className="p-4 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <span className="font-medium">Score de Saúde</span>
                </div>
                <Badge 
                  variant={stats.linkHealthScore >= 70 ? 'default' : stats.linkHealthScore >= 40 ? 'secondary' : 'destructive'}
                >
                  {stats.linkHealthScore}/100
                </Badge>
              </div>
              <Progress value={stats.linkHealthScore} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {stats.linkHealthScore >= 70 
                  ? 'Excelente! Sua estrutura de links está bem otimizada.'
                  : stats.linkHealthScore >= 40
                  ? 'Bom, mas há oportunidades de melhoria.'
                  : 'Precisa de atenção. Adicione mais links internos.'}
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{stats.totalArticles}</p>
                <p className="text-xs text-muted-foreground">Artigos Indexados</p>
              </div>
              <div className="text-center p-3 bg-accent/50 rounded-lg">
                <p className="text-2xl font-bold text-primary">{stats.articlesWithLinks}</p>
                <p className="text-xs text-muted-foreground">Com Links</p>
              </div>
              <div className="text-center p-3 bg-secondary/50 rounded-lg">
                <p className="text-2xl font-bold text-secondary-foreground">{stats.articlesWithoutLinks}</p>
                <p className="text-xs text-muted-foreground">Sem Links</p>
              </div>
              <div className="text-center p-3 bg-primary/10 rounded-lg">
                <p className="text-2xl font-bold text-primary">{stats.averageLinksPerArticle}</p>
                <p className="text-xs text-muted-foreground">Média/Artigo</p>
              </div>
            </div>

            {/* Suggestions Summary */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Sugestões de Links</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.pendingSuggestions} pendentes • {stats.appliedSuggestions} aplicadas
                  </p>
                </div>
              </div>
              {stats.pendingSuggestions > 0 && (
                <Badge variant="secondary" className="animate-pulse">
                  {stats.pendingSuggestions} novas
                </Badge>
              )}
            </div>

            {/* Top Clusters */}
            {stats.topClusters.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Clusters de Tópicos
                </p>
                <div className="space-y-2">
                  {stats.topClusters.slice(0, 3).map((cluster, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                      <span className="text-sm">{cluster.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {cluster.articleCount} artigos
                        </Badge>
                        <div className="w-16">
                          <Progress value={cluster.strength} className="h-1" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum dado disponível</p>
            <Button 
              variant="link" 
              size="sm" 
              onClick={runBacklinkAnalysis}
              className="mt-2"
            >
              Executar primeira análise
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
