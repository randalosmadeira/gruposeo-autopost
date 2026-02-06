import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Rocket, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PublishingOptionsProps {
  autoPublish: boolean;
  projectId: string;
  onAutoPublishChange: (value: boolean) => void;
  onProjectIdChange: (value: string) => void;
  connectedProjects: Array<{ id: string; name: string; is_connected: boolean }>;
  accentColor?: string;
}

export function PublishingOptions({
  autoPublish,
  projectId,
  onAutoPublishChange,
  onProjectIdChange,
  connectedProjects,
  accentColor = '#4169E1',
}: PublishingOptionsProps) {
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
          <div className="mt-4 pt-4 border-t space-y-3">
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
    </div>
  );
}
