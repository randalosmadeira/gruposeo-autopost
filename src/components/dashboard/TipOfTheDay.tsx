import { Lightbulb, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const tips = [
  {
    title: 'Foque em Long-tail Keywords',
    description: 'Palavras-chave de cauda longa têm menor competição e melhor taxa de conversão.',
  },
  {
    title: 'Use Links Internos',
    description: 'Conecte seus artigos para melhorar a navegação e distribuir autoridade entre páginas.',
  },
  {
    title: 'Otimize para Featured Snippets',
    description: 'Estruture seu conteúdo com listas e perguntas frequentes para aparecer em posição zero.',
  },
  {
    title: 'Atualize Conteúdo Antigo',
    description: 'Revise e melhore artigos existentes para manter a relevância e rankings.',
  },
];

export function TipOfTheDay() {
  const [visible, setVisible] = useState(true);
  const [currentTip] = useState(() => tips[Math.floor(Math.random() * tips.length)]);

  if (!visible) return null;

  return (
    <div className="relative bg-gradient-to-r from-accent/10 via-warning-light to-accent/5 rounded-2xl p-6 border border-accent/20 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
      
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 w-8 h-8 text-muted-foreground hover:text-foreground"
        onClick={() => setVisible(false)}
      >
        <X className="w-4 h-4" />
      </Button>

      <div className="relative flex items-start gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-accent text-accent-foreground shrink-0">
          <Lightbulb className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-1">
            💡 Dica do Dia
          </p>
          <h4 className="font-semibold text-foreground mb-1">{currentTip.title}</h4>
          <p className="text-sm text-muted-foreground">{currentTip.description}</p>
        </div>
      </div>
    </div>
  );
}