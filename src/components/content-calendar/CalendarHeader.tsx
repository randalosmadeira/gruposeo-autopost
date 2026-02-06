import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarRange,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarView, statusConfig } from './types';
import { cn } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
}

interface CalendarHeaderProps {
  currentDate: Date;
  view: CalendarView;
  selectedProject: string;
  selectedStatus: string;
  projects: Project[];
  onPreviousPeriod: () => void;
  onNextPeriod: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  onProjectChange: (project: string) => void;
  onStatusChange: (status: string) => void;
}

export function CalendarHeader({
  currentDate,
  view,
  selectedProject,
  selectedStatus,
  projects,
  onPreviousPeriod,
  onNextPeriod,
  onToday,
  onViewChange,
  onProjectChange,
  onStatusChange,
}: CalendarHeaderProps) {
  const getDateLabel = () => {
    switch (view) {
      case 'month':
        return format(currentDate, 'MMMM yyyy', { locale: ptBR });
      case 'week':
        return format(currentDate, "'Semana de' dd 'de' MMMM", { locale: ptBR });
      case 'day':
        return format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
      {/* Navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onPreviousPeriod}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        
        <h2 className="text-lg font-semibold text-foreground min-w-[240px] text-center capitalize">
          {getDateLabel()}
        </h2>
        
        <Button variant="outline" size="icon" onClick={onNextPeriod}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        
        <Button variant="ghost" size="sm" onClick={onToday} className="ml-2">
          Hoje
        </Button>
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
        <Button
          variant={view === 'month' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewChange('month')}
          className={cn('gap-2', view === 'month' && 'bg-background shadow-sm')}
        >
          <CalendarIcon className="w-4 h-4" />
          Mês
        </Button>
        <Button
          variant={view === 'week' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewChange('week')}
          className={cn('gap-2', view === 'week' && 'bg-background shadow-sm')}
        >
          <CalendarRange className="w-4 h-4" />
          Semana
        </Button>
        <Button
          variant={view === 'day' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewChange('day')}
          className={cn('gap-2', view === 'day' && 'bg-background shadow-sm')}
        >
          <CalendarDays className="w-4 h-4" />
          Dia
        </Button>
      </div>
      
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtrar:</span>
        </div>
        
        <Select value={selectedProject} onValueChange={onProjectChange}>
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
        
        <Select value={selectedStatus} onValueChange={onStatusChange}>
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
  );
}
