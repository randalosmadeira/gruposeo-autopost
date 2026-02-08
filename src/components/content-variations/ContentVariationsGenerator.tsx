import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Linkedin,
  Instagram,
  Twitter,
  Mail,
  MessageCircle,
  Sparkles,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Hash,
  Share2,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContentVariation {
  platform: string;
  content: string;
  characterCount: number;
  hashtags?: string[];
  callToAction?: string;
}

interface ContentVariationsGeneratorProps {
  articleId?: string;
  title: string;
  content: string;
  excerpt?: string;
  niche?: string;
  onClose?: () => void;
}

const platformConfig = {
  linkedin: {
    icon: Linkedin,
    label: 'LinkedIn',
    color: 'bg-[#0077B5]/10 text-[#0077B5] border-[#0077B5]/30',
    maxChars: 3000,
    description: 'Post profissional',
  },
  instagram: {
    icon: Instagram,
    label: 'Instagram',
    color: 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-pink-600 border-pink-500/30',
    maxChars: 2200,
    description: 'Caption com hashtags',
  },
  twitter: {
    icon: Twitter,
    label: 'Twitter/X',
    color: 'bg-[#1DA1F2]/10 text-[#1DA1F2] border-[#1DA1F2]/30',
    maxChars: 280,
    description: 'Thread viral',
  },
  newsletter: {
    icon: Mail,
    label: 'Newsletter',
    color: 'bg-primary/10 text-primary border-primary/30',
    maxChars: 5000,
    description: 'Email marketing',
  },
  whatsapp: {
    icon: MessageCircle,
    label: 'WhatsApp',
    color: 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30',
    maxChars: 1000,
    description: 'Mensagem direta',
  },
};

type PlatformKey = keyof typeof platformConfig;

export function ContentVariationsGenerator({
  articleId,
  title,
  content,
  excerpt,
  niche,
  onClose,
}: ContentVariationsGeneratorProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformKey[]>([
    'linkedin',
    'instagram',
    'twitter',
  ]);
  const [variations, setVariations] = useState<ContentVariation[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('');
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);
  const { toast } = useToast();

  const togglePlatform = (platform: PlatformKey) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const handleGenerate = async () => {
    if (selectedPlatforms.length === 0) {
      toast({
        title: 'Selecione ao menos uma plataforma',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setVariations([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Não autenticado');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-content-variations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            articleId,
            title,
            content,
            excerpt,
            niche,
            platforms: selectedPlatforms,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.variations) {
        setVariations(data.variations);
        setActiveTab(data.variations[0]?.platform || '');
        toast({
          title: 'Variações geradas! 🎉',
          description: `${data.variations.length} versões criadas para suas plataformas`,
        });
      } else {
        throw new Error('Resposta inválida');
      }
    } catch (error) {
      console.error('Error generating variations:', error);
      toast({
        title: 'Erro ao gerar variações',
        description: error instanceof Error ? error.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (platform: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPlatform(platform);
      setTimeout(() => setCopiedPlatform(null), 2000);
      toast({
        title: 'Copiado!',
        description: `Conteúdo para ${platformConfig[platform as PlatformKey]?.label || platform} copiado`,
      });
    } catch {
      toast({
        title: 'Erro ao copiar',
        variant: 'destructive',
      });
    }
  };

  const getVariation = (platform: string) =>
    variations.find((v) => v.platform === platform);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-primary" />
              Gerador de Variações
            </CardTitle>
            <CardDescription>
              Transforme seu artigo em posts otimizados para cada rede social
            </CardDescription>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Platform Selection */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Selecione as plataformas:</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(platformConfig) as PlatformKey[]).map((platform) => {
              const config = platformConfig[platform];
              const Icon = config.icon;
              const isSelected = selectedPlatforms.includes(platform);

              return (
                <div
                  key={platform}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all',
                    isSelected
                      ? config.color + ' border-2'
                      : 'border-border hover:border-primary/50 bg-muted/50'
                  )}
                  onClick={() => togglePlatform(platform)}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => togglePlatform(platform)}
                    className="pointer-events-none"
                  />
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{config.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source Preview */}
        <div className="p-4 rounded-lg bg-muted/50 border">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm line-clamp-1">{title}</h4>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {excerpt || content.substring(0, 150)}...
              </p>
              <div className="flex items-center gap-2 mt-2">
                {niche && (
                  <Badge variant="outline" className="text-xs">
                    {niche}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {content.split(/\s+/).length} palavras
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || selectedPlatforms.length === 0}
          className="w-full gap-2"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Gerando variações...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Gerar {selectedPlatforms.length} Variações
            </>
          )}
        </Button>

        {/* Results */}
        {variations.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium flex items-center gap-2">
                <Check className="w-4 h-4 text-success" />
                Variações Geradas
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                <RefreshCw className={cn('w-4 h-4 mr-1', isGenerating && 'animate-spin')} />
                Regenerar
              </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
                {variations.map((v) => {
                  const config = platformConfig[v.platform as PlatformKey];
                  if (!config) return null;
                  const Icon = config.icon;

                  return (
                    <TabsTrigger
                      key={v.platform}
                      value={v.platform}
                      className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      <Icon className="w-4 h-4" />
                      {config.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {variations.map((variation) => {
                const config = platformConfig[variation.platform as PlatformKey];
                if (!config) return null;

                return (
                  <TabsContent key={variation.platform} value={variation.platform}>
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={config.color}>
                              {config.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {variation.characterCount}/{config.maxChars} caracteres
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(variation.platform, variation.content)}
                          >
                            {copiedPlatform === variation.platform ? (
                              <>
                                <Check className="w-4 h-4 mr-1 text-success" />
                                Copiado!
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4 mr-1" />
                                Copiar
                              </>
                            )}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <ScrollArea className="h-[250px]">
                          <Textarea
                            value={variation.content}
                            readOnly
                            className="min-h-[220px] font-mono text-sm resize-none border-0 bg-muted/50"
                          />
                        </ScrollArea>

                        {/* Hashtags */}
                        {variation.hashtags && variation.hashtags.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <Hash className="w-4 h-4" />
                              Hashtags
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {variation.hashtags.map((tag, i) => (
                                <Badge
                                  key={i}
                                  variant="secondary"
                                  className="text-xs cursor-pointer hover:bg-primary/20"
                                  onClick={() => handleCopy(`${variation.platform}-tag-${i}`, `#${tag}`)}
                                >
                                  #{tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* CTA */}
                        {variation.callToAction && (
                          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                            <p className="text-xs font-medium text-primary mb-1">
                              Call to Action Sugerido:
                            </p>
                            <p className="text-sm">{variation.callToAction}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
