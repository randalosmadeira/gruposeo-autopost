import NewsRewriter from './NewsRewriter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Bot, ListChecks, ShieldCheck, Sparkles } from 'lucide-react';

export default function NewsRewriterAutonomous() {
  return (
    <div>
      <div className="container max-w-7xl px-4 pt-6">
        <Alert className="border-primary/50 bg-primary/5">
          <Bot className="h-5 w-5 text-primary" />
          <AlertTitle className="flex flex-wrap items-center gap-2 text-base">
            Rol de repostagens governado pelos Agentes de IA
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              Autonomia ativa
            </Badge>
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>
              Nicho, ângulo de análise, tamanho, palavra-chave, tom e gatilho emocional são decididos para cada matéria conforme a fonte, o projeto, o risco e as decisões recentes do rol. As opções visuais abaixo funcionam como pistas editoriais, não como comandos rígidos.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="gap-1 border-primary/30">
                <ListChecks className="h-3.5 w-3.5" />
                Diversidade entre matérias
              </Badge>
              <Badge variant="outline" className="gap-1 border-primary/30">
                <ShieldCheck className="h-3.5 w-3.5" />
                Bloqueio de sensacionalismo
              </Badge>
              <Badge variant="outline" className="gap-1 border-primary/30">
                Revisão humana em alto risco
              </Badge>
              <Badge variant="outline" className="gap-1 border-primary/30">
                RSS verificado após publicação
              </Badge>
            </div>
          </AlertDescription>
        </Alert>
      </div>
      <NewsRewriter />
    </div>
  );
}
