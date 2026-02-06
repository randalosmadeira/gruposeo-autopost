import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface AIModel {
  value: string;
  label: string;
  description: string;
  credits: number;
  technical: string;
}

export const aiModels: AIModel[] = [
  { 
    value: 'standard', 
    label: 'Padrão', 
    description: 'Qualidade boa para uso geral',
    credits: 1,
    technical: 'Mix de modelos escolhidos automaticamente'
  },
  { 
    value: 'premium', 
    label: 'Premium', 
    description: 'Máxima qualidade e precisão',
    credits: 2,
    technical: 'gpt-5 + gpt-5-nano'
  },
  { 
    value: 'advanced', 
    label: 'Avançado', 
    description: 'Qualidade superior com modelos avançados',
    credits: 3,
    technical: 'gemini-2.5-pro + gemini-2.5-flash'
  },
  { 
    value: 'professional', 
    label: 'Profissional', 
    description: 'Qualidade máxima com modelos de ponta',
    credits: 4,
    technical: 'gemini-3-pro-preview + gemini-3-flash-preview'
  },
];

interface AIModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  accentColor?: string;
}

export function AIModelSelector({ 
  value, 
  onChange, 
  accentColor = '#4169E1' 
}: AIModelSelectorProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Modelo de IA</Label>
      <div className="grid grid-cols-2 gap-3">
        {aiModels.map((model) => {
          const isSelected = value === model.value;
          return (
            <div
              key={model.value}
              onClick={() => onChange(model.value)}
              className={cn(
                'p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md',
                isSelected 
                  ? 'shadow-md' 
                  : 'border-gray-200 bg-white hover:border-gray-300'
              )}
              style={{
                borderColor: isSelected ? accentColor : undefined,
                backgroundColor: isSelected ? `${accentColor}08` : undefined,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{model.label}</span>
                <Badge 
                  variant="secondary" 
                  className="text-xs"
                  style={{ 
                    backgroundColor: isSelected ? `${accentColor}20` : undefined,
                    color: isSelected ? accentColor : undefined 
                  }}
                >
                  {model.credits} {model.credits === 1 ? 'crédito' : 'créditos'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{model.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function getModelByValue(value: string): AIModel | undefined {
  return aiModels.find(m => m.value === value);
}
