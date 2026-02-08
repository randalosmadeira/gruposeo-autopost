import { Button } from '@/components/ui/button';
import { Play, Sparkles, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GeneratorActionBarProps {
  appState: 'form' | 'editing-outline' | 'generating-article' | 'editing-article' | 'publishing' | 'generating-outline';
  isGenerating: boolean;
  isDisabled: boolean;
  validationErrors: string[];
  totalCredits: number;
  userCredits: number;
  onValidateAndGenerate: () => void;
  onGenerateArticle: () => void;
  onReset: () => void;
  isMobile?: boolean;
}

export function GeneratorActionBar({
  appState,
  isGenerating,
  isDisabled,
  validationErrors,
  totalCredits,
  userCredits,
  onValidateAndGenerate,
  onGenerateArticle,
  onReset,
  isMobile = false,
}: GeneratorActionBarProps) {
  return (
    <div 
      className={cn(
        "absolute bottom-0 left-0 p-4 border-t bg-background/95 backdrop-blur-sm border-border z-10",
        isMobile ? "w-full" : "w-1/2"
      )}
    >
      {appState === 'form' && (
        <>
          {validationErrors.length > 0 && (
            <div className="mb-3 p-3 bg-destructive/10 rounded-lg space-y-1">
              {validationErrors.map((error, idx) => (
                <p key={idx} className="text-sm flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </p>
              ))}
            </div>
          )}
          <Button
            onClick={onValidateAndGenerate}
            disabled={isGenerating || isDisabled}
            className="w-full h-12 text-base transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-primary hover:bg-primary/90"
          >
            <Play className="w-5 h-5 mr-2" />
            Gerar Esboço do Artigo
          </Button>
          <p className="text-xs text-center text-muted-foreground mt-2">
            Custo total: {totalCredits} {totalCredits === 1 ? 'crédito' : 'créditos'} • Disponível: {userCredits}
          </p>
        </>
      )}
      
      {appState === 'editing-outline' && (
        <>
          <Button
            onClick={onGenerateArticle}
            disabled={isGenerating}
            className="w-full h-12 text-base transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-primary hover:bg-primary/90"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Gerando Artigo...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Gerar Artigo Completo ({totalCredits} {totalCredits === 1 ? 'crédito' : 'créditos'})
              </>
            )}
          </Button>
          <Button
            onClick={onReset}
            variant="outline"
            className="w-full h-10 mt-2 transition-colors duration-200"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reiniciar & Começar de Novo
          </Button>
        </>
      )}
    </div>
  );
}
