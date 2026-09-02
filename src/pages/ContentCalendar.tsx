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
import { scheduleWordPressArticle } from '@/services/wordpressOperations';

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

function buildTargetSchedule(targetDay: Date, currentSchedule?: Date | null) {
  const target = new Date(targetDay);
  const current = currentSchedule && !Number.isNaN(currentSchedule.getTime()) ? currentSchedule : null;
  target.setHours(current?.getHours() ?? 9, current?.getMinutes() ?? 0, 0, 0);
  if (target.getTime() <= Date.now()) {
    const minimum = new Date(Date.now() + 5 * 60 * 1000);
    if (isSameDay(target, minimum)) return minimum;
  }
  return target;
}

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const contentItems = useMemo((): ContentItem[] => {
    if (!articles) return [];

    return articles.map(article => {
      const scheduledAt = article.scheduled_at ? new Date(article.scheduled_at) : null;
      const articleDate = scheduledAt || new Date(article.created_at);
      let displayStatus = article.status as ContentItem['status'];
      if (scheduledAt && scheduledAt > new Date() && article.status !== 'published') displayStatus = 'scheduled';

      return {
        id: article.id,
        title: article.title || article.keyword,
        type: article.type === 'blog' ? 'article' : 'landing',
        status: displayStatus,
        date: articleDate,
        scheduledAt,
        imageUrl: article.featured_image_url,
        projectId: article.project_id,
        projectName: projects?.find(p => p.id === article.project_id)?.name,
        keyword: article.keyword,
        excerpt: article.excerpt,
      };
    });
  }, [articles, projects]);

  const filteredContent = useMemo(() => contentItems.filter(item => {
    const matchesProject = selectedProject === 'all' || item.projectId === selectedProject;
    const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;
    return matchesProject && matchesStatus;
  }), [contentItems, selectedProject, selectedStatus]);

  const selectedDayContent = useMemo(() => {
    if (!selectedDay) return [];
    return filteredContent.filter(item => isSameDay(item.date, selectedDay));
  }, [filteredContent, selectedDay]);

  const goToPrevious = () => {
    if (view === 'month') setCurrentDate(subMonths(currentDate, 1));
    if (view === 'week') setCurrentDate(subWeeks(currentDate, 1));
    if (view === 'day') setCurrentDate(subDays(currentDate, 1));
  };
  const goToNext = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
    if (view === 'week') setCurrentDate(addWeeks(currentDate, 1));
    if (view === 'day') setCurrentDate(addDays(currentDate, 1));
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

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);
    if (!over) return;

    const overId = over.id as string;
    if (!overId.startsWith('day-') && !overId.startsWith('week-day-') && !overId.startsWith('day-view-')) return;
    const dateStr = overId.replace('week-day-', '').replace('day-view-', '').replace('day-', '');
    const targetDay = new Date(dateStr);
    const draggedItem = active.data.current?.item as ContentItem;
    if (!draggedItem || Number.isNaN(targetDay.getTime())) return;

    const nextSchedule = buildTargetSchedule(targetDay, draggedItem.scheduledAt);
    if (draggedItem.scheduledAt && draggedItem.scheduledAt.getTime() === nextSchedule.getTime()) return;

    try {
      if (draggedItem.projectId) {
        await scheduleWordPressArticle({
          articleId: draggedItem.id,
          projectId: draggedItem.projectId,
          scheduledAt: nextSchedule.toISOString(),
          publishStatus: 'publish',
        });
      }

      await updateArticle.mutateAsync({
        id: draggedItem.id,
        scheduled_at: nextSchedule.toISOString(),
      });

      toast.success('Conteúdo reagendado!', {
        description: `"${draggedItem.title}" foi movido para ${format(nextSchedule, 'dd/MM/yyyy HH:mm')}. scheduled_at atualizado.`,
      });
    } catch (error) {
      console.error('[ContentCalendar] reschedule failed:', error);
      toast.error('Erro ao reagendar', {
        description: error instanceof Error ? error.message : 'Não foi possível mover o conteúdo.',
      });
    }
  }, [updateArticle]);

  const handleDragStart = useCallback((event: any) => {
    const item = event.active.data.current?.item as ContentItem;
    setActiveItem(item || null);
  }, []);

  const stats = useMemo(() => ({
    scheduled: filteredContent.filter(c => c.status === 'scheduled').length,
    generating: filteredContent.filter(c => c.status === 'generating').length,
    draft: filteredContent.filter(c => c.status === 'draft').length,
    ready: filteredContent.filter(c => c.status === 'ready').length,
    published: filteredContent.filter(c => c.status === 'published').length,
  }), [filteredContent]);

  if (articlesLoading || projectsLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-background">
        <header className="bg-card border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-gradient-accent rounded-xl"><CalendarIcon className="w-6 h-6 text-white" /></div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Calendário de Conteúdo</h1>
                <p className="text-sm text-muted-foreground">Agendamento operacional baseado em scheduled_at, integrado à fila WordPress.</p>
              </div>
            </div>
            <Button onClick={() => navigate('/articles/new')} className="bg-gradient-accent hover:opacity-90"><Plus className="w-4 h-4 mr-2" />Novo Conteúdo</Button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(stats).map(([key, value]) => {
              const config = statusConfig[key as keyof typeof statusConfig];
              const Icon = statusIcons[key as keyof typeof statusIcons];
              if (!config) return null;
              return (
                <Card key={key} className="border-0 shadow-card">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={cn('p-2 rounded-lg', config.bgColor)}><Icon className={cn('w-5 h-5', config.color)} /></div>
                    <div><p className="text-2xl font-bold text-foreground">{value}</p><p className="text-xs text-muted-foreground">{config.label}</p></div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

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

          <Card className="border-0 shadow-card overflow-hidden">
            <SortableContext items={filteredContent.map(c => c.id)} strategy={rectSortingStrategy}>
              {view === 'month' && <MonthView currentDate={currentDate} content={filteredContent} hoveredDay={hoveredDay} onHoverDay={setHoveredDay} onDayClick={handleDayClick} onItemClick={handleItemClick} />}
              {view === 'week' && <WeekView currentDate={currentDate} content={filteredContent} onDayClick={handleDayClick} onItemClick={handleItemClick} />}
              {view === 'day' && <DayView currentDate={currentDate} content={filteredContent.filter(item => isSameDay(item.date, currentDate))} />}
            </SortableContext>
          </Card>

          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-center gap-6 flex-wrap">
                {Object.entries(statusConfig).map(([key, config]) => {
                  const Icon = statusIcons[key as keyof typeof statusIcons];
                  if (!Icon) return null;
                  return <div key={key} className="flex items-center gap-2"><div className={cn('p-1 rounded', config.bgColor)}><Icon className={cn('w-3 h-3', config.color)} /></div><span className="text-sm text-muted-foreground">{config.label}</span></div>;
                })}
                <div className="flex items-center gap-2 ml-4 pl-4 border-l"><span className="text-xs text-muted-foreground">Arraste os cards para alterar scheduled_at.</span></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DayDetailsModal open={isModalOpen} onOpenChange={setIsModalOpen} date={selectedDay} content={selectedDayContent} />
        <DragOverlay>
          {activeItem && <div className="opacity-80 rotate-3 scale-105"><ContentCard item={activeItem} onClick={() => {}} draggable={false} /></div>}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
