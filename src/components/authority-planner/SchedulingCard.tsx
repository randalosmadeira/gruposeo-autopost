import { useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { format, addDays, addHours, setHours, setMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, Plus, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface SchedulingCardProps {
  form: UseFormReturn<any>;
  isScheduleMode: boolean;
}

interface ScheduledTime {
  date: Date;
  time: string;
}

const timeSlots = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00'
];

export function SchedulingCard({ form, isScheduleMode }: SchedulingCardProps) {
  const [scheduledTimes, setScheduledTimes] = useState<ScheduledTime[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [selectedTime, setSelectedTime] = useState<string>('09:00');

  if (!isScheduleMode) return null;

  const addScheduledTime = () => {
    if (!selectedDate) return;
    
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const scheduledDate = setMinutes(setHours(selectedDate, hours), minutes);
    
    // Check if already scheduled
    const exists = scheduledTimes.some(
      st => st.date.getTime() === scheduledDate.getTime()
    );
    
    if (!exists) {
      const newTimes = [...scheduledTimes, { date: scheduledDate, time: selectedTime }]
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      setScheduledTimes(newTimes);
      form.setValue('scheduledTimes', newTimes.map(st => st.date.toISOString()));
    }
  };

  const removeScheduledTime = (index: number) => {
    const newTimes = scheduledTimes.filter((_, i) => i !== index);
    setScheduledTimes(newTimes);
    form.setValue('scheduledTimes', newTimes.map(st => st.date.toISOString()));
  };

  const quickSchedule = (type: 'daily' | 'weekly' | 'custom') => {
    const now = new Date();
    let times: ScheduledTime[] = [];

    if (type === 'daily') {
      // Schedule for next 7 days at 9AM
      for (let i = 1; i <= 7; i++) {
        const date = addDays(now, i);
        const scheduledDate = setMinutes(setHours(date, 9), 0);
        times.push({ date: scheduledDate, time: '09:00' });
      }
    } else if (type === 'weekly') {
      // Schedule 1 per week for next 4 weeks
      for (let i = 1; i <= 4; i++) {
        const date = addDays(now, i * 7);
        const scheduledDate = setMinutes(setHours(date, 10), 0);
        times.push({ date: scheduledDate, time: '10:00' });
      }
    }

    setScheduledTimes(times);
    form.setValue('scheduledTimes', times.map(st => st.date.toISOString()));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5" />
          Agendamento de Publicação
        </CardTitle>
        <CardDescription>
          Configure quando cada artigo será publicado automaticamente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Schedule Options */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => quickSchedule('daily')}
          >
            <Clock className="w-4 h-4 mr-1" />
            Diário (7 dias)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => quickSchedule('weekly')}
          >
            <CalendarIcon className="w-4 h-4 mr-1" />
            Semanal (4 semanas)
          </Button>
        </div>

        {/* Custom Schedule */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Data</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[180px] justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Horário</label>
            <Select value={selectedTime} onValueChange={setSelectedTime}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Horário" />
              </SelectTrigger>
              <SelectContent>
                {timeSlots.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="button" onClick={addScheduledTime} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Adicionar
          </Button>
        </div>

        {/* Scheduled Times List */}
        {scheduledTimes.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Publicações agendadas ({scheduledTimes.length})
            </label>
            <div className="flex flex-wrap gap-2">
              {scheduledTimes.map((st, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="flex items-center gap-1 py-1.5 px-3"
                >
                  <CalendarIcon className="w-3 h-3" />
                  {format(st.date, "dd/MM 'às' HH:mm", { locale: ptBR })}
                  <button
                    type="button"
                    onClick={() => removeScheduledTime(index)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Info */}
        <p className="text-xs text-muted-foreground">
          Os artigos serão publicados automaticamente nos horários agendados. 
          O pilar será publicado primeiro, seguido pelos satélites em sequência.
        </p>
      </CardContent>
    </Card>
  );
}
