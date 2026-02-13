import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Copy, 
  Check, 
  Megaphone,
  RefreshCw,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface GoogleAdsVariation {
  headline1: string;
  headline2: string;
  headline3: string;
  description1: string;
  description2: string;
}

interface GoogleAdsVariationsPanelProps {
  title: string | null;
  keyword: string;
  content: string | null;
  excerpt: string | null;
}

function generateLocalVariations(title: string, keyword: string, excerpt: string): GoogleAdsVariation[] {
  const kw = keyword.trim();
  const cleanTitle = (title || kw).replace(/[—–-]\s*.+$/, '').trim();
  const year = new Date().getFullYear();
  
  return [
    {
      headline1: truncate(`${cleanTitle}`, 30),
      headline2: truncate(`Especialistas em ${kw}`, 30),
      headline3: truncate(`Consulta Grátis ${year}`, 30),
      description1: truncate(excerpt || `Precisa de ajuda com ${kw}? Fale com nossos especialistas hoje mesmo.`, 90),
      description2: truncate(`✅ Atendimento rápido ✅ Sem compromisso ✅ Resultados comprovados`, 90),
    },
    {
      headline1: truncate(`${kw} — Resolva Agora`, 30),
      headline2: truncate(`Equipe Especializada`, 30),
      headline3: truncate(`Avaliação Gratuita`, 30),
      description1: truncate(`Não deixe para depois. Nossos especialistas em ${kw} podem ajudar você hoje.`, 90),
      description2: truncate(`⭐ +500 clientes atendidos ⭐ Atendimento humanizado ⭐ Resultados reais`, 90),
    },
    {
      headline1: truncate(`Problemas com ${kw}?`, 30),
      headline2: truncate(`Nós Resolvemos Para Você`, 30),
      headline3: truncate(`Fale Conosco Agora`, 30),
      description1: truncate(`Entenda seus direitos sobre ${kw}. Atendimento personalizado e sem burocracia.`, 90),
      description2: truncate(`📞 Resposta em até 2h ✅ Sem custo inicial ✅ Atuação em todo Brasil`, 90),
    },
  ];
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3).trim() + '...';
}

export function GoogleAdsVariationsPanel({ title, keyword, content, excerpt }: GoogleAdsVariationsPanelProps) {
  const { toast } = useToast();
  const [variations, setVariations] = useState<GoogleAdsVariation[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Auto-generate local variations on first render
  const localVariations = useMemo(() => {
    if (!keyword) return [];
    return generateLocalVariations(title || keyword, keyword, excerpt || '');
  }, [title, keyword, excerpt]);

  const displayVariations = variations.length > 0 ? variations : localVariations;

  const handleGenerateWithAI = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-api', {
        body: {
          action: 'generate-google-ads',
          prompt: JSON.stringify({
            keyword,
            title: title || keyword,
            excerpt: excerpt || '',
            contentSnippet: (content || '').slice(0, 500),
          }),
        },
      });

      if (error) throw error;

      if (data?.variations && Array.isArray(data.variations)) {
        setVariations(data.variations.slice(0, 3));
        toast({ title: 'Variações geradas!', description: '3 variações de Google Ads criadas com IA.' });
      } else {
        // Fallback to local
        setVariations(localVariations);
        toast({ title: 'Variações geradas!', description: 'Variações criadas com base no conteúdo.' });
      }
    } catch (err) {
      console.error('Error generating ads:', err);
      setVariations(localVariations);
      toast({ title: 'Variações geradas', description: 'Utilizando geração local como fallback.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (index: number) => {
    const v = displayVariations[index];
    if (!v) return;
    
    const text = `Título 1: ${v.headline1}\nTítulo 2: ${v.headline2}\nTítulo 3: ${v.headline3}\nDescrição 1: ${v.description1}\nDescrição 2: ${v.description2}`;
    
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast({ title: 'Copiado!', description: `Variação ${index + 1} copiada.` });
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  const handleCopyAll = async () => {
    const text = displayVariations.map((v, i) => 
      `--- Variação ${i + 1} ---\nTítulo 1: ${v.headline1}\nTítulo 2: ${v.headline2}\nTítulo 3: ${v.headline3}\nDescrição 1: ${v.description1}\nDescrição 2: ${v.description2}`
    ).join('\n\n');

    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Todas copiadas!', description: `${displayVariations.length} variações copiadas.` });
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  if (!keyword) return null;

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            <CardTitle className="text-sm font-medium">Google Ads</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyAll}
              className="h-7 text-xs gap-1"
              disabled={displayVariations.length === 0}
            >
              <Copy className="w-3 h-3" />
              Copiar Todas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateWithAI}
              disabled={isGenerating}
              className="h-7 text-xs gap-1"
            >
              {isGenerating ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              Gerar com IA
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2 space-y-3">
        <p className="text-xs text-muted-foreground">
          {displayVariations.length} variações de anúncio para Google Ads (Responsive Search Ads).
        </p>

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3">
            {displayVariations.map((v, i) => (
              <div key={i} className="p-3 rounded-lg border bg-background space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px]">
                    Variação {i + 1}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(i)}
                    className="h-6 w-6 p-0"
                  >
                    {copiedIndex === i ? (
                      <Check className="w-3 h-3 text-green-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                </div>

                {/* Headlines */}
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Títulos</p>
                  <p className="text-xs text-primary font-medium">
                    {v.headline1} | {v.headline2} | {v.headline3}
                  </p>
                  <div className="flex gap-1">
                    <span className={`text-[9px] ${v.headline1.length <= 30 ? 'text-green-600' : 'text-destructive'}`}>
                      H1: {v.headline1.length}/30
                    </span>
                    <span className={`text-[9px] ${v.headline2.length <= 30 ? 'text-green-600' : 'text-destructive'}`}>
                      H2: {v.headline2.length}/30
                    </span>
                    <span className={`text-[9px] ${v.headline3.length <= 30 ? 'text-green-600' : 'text-destructive'}`}>
                      H3: {v.headline3.length}/30
                    </span>
                  </div>
                </div>

                <Separator />

                {/* Descriptions */}
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Descrições</p>
                  <p className="text-xs">{v.description1}</p>
                  <p className="text-xs text-muted-foreground">{v.description2}</p>
                  <div className="flex gap-1">
                    <span className={`text-[9px] ${v.description1.length <= 90 ? 'text-green-600' : 'text-destructive'}`}>
                      D1: {v.description1.length}/90
                    </span>
                    <span className={`text-[9px] ${v.description2.length <= 90 ? 'text-green-600' : 'text-destructive'}`}>
                      D2: {v.description2.length}/90
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
