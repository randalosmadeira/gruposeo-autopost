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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const contentItems = useMemo((): ContentItem[] => {
    if (!articles) return [];
    return articles.map((article) => {
      const articleDate = article.scheduled_at ? new Date(article.scheduled_at) : new Date(article.created_at);
      let displayStatus = article.status as ContentItem['status'];
      if (article.scheduled_at && new Date(article.scheduled_at) > new Date() && article.status !== 'published') displayStatus = 'scheduled';
      return {
        id: article.id,
        title: article.title || article.keyword,
        type: article.type === 'blog' ? 'article' : 'landing',
        status: displayStatus,
        date: articleDate,
        scheduledAt: article.scheduled_at ? new Date(article.scheduled_at) : null,
        imageUrl: article.featured_image_url,
        projectId: article.project_id,
        projectName: projects?.find((p) => p.id === article.project_id)?.name,
        keyword: article.keyword,
        excerpt: article.excerpt,
      };
    });
  }, [articles, projects]);

  const filteredContent = useMemo(() => contentItems.filter((item) => {
    const matchesProject = selectedProject === 'all' || item.projectId === selectedProject;
    const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;
    return matchesProject && matchesStatus;
  }), [contentItems, selectedProject, selectedStatus]);

  const selectedDayContent = useMemo(() => selectedDay ? filteredContent.filter((item) => isSameDay(item.date, selectedDay)) : [], [filteredContent, selectedDay]);

  const goToPrevious = () => {
    if (view === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };
  const goToNext = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };
  const goToToday = () => setCurrentDate(new Date());
  const handleDayClick = useCallback((day: Date) => { if (view !== 'day') { setSelectedDay(day); setIsModalOpen(true); } }, [view]);
  const handleItemClick = useCallback((item: ContentItem) => navigate(`/articles/${item.id}`), [navigate]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith('day-') && !overId.startsWith('week-day-') && !overId.startsWith('day-view-')) return;
    const dateStr = overId.replace('week-day-', '').replace('day-view-', '').replace('day-', '');
    const targetDate = new Date(dateStr);
    const draggedItem = active.data.current?.item as ContentItem;
    if (!draggedItem || Number.isNaN(targetDate.getTime()) || isSameDay(draggedItem.date, targetDate)) return;

    // Preserve the item's existing clock time while moving only the calendar day.
    // If it was never scheduled, use the clock time already represented by the card
    // rather than inventing an arbitrary posting hour.
    const sourceClock = draggedItem.scheduledAt || draggedItem.date;
    const scheduledAt = new Date(targetDate);
    scheduledAt.setHours(sourceClock.getHours(), sourceClock.getMinutes(), sourceClock.getSeconds(), 0);

    updateArticle.mutate(
      {
        id: draggedItem.id,
        scheduled_at: scheduledAt.toISOString(),
        traffic_wave_status: 'scheduled',
      } as any,
      {
        onSuccess: () => toast.success('Conteúdo agendado!', { description: `"${draggedItem.title}" programado para ${format(scheduledAt, 'dd/MM/yyyy HH:mm')}. O Zica Brain fará o despacho quando o artigo estiver pronto.` }),
        onError: () => toast.error('Erro ao reagendar', { description: 'Não foi possível atualizar scheduled_at.' }),
      },
    );
  }, [updateArticle]);

  const handleDragStart = useCallback((event: any) => setActiveItem((event.active.data.current?.item as ContentItem) || null), []);

  const stats = useMemo(() => ({
    scheduled: filteredContent.filter((c) => c.status === 'scheduled').length,
    generating: filteredContent.filter((c) => c.status === 'generating').length,
    draft: filteredContent.filter((c) => c.status === 'draft').length,
    ready: filteredContent.filter((c) => c.status === 'ready').length,
    published: filteredContent.filter((c) => c.status === 'published').length,
  }), [filteredContent]);

  if (articlesLoading || projectsLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card px-6 py-4"><div className="flex items-center justify-between"><div className="flex items-center gap-4"><div className="rounded-xl bg-gradient-accent p-2"><CalendarIcon className="h-6 w-6 text-white" /></div><div><h1 className="text-2xl font-bold text-foreground">Calendário de Conteúdo</h1><p className="text-sm text-muted-foreground">Planeje ondas; scheduled_at alimenta o dispatcher do Zica Brain.</p></div></div><Button onClick={() => navigate('/articles/new')} className="bg-gradient-accent hover:opacity-90"><Plus className="mr-2 h-4 w-4" />Novo Conteúdo</Button></div></header>
        <div className="space-y-6 p-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">{Object.entries(stats).map(([key, value]) => { const config = statusConfig[key as keyof typeof statusConfig]; const Icon = statusIcons[key as keyof typeof statusIcons]; if (!config || !Icon) return null; return <Card key={key} className="border-0 shadow-card"><CardContent className="flex items-center gap-3 p-4"><div className={cn('rounded-lg p-2', config.bgColor)}><Icon className={cn('h-5 w-5', config.color)} /></div><div><p className="text-2xl font-bold text-foreground">{value}</p><p className="text-xs text-muted-foreground">{config.label}</p></div></CardContent></Card>; })}</div>
          <Card className="border-0 shadow-card"><CardContent className="p-4"><CalendarHeader currentDate={currentDate} view={view} selectedProject={selectedProject} selectedStatus={selectedStatus} projects={projects ?? []} onPreviousPeriod={goToPrevious} onNextPeriod={goToNext} onToday={goToToday} onViewChange={setView} onProjectChange={setSelectedProject} onStatusChange={setSelectedStatus} /></CardContent></Card>
          <Card className="overflow-hidden border-0 shadow-card"><SortableContext items={filteredContent.map((c) => c.id)} strategy={rectSortingStrategy}>{view === 'month' && <MonthView currentDate={currentDate} content={filteredContent} hoveredDay={hoveredDay} onHoverDay={setHoveredDay} onDayClick={handleDayClick} onItemClick={handleItemClick} />}{view === 'week' && <WeekView currentDate={currentDate} content={filteredContent} onDayClick={handleDayClick} onItemClick={handleItemClick} />}{view === 'day' && <DayView currentDate={currentDate} content={filteredContent.filter((item) => isSameDay(item.date, currentDate))} />}</SortableContext></Card>
          <Card className="border-0 shadow-card"><CardContent className="p-4"><div className="flex flex-wrap items-center justify-center gap-6">{Object.entries(statusConfig).map(([key, config]) => { const Icon = statusIcons[key as keyof typeof statusIcons]; if (!Icon) return null; return <div key={key} className="flex items-center gap-2"><div className={cn('rounded p-1', config.bgColor)}><Icon className={cn('h-3 w-3', config.color)} /></div><span className="text-sm text-muted-foreground">{config.label}</span></div>; })}<div className="ml-4 border-l pl-4 text-xs text-muted-foreground">Arrastar altera scheduled_at; não altera mais created_at.</div></div></CardContent></Card>
        </div>
        <DayDetailsModal open={isModalOpen} onOpenChange={setIsModalOpen} date={selectedDay} content={selectedDayContent} />
        <DragOverlay>{activeItem && <div className="scale-105 rotate-3 opacity-80"><ContentCard item={activeItem} onClick={() => {}} draggable={false} /></div>}</DragOverlay>
      </div>
    </DndContext>
  );
}
