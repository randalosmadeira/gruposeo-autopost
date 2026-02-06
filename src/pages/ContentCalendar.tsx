import { useState, useMemo, useCallback } from 'react';
import { useArticles } from '@/hooks/useArticles';
import { useProjects } from '@/hooks/useProjects';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter,
  Loader2,
  FileText,
  Newspaper,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import logoSeo from '@/assets/logo-grupo-seo.png';

type ContentStatus = 'scheduled' | 'generating' | 'draft' | 'published' | 'error';

interface ContentItem {
  id: string;
  title: string;
  type: 'article' | 'news' | 'landing';
  status: ContentStatus;
  date: Date;
  imageUrl?: string | null;
  projectId?: string | null;
  projectName?: string;
}

const statusConfig: Record<ContentStatus, { 
  label: string; 
  color: string; 
  bgColor: string;
  icon: React.ElementType;
}> = {
  scheduled: { 
    label: 'Agendado', 
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: Clock,
  },
  generating: { 
    label: 'Gerando', 
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: RefreshCw,
  },
  draft: { 
    label: 'Rascunho', 
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: FileText,
  },
  published: { 
    label: 'Publicado', 
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: CheckCircle2,
  },
  error: { 
    label: 'Erro', 
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: AlertCircle,
  },
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function ContentCalendar() {
  const navigate = useNavigate();
  const { articles, isLoading: articlesLoading } = useArticles();
  const { projects, isLoading: projectsLoading } = useProjects();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [hoveredDay, setHoveredDay] = useState<Date | null>(null);

  // Convert articles to content items
  const contentItems = useMemo((): ContentItem[] => {
    if (!articles) return [];
    
    return articles.map(article => ({
      id: article.id,
      title: article.title || article.keyword,
      type: article.type === 'blog' ? 'article' : 'landing',
      status: article.status as ContentStatus,
      date: new Date(article.created_at),
      imageUrl: article.featured_image_url,
      projectId: article.project_id,
      projectName: projects?.find(p => p.id === article.project_id)?.name,
    }));
  }, [articles, projects]);

  // Filter content by project and status
  const filteredContent = useMemo(() => {
    return contentItems.filter(item => {
      const matchesProject = selectedProject === 'all' || item.projectId === selectedProject;
      const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;
      return matchesProject && matchesStatus;
    });
  }, [contentItems, selectedProject, selectedStatus]);

  // Get calendar days
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start, end });
    
    // Add padding days for the start of the month
    const startDayOfWeek = getDay(start);
    const paddingDays = Array(startDayOfWeek).fill(null);
    
    return [...paddingDays, ...days];
  }, [currentDate]);

  // Get content for a specific day
  const getContentForDay = useCallback((day: Date) => {
    return filteredContent.filter(item => isSameDay(item.date, day));
  }, [filteredContent]);

  // Navigation
  const goToPreviousMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Stats
  const stats = useMemo(() => ({
    scheduled: filteredContent.filter(c => c.status === 'scheduled').length,
    generating: filteredContent.filter(c => c.status === 'generating').length,
    draft: filteredContent.filter(c => c.status === 'draft').length,
    published: filteredContent.filter(c => c.status === 'published').length,
  }), [filteredContent]);

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
            <div className="p-2 bg-gradient-accent rounded-xl">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Calendário de Conteúdo</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie sua linha editorial e acompanhe todas as publicações
              </p>
            </div>
          </div>
          
          <Button 
            onClick={() => navigate('/articles/new')} 
            className="bg-gradient-accent hover:opacity-90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Conteúdo
          </Button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(stats).map(([key, value]) => {
            const config = statusConfig[key as ContentStatus];
            const Icon = config.icon;
            return (
              <Card key={key} className="border-0 shadow-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn('p-2 rounded-lg', config.bgColor)}>
                    <Icon className={cn('w-5 h-5', config.color)} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground">{config.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filters and Navigation */}
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              {/* Month Navigation */}
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                
                <h2 className="text-lg font-semibold text-foreground min-w-[200px] text-center capitalize">
                  {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                </h2>
                
                <Button variant="outline" size="icon" onClick={goToNextMonth}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                
                <Button variant="ghost" size="sm" onClick={goToToday} className="ml-2">
                  Hoje
                </Button>
              </div>
              
              {/* Filters */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Filtrar:</span>
                </div>
                
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="w-[180px] bg-background">
                    <SelectValue placeholder="Todos os projetos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os projetos</SelectItem>
                    {projects?.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-[150px] bg-background">
                    <SelectValue placeholder="Todos os status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    {Object.entries(statusConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar Grid */}
        <Card className="border-0 shadow-card overflow-hidden">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 bg-muted/50 border-b">
            {WEEKDAYS.map(day => (
              <div 
                key={day} 
                className="p-3 text-center text-sm font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar Days */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="min-h-[140px] bg-muted/20 border-b border-r" />;
              }
              
              const dayContent = getContentForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isDayToday = isToday(day);
              const isHovered = hoveredDay && isSameDay(day, hoveredDay);
              
              return (
                <div
                  key={day.toString()}
                  className={cn(
                    'min-h-[140px] p-2 border-b border-r transition-colors',
                    !isCurrentMonth && 'bg-muted/30',
                    isHovered && 'bg-accent/5',
                    isDayToday && 'bg-primary/5'
                  )}
                  onMouseEnter={() => setHoveredDay(day)}
                  onMouseLeave={() => setHoveredDay(null)}
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn(
                      'text-sm font-medium',
                      !isCurrentMonth && 'text-muted-foreground',
                      isDayToday && 'bg-primary text-primary-foreground px-2 py-0.5 rounded-full'
                    )}>
                      {format(day, 'd')}
                    </span>
                    
                    {dayContent.length > 0 && (
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {dayContent.length}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Content Items */}
                  <div className="space-y-1 max-h-[100px] overflow-y-auto scrollbar-thin">
                    {dayContent.slice(0, 3).map(item => {
                      const config = statusConfig[item.status];
                      return (
                        <button
                          key={item.id}
                          onClick={() => navigate(`/articles/${item.id}`)}
                          className={cn(
                            'w-full p-1.5 rounded-md text-left transition-all hover:scale-[1.02]',
                            'flex items-center gap-2 group',
                            config.bgColor
                          )}
                        >
                          {item.imageUrl ? (
                            <img 
                              src={item.imageUrl} 
                              alt=""
                              className="w-6 h-6 rounded object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center flex-shrink-0">
                              <ImageIcon className="w-3 h-3 text-muted-foreground" />
                            </div>
                          )}
                          <span className={cn(
                            'text-xs font-medium truncate flex-1',
                            config.color
                          )}>
                            {item.title}
                          </span>
                          <Eye className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      );
                    })}
                    
                    {dayContent.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        +{dayContent.length - 3} mais
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Legend */}
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-center gap-6 flex-wrap">
              {Object.entries(statusConfig).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <div className={cn('p-1 rounded', config.bgColor)}>
                      <Icon className={cn('w-3 h-3', config.color)} />
                    </div>
                    <span className="text-sm text-muted-foreground">{config.label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
