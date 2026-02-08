import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CreditCard,
  Search,
  User,
  Image,
  Clock,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdvancedSettingsProps {
  usePlatformCredits: boolean;
  seoOptimization: boolean;
  realtimeData: boolean;
  humanizeContent: boolean;
  generateImages: boolean;
  imageCount: number;
  imageStyle: string;
  onUsePlatformCreditsChange: (value: boolean) => void;
  onSeoOptimizationChange: (value: boolean) => void;
  onRealtimeDataChange: (value: boolean) => void;
  onHumanizeContentChange: (value: boolean) => void;
  onGenerateImagesChange: (value: boolean) => void;
  onImageCountChange: (value: number) => void;
  onImageStyleChange: (value: string) => void;
  accentColor?: string;
}

interface SettingsToggleProps {
  icon: React.ElementType;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  accentColor: string;
  bgColor: string;
  creditCost?: string;
}

const imageStyles = [
  'Fotorrealístico',
  'Ilustração Digital',
  'Estilo Cartoon',
  'Minimalista',
  'Arte Abstrata',
  'Aquarela',
  'Estilo Vintage',
  'Design Moderno',
];

function SettingsToggle({ 
  icon: Icon, 
  title, 
  description, 
  checked, 
  onCheckedChange,
  accentColor,
  bgColor,
  creditCost
}: SettingsToggleProps) {
  return (
    <div 
      className={cn(
        'p-4 rounded-lg border transition-all',
        checked ? 'border-2' : 'border-border'
      )}
      style={{ 
        borderColor: checked ? accentColor : undefined,
        backgroundColor: checked ? `${accentColor}08` : undefined
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            className={cn('w-10 h-10 rounded-lg flex items-center justify-center', !checked && 'bg-muted')}
            style={{ backgroundColor: checked ? `${accentColor}20` : undefined }}
          >
            <Icon 
              className={cn('w-5 h-5', !checked && 'text-muted-foreground')}
              style={{ color: checked ? accentColor : undefined }} 
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">{title}</p>
              {creditCost && (
                <span 
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ 
                    backgroundColor: `${accentColor}15`, 
                    color: accentColor 
                  }}
                >
                  {creditCost}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Switch 
          checked={checked} 
          onCheckedChange={onCheckedChange}
          style={checked ? { backgroundColor: accentColor } : {}}
        />
      </div>
    </div>
  );
}

export function AdvancedSettings({
  usePlatformCredits,
  seoOptimization,
  realtimeData,
  humanizeContent,
  generateImages,
  imageCount,
  imageStyle,
  onUsePlatformCreditsChange,
  onSeoOptimizationChange,
  onRealtimeDataChange,
  onHumanizeContentChange,
  onGenerateImagesChange,
  onImageCountChange,
  onImageStyleChange,
  accentColor = '#4169E1',
}: AdvancedSettingsProps) {
  return (
    <div className="space-y-4">
      {/* Platform Credits Toggle */}
      <SettingsToggle
        icon={CreditCard}
        title="Usar Créditos da Plataforma"
        description="Usar créditos ilimitados da plataforma"
        checked={usePlatformCredits}
        onCheckedChange={onUsePlatformCreditsChange}
        accentColor="#22C55E"
        bgColor="#DCFCE7"
        creditCost="+1 crédito"
      />

      {/* SEO Optimization */}
      <SettingsToggle
        icon={Search}
        title="Otimização SEO Avançada"
        description="Análise e otimização automática para mecanismos de busca"
        checked={seoOptimization}
        onCheckedChange={onSeoOptimizationChange}
        accentColor="#3B82F6"
        bgColor="#DBEAFE"
      />

      {/* Realtime Data */}
      <SettingsToggle
        icon={Clock}
        title="Dados em Tempo Real"
        description="Inclui informações e estatísticas atualizadas"
        checked={realtimeData}
        onCheckedChange={onRealtimeDataChange}
        accentColor="#8B5CF6"
        bgColor="#EDE9FE"
        creditCost="+1 crédito"
      />

      {/* Humanize Content */}
      <SettingsToggle
        icon={User}
        title="Humanizar Conteúdo"
        description="Deixa o texto mais natural e humano"
        checked={humanizeContent}
        onCheckedChange={onHumanizeContentChange}
        accentColor="#F97316"
        bgColor="#FFF7ED"
        creditCost="+1 crédito"
      />

      {/* Generate Images */}
      <div 
        className={cn(
          'p-4 rounded-lg border transition-all',
          generateImages ? 'border-2 border-accent bg-accent/5' : 'border-border'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                generateImages ? 'bg-accent/20' : 'bg-muted'
              )}
            >
              <Image 
                className={cn('w-5 h-5', generateImages ? 'text-accent' : 'text-muted-foreground')}
              />
            </div>
            <div>
              <p className="font-medium text-sm">Gerar Imagens</p>
              <p className="text-xs text-muted-foreground">
                Cria imagens personalizadas para o artigo
              </p>
            </div>
          </div>
          <Switch 
            checked={generateImages} 
            onCheckedChange={onGenerateImagesChange}
            className="data-[state=checked]:bg-accent"
          />
        </div>
        
        {generateImages && (
          <div className="mt-4 pt-4 border-t space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Quantidade de imagens</Label>
                <span className="text-sm font-medium text-accent">{imageCount}</span>
              </div>
              <Slider
                value={[imageCount]}
                onValueChange={(v) => onImageCountChange(v[0])}
                min={1}
                max={5}
                step={1}
                className="py-2"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm">Estilo das imagens</Label>
              <Select value={imageStyle} onValueChange={onImageStyleChange}>
                <SelectTrigger className="border-border bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {imageStyles.map((style) => (
                    <SelectItem key={style} value={style.toLowerCase()}>
                      {style}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
