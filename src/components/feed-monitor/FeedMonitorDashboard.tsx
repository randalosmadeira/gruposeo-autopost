import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import {
  Rss,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  TrendingUp,
  FileText,
  RefreshCw,
  Loader2,
  Zap,
  Target,
  BarChart3,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FeedStats {
  totalFeeds: number;
  activeFeeds: number;
  todayProcessed: number;
  todayPublished: number;
  successRate: number;
  avgProcessingTime: number;
  pendingReview: number;
  scheduledPosts: number;
}

interface FeedSource {
  id: string;
  feed_name: string;
  feed_url: string;
  is_active: boolean;
  last_run_at: string | null;
  articles_generated: number;
  niche: string | null;
  frequency: string | null;
  auto_publish: boolean | null;
}

interface ChartDataPoint {
  date: string;
  processed: number;
  published: number;
  approved: number;
  review: number;
}

interface Alert {
  id: string;
  type: 'warning' | 'info' | 'success' | 'error';
  message: string;
  timestamp: Date;
}

export function FeedMonitorDashboard() {
  const [stats, setStats] = useState<FeedStats>({
    totalFeeds: 0,
    activeFeeds: 0,
    todayProcessed: 0,
    todayPublished: 0,
    successRate: 0,
    avgProcessingTime: 0,
    pendingReview: 0,
    scheduledPosts: 0,
  });
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'24h' | '7d' | '30d'>('7d');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load RSS schedules (feeds)
      const { data: feedsData } = await supabase
        .from('rss_schedules')
        .select('*')
        .order('created_at', { ascending: false });

      if (feedsData) {
        setFeeds(feedsData);
        
        const activeFeeds = feedsData.filter(f => f.is_active);
        const totalGenerated = feedsData.reduce((sum, f) => sum + (f.articles_generated || 0), 0);

        // Load articles for stats
        const daysToFetch = selectedPeriod === '24h' ? 1 : selectedPeriod === '7d' ? 7 : 30;
        const startDate = subDays(new Date(), daysToFetch);

        const { data: articlesData } = await supabase
          .from('articles')
          .select('id, status, created_at, config')
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false });

        const rewriteArticles = articlesData?.filter(a => 
          (a.config as any)?.type === 'rewrite'
        ) || [];

        const todayStart = startOfDay(new Date()).toISOString();
        const todayArticles = rewriteArticles.filter(a => a.created_at >= todayStart);
        const publishedToday = todayArticles.filter(a => a.status === 'published');
        const pendingReview = rewriteArticles.filter(a => 
          (a.config as any)?.audit_status === 'review'
        );
        const approvedArticles = rewriteArticles.filter(a => 
          (a.config as any)?.audit_status === 'approved'
        );

        // Calculate success rate
        const successRate = rewriteArticles.length > 0
          ? Math.round((approvedArticles.length / rewriteArticles.length) * 100)
          : 0;

        setStats({
          totalFeeds: feedsData.length,
          activeFeeds: activeFeeds.length,
          todayProcessed: todayArticles.length,
          todayPublished: publishedToday.length,
          successRate,
          avgProcessingTime: 45, // Placeholder - would need actual timing data
          pendingReview: pendingReview.length,
          scheduledPosts: 0, // Would need scheduled_at data
        });

        // Build chart data
        const days = eachDayOfInterval({
          start: startDate,
          end: new Date(),
        });

        const chartPoints: ChartDataPoint[] = days.map(day => {
          const dayStart = startOfDay(day);
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);

          const dayArticles = rewriteArticles.filter(a => {
            const date = new Date(a.created_at);
            return date >= dayStart && date < dayEnd;
          });

          return {
            date: format(day, 'dd/MM', { locale: ptBR }),
            processed: dayArticles.length,
            published: dayArticles.filter(a => a.status === 'published').length,
            approved: dayArticles.filter(a => (a.config as any)?.audit_status === 'approved').length,
            review: dayArticles.filter(a => (a.config as any)?.audit_status === 'review').length,
          };
        });

        setChartData(chartPoints);

        // Generate alerts
        const newAlerts: Alert[] = [];
        
        if (pendingReview.length > 0) {
          newAlerts.push({
            id: 'pending-review',
            type: 'warning',
            message: `${pendingReview.length} artigo(s) aguardando revisão manual`,
            timestamp: new Date(),
          });
        }

        const inactiveFeeds = feedsData.filter(f => !f.is_active);
        if (inactiveFeeds.length > 0) {
          newAlerts.push({
            id: 'inactive-feeds',
            type: 'info',
            message: `${inactiveFeeds.length} feed(s) pausado(s)`,
            timestamp: new Date(),
          });
        }

        if (successRate >= 90) {
          newAlerts.push({
            id: 'high-success',
            type: 'success',
            message: `Excelente! Taxa de aprovação de ${successRate}%`,
            timestamp: new Date(),
          });
        }

        setAlerts(newAlerts);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadDashboardData();
    
    // Auto-refresh every minute
    const interval = setInterval(() => loadDashboardData(true), 60000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Monitor de Feeds
          </h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe o processamento de feeds RSS em tempo real
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadDashboardData(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", refreshing && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Rss className="w-4 h-4 text-primary" />
              Feeds Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.activeFeeds}</p>
            <p className="text-xs text-muted-foreground">
              de {stats.totalFeeds} cadastrados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Processados Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.todayProcessed}</p>
            <p className="text-xs text-muted-foreground">
              {stats.todayPublished} publicados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Taxa de Sucesso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn(
              "text-2xl font-bold",
              stats.successRate >= 90 ? "text-success" :
              stats.successRate >= 70 ? "text-warning" : "text-destructive"
            )}>
              {stats.successRate}%
            </p>
            <p className="text-xs text-muted-foreground">
              últimas {selectedPeriod === '24h' ? '24h' : selectedPeriod === '7d' ? '7 dias' : '30 dias'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Tempo Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.avgProcessingTime}s</p>
            <p className="text-xs text-muted-foreground">
              por artigo
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Performance de Processamento
              </CardTitle>
              <CardDescription>
                Artigos processados e publicados por dia
              </CardDescription>
            </div>
            <div className="flex gap-1">
              {(['24h', '7d', '30d'] as const).map((period) => (
                <Button
                  key={period}
                  variant={selectedPeriod === period ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedPeriod(period)}
                >
                  {period === '24h' ? '24h' : period === '7d' ? '7 dias' : '30 dias'}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="processed" name="Processados" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="approved" name="Aprovados" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="review" name="Em Revisão" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Feeds List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rss className="w-5 h-5" />
              Feeds Monitorados
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[300px]">
              <div className="divide-y divide-border">
                {feeds.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <Rss className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhum feed cadastrado</p>
                  </div>
                ) : (
                  feeds.map((feed) => (
                    <FeedSourceCard key={feed.id} feed={feed} />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Alertas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AlertsList alerts={alerts} stats={stats} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FeedSourceCard({ feed }: { feed: FeedSource }) {
  const getStatusBadge = () => {
    if (feed.is_active) {
      return <Badge className="bg-success/20 text-success border-success/30">Ativo</Badge>;
    }
    return <Badge variant="secondary">Pausado</Badge>;
  };

  const getFrequencyLabel = (freq: string | null) => {
    const labels: Record<string, string> = {
      hourly: 'A cada hora',
      twice_daily: '2x/dia',
      daily: 'Diário',
      weekly: 'Semanal',
    };
    return labels[freq || 'daily'] || freq;
  };

  return (
    <div className={cn(
      "p-4 transition-colors hover:bg-muted/50",
      !feed.is_active && "opacity-60"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Rss className={cn(
              "w-4 h-4 shrink-0",
              feed.is_active ? "text-primary" : "text-muted-foreground"
            )} />
            <span className="font-medium text-sm">{feed.feed_name}</span>
            {getStatusBadge()}
            {feed.auto_publish && (
              <Badge variant="outline" className="text-xs">
                <Zap className="w-3 h-3 mr-1" />
                Auto
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {feed.feed_url}
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {getFrequencyLabel(feed.frequency)}
            </span>
            {feed.niche && (
              <Badge variant="outline" className="text-xs">
                {feed.niche}
              </Badge>
            )}
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {feed.articles_generated || 0} artigos
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          {feed.last_run_at && (
            <p className="text-xs text-muted-foreground">
              Última: {format(new Date(feed.last_run_at), "dd/MM HH:mm", { locale: ptBR })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AlertsList({ alerts, stats }: { alerts: Alert[]; stats: FeedStats }) {
  const allAlerts = [...alerts];

  if (stats.pendingReview > 0 && !alerts.find(a => a.id === 'pending-review')) {
    allAlerts.push({
      id: 'pending-review-stat',
      type: 'warning',
      message: `${stats.pendingReview} artigo(s) aguardando revisão`,
      timestamp: new Date(),
    });
  }

  if (stats.scheduledPosts > 0) {
    allAlerts.push({
      id: 'scheduled',
      type: 'info',
      message: `${stats.scheduledPosts} publicação(ões) agendada(s)`,
      timestamp: new Date(),
    });
  }

  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-warning" />;
      case 'error': return <XCircle className="w-4 h-4 text-destructive" />;
      default: return <Bell className="w-4 h-4 text-primary" />;
    }
  };

  const getAlertBg = (type: Alert['type']) => {
    switch (type) {
      case 'success': return 'bg-success/10 border-success/20';
      case 'warning': return 'bg-warning/10 border-warning/20';
      case 'error': return 'bg-destructive/10 border-destructive/20';
      default: return 'bg-primary/10 border-primary/20';
    }
  };

  if (allAlerts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Tudo em ordem! Nenhum alerta no momento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {allAlerts.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            "p-3 rounded-lg border flex items-start gap-3",
            getAlertBg(alert.type)
          )}
        >
          {getAlertIcon(alert.type)}
          <div className="flex-1">
            <p className="text-sm font-medium">{alert.message}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {format(alert.timestamp, "HH:mm", { locale: ptBR })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
