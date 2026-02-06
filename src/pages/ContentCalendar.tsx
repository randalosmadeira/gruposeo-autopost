import { useState, useMemo, useCallback } from 'react';
import { useArticles } from '@/hooks/useArticles';
import { useProjects } from '@/hooks/useProjects';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar as CalendarIcon,
  Plus,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, isSameDay } from 'date-fns';
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { toast } from 'sonner';

import {
  CalendarHeader,
  DayDetailsModal,
  MonthView,
  WeekView,
  DayView,
  ContentCard,
  ContentItem,
  CalendarView,
  statusConfig,
} from '@/components/content-calendar';

const statusIcons = {
  scheduled: Clock,
  generating: RefreshCw,
  draft: FileText,
  ready: CheckCircle2,
  published: CheckCircle2,
  error: AlertCircle,
};

export default function ContentCalendar() {
  const navigate = useNavigate();
  const { articles, isLoading: articlesLoading, updateArticle } = useArticles();
  const { projects, isLoading: projectsLoading } = useProjects();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [hoveredDay, setHoveredDay] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<ContentItem | null>(null);

  // Drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Convert articles to content items
  const contentItems = useMemo((): ContentItem[] => {
    if (!articles) return [];
    
    return articles.map(article => ({
      id: article.id,
      title: article.title || article.keyword,
      type: article.type === 'blog' ? 'article' : 'landing',
      status: article.status as ContentItem['status'],
      date: new Date(article.created_at),
      imageUrl: article.featured_image_url,
      projectId: article.project_id,
      projectName: projects?.find(p => p.id === article.project_id)?.name,
      keyword: article.keyword,
      excerpt: article.excerpt,
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

  // Get content for selected day (modal)
  const selectedDayContent = useMemo(() => {
    if (!selectedDay) return [];
    return filteredContent.filter(item => isSameDay(item.date, selectedDay));
  }, [filteredContent, selectedDay]);

  // Navigation based on view
  const goToPrevious = () => {
    switch (view) {
      case 'month':
        setCurrentDate(subMonths(currentDate, 1));
        break;
      case 'week':
        setCurrentDate(subWeeks(currentDate, 1));
        break;
      case 'day':
        setCurrentDate(subDays(currentDate, 1));
        break;
    }
  };

  const goToNext = () => {
    switch (view) {
      case 'month':
        setCurrentDate(addMonths(currentDate, 1));
        break;
      case 'week':
        setCurrentDate(addWeeks(currentDate, 1));
        break;
      case 'day':
        setCurrentDate(addDays(currentDate, 1));
        break;
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const handleDayClick = useCallback((day: Date) => {
    if (view === 'day') return;
    setSelectedDay(day);
    setIsModalOpen(true);
  }, [view]);

  const handleItemClick = useCallback((item: ContentItem) => {
    navigate(`/articles/${item.id}`);
  }, [navigate]);

  // Drag and drop handler
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);
    
    if (!over) return;
    
    const overId = over.id as string;
    if (!overId.startsWith('day-') && !overId.startsWith('week-day-') && !overId.startsWith('day-view-')) return;
    
    const dateStr = overId.replace('day-', '').replace('week-day-', '').replace('day-view-', '');
    const targetDate = new Date(dateStr);
    
    const draggedItem = active.data.current?.item as ContentItem;
    if (!draggedItem) return;
    
    // Check if dropped on same day
    if (isSameDay(draggedItem.date, targetDate)) return;
    
    // Update article date
    updateArticle.mutate(
      { 
        id: draggedItem.id, 
        created_at: targetDate.toISOString() 
      },
      {
        onSuccess: () => {
          toast.success('Conteúdo reagendado!', {
            description: `"${draggedItem.title}" movido para ${format(targetDate, 'dd/MM/yyyy')}`,
          });
        },
        onError: () => {
          toast.error('Erro ao reagendar', {
            description: 'Não foi possível mover o conteúdo.',
          });
        },
      }
    );
  }, [updateArticle]);

  const handleDragStart = useCallback((event: any) => {
    const item = event.active.data.current?.item as ContentItem;
    setActiveItem(item || null);
  }, []);

  // Stats
  const stats = useMemo(() => ({
    scheduled: filteredContent.filter(c => c.status === 'scheduled').length,
    generating: filteredContent.filter(c => c.status === 'generating').length,
    draft: filteredContent.filter(c => c.status === 'draft').length,
    ready: filteredContent.filter(c => c.status === 'ready').length,
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
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(stats).map(([key, value]) => {
              const config = statusConfig[key as keyof typeof statusConfig];
              const Icon = statusIcons[key as keyof typeof statusIcons];
              if (!config) return null;
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
              <CalendarHeader
                currentDate={currentDate}
                view={view}
                selectedProject={selectedProject}
                selectedStatus={selectedStatus}
                projects={projects ?? []}
                onPreviousPeriod={goToPrevious}
                onNextPeriod={goToNext}
                onToday={goToToday}
                onViewChange={setView}
                onProjectChange={setSelectedProject}
                onStatusChange={setSelectedStatus}
              />
            </CardContent>
          </Card>

          {/* Calendar Grid */}
          <Card className="border-0 shadow-card overflow-hidden">
            <SortableContext 
              items={filteredContent.map(c => c.id)} 
              strategy={rectSortingStrategy}
            >
              {view === 'month' && (
                <MonthView
                  currentDate={currentDate}
                  content={filteredContent}
                  hoveredDay={hoveredDay}
                  onHoverDay={setHoveredDay}
                  onDayClick={handleDayClick}
                  onItemClick={handleItemClick}
                />
              )}
              
              {view === 'week' && (
                <WeekView
                  currentDate={currentDate}
                  content={filteredContent}
                  onDayClick={handleDayClick}
                  onItemClick={handleItemClick}
                />
              )}
              
              {view === 'day' && (
                <DayView
                  currentDate={currentDate}
                  content={filteredContent.filter(item => 
                    isSameDay(item.date, currentDate)
                  )}
                />
              )}
            </SortableContext>
          </Card>

          {/* Legend */}
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-center gap-6 flex-wrap">
                {Object.entries(statusConfig).map(([key, config]) => {
                  const Icon = statusIcons[key as keyof typeof statusIcons];
                  if (!Icon) return null;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <div className={cn('p-1 rounded', config.bgColor)}>
                        <Icon className={cn('w-3 h-3', config.color)} />
                      </div>
                      <span className="text-sm text-muted-foreground">{config.label}</span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 ml-4 pl-4 border-l">
                  <span className="text-xs text-muted-foreground">
                    💡 Arraste os cards para reagendar
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Day Details Modal */}
        <DayDetailsModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          date={selectedDay}
          content={selectedDayContent}
        />

        {/* Drag Overlay */}
        <DragOverlay>
          {activeItem && (
            <div className="opacity-80 rotate-3 scale-105">
              <ContentCard
                item={activeItem}
                onClick={() => {}}
                draggable={false}
              />
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
