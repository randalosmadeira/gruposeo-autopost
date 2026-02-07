import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Circle, CheckCircle2 } from 'lucide-react';

export type AIProvider = 'openai' | 'gemini';

export interface AIModel {
  value: string;
  label: string;
  description: string;
  credits: number;
  technical: string;
  provider: AIProvider;
}

// Credit tier models - matching Sifet structure
export interface CreditTierModel {
  tier: 'padrao' | 'premium' | 'avancado' | 'profissional';
  label: string;
  description: string;
  credits: number;
  models: string;
  value: string;
}

export const creditTierModels: CreditTierModel[] = [
  {
    tier: 'padrao',
    label: 'Padrão',
    description: 'Qualidade boa para uso geral',
    credits: 1,
    models: 'Mix automático de modelos',
    value: 'standard',
  },
  {
    tier: 'premium',
    label: 'Premium',
    description: 'Máxima qualidade e precisão',
    credits: 2,
    models: 'gpt-5 + gpt-5-nano',
    value: 'premium',
  },
  {
    tier: 'avancado',
    label: 'Avançado',
    description: 'Qualidade superior com GPT-4.1',
    credits: 3,
    models: 'gpt-4.1 + gpt-4.1-mini',
    value: 'advanced',
  },
  {
    tier: 'profissional',
    label: 'Profissional',
    description: 'Qualidade máxima com GPT-4o',
    credits: 4,
    models: 'gpt-4o + gpt-4o-mini',
    value: 'professional',
  },
];

// OpenAI Models
export const openaiModels: AIModel[] = [
  { 
    value: 'gpt-4o', 
    label: 'GPT-4o', 
    description: 'Mais poderoso, ideal para conteúdo complexo',
    credits: 2,
    technical: 'gpt-4o',
    provider: 'openai'
  },
  { 
    value: 'gpt-4o-mini', 
    label: 'GPT-4o Mini', 
    description: 'Rápido e eficiente, ótimo custo-benefício',
    credits: 1,
    technical: 'gpt-4o-mini',
    provider: 'openai'
  },
];

// Gemini Models
export const geminiModels: AIModel[] = [
  { 
    value: 'flash', 
    label: 'Gemini Flash', 
    description: 'Rápido e eficiente para uso geral',
    credits: 1,
    technical: 'gemini-2.0-flash',
    provider: 'gemini'
  },
  { 
    value: 'flash-lite', 
    label: 'Gemini Flash Lite', 
    description: 'Ultra-rápido, ideal para tarefas simples',
    credits: 1,
    technical: 'gemini-2.0-flash-lite',
    provider: 'gemini'
  },
  { 
    value: 'pro', 
    label: 'Gemini Pro', 
    description: 'Máxima qualidade e precisão',
    credits: 2,
    technical: 'gemini-2.5-pro-preview',
    provider: 'gemini'
  },
  { 
    value: 'flash-thinking', 
    label: 'Gemini Thinking', 
    description: 'Raciocínio avançado para tarefas complexas',
    credits: 2,
    technical: 'gemini-2.0-flash-thinking-exp',
    provider: 'gemini'
  },
];

// Combined models list
export const aiModels: AIModel[] = [...openaiModels, ...geminiModels];

interface AIModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  provider?: AIProvider;
  onProviderChange?: (provider: AIProvider) => void;
  accentColor?: string;
  showProviderTabs?: boolean;
  variant?: 'default' | 'credit-tiers';
}

export function AIModelSelector({ 
  value, 
  onChange, 
  provider = 'openai',
  onProviderChange,
  accentColor = '#4169E1',
  showProviderTabs = true,
  variant = 'credit-tiers',
}: AIModelSelectorProps) {
  // Credit tiers variant - matches Sifet PDF exactly
  if (variant === 'credit-tiers') {
    return (
      <div className="space-y-3">
        {/* Credit tier cards */}
        <div className="space-y-2">
          {creditTierModels.map((tier) => {
            const isSelected = value === tier.value;
            
            return (
              <div
                key={tier.value}
                onClick={() => onChange(tier.value)}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200',
                  'hover:shadow-md hover:border-primary/50',
                  isSelected 
                    ? 'border-primary bg-primary/5 shadow-sm' 
                    : 'border-border bg-background'
                )}
              >
                {/* Radio indicator */}
                <div className="flex-shrink-0">
                  {isSelected ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground/50" />
                  )}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground">{tier.label}</div>
                  <div className="text-sm text-muted-foreground">{tier.description}</div>
                </div>
                
                {/* Credits badge */}
                <div className="flex-shrink-0 text-right">
                  <div className="font-bold text-foreground">
                    {tier.credits} {tier.credits === 1 ? 'crédito' : 'créditos'}
                  </div>
                  <div className="text-xs text-muted-foreground">por artigo</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Model descriptions footer */}
        <div className="p-4 bg-muted/50 rounded-lg text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">Padrão:</strong> Qualidade ótima com um mix de modelos de IA escolhidos automaticamente (1 crédito)</p>
          <p><strong className="text-foreground">Premium:</strong> Máxima qualidade com gpt-5 + gpt-5-nano (2 créditos)</p>
          <p><strong className="text-foreground">Avançado:</strong> Qualidade superior com gpt-4.1 + gpt-4.1-mini (3 créditos)</p>
          <p><strong className="text-foreground">Profissional:</strong> Qualidade máxima com gpt-4o + gpt-4o-mini (4 créditos)</p>
        </div>
      </div>
    );
  }

  // Default variant with provider tabs
  const models = provider === 'openai' ? openaiModels : geminiModels;
  
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Provedor de IA</Label>
      
      {showProviderTabs && onProviderChange && (
        <Tabs 
          value={provider} 
          onValueChange={(v) => {
            const newProvider = v as AIProvider;
            onProviderChange(newProvider);
            // Auto-select first model of new provider
            const newModels = newProvider === 'openai' ? openaiModels : geminiModels;
            if (newModels.length > 0) {
              onChange(newModels[0].value);
            }
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger 
              value="openai" 
              className="data-[state=active]:bg-green-600 data-[state=active]:text-white"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.6 8.3829l2.02-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
              </svg>
              OpenAI
            </TabsTrigger>
            <TabsTrigger 
              value="gemini"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm0 3.6c4.638 0 8.4 3.762 8.4 8.4s-3.762 8.4-8.4 8.4-8.4-3.762-8.4-8.4 3.762-8.4 8.4-8.4z"/>
                <circle cx="12" cy="12" r="4"/>
              </svg>
              Google Gemini
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <Label className="text-sm font-medium mt-4 block">Modelo</Label>
      <div className="grid grid-cols-2 gap-3">
        {models.map((model) => {
          const isSelected = value === model.value;
          const modelColor = model.provider === 'openai' ? '#10a37f' : '#4285f4';
          const selectedColor = isSelected ? modelColor : undefined;
          
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
                borderColor: selectedColor,
                backgroundColor: isSelected ? `${modelColor}08` : undefined,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{model.label}</span>
                <Badge 
                  variant="secondary" 
                  className="text-xs"
                  style={{ 
                    backgroundColor: isSelected ? `${modelColor}20` : undefined,
                    color: isSelected ? modelColor : undefined 
                  }}
                >
                  {model.provider === 'openai' ? 'OpenAI' : 'Gemini'}
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

export function getCreditTierByValue(value: string): CreditTierModel | undefined {
  return creditTierModels.find(t => t.value === value);
}

export function getProviderByModel(value: string): AIProvider {
  const model = aiModels.find(m => m.value === value);
  return model?.provider || 'openai';
}
