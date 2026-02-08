import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Target,
  Briefcase,
  FileText,
  Compass,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SEOAdvancedConfigProps {
  segment: string;
  contentType: string;
  goal: string;
  intentType: string;
  onSegmentChange: (value: string) => void;
  onContentTypeChange: (value: string) => void;
  onGoalChange: (value: string) => void;
  onIntentTypeChange: (value: string) => void;
  accentColor?: string;
}

const segments = [
  { value: 'general', label: 'Geral', icon: '🌐' },
  { value: 'legal', label: 'Jurídico', icon: '⚖️', description: 'Advogados, escritórios' },
  { value: 'health', label: 'Saúde', icon: '🏥', description: 'Médicos, clínicas' },
  { value: 'fintech', label: 'Finanças/Fintech', icon: '💰', description: 'Bancos, investimentos' },
  { value: 'ecommerce', label: 'E-commerce', icon: '🛒', description: 'Lojas online' },
  { value: 'b2b-saas', label: 'B2B SaaS', icon: '💼', description: 'Software empresarial' },
  { value: 'education', label: 'Educação', icon: '📚', description: 'Cursos, treinamentos' },
];

const contentTypes = [
  { value: 'how-to', label: 'Tutorial/How-To', description: 'Passo a passo' },
  { value: 'listicle', label: 'Listicle', description: 'Lista numerada' },
  { value: 'pillar', label: 'Conteúdo Pilar', description: 'Guia completo' },
  { value: 'comparative', label: 'Comparativo', description: 'X vs Y' },
  { value: 'review', label: 'Review de Produto', description: 'Análise detalhada' },
  { value: 'opinion', label: 'Opinião/Análise', description: 'Ponto de vista' },
  { value: 'news', label: 'Notícia', description: 'Atualidade' },
];

const goals = [
  { value: 'inform', label: 'Informar', icon: '📖' },
  { value: 'convert', label: 'Converter', icon: '🎯' },
  { value: 'educate', label: 'Educar', icon: '🎓' },
  { value: 'engage', label: 'Engajar', icon: '💬' },
];

const intentTypes = [
  { value: 'informational', label: 'Informacional', description: 'Usuário quer aprender' },
  { value: 'navigational', label: 'Navegacional', description: 'Busca marca específica' },
  { value: 'transactional', label: 'Transacional', description: 'Quer comprar/contratar' },
  { value: 'commercial', label: 'Comercial', description: 'Pesquisa antes de decidir' },
];

export function SEOAdvancedConfig({
  segment,
  contentType,
  goal,
  intentType,
  onSegmentChange,
  onContentTypeChange,
  onGoalChange,
  onIntentTypeChange,
  accentColor = '#4169E1',
}: SEOAdvancedConfigProps) {
  return (
    <div className="space-y-5">
      {/* Segment Selection */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4" style={{ color: accentColor }} />
          <Label className="text-sm font-medium">Segmento do Negócio</Label>
        </div>
        <Select value={segment} onValueChange={onSegmentChange}>
          <SelectTrigger className="h-11 border-border bg-background">
            <SelectValue placeholder="Selecione o segmento" />
          </SelectTrigger>
          <SelectContent>
            {segments.map((seg) => (
              <SelectItem key={seg.value} value={seg.value}>
                <div className="flex items-center gap-2">
                  <span>{seg.icon}</span>
                  <span>{seg.label}</span>
                  {seg.description && (
                    <span className="text-xs text-muted-foreground">
                      - {seg.description}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Aplica diretrizes específicas do setor (compliance, tom, disclaimers)
        </p>
      </div>

      {/* Content Type */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" style={{ color: accentColor }} />
          <Label className="text-sm font-medium">Tipo de Conteúdo</Label>
        </div>
        <Select value={contentType} onValueChange={onContentTypeChange}>
          <SelectTrigger className="h-11 border-border bg-background">
            <SelectValue placeholder="Selecione o tipo" />
          </SelectTrigger>
          <SelectContent>
            {contentTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{type.label}</span>
                  <span className="text-xs text-muted-foreground">
                    ({type.description})
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid 2x1 for Goal and Intent */}
      <div className="grid grid-cols-2 gap-4">
        {/* Goal */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4" style={{ color: accentColor }} />
            <Label className="text-sm font-medium">Objetivo</Label>
          </div>
          <Select value={goal} onValueChange={onGoalChange}>
            <SelectTrigger className="h-11 border-border bg-background">
              <SelectValue placeholder="Objetivo" />
            </SelectTrigger>
            <SelectContent>
              {goals.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  <div className="flex items-center gap-2">
                    <span>{g.icon}</span>
                    <span>{g.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Intent Type */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4" style={{ color: accentColor }} />
            <Label className="text-sm font-medium">Intenção de Busca</Label>
          </div>
          <Select value={intentType} onValueChange={onIntentTypeChange}>
            <SelectTrigger className="h-11 border-border bg-background">
              <SelectValue placeholder="Intenção" />
            </SelectTrigger>
            <SelectContent>
              {intentTypes.map((intent) => (
                <SelectItem key={intent.value} value={intent.value}>
                  <div className="flex flex-col">
                    <span className="font-medium">{intent.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Info Box */}
      <div 
        className="p-3 rounded-lg text-xs border"
        style={{ backgroundColor: `${accentColor}08`, borderColor: `${accentColor}30` }}
      >
        <p className="font-medium mb-1" style={{ color: accentColor }}>
          💡 Otimização E-E-A-T Automática
        </p>
        <p className="text-muted-foreground">
          Com base no segmento selecionado, o sistema aplicará automaticamente:
          disclaimers legais, citação de fontes apropriadas, tom adequado, 
          e estratégias de featured snippets otimizadas.
        </p>
      </div>
    </div>
  );
}
