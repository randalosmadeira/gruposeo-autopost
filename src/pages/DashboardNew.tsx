import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useArticles } from '@/hooks/useArticles';
import { useProjects } from '@/hooks/useProjects';
import { useNewsAgents } from '@/hooks/useNewsAgents';
import { 
  LayoutDashboard,
  FileText,
  Newspaper,
  FolderKanban,
  Calendar,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  ChevronRight,
  Loader2,
  Zap,
  Target,
  Clock,
  CheckCircle2,
  AlertCircle,
  ImageIcon,
  BarChart3,
  Globe,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { format, subDays, isToday, isThisWeek, isThisMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import logoSeo from '@/assets/logo-grupo-seo.png';

// Quick action card component
function QuickActionCard({ 
  icon: Icon, 
  title, 
  description, 
  href, 
  color 
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string; 
  href: string; 
  color: string;
}) {
  return (
    <Link 
      to={href}
      className="group flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-card-hover transition-all"
    >
      <div className={cn('p-3 rounded-xl', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
    </Link>
  );
}

// Stat card component
function StatCard({ 
  title, 
  value, 
  change, 
  changeType, 
  icon: Icon,
  iconColor
}: { 
  title: string; 
  value: number | string; 
  change?: string; 
  changeType?: 'up' | 'down' | 'neutral';
  icon: React.ElementType;
  iconColor: string;
}) {
  return (
    <Card className="border-0 shadow-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold text-foreground">{value}</p>
            {change && (
              <div className={cn(
                'flex items-center gap-1 mt-2 text-sm',
                changeType === 'up' && 'text-green-600',
                changeType === 'down' && 'text-red-600',
                changeType === 'neutral' && 'text-muted-foreground'
              )}>
                {changeType === 'up' && <ArrowUpRight className="w-4 h-4" />}
                {changeType === 'down' && <ArrowDownRight className="w-4 h-4" />}
                <span>{change}</span>
              </div>
            )}
          </div>
          <div className={cn('p-3 rounded-xl', iconColor)}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Recent content item component
function RecentContentItem({ 
  title, 
  status, 
  date, 
  imageUrl,
  onClick
}: { 
  title: string; 
  status: string; 
  date: Date;
  imageUrl?: string | null;
  onClick: () => void;
}) {
  const statusConfig: Record<string, { color: string; bgColor: string; label: string }> = {
    published: { color: 'text-green-700', bgColor: 'bg-green-100', label: 'Publicado' },
    ready: { color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Pronto' },
    draft: { color: 'text-gray-700', bgColor: 'bg-gray-100', label: 'Rascunho' },
    generating: { color: 'text-amber-700', bgColor: 'bg-amber-100', label: 'Gerando' },
    error: { color: 'text-red-700', bgColor: 'bg-red-100', label: 'Erro' },
  };
  
  const config = statusConfig[status] || statusConfig.draft;
  
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left group"
    >
      {imageUrl ? (
        <img 
          src={imageUrl} 
          alt=""
          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <ImageIcon className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {title}
        </p>
        <p className="text-xs text-muted-foreground">
          {format(date, "dd MMM 'às' HH:mm", { locale: ptBR })}
        </p>
      </div>
      <Badge className={cn('text-xs', config.bgColor, config.color)}>
        {config.label}
      </Badge>
    </button>
  );
}

export default function DashboardNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { articles, stats, isLoading: articlesLoading } = useArticles();
  const { projects, isLoading: projectsLoading } = useProjects();
  const { agents, activeAgentsCount, totalArticles: agentArticles } = useNewsAgents();

  // Calculate stats
  const dashboardStats = useMemo(() => {
    if (!articles) return { total: 0, thisWeek: 0, thisMonth: 0, published: 0 };
    
    const thisWeek = articles.filter(a => isThisWeek(new Date(a.created_at))).length;
    const thisMonth = articles.filter(a => isThisMonth(new Date(a.created_at))).length;
    const published = articles.filter(a => a.status === 'published').length;
    
    return {
      total: articles.length,
      thisWeek,
      thisMonth,
      published,
    };
  }, [articles]);

  // Recent articles
  const recentArticles = useMemo(() => {
    if (!articles) return [];
    return [...articles]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [articles]);

  // Projects stats
  const projectStats = useMemo(() => {
    if (!projects) return [];
    return projects.map(project => {
      const projectArticles = articles?.filter(a => a.project_id === project.id) || [];
      return {
        ...project,
        articleCount: projectArticles.length,
        publishedCount: projectArticles.filter(a => a.status === 'published').length,
      };
    });
  }, [projects, articles]);

  if (articlesLoading || projectsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={logoSeo} alt="GRUPO SEO MKT" className="w-10 h-10" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Painel de Controle</h1>
              <p className="text-sm text-muted-foreground">
                Visão 360° da sua produção de conteúdo
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              variant="outline"
              onClick={() => navigate('/calendar')}
            >
              <Calendar className="w-4 h-4 mr-2" />
              Calendário
            </Button>
            <Button 
              onClick={() => navigate('/articles/new')} 
              className="bg-gradient-accent hover:opacity-90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Conteúdo
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total de Artigos"
            value={dashboardStats.total}
            change={`${dashboardStats.thisWeek} esta semana`}
            changeType="neutral"
            icon={FileText}
            iconColor="bg-primary"
          />
          <StatCard
            title="Publicados"
            value={dashboardStats.published}
            change={`${Math.round((dashboardStats.published / Math.max(dashboardStats.total, 1)) * 100)}% do total`}
            changeType="up"
            icon={CheckCircle2}
            iconColor="bg-green-500"
          />
          <StatCard
            title="Projetos Ativos"
            value={projects?.length || 0}
            icon={FolderKanban}
            iconColor="bg-amber-500"
          />
          <StatCard
            title="Agentes de Notícias"
            value={activeAgentsCount}
            change={`${agentArticles} artigos gerados`}
            changeType="neutral"
            icon={Newspaper}
            iconColor="bg-purple-500"
          />
        </div>

        {/* Quick Actions */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" />
              Ações Rápidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <QuickActionCard
                icon={FileText}
                title="Novo Artigo"
                description="Criar artigo com IA"
                href="/articles/new"
                color="bg-primary"
              />
              <QuickActionCard
                icon={Target}
                title="Landing Page"
                description="Página de vendas"
                href="/landing-page/new"
                color="bg-gradient-accent"
              />
              <QuickActionCard
                icon={Newspaper}
                title="Novo Agente"
                description="Automatizar notícias"
                href="/news-agents/new"
                color="bg-purple-500"
              />
              <QuickActionCard
                icon={Calendar}
                title="Calendário"
                description="Ver linha editorial"
                href="/calendar"
                color="bg-green-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Content */}
          <Card className="lg:col-span-2 border-0 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Conteúdo Recente</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/articles')}>
                Ver todos
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {recentArticles.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhum artigo ainda</p>
                  <Button 
                    onClick={() => navigate('/articles/new')}
                    className="mt-3 bg-gradient-accent"
                  >
                    Criar primeiro artigo
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentArticles.map(article => (
                    <RecentContentItem
                      key={article.id}
                      title={article.title || article.keyword}
                      status={article.status}
                      date={new Date(article.created_at)}
                      imageUrl={article.featured_image_url}
                      onClick={() => navigate(`/articles/${article.id}`)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Projects Overview */}
          <Card className="border-0 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Projetos</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
                Gerenciar
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {projectStats.length === 0 ? (
                <div className="text-center py-8">
                  <FolderKanban className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhum projeto</p>
                  <Button 
                    onClick={() => navigate('/projects')}
                    variant="outline"
                    className="mt-3"
                  >
                    Criar projeto
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {projectStats.slice(0, 4).map(project => (
                    <div 
                      key={project.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigate('/projects')}
                    >
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Globe className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">
                          {project.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {project.domain}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {project.articleCount}
                        </p>
                        <p className="text-xs text-muted-foreground">artigos</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Performance Overview */}
        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Desempenho Mensal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Artigos do mês</span>
                  <span className="font-semibold">{dashboardStats.thisMonth}</span>
                </div>
                <Progress value={Math.min(dashboardStats.thisMonth * 10, 100)} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Taxa de publicação</span>
                  <span className="font-semibold">
                    {Math.round((dashboardStats.published / Math.max(dashboardStats.total, 1)) * 100)}%
                  </span>
                </div>
                <Progress 
                  value={Math.round((dashboardStats.published / Math.max(dashboardStats.total, 1)) * 100)} 
                  className="h-2" 
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Agentes ativos</span>
                  <span className="font-semibold">{activeAgentsCount}</span>
                </div>
                <Progress value={activeAgentsCount * 20} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
