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

export function ProgressScreen({ currentStep, progress, steps }: ProgressScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8 animate-scale-in">
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-primary/10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">
          Estamos criando o seu artigo
        </h2>
      </div>

      {/* Current Task */}
      <div className="flex items-center gap-3 px-6 py-3 rounded-full mb-6 bg-primary/10 animate-fade-in">
        <span className="text-primary">✨</span>
        <span className="font-medium text-primary">
          {currentStep}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full max-w-md mb-8">
        <Progress value={progress} className="h-2" />
      </div>

      {/* Steps List */}
      <div className="w-full max-w-md space-y-4 mb-8">
        {steps.map((step, index) => (
          <div 
            key={step.id}
            className={cn(
              'flex items-start gap-4 p-4 rounded-lg transition-all duration-300',
              step.status === 'in-progress' && 'bg-primary/5 border border-primary/20 animate-scale-in',
              step.status === 'completed' && 'opacity-80',
              step.status === 'pending' && 'opacity-60'
            )}
            style={{
              animationDelay: `${index * 100}ms`,
            }}
          >
            {/* Status Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {step.status === 'completed' ? (
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-green-500 animate-scale-in">
                  <Check className="w-4 h-4 text-white" />
                </div>
              ) : step.status === 'in-progress' ? (
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-primary">
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full flex items-center justify-center border-2 border-muted">
                  <Circle className="w-3 h-3 text-muted" />
                </div>
              )}
            </div>

            {/* Step Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "font-medium text-sm transition-colors duration-200",
                  step.status === 'pending' ? 'text-muted-foreground' : 'text-foreground'
                )}>
                  {step.title}
                </span>
                {step.status === 'completed' && (
                  <span className="text-xs text-green-500 font-medium">
                    Concluído
                  </span>
                )}
                {step.status === 'in-progress' && (
                  <span className="text-xs text-primary font-medium animate-pulse">
                    Em andamento
                  </span>
                )}
              </div>
              {step.description && (
                <p className="text-xs mt-0.5 text-muted-foreground">
                  {step.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Metrics */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-lg animate-fade-in" style={{ animationDelay: '300ms' }}>
        <div className="p-4 rounded-lg text-center bg-muted/50 transition-all duration-200 hover:bg-muted">
          <Settings className="w-5 h-5 mx-auto mb-2 text-primary" />
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Etapa Atual
          </p>
          <p className="text-sm font-semibold mt-1 text-foreground truncate">
            {currentStep}
          </p>
        </div>

        <div className="p-4 rounded-lg text-center bg-muted/50 transition-all duration-200 hover:bg-muted">
          <BarChart3 className="w-5 h-5 mx-auto mb-2 text-primary" />
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Progresso
          </p>
          <p className="text-sm font-semibold mt-1 text-foreground">
            {Math.round(progress)}%
          </p>
        </div>

        <div className="p-4 rounded-lg text-center bg-muted/50 transition-all duration-200 hover:bg-muted">
          <Clock className="w-5 h-5 mx-auto mb-2 text-primary" />
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Tempo Médio
          </p>
          <p className="text-sm font-semibold mt-1 text-foreground">
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
