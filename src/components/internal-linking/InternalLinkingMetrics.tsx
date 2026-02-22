import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Link2,
  FileText,
  Layers,
  Target,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  PieChartIcon,
} from 'lucide-react';
import type { IndexedArticle, TopicCluster, KeywordRule } from '@/hooks/useInternalLinking';

interface RealtimeCounts {
  indexedArticles: number;
  topicClusters: number;
  totalInternalLinks: number;
  articlesWithoutLinks: number;
  avgLinkability: number;
}

interface InternalLinkingMetricsProps {
  indexedArticles: IndexedArticle[];
  topicClusters: TopicCluster[];
  keywordRules: KeywordRule[];
  realtimeCounts?: RealtimeCounts;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

export function InternalLinkingMetrics({
  indexedArticles,
  topicClusters,
  keywordRules,
  realtimeCounts,
}: InternalLinkingMetricsProps) {
  // Calculate metrics
  const metrics = useMemo(() => {
    const totalArticles = realtimeCounts?.indexedArticles || indexedArticles.length;
    const avgLinkabilityScore = realtimeCounts?.avgLinkability || (indexedArticles.length > 0
      ? Math.round(indexedArticles.reduce((sum, a) => sum + (a.linkability_score || 0), 0) / indexedArticles.length)
      : 0);

    // Articles by cluster
    const articlesByCluster = topicClusters.map(c => ({
      name: c.name.length > 15 ? c.name.substring(0, 15) + '...' : c.name,
      fullName: c.name,
      value: c.article_count,
      strength: c.cluster_strength,
    })).slice(0, 8);

    // Linkability distribution
    const linkabilityDistribution = [
      { range: '0-20', count: indexedArticles.filter(a => a.linkability_score <= 20).length, color: '#ef4444' },
      { range: '21-40', count: indexedArticles.filter(a => a.linkability_score > 20 && a.linkability_score <= 40).length, color: '#f59e0b' },
      { range: '41-60', count: indexedArticles.filter(a => a.linkability_score > 40 && a.linkability_score <= 60).length, color: '#eab308' },
      { range: '61-80', count: indexedArticles.filter(a => a.linkability_score > 60 && a.linkability_score <= 80).length, color: '#22c55e' },
      { range: '81-100', count: indexedArticles.filter(a => a.linkability_score > 80).length, color: '#10b981' },
    ];

    // Top keywords from indexed articles
    const keywordCounts: Record<string, number> = {};
    indexedArticles.forEach(article => {
      if (article.primary_keyword) {
        keywordCounts[article.primary_keyword] = (keywordCounts[article.primary_keyword] || 0) + 1;
      }
      article.secondary_keywords?.forEach(kw => {
        keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
      });
    });

    const topKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));

    // Articles without cluster
    const articlesWithoutCluster = indexedArticles.filter(a => !a.topic_cluster).length;

    // Active vs inactive rules
    const activeRules = keywordRules.filter(r => r.is_active).length;
    const totalLinksApplied = keywordRules.reduce((sum, r) => sum + r.times_applied, 0);

    // Health score calculation
    const clusterCoverage = totalArticles > 0 ? ((totalArticles - articlesWithoutCluster) / totalArticles) * 100 : 0;
    const healthScore = Math.round(
      (avgLinkabilityScore * 0.4) + (clusterCoverage * 0.3) + (Math.min(activeRules * 10, 30))
    );

    return {
      totalArticles,
      avgLinkabilityScore,
      articlesByCluster,
      linkabilityDistribution,
      topKeywords,
      articlesWithoutCluster,
      activeRules,
      totalLinksApplied,
      clusterCoverage,
      healthScore,
    };
  }, [indexedArticles, topicClusters, keywordRules]);

  // Health status based on score
  const getHealthStatus = (score: number) => {
    if (score >= 70) return { label: 'Excelente', color: 'text-green-500', icon: CheckCircle2 };
    if (score >= 50) return { label: 'Bom', color: 'text-amber-500', icon: TrendingUp };
    return { label: 'Precisa Atenção', color: 'text-red-500', icon: AlertTriangle };
  };

  const healthStatus = getHealthStatus(metrics.healthScore);
  const HealthIcon = healthStatus.icon;

  return (
    <div className="space-y-6">
      {/* Health Score Card */}
      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Saúde da Linkagem Interna
          </CardTitle>
          <CardDescription>
            Score geral baseado em cobertura de clusters, linkabilidade e regras ativas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative w-32 h-32">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="transparent"
                  className="text-muted"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 56}`}
                  strokeDashoffset={`${2 * Math.PI * 56 * (1 - metrics.healthScore / 100)}`}
                  className={healthStatus.color.replace('text-', 'text-')}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold">{metrics.healthScore}</span>
                <span className="text-xs text-muted-foreground">de 100</span>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Cobertura de Clusters</p>
                <div className="flex items-center gap-2">
                  <Progress value={metrics.clusterCoverage} className="flex-1" />
                  <span className="text-sm font-medium">{Math.round(metrics.clusterCoverage)}%</span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Linkabilidade Média</p>
                <div className="flex items-center gap-2">
                  <Progress value={metrics.avgLinkabilityScore} className="flex-1" />
                  <span className="text-sm font-medium">{metrics.avgLinkabilityScore}%</span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Regras Ativas</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {metrics.activeRules} / {keywordRules.length}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <HealthIcon className={`w-8 h-8 ${healthStatus.color}`} />
              <div>
                <p className={`font-semibold ${healthStatus.color}`}>{healthStatus.label}</p>
                <p className="text-xs text-muted-foreground">Status geral</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Linkability Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Distribuição de Linkabilidade
            </CardTitle>
            <CardDescription>
              Como os artigos estão distribuídos por score de linkabilidade
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={metrics.linkabilityDistribution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="range" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="count" name="Artigos">
                  {metrics.linkabilityDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Articles by Cluster */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="w-4 h-4" />
              Artigos por Cluster
            </CardTitle>
            <CardDescription>
              Distribuição de artigos entre os clusters temáticos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.articlesByCluster.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={metrics.articlesByCluster}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {metrics.articlesByCluster.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value, name, props) => [value, props.payload.fullName]}
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    formatter={(value, entry: any) => (
                      <span className="text-xs text-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum cluster gerado ainda</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Keywords & Cluster Strength */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Keywords */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4" />
              Keywords Mais Frequentes
            </CardTitle>
            <CardDescription>
              Palavras-chave mais presentes nos artigos indexados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.topKeywords.length > 0 ? (
                metrics.topKeywords.map((kw, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm font-medium text-muted-foreground">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate max-w-[200px]">
                          {kw.keyword}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {kw.count}x
                        </Badge>
                      </div>
                      <Progress
                        value={(kw.count / metrics.topKeywords[0].count) * 100}
                        className="h-1.5"
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma keyword identificada</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cluster Strength */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Força dos Clusters
            </CardTitle>
            <CardDescription>
              Pontuação de relevância e coesão de cada cluster temático
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topicClusters.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={topicClusters.slice(0, 8).map(c => ({
                    name: c.name.length > 12 ? c.name.substring(0, 12) + '...' : c.name,
                    strength: c.cluster_strength,
                    articles: c.article_count,
                  }))}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" domain={[0, 100]} className="text-xs" />
                  <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="strength" name="Força" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Gere os clusters primeiro</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{metrics.articlesWithoutCluster}</p>
                <p className="text-sm text-muted-foreground">Sem Cluster</p>
              </div>
              {metrics.articlesWithoutCluster > 0 ? (
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{metrics.totalLinksApplied}</p>
                <p className="text-sm text-muted-foreground">Links Aplicados</p>
              </div>
              <Link2 className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{topicClusters.length}</p>
                <p className="text-sm text-muted-foreground">Clusters</p>
              </div>
              <Layers className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{metrics.topKeywords.length}</p>
                <p className="text-sm text-muted-foreground">Keywords Únicas</p>
              </div>
              <Target className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
