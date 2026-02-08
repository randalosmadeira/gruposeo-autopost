import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  List,
  Table,
  CheckCircle2,
  HelpCircle,
  Link2,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ContentStructureProps {
  metaDescription: boolean;
  lists: boolean;
  tables: boolean;
  conclusion: boolean;
  faq: boolean;
  internalLinking: boolean;
  projectId: string;
  onMetaDescriptionChange: (value: boolean) => void;
  onListsChange: (value: boolean) => void;
  onTablesChange: (value: boolean) => void;
  onConclusionChange: (value: boolean) => void;
  onFaqChange: (value: boolean) => void;
  onInternalLinkingChange: (value: boolean) => void;
  onProjectIdChange: (value: string) => void;
  connectedProjects: Array<{ id: string; name: string; is_connected: boolean }>;
  accentColor?: string;
}

interface ToggleCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  accentColor?: string;
}

function ToggleCard({ 
  icon: Icon, 
  title, 
  description, 
  checked, 
  onCheckedChange,
  accentColor = '#4169E1'
}: ToggleCardProps) {
  const activeStyles = checked ? {
    borderColor: `${accentColor}60`,
    backgroundColor: `${accentColor}08`,
  } : {};

  return (
    <div 
      className={cn(
        'flex items-center justify-between p-4 rounded-lg border transition-all cursor-pointer',
        checked ? '' : 'border-border bg-background hover:border-muted-foreground/30'
      )}
      style={activeStyles}
      onClick={() => onCheckedChange(!checked)}
    >
      <div className="flex items-center gap-3">
        <div 
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            checked ? '' : 'bg-muted'
          )}
          style={checked ? { backgroundColor: `${accentColor}15` } : {}}
        >
          <Icon 
            className="w-4 h-4" 
            style={{ color: checked ? accentColor : undefined }} 
          />
          {!checked && <Icon className="w-4 h-4 text-muted-foreground hidden" />}
        </div>
        <div>
          <p className={cn(
            'text-sm font-medium',
            checked ? '' : 'text-foreground'
          )} style={checked ? { color: accentColor } : {}}>
            {title}
          </p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch 
        checked={checked} 
        onCheckedChange={onCheckedChange}
        style={checked ? { backgroundColor: accentColor } : {}}
      />
    </div>
  );
}

export function ContentStructureConfig({
  metaDescription,
  lists,
  tables,
  conclusion,
  faq,
  internalLinking,
  projectId,
  onMetaDescriptionChange,
  onListsChange,
  onTablesChange,
  onConclusionChange,
  onFaqChange,
  onInternalLinkingChange,
  onProjectIdChange,
  connectedProjects,
  accentColor = '#4169E1',
}: ContentStructureProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-muted-foreground mb-3">Elementos do Conteúdo</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ToggleCard
          icon={FileText}
          title="Meta Descrição"
          description="Meta descrição SEO"
          checked={metaDescription}
          onCheckedChange={onMetaDescriptionChange}
          accentColor={accentColor}
        />
        <ToggleCard
          icon={List}
          title="Listas"
          description="Incluir listas organizadas"
          checked={lists}
          onCheckedChange={onListsChange}
          accentColor={accentColor}
        />
        <ToggleCard
          icon={Table}
          title="Tabelas"
          description="Tabelas de comparação"
          checked={tables}
          onCheckedChange={onTablesChange}
          accentColor={accentColor}
        />
        <ToggleCard
          icon={CheckCircle2}
          title="Conclusão"
          description="Resumo com CTA final"
          checked={conclusion}
          onCheckedChange={onConclusionChange}
          accentColor={accentColor}
        />
        <ToggleCard
          icon={HelpCircle}
          title="Seção FAQ"
          description="Perguntas frequentes"
          checked={faq}
          onCheckedChange={onFaqChange}
          accentColor={accentColor}
        />
      </div>

      <hr className="my-4" />

      {/* Internal Linking */}
      <div 
        className={cn(
          'p-4 rounded-lg border transition-all',
          internalLinking ? 'border-accent/50 bg-accent/5' : 'border-border'
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              internalLinking ? 'bg-accent/20' : 'bg-muted'
            )}>
              <Link2 className={cn(
                'w-5 h-5',
                internalLinking ? 'text-accent' : 'text-muted-foreground'
              )} />
            </div>
            <div>
              <p className="font-medium">Linkagem Interna</p>
              <p className="text-sm text-muted-foreground">
                Adicionar automaticamente links internos ao conteúdo
              </p>
            </div>
          </div>
          <Switch 
            checked={internalLinking}
            onCheckedChange={onInternalLinkingChange}
            className="data-[state=checked]:bg-accent"
          />
        </div>

        {internalLinking && (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Selecione o projeto WordPress</Label>
            <Select value={projectId} onValueChange={onProjectIdChange}>
              <SelectTrigger className="border-border bg-background">
                <SelectValue placeholder="Selecione um projeto..." />
              </SelectTrigger>
              <SelectContent>
                {connectedProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <span className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      {project.name}
                    </span>
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
        )}
      </div>
    </div>
  );
}
