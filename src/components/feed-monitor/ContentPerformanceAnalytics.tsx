import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Target,
  BarChart3,
  PieChartIcon,
  Sparkles,
  Award,
  Clock,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ArticlePerformance {
  id: string;
  title: string;
  created_at: string;
  status: string;
  word_count: number | null;
  seo_score: number | null;
  config: {
    audit_status?: string;
    originality_score?: number;
    quality_score?: number;
    niche?: string;
  } | null;
}

interface PerformanceMetrics {
  totalArticles: number;
  approvedCount: number;
  reviewCount: number;
  rejectedCount: number;
  avgOriginality: number;
  avgQuality: number;
  avgSeoScore: number;
  avgWordCount: number;
}

interface NichePerformance {
  name: string;
  value: number;
  avgQuality: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', '#8b5cf6'];

export function ContentPerformanceAnalytics() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    totalArticles: 0,
    approvedCount: 0,
    reviewCount: 0,
    rejectedCount: 0,
    avgOriginality: 0,
    avgQuality: 0,
    avgSeoScore: 0,
    avgWordCount: 0,
  });
  const [topArticles, setTopArticles] = useState<ArticlePerformance[]>([]);
  const [nicheData, setNicheData] = useState<NichePerformance[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('7d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [selectedPeriod]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const daysToFetch = selectedPeriod === 'today' ? 1 : 
                          selectedPeriod === '7d' ? 7 : 
                          selectedPeriod === '30d' ? 30 : 90;
      const startDate = subDays(new Date(), daysToFetch);

      const { data: articles, error } = await supabase
        .from('articles')
        .select('id, title, created_at, status, word_count, seo_score, config')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter rewrite articles
      const rewriteArticles = (articles || []).filter(a => 
        (a.config as any)?.type === 'rewrite'
      ) as ArticlePerformance[];

      // Calculate metrics
      const approved = rewriteArticles.filter(a => (a.config as any)?.audit_status === 'approved');
      const review = rewriteArticles.filter(a => (a.config as any)?.audit_status === 'review');
      const rejected = rewriteArticles.filter(a => (a.config as any)?.audit_status === 'rejected');

      const origScores = rewriteArticles
        .map(a => (a.config as any)?.originality_score)
        .filter(Boolean);
      const qualityScores = rewriteArticles
        .map(a => (a.config as any)?.quality_score)
        .filter(Boolean);
      const seoScores = rewriteArticles
        .map(a => a.seo_score)
        .filter(Boolean);
      const wordCounts = rewriteArticles
        .map(a => a.word_count)
        .filter(Boolean);

      const avgOrig = origScores.length > 0 
        ? Math.round(origScores.reduce((a, b) => a + b, 0) / origScores.length) 
        : 0;
      const avgQual = qualityScores.length > 0 
        ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) 
        : 0;
      const avgSeo = seoScores.length > 0 
        ? Math.round(seoScores.reduce((a, b) => a + b, 0) / seoScores.length) 
        : 0;
      const avgWords = wordCounts.length > 0 
        ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length) 
        : 0;

      setMetrics({
        totalArticles: rewriteArticles.length,
        approvedCount: approved.length,
        reviewCount: review.length,
        rejectedCount: rejected.length,
        avgOriginality: avgOrig,
        avgQuality: avgQual,
        avgSeoScore: avgSeo,
        avgWordCount: avgWords,
      });

      // Top performing articles (by quality score)
      const sorted = [...rewriteArticles]
        .sort((a, b) => {
          const scoreA = (a.config as any)?.quality_score || 0;
          const scoreB = (b.config as any)?.quality_score || 0;
          return scoreB - scoreA;
        })
        .slice(0, 10);
      setTopArticles(sorted);

      // Niche distribution
      const nicheMap = new Map<string, { count: number; totalQuality: number }>();
      rewriteArticles.forEach(a => {
        const niche = (a.config as any)?.niche || 'geral';
        const quality = (a.config as any)?.quality_score || 0;
        const existing = nicheMap.get(niche) || { count: 0, totalQuality: 0 };
        nicheMap.set(niche, {
          count: existing.count + 1,
          totalQuality: existing.totalQuality + quality,
        });
      });

      const nichePerf: NichePerformance[] = Array.from(nicheMap.entries()).map(([name, data]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: data.count,
        avgQuality: data.count > 0 ? Math.round(data.totalQuality / data.count) : 0,
      }));

      setNicheData(nichePerf);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusData = [
    { name: 'Aprovados', value: metrics.approvedCount, color: 'hsl(var(--success))' },
    { name: 'Em Revisão', value: metrics.reviewCount, color: 'hsl(var(--warning))' },
    { name: 'Reprovados', value: metrics.rejectedCount, color: 'hsl(var(--destructive))' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Analytics de Performance
          </h2>
          <p className="text-sm text-muted-foreground">
            Métricas de qualidade e desempenho dos artigos gerados
          </p>
        </div>
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Originalidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn(
              "text-2xl font-bold",
              metrics.avgOriginality >= 95 ? "text-success" :
              metrics.avgOriginality >= 85 ? "text-warning" : "text-destructive"
            )}>
              {metrics.avgOriginality}%
            </p>
            <p className="text-xs text-muted-foreground">
              média geral
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" />
              Qualidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn(
              "text-2xl font-bold",
              metrics.avgQuality >= 85 ? "text-success" :
              metrics.avgQuality >= 70 ? "text-warning" : "text-destructive"
            )}>
              {metrics.avgQuality}%
            </p>
            <p className="text-xs text-muted-foreground">
              média geral
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Score SEO
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn(
              "text-2xl font-bold",
              metrics.avgSeoScore >= 80 ? "text-success" :
              metrics.avgSeoScore >= 60 ? "text-warning" : "text-destructive"
            )}>
              {metrics.avgSeoScore}
            </p>
            <p className="text-xs text-muted-foreground">
              pontuação média
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Palavras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {metrics.avgWordCount}
            </p>
            <p className="text-xs text-muted-foreground">
              média por artigo
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5" />
              Distribuição por Status
            </CardTitle>
            <CardDescription>
              {metrics.totalArticles} artigos no período
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <PieChartIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Sem dados no período</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Niche Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Performance por Nicho
            </CardTitle>
            <CardDescription>
              Qualidade média por categoria
            </CardDescription>
          </CardHeader>
          <CardContent>
            {nicheData.length > 0 ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={nicheData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis type="category" dataKey="name" width={100} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value}%`, 'Qualidade']}
                    />
                    <Bar 
                      dataKey="avgQuality" 
                      fill="hsl(var(--primary))" 
                      radius={[0, 4, 4, 0]}
                      name="Qualidade Média"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Sem dados no período</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Articles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="w-5 h-5" />
            Artigos com Melhor Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[350px]">
            <div className="divide-y divide-border">
              {topArticles.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum artigo no período</p>
                </div>
              ) : (
                topArticles.map((article, index) => (
                  <ArticlePerformanceCard 
                    key={article.id} 
                    article={article} 
                    rank={index + 1} 
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Optimization Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-warning" />
            Recomendações de Otimização
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OptimizationSuggestions metrics={metrics} />
        </CardContent>
      </Card>
    </div>
  );
}

function ArticlePerformanceCard({ article, rank }: { article: ArticlePerformance; rank: number }) {
  const config = article.config as any;
  const auditStatus = config?.audit_status;
  const qualityScore = config?.quality_score || 0;
  const originalityScore = config?.originality_score || 0;

  const getStatusIcon = () => {
    switch (auditStatus) {
      case 'approved': return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'review': return <AlertTriangle className="w-4 h-4 text-warning" />;
      case 'rejected': return <XCircle className="w-4 h-4 text-destructive" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="p-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
          #{rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <h4 className="font-medium text-sm line-clamp-1">
              {article.title || 'Sem título'}
            </h4>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Publicado em {format(new Date(article.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
          <div className="flex items-center gap-3 mt-2">
            {config?.niche && (
              <Badge variant="outline" className="text-xs">
                {config.niche}
              </Badge>
            )}
            {article.word_count && (
              <span className="text-xs text-muted-foreground">
                {article.word_count} palavras
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={cn(
            "text-lg font-bold",
            qualityScore >= 85 ? "text-success" :
            qualityScore >= 70 ? "text-warning" : "text-muted-foreground"
          )}>
            {qualityScore}%
          </p>
          <p className="text-xs text-muted-foreground">
            {originalityScore}% original
          </p>
        </div>
      </div>
    </div>
  );
}

function OptimizationSuggestions({ metrics }: { metrics: PerformanceMetrics }) {
  const suggestions: Array<{
    type: 'warning' | 'info' | 'tip';
    title: string;
    message: string;
    action: string;
  }> = [];

  if (metrics.avgOriginality < 95) {
    suggestions.push({
      type: 'warning',
      title: 'Originalidade Baixa',
      message: `Média de ${metrics.avgOriginality}%. Considere usar ângulos de análise mais únicos ou adicionar mais contexto brasileiro.`,
      action: 'Ajustar Prompts',
    });
  }

  if (metrics.avgQuality < 85) {
    suggestions.push({
      type: 'info',
      title: 'Qualidade Pode Melhorar',
      message: 'Experimente aumentar o tamanho dos artigos e usar nichos especializados como Advocacia ou Saúde.',
      action: 'Ver Estratégias',
    });
  }

  if (metrics.avgWordCount < 600) {
    suggestions.push({
      type: 'tip',
      title: 'Aumente o Tamanho dos Artigos',
      message: 'Artigos com mais de 800 palavras tendem a ter melhor engajamento e SEO.',
      action: 'Configurar Tamanho',
    });
  }

  if (metrics.reviewCount > metrics.approvedCount) {
    suggestions.push({
      type: 'warning',
      title: 'Muitos Artigos em Revisão',
      message: 'Mais artigos estão em revisão do que aprovados. Verifique os critérios de qualidade.',
      action: 'Revisar Critérios',
    });
  }

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-success" />
        <p className="text-sm">Excelente! Suas métricas estão ótimas.</p>
      </div>
    );
  }

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'warning': return 'bg-warning/10 border-warning/20';
      case 'info': return 'bg-primary/10 border-primary/20';
      default: return 'bg-success/10 border-success/20';
    }
  };

  return (
    <div className="space-y-3">
      {suggestions.map((sug, index) => (
        <div
          key={index}
          className={cn(
            "p-4 rounded-lg border flex items-start justify-between gap-4",
            getTypeStyles(sug.type)
          )}
        >
          <div className="flex-1">
            <h4 className="font-medium text-sm">{sug.title}</h4>
            <p className="text-xs text-muted-foreground mt-1">{sug.message}</p>
          </div>
          <Button variant="outline" size="sm">
            {sug.action}
          </Button>
        </div>
      ))}
    </div>
  );
}
