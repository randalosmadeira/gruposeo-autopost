import { Loader2, Check, Circle, Settings, BarChart3, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  title: string;
  description?: string;
  status: 'completed' | 'in-progress' | 'pending';
}

interface ProgressScreenProps {
  currentStep: string;
  progress: number;
  steps: Step[];
}

const colors = {
  primary: '#4169E1',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  border: '#E0E0E0',
  success: '#4CAF50',
  background: '#FFFFFF',
  backgroundSecondary: '#F5F7FA',
  lightBlue: '#E3F2FD',
};

export function ProgressScreen({ currentStep, progress, steps }: ProgressScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div 
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${colors.primary}15` }}
        >
          <Loader2 
            className="w-6 h-6 animate-spin" 
            style={{ color: colors.primary }} 
          />
        </div>
        <h2 className="text-xl font-semibold" style={{ color: colors.textPrimary }}>
          Estamos criando o seu artigo
        </h2>
      </div>

      {/* Current Task */}
      <div 
        className="flex items-center gap-3 px-6 py-3 rounded-full mb-6"
        style={{ backgroundColor: colors.lightBlue }}
      >
        <span style={{ color: colors.primary }}>✨</span>
        <span className="font-medium" style={{ color: colors.primary }}>
          {currentStep}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full max-w-md mb-8">
        <Progress value={progress} className="h-2" />
      </div>

      {/* Steps List */}
      <div className="w-full max-w-md space-y-4 mb-8">
        {steps.map((step) => (
          <div 
            key={step.id}
            className={cn(
              'flex items-start gap-4 p-4 rounded-lg transition-all',
              step.status === 'in-progress' && 'bg-blue-50 border border-blue-100',
              step.status === 'completed' && 'opacity-80',
              step.status === 'pending' && 'opacity-60'
            )}
          >
            {/* Status Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {step.status === 'completed' ? (
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: colors.success }}
                >
                  <Check className="w-4 h-4 text-white" />
                </div>
              ) : step.status === 'in-progress' ? (
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                </div>
              ) : (
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center border-2"
                  style={{ borderColor: colors.border }}
                >
                  <Circle className="w-3 h-3" style={{ color: colors.border }} />
                </div>
              )}
            </div>

            {/* Step Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span 
                  className="font-medium text-sm"
                  style={{ color: step.status === 'pending' ? colors.textSecondary : colors.textPrimary }}
                >
                  {step.title}
                </span>
                {step.status === 'completed' && (
                  <span className="text-xs" style={{ color: colors.success }}>
                    Concluído
                  </span>
                )}
                {step.status === 'in-progress' && (
                  <span className="text-xs" style={{ color: colors.primary }}>
                    Em andamento
                  </span>
                )}
              </div>
              {step.description && (
                <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                  {step.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Metrics */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-lg">
        <div 
          className="p-4 rounded-lg text-center"
          style={{ backgroundColor: colors.backgroundSecondary }}
        >
          <Settings className="w-5 h-5 mx-auto mb-2" style={{ color: colors.primary }} />
          <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: colors.textSecondary }}>
            Etapa Atual
          </p>
          <p className="text-sm font-semibold mt-1" style={{ color: colors.textPrimary }}>
            {currentStep}
          </p>
        </div>

        <div 
          className="p-4 rounded-lg text-center"
          style={{ backgroundColor: colors.backgroundSecondary }}
        >
          <BarChart3 className="w-5 h-5 mx-auto mb-2" style={{ color: colors.primary }} />
          <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: colors.textSecondary }}>
            Progresso
          </p>
          <p className="text-sm font-semibold mt-1" style={{ color: colors.textPrimary }}>
            {Math.round(progress)}%
          </p>
        </div>

        <div 
          className="p-4 rounded-lg text-center"
          style={{ backgroundColor: colors.backgroundSecondary }}
        >
          <Clock className="w-5 h-5 mx-auto mb-2" style={{ color: colors.primary }} />
          <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: colors.textSecondary }}>
            Tempo Médio
          </p>
          <p className="text-sm font-semibold mt-1" style={{ color: colors.textPrimary }}>
            ≈ 2-4 min
          </p>
        </div>
      </div>
    </div>
  );
}

// Default steps for article generation
export const defaultGenerationSteps: Step[] = [
  {
    id: 'preferences',
    title: 'Preparando preferências',
    status: 'pending',
  },
  {
    id: 'seo',
    title: 'Análise de SEO',
    description: 'Pesquisando concorrentes e palavras-chave relevantes.',
    status: 'pending',
  },
  {
    id: 'outline',
    title: 'Gerando esboço',
    description: 'Definindo a estrutura ideal do artigo.',
    status: 'pending',
  },
  {
    id: 'writing',
    title: 'Escrevendo conteúdo',
    description: 'Nossa IA está redigindo o artigo completo.',
    status: 'pending',
  },
  {
    id: 'finalizing',
    title: 'Finalizando entrega',
    description: 'Aplicando toques finais e salvando o artigo.',
    status: 'pending',
  },
];
