import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';

interface GeneratorTutorialBannerProps {
  onClose: () => void;
}

export function GeneratorTutorialBanner({ onClose }: GeneratorTutorialBannerProps) {
  return (
    <div className="rounded-lg p-4 flex items-center gap-4 bg-blue-50">
      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary">
        <Play className="w-4 h-4 text-white ml-0.5" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-foreground">
          Tutorial: Como Criar Artigos
        </p>
        <p className="text-sm text-muted-foreground">
          Aprenda a usar o gerador de artigos passo a passo
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onClose}>
        Fechar
      </Button>
    </div>
  );
}
