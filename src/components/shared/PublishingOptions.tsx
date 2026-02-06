import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Rocket, Info, CalendarIcon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PublishingOptionsProps {
  autoPublish: boolean;
  projectId: string;
  scheduledDate?: Date | null;
  onAutoPublishChange: (value: boolean) => void;
  onProjectIdChange: (value: string) => void;
  onScheduledDateChange?: (date: Date | null) => void;
  connectedProjects: Array<{ id: string; name: string; is_connected: boolean }>;
  accentColor?: string;
}

const timeSlots = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
];

export function PublishingOptions({
  autoPublish,
  projectId,
  scheduledDate,
  onAutoPublishChange,
  onProjectIdChange,
  onScheduledDateChange,
  connectedProjects,
  accentColor = '#4169E1',
}: PublishingOptionsProps) {
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [isScheduled, setIsScheduled] = useState(false);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date || !onScheduledDateChange) return;
    
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const scheduledDateTime = new Date(date);
    scheduledDateTime.setHours(hours, minutes, 0, 0);
    onScheduledDateChange(scheduledDateTime);
  };

  const handleTimeChange = (time: string) => {
    setSelectedTime(time);
    if (scheduledDate && onScheduledDateChange) {
      const [hours, minutes] = time.split(':').map(Number);
      const newDate = new Date(scheduledDate);
      newDate.setHours(hours, minutes, 0, 0);
      onScheduledDateChange(newDate);
    }
  };

  const handleScheduleToggle = (enabled: boolean) => {
    setIsScheduled(enabled);
    if (!enabled && onScheduledDateChange) {
      onScheduledDateChange(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div 
        className="flex items-start gap-3 p-3 rounded-lg border"
        style={{ 
          backgroundColor: `${accentColor}08`, 
          borderColor: `${accentColor}30` 
        }}
      >
        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: accentColor }} />
        <p className="text-sm" style={{ color: accentColor }}>
          Configure a publicação automática para enviar o conteúdo diretamente 
          para o seu site WordPress após a geração.
        </p>
      </div>

      {/* Auto Publish Toggle */}
      <div 
        className={cn(
          'p-4 rounded-lg border transition-all',
          autoPublish ? 'border-2' : 'border-gray-200'
        )}
        style={{ 
          borderColor: autoPublish ? accentColor : undefined,
          backgroundColor: autoPublish ? `${accentColor}08` : undefined
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: autoPublish ? `${accentColor}20` : '#F3F4F6' }}
            >
              <Rocket 
                className="w-5 h-5" 
                style={{ color: autoPublish ? accentColor : '#6b7280' }} 
              />
            </div>
            <div>
              <p className="font-medium text-sm">Publicação Automática</p>
              <p className="text-xs text-muted-foreground">
                Publicar automaticamente após a geração
              </p>
            </div>
          </div>
          <Switch 
            checked={autoPublish} 
            onCheckedChange={onAutoPublishChange}
            style={autoPublish ? { backgroundColor: accentColor } : {}}
          />
        </div>
        
        {autoPublish && (
          <div className="mt-4 pt-4 border-t space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Site WordPress</Label>
              <Select value={projectId} onValueChange={onProjectIdChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um projeto..." />
                </SelectTrigger>
                <SelectContent>
                  {connectedProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                  {connectedProjects.length === 0 && (
                    <SelectItem value="none" disabled>
                      Nenhum projeto conectado
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Schedule Publication */}
      <div 
        className={cn(
          'p-4 rounded-lg border transition-all',
          isScheduled ? 'border-2' : 'border-gray-200'
        )}
        style={{ 
          borderColor: isScheduled ? accentColor : undefined,
          backgroundColor: isScheduled ? `${accentColor}08` : undefined
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: isScheduled ? `${accentColor}20` : '#F3F4F6' }}
            >
              <CalendarIcon 
                className="w-5 h-5" 
                style={{ color: isScheduled ? accentColor : '#6b7280' }} 
              />
            </div>
            <div>
              <p className="font-medium text-sm">Agendar Publicação</p>
              <p className="text-xs text-muted-foreground">
                Definir data e hora para publicação futura
              </p>
            </div>
          </div>
          <Switch 
            checked={isScheduled} 
            onCheckedChange={handleScheduleToggle}
            style={isScheduled ? { backgroundColor: accentColor } : {}}
          />
        </div>
        
        {isScheduled && (
          <div className="mt-4 pt-4 border-t space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Date Picker */}
              <div className="space-y-2">
                <Label className="text-sm">Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !scheduledDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {scheduledDate 
                        ? format(scheduledDate, "dd 'de' MMM", { locale: ptBR })
                        : "Selecionar"
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={scheduledDate || undefined}
                      onSelect={handleDateSelect}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Time Picker */}
              <div className="space-y-2">
                <Label className="text-sm">Horário</Label>
                <Select value={selectedTime} onValueChange={handleTimeChange}>
                  <SelectTrigger>
                    <Clock className="mr-2 h-4 w-4" />
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
            </div>

            {scheduledDate && (
              <div 
                className="p-3 rounded-lg text-sm"
                style={{ backgroundColor: `${accentColor}10` }}
              >
                <p className="font-medium" style={{ color: accentColor }}>
                  📅 Agendado para: {format(scheduledDate, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
