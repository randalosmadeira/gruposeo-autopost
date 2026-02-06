import { useMemo } from 'react';
import { 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday, 
  getDay,
  format, 
} from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ContentItem, WEEKDAYS } from './types';
import { ContentCard } from './ContentCard';
import { useDroppable } from '@dnd-kit/core';

interface DayCellProps {
  day: Date;
  currentDate: Date;
  content: ContentItem[];
  isHovered: boolean;
  onHover: (day: Date | null) => void;
  onDayClick: (day: Date) => void;
  onItemClick: (item: ContentItem) => void;
}

function DayCell({ day, currentDate, content, isHovered, onHover, onDayClick, onItemClick }: DayCellProps) {
  const isCurrentMonth = isSameMonth(day, currentDate);
  const isDayToday = isToday(day);
  
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${format(day, 'yyyy-MM-dd')}`,
    data: { date: day },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[140px] p-2 border-b border-r transition-colors',
        !isCurrentMonth && 'bg-muted/30',
        isHovered && 'bg-accent/5',
        isDayToday && 'bg-primary/5',
        isOver && 'bg-primary/10 ring-2 ring-primary/30 ring-inset'
      )}
      onMouseEnter={() => onHover(day)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Day Header */}
      <div 
        className="flex items-center justify-between mb-2 cursor-pointer hover:opacity-80"
        onClick={() => onDayClick(day)}
      >
        <span className={cn(
          'text-sm font-medium',
          !isCurrentMonth && 'text-muted-foreground',
          isDayToday && 'bg-primary text-primary-foreground px-2 py-0.5 rounded-full'
        )}>
          {format(day, 'd')}
        </span>
        
        {content.length > 0 && (
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {content.length}
          </Badge>
        )}
      </div>
      
      {/* Content Items */}
      <div className="space-y-1 max-h-[100px] overflow-y-auto scrollbar-thin">
        {content.slice(0, 3).map(item => (
          <ContentCard
            key={item.id}
            item={item}
            onClick={onItemClick}
            compact
          />
        ))}
        
        {content.length > 3 && (
          <button
            onClick={() => onDayClick(day)}
            className="w-full text-xs text-primary hover:underline text-center py-1"
          >
            +{content.length - 3} mais
          </button>
        )}
      </div>
    </div>
  );
}

interface MonthViewProps {
  currentDate: Date;
  content: ContentItem[];
  hoveredDay: Date | null;
  onHoverDay: (day: Date | null) => void;
  onDayClick: (day: Date) => void;
  onItemClick: (item: ContentItem) => void;
}

export function MonthView({
  currentDate,
  content,
  hoveredDay,
  onHoverDay,
  onDayClick,
  onItemClick,
}: MonthViewProps) {
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start, end });
    
    // Add padding days for the start of the month
    const startDayOfWeek = getDay(start);
    const paddingDays: (Date | null)[] = Array(startDayOfWeek).fill(null);
    
    return [...paddingDays, ...days];
  }, [currentDate]);

  const getContentForDay = (day: Date) => {
    return content.filter(item => isSameDay(item.date, day));
  };

  return (
    <>
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
          const isHovered = hoveredDay && isSameDay(day, hoveredDay);
          
          return (
            <DayCell
              key={day.toString()}
              day={day}
              currentDate={currentDate}
              content={dayContent}
              isHovered={!!isHovered}
              onHover={onHoverDay}
              onDayClick={onDayClick}
              onItemClick={onItemClick}
            />
          );
        })}
      </div>
    </>
  );
}
