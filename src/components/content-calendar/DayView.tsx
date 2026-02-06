import { format, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Plus, 
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
  ImageIcon,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContentItem, statusConfig } from './types';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate } from 'react-router-dom';

const statusIcons = {
  scheduled: Clock,
  generating: RefreshCw,
  draft: FileText,
  ready: CheckCircle2,
  published: CheckCircle2,
  error: AlertCircle,
};

interface DayContentCardProps {
  item: ContentItem;
}

function DayContentCard({ item }: DayContentCardProps) {
  const navigate = useNavigate();
  const config = statusConfig[item.status];
  const Icon = statusIcons[item.status];
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: item.id,
    data: { item },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-4 p-5 rounded-xl border bg-card hover:shadow-lg transition-all cursor-pointer group',
        isDragging && 'opacity-50'
      )}
      onClick={() => navigate(`/articles/${item.id}`)}
      {...attributes}
      {...listeners}
    >
      {item.imageUrl ? (
        <img 
          src={item.imageUrl} 
          alt=""
          className="w-32 h-24 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-32 h-24 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <ImageIcon className="w-10 h-10 text-muted-foreground" />
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-1">
              {item.title}
            </h3>
            {item.excerpt && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {item.excerpt}
              </p>
            )}
          </div>
          
          <Badge className={cn('gap-1 flex-shrink-0', config.bgColor, config.color)}>
            <Icon className="w-3 h-3" />
            {config.label}
          </Badge>
        </div>
        
        <div className="flex items-center gap-4 mt-3">
          {item.projectName && (
            <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">
              {item.projectName}
            </span>
          )}
          {item.keyword && (
            <span className="text-sm text-muted-foreground">
              Keyword: <strong>{item.keyword}</strong>
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {format(item.date, 'HH:mm', { locale: ptBR })}
          </span>
        </div>
      </div>
      
      <ExternalLink className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
    </div>
  );
}

interface DayViewProps {
  currentDate: Date;
  content: ContentItem[];
}

export function DayView({ currentDate, content }: DayViewProps) {
  const navigate = useNavigate();
  const isDayToday = isToday(currentDate);
  
  const { setNodeRef, isOver } = useDroppable({
    id: `day-view-${format(currentDate, 'yyyy-MM-dd')}`,
    data: { date: currentDate },
  });

  // Group by time (morning, afternoon, evening)
  const groupedContent = {
    morning: content.filter(item => {
      const hour = item.date.getHours();
      return hour >= 6 && hour < 12;
    }),
    afternoon: content.filter(item => {
      const hour = item.date.getHours();
      return hour >= 12 && hour < 18;
    }),
    evening: content.filter(item => {
      const hour = item.date.getHours();
      return hour >= 18 || hour < 6;
    }),
    unscheduled: content.filter(item => {
      // Items without specific time (created_at time)
      return true;
    }),
  };

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        'p-6 min-h-[600px]',
        isOver && 'bg-primary/5'
      )}
    >
      {/* Day Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className={cn(
            'text-center p-4 rounded-xl',
            isDayToday ? 'bg-primary text-primary-foreground' : 'bg-muted'
          )}>
            <p className="text-xs uppercase font-medium opacity-80">
              {format(currentDate, 'EEEE', { locale: ptBR })}
            </p>
            <p className="text-4xl font-bold mt-1">
              {format(currentDate, 'd')}
            </p>
            <p className="text-xs mt-1 opacity-80">
              {format(currentDate, 'MMMM', { locale: ptBR })}
            </p>
          </div>
          
          <div>
            <h2 className="text-2xl font-bold text-foreground capitalize">
              {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </h2>
            <p className="text-muted-foreground mt-1">
              {content.length} {content.length === 1 ? 'conteúdo agendado' : 'conteúdos agendados'}
            </p>
          </div>
        </div>
        
        <Button 
          onClick={() => navigate('/articles/new')} 
          className="bg-gradient-accent"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Conteúdo
        </Button>
      </div>

      {/* Content List */}
      <ScrollArea className="h-[500px]">
        {content.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nenhum conteúdo para este dia
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Crie um novo artigo ou arraste um conteúdo existente para agendar nesta data.
            </p>
            <Button onClick={() => navigate('/articles/new')} variant="outline" size="lg">
              <Plus className="w-4 h-4 mr-2" />
              Criar Artigo
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {content.map(item => (
              <DayContentCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
