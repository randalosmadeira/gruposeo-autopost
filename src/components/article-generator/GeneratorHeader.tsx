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
    <header className="border-b flex bg-background border-border shrink-0">
      {/* Left Header - Generator Title */}
      <div 
        className={cn(
          "flex items-center justify-between px-4 md:px-5 py-3 border-r border-border",
          isMobile ? "w-full" : "w-1/2"
        )}
      >
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
            <Zap className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-semibold text-foreground truncate">
              Gerador de Artigos IA
            </h1>
            <p className="text-xs hidden sm:block text-muted-foreground truncate">
              Crie conteúdo de alta qualidade com IA
            </p>
          </div>
        </div>
        <Badge className="text-xs px-2 py-1 shrink-0 ml-2 bg-primary text-primary-foreground">
          {totalCredits} {totalCredits === 1 ? 'Crédito' : 'Créditos'}
        </Badge>
      </div>
      
      {/* Right Header - Preview Status */}
      {!isMobile && (
        <div className="w-1/2 flex items-center justify-between px-4 md:px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4 text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground text-sm truncate">{rightPanelTitle}</h2>
              <p className="text-xs text-muted-foreground truncate">{rightPanelDescription}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 ml-2">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="hidden md:inline">{statusText}</span>
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
