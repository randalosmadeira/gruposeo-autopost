import { Progress } from '@/components/ui/progress';
import { Target, Search, FileText, Sparkles, Image, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GenerationStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
}

interface LandingPageProgressScreenProps {
  currentStep: string;
  progress: number;
  steps: GenerationStep[];
}

const colors = {
  primary: '#FF6B2B',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  border: '#E0E0E0',
  background: '#FFFFFF',
  backgroundSecondary: '#F5F7FA',
  success: '#22C55E',
  lightOrange: '#FFF7ED',
};

const stepIcons: Record<string, typeof Search> = {
  research: Search,
  structure: FileText,
  copywriting: Sparkles,
  images: Image,
  optimization: CheckCircle2,
};

export const defaultLandingPageSteps: GenerationStep[] = [
  {
    id: 'research',
    title: 'Pesquisando Mercado e Buscadores',
    description: 'Analisando concorrentes, tendências e intenção de busca',
    status: 'pending',
  },
  {
    id: 'structure',
    title: 'Estruturando Artigo de Vendas',
    description: 'Definindo hierarquia de conteúdo com técnicas AIDA e PAS',
    status: 'pending',
  },
  {
    id: 'copywriting',
    title: 'Escrevendo Copy Persuasivo',
    description: 'Criando conteúdo com gatilhos neurais e autoridade E-E-A-T',
    status: 'pending',
  },
  {
    id: 'images',
    title: 'Gerando Imagens de Suporte',
    description: 'Criando visuais que reforçam a mensagem de venda',
    status: 'pending',
  },
  {
    id: 'optimization',
    title: 'Otimizando para SEO e IAs',
    description: 'Aplicando técnicas para Google, Bing, ChatGPT e Claude',
    status: 'pending',
  },
];

export function LandingPageProgressScreen({
  currentStep,
  progress,
  steps,
}: LandingPageProgressScreenProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 animate-fade-in">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div 
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto animate-pulse"
            style={{ backgroundColor: colors.lightOrange }}
          >
            <Target className="w-8 h-8" style={{ color: colors.primary }} />
          </div>
          <h2 className="text-xl font-semibold" style={{ color: colors.textPrimary }}>
            Gerando seu Artigo de Vendas
          </h2>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            {currentStep || 'Iniciando geração com SEO avançado...'}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={progress} className="h-3" />
          <p className="text-center text-sm font-medium" style={{ color: colors.primary }}>
            {progress.toFixed(0)}% concluído
          </p>
        </div>

        {/* Steps List */}
        <div className="space-y-3">
          {steps.map((step) => {
            const Icon = stepIcons[step.id] || FileText;
            const isActive = step.status === 'in-progress';
            const isCompleted = step.status === 'completed';

            return (
              <div
                key={step.id}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-lg border transition-all duration-300',
                  isActive && 'border-orange-300 bg-orange-50 shadow-sm',
                  isCompleted && 'border-green-200 bg-green-50/50',
                  !isActive && !isCompleted && 'border-gray-200 opacity-50'
                )}
              >
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300',
                    isActive && 'bg-orange-100',
                    isCompleted && 'bg-green-100',
                    !isActive && !isCompleted && 'bg-gray-100'
                  )}
                >
                  {isActive ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: colors.primary }} />
                  ) : isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" style={{ color: colors.success }} />
                  ) : (
                    <Icon className="w-5 h-5" style={{ color: colors.textSecondary }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'font-medium text-sm',
                      isCompleted && 'text-green-700',
                      isActive && 'text-orange-700'
                    )}
                    style={{ color: !isActive && !isCompleted ? colors.textPrimary : undefined }}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs truncate" style={{ color: colors.textSecondary }}>
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tip */}
        <div 
          className="p-4 rounded-lg text-center text-sm"
          style={{ backgroundColor: colors.backgroundSecondary, color: colors.textSecondary }}
        >
          💡 <strong>Dica:</strong> Artigos de vendas com SEO otimizado podem aumentar o tráfego orgânico em até 400% e conversões em 150%
        </div>
      </div>
    </div>
  );
}
