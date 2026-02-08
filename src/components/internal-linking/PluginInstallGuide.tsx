import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Download,
  Upload,
  Key,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  Plug,
  Settings,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PluginInstallGuideProps {
  showFallbackOption?: boolean;
  onUseFallback?: () => void;
  isUsingFallback?: boolean;
}

export function PluginInstallGuide({ 
  showFallbackOption = false, 
  onUseFallback,
  isUsingFallback = false,
}: PluginInstallGuideProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  const copyToClipboard = async (text: string, step: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStep(step);
      setTimeout(() => setCopiedStep(null), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedStep(step);
      setTimeout(() => setCopiedStep(null), 2000);
    }
  };

  const steps = [
    {
      icon: Download,
      title: 'Baixar o Plugin',
      description: 'Acesse a página "Plugin WP" no menu lateral e baixe o arquivo .zip do plugin ContentFactory RDM.',
      action: (
        <Button variant="outline" size="sm" asChild>
          <a href="/wordpress-plugin">
            <Download className="w-4 h-4 mr-2" />
            Ir para Plugin WP
          </a>
        </Button>
      ),
    },
    {
      icon: Upload,
      title: 'Instalar no WordPress',
      description: 'No painel WordPress, vá em Plugins → Adicionar Novo → Fazer Upload e selecione o arquivo .zip baixado.',
      code: 'Plugins → Adicionar Novo → Fazer Upload do Plugin',
    },
    {
      icon: Plug,
      title: 'Ativar o Plugin',
      description: 'Após instalar, clique em "Ativar" para habilitar o plugin ContentFactory RDM.',
    },
    {
      icon: Key,
      title: 'Copiar a API Key',
      description: 'Acesse ContentFactory → Configurações no menu do WordPress e copie a API Key gerada automaticamente.',
    },
    {
      icon: Settings,
      title: 'Configurar no Projeto',
      description: 'Em Projetos, edite o projeto WordPress e selecione "Plugin + API Key" como método de conexão. Cole a API Key copiada.',
    },
  ];

  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Plugin Não Detectado</CardTitle>
                  <CardDescription>
                    O plugin ContentFactory RDM não está instalado ou ativo neste site
                  </CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon">
                {isOpen ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </Button>
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Benefits */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-background border">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Análise completa de conteúdo</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-background border">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Extração de metadados SEO</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-background border">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Mapeamento de links internos</span>
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Como instalar o plugin:</h4>
              {steps.map((step, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg bg-background border"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <step.icon className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{step.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                    {step.code && (
                      <div className="mt-2 flex items-center gap-2">
                        <code className="px-2 py-1 rounded bg-muted text-xs font-mono">
                          {step.code}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(step.code!, index)}
                        >
                          {copiedStep === index ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    )}
                    {step.action && <div className="mt-2">{step.action}</div>}
                  </div>
                </div>
              ))}
            </div>

            {/* Fallback Option */}
            {showFallbackOption && (
              <Alert className="mt-4">
                <Settings className="w-4 h-4" />
                <AlertTitle>Opção alternativa: REST API padrão</AlertTitle>
                <AlertDescription className="mt-2">
                  <p className="mb-3">
                    Você pode sincronizar usando a REST API padrão do WordPress (requer Application Password configurado). 
                    Esta opção tem menos recursos que o plugin, mas funciona sem instalação adicional.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button
                      variant={isUsingFallback ? "secondary" : "outline"}
                      size="sm"
                      onClick={onUseFallback}
                    >
                      {isUsingFallback ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                          Usando REST API
                        </>
                      ) : (
                        <>
                          <Settings className="w-4 h-4 mr-2" />
                          Usar REST API Padrão
                        </>
                      )}
                    </Button>
                    {isUsingFallback && (
                      <Badge variant="outline" className="text-amber-600">
                        Funcionalidade limitada
                      </Badge>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
