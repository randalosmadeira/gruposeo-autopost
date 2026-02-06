import { Eye, ImageIcon, GripVertical } from 'lucide-react';
import { ContentItem, statusConfig } from './types';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ContentCardProps {
  item: ContentItem;
  onClick: (item: ContentItem) => void;
  compact?: boolean;
  draggable?: boolean;
}

export function ContentCard({ item, onClick, compact = false, draggable = true }: ContentCardProps) {
  const config = statusConfig[item.status];
  
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

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'w-full p-1.5 rounded-md text-left transition-all hover:scale-[1.02]',
          'flex items-center gap-2 group cursor-pointer',
          config.bgColor,
          isDragging && 'opacity-50 z-50'
        )}
        onClick={() => onClick(item)}
        {...(draggable ? { ...attributes, ...listeners } : {})}
      >
        {draggable && (
          <GripVertical className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
        )}
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
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'p-3 rounded-lg border transition-all hover:shadow-md cursor-pointer group',
        config.bgColor,
        'border-transparent hover:border-primary/20',
        isDragging && 'opacity-50 z-50'
      )}
      onClick={() => onClick(item)}
      {...(draggable ? { ...attributes, ...listeners } : {})}
    >
      <div className="flex items-start gap-3">
        {draggable && (
          <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab mt-1" />
        )}
        {item.imageUrl ? (
          <img 
            src={item.imageUrl} 
            alt=""
            className="w-16 h-12 rounded-md object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-16 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className={cn('font-medium text-sm truncate', config.color)}>
            {item.title}
          </h4>
          {item.projectName && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {item.projectName}
            </p>
          )}
          <span className={cn(
            'inline-block text-xs px-2 py-0.5 rounded-full mt-1',
            config.bgColor,
            config.color
          )}>
            {config.label}
          </span>
        </div>
      </div>
    </div>
  );
}
