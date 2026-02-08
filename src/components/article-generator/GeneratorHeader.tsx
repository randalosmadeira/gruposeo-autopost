import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Zap, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GeneratorHeaderProps {
  totalCredits: number;
  isMobile: boolean;
  showPreview?: boolean;
  onShowPreview?: () => void;
  rightPanelTitle?: string;
  rightPanelDescription?: string;
  statusText?: string;
}

export function GeneratorHeader({
  totalCredits,
  isMobile,
  showPreview = false,
  onShowPreview,
  rightPanelTitle = 'Prévia em Tempo Real',
  rightPanelDescription = 'Prévia do artigo em tempo real',
  statusText = 'Pronto Para Gerar',
}: GeneratorHeaderProps) {
  return (
    <header className="border-b flex bg-background border-border">
      {/* Left Header - Generator Title */}
      <div 
        className={cn(
          "flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-r border-border",
          isMobile ? "w-full" : "w-1/2"
        )}
      >
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center bg-primary/10">
            <Zap className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-foreground">
              Gerador de Artigos IA
            </h1>
            <p className="text-xs md:text-sm hidden sm:block text-muted-foreground">
              Crie conteúdo de alta qualidade com inteligência artificial
            </p>
          </div>
        </div>
        <Badge className="text-xs md:text-sm px-3 py-1.5 bg-primary text-primary-foreground">
          Total: {totalCredits} {totalCredits === 1 ? 'Crédito' : 'Créditos'}
        </Badge>
      </div>
      
      {/* Right Header - Preview Status */}
      {!isMobile && (
        <div className="w-1/2 flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <Eye className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{rightPanelTitle}</h2>
              <p className="text-xs text-muted-foreground">{rightPanelDescription}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {statusText}
          </div>
        </div>
      )}
      
      {/* Mobile Preview Button */}
      {isMobile && onShowPreview && (
        <Button 
          variant="outline" 
          size="sm"
          onClick={onShowPreview}
          className="flex items-center gap-1 ml-2 my-auto mr-4"
        >
          <Eye className="w-4 h-4" />
          <span className="hidden xs:inline">Prévia</span>
        </Button>
      )}
    </header>
  );
}
