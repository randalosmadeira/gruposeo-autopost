import { useMemo } from 'react';
import { 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameDay, 
  isToday, 
  format, 
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ContentItem, WEEKDAYS_FULL } from './types';
import { ContentCard } from './ContentCard';
import { useDroppable } from '@dnd-kit/core';
import { ScrollArea } from '@/components/ui/scroll-area';

interface WeekDayCellProps {
  day: Date;
  content: ContentItem[];
  onDayClick: (day: Date) => void;
  onItemClick: (item: ContentItem) => void;
}

function WeekDayCell({ day, content, onDayClick, onItemClick }: WeekDayCellProps) {
  const isDayToday = isToday(day);
  
  const { setNodeRef, isOver } = useDroppable({
    id: `week-day-${format(day, 'yyyy-MM-dd')}`,
    data: { date: day },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 min-w-[180px] border-r last:border-r-0 flex flex-col',
        isOver && 'bg-primary/10'
      )}
    >
      {/* Day Header */}
      <div 
        className={cn(
          'p-3 border-b text-center cursor-pointer hover:bg-muted/50 transition-colors',
          isDayToday && 'bg-primary/10'
        )}
        onClick={() => onDayClick(day)}
      >
        <p className="text-xs text-muted-foreground uppercase">
          {WEEKDAYS_FULL[day.getDay()]}
        </p>
        <p className={cn(
          'text-2xl font-bold mt-1',
          isDayToday ? 'text-primary' : 'text-foreground'
        )}>
          {format(day, 'd')}
        </p>
        {content.length > 0 && (
          <Badge variant="secondary" className="mt-1 text-xs">
            {content.length} {content.length === 1 ? 'item' : 'itens'}
          </Badge>
        )}
      </div>
      
      {/* Content List */}
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2">
          {content.map(item => (
            <ContentCard
              key={item.id}
              item={item}
              onClick={onItemClick}
            />
          ))}
          
          {content.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                Nenhum conteúdo
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface WeekViewProps {
  currentDate: Date;
  content: ContentItem[];
  onDayClick: (day: Date) => void;
  onItemClick: (item: ContentItem) => void;
}

export function WeekView({
  currentDate,
  content,
  onDayClick,
  onItemClick,
}: WeekViewProps) {
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { locale: ptBR });
    const end = endOfWeek(currentDate, { locale: ptBR });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const getContentForDay = (day: Date) => {
    return content.filter(item => isSameDay(item.date, day));
  };

  return (
    <div className="flex h-[600px] overflow-x-auto">
      {weekDays.map(day => (
        <WeekDayCell
          key={day.toString()}
          day={day}
          content={getContentForDay(day)}
          onDayClick={onDayClick}
          onItemClick={onItemClick}
        />
      ))}
    </div>
  );
}
