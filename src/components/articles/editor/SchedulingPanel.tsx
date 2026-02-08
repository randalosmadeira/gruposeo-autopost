import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarIcon, Clock, Repeat } from 'lucide-react';
import { format, addDays, addHours, setHours, setMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface SchedulingPanelProps {
  scheduledAt: Date | null | undefined;
  onScheduleChange: (date: Date | null) => void;
}

const TIME_SLOTS = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
];

const QUICK_INTERVALS = [
  { label: 'Em 1 hora', hours: 1 },
  { label: 'Em 3 horas', hours: 3 },
  { label: 'Em 6 horas', hours: 6 },
  { label: 'Amanhã às 9h', days: 1, hour: 9 },
  { label: 'Amanhã às 14h', days: 1, hour: 14 },
  { label: 'Em 2 dias', days: 2, hour: 9 },
  { label: 'Em 1 semana', days: 7, hour: 9 },
];

export function SchedulingPanel({ scheduledAt, onScheduleChange }: SchedulingPanelProps) {
  const [isEnabled, setIsEnabled] = useState(!!scheduledAt);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    scheduledAt ? new Date(scheduledAt) : undefined
  );
  const [selectedTime, setSelectedTime] = useState<string>(
    scheduledAt ? format(new Date(scheduledAt), 'HH:mm') : '09:00'
  );

  useEffect(() => {
    if (scheduledAt) {
      setIsEnabled(true);
      setSelectedDate(new Date(scheduledAt));
      setSelectedTime(format(new Date(scheduledAt), 'HH:mm'));
    }
  }, [scheduledAt]);

  const handleToggle = (enabled: boolean) => {
    setIsEnabled(enabled);
    if (!enabled) {
      setSelectedDate(undefined);
      onScheduleChange(null);
    }
  };

  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date) {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const scheduledDate = new Date(date);
      scheduledDate.setHours(hours, minutes, 0, 0);
      onScheduleChange(scheduledDate);
    }
  };

  const handleTimeChange = (time: string) => {
    setSelectedTime(time);
    if (selectedDate) {
      const [hours, minutes] = time.split(':').map(Number);
      const scheduledDate = new Date(selectedDate);
      scheduledDate.setHours(hours, minutes, 0, 0);
      onScheduleChange(scheduledDate);
    }
  };

  const handleQuickInterval = (interval: typeof QUICK_INTERVALS[0]) => {
    let date = new Date();
    
    if (interval.hours) {
      date = addHours(date, interval.hours);
    } else if (interval.days) {
      date = addDays(date, interval.days);
      if (interval.hour !== undefined) {
        date = setHours(setMinutes(date, 0), interval.hour);
      }
    }
    
    setSelectedDate(date);
    setSelectedTime(format(date, 'HH:mm'));
    onScheduleChange(date);
  };

  const isDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarIcon className="w-4 h-4 text-primary" />
        <Label className="text-sm font-medium">Agendamento</Label>
      </div>
      
      {/* Enable Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">Agendar Publicação</span>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggle}
        />
      </div>

      {isEnabled && (
        <div className="space-y-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          {/* Quick Intervals */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Repeat className="w-3 h-3" />
              Intervalos Rápidos
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_INTERVALS.map((interval) => (
                <Button
                  key={interval.label}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleQuickInterval(interval)}
                >
                  {interval.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Date Picker */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? (
                    format(selectedDate, "PPP", { locale: ptBR })
                  ) : (
                    <span>Selecione a data</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateChange}
                  initialFocus
                  disabled={isDateDisabled}
                  className="pointer-events-auto p-3"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Picker */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Horário</Label>
            <Select value={selectedTime} onValueChange={handleTimeChange}>
              <SelectTrigger>
                <Clock className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Horário" />
              </SelectTrigger>
              <SelectContent>
                {TIME_SLOTS.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule Summary */}
          {selectedDate && (
            <div className="p-2 rounded-lg bg-primary/10 text-sm">
              <p className="text-primary font-medium">
                📅 Agendado para {format(selectedDate, "dd 'de' MMMM 'de' yyyy 'às' ", { locale: ptBR })}{selectedTime}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
