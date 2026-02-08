import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, FileText, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GeneratorPreviewPanelProps {
  keyword: string;
  title: string;
  size: string;
  language: string;
  tone: string;
  pointOfView: string;
  metaDescription: boolean;
  lists: boolean;
  tables: boolean;
  conclusion: boolean;
  faq: boolean;
  internalLinking: boolean;
  seoOptimization: boolean;
  realtimeData: boolean;
  humanizeContent: boolean;
  generateImages: boolean;
  imageCount: number;
  selectedCreditTier: { label: string; credits: number };
  articleSizes: Array<{ value: string; words: string }>;
  pointsOfView: Array<{ value: string; label: string }>;
  isMobile?: boolean;
  showPreview?: boolean;
  onClosePreview?: () => void;
}

export function GeneratorPreviewPanel({
  keyword,
  title,
  size,
  language,
  tone,
  pointOfView,
  metaDescription,
  lists,
  tables,
  conclusion,
  faq,
  internalLinking,
  seoOptimization,
  realtimeData,
  humanizeContent,
  generateImages,
  imageCount,
  selectedCreditTier,
  articleSizes,
  pointsOfView,
  isMobile = false,
  showPreview = false,
  onClosePreview,
}: GeneratorPreviewPanelProps) {
  const selectedSize = articleSizes.find(s => s.value === size);
  const selectedPov = pointsOfView.find(p => p.value === pointOfView);

  return (
    <div className={cn(
      "overflow-hidden transition-all duration-300 bg-background",
      isMobile ? "fixed inset-0 z-50" : "h-full",
      isMobile && !showPreview && "hidden"
    )}>
      {/* Mobile close button */}
      {isMobile && showPreview && onClosePreview && (
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="font-medium">Prévia</span>
          <Button variant="ghost" size="icon" onClick={onClosePreview}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      )}
      
      <ScrollArea className="h-full">
        <div className="p-6">
          {/* Preview Header */}
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Prévia em Tempo Real
            </h2>
          </div>
          <p className="text-sm mb-6 text-muted-foreground">
            Prévia do artigo em tempo real
          </p>

          <div className="rounded-lg border p-6 min-h-[500px] border-border">
            {title || keyword ? (
              <article className="space-y-6">
                {/* Article Title */}
                <h1 className="text-2xl font-bold text-foreground">
                  {title || `[Título sobre: ${keyword}]`}
                </h1>
                
                {/* Metadata Tags */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">
                    Tamanho: {selectedSize?.words || 'N/A'}
                  </Badge>
                  <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">
                    Idioma: {language === 'pt-BR' ? '🇧🇷 Português' : language === 'en-US' ? '🇺🇸 English' : '🇪🇸 Español'}
                  </Badge>
                  <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">
                    Tom: {tone.charAt(0).toUpperCase() + tone.slice(1)}
                  </Badge>
                  <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">
                    Ponto de Vista: {selectedPov?.label || pointOfView}
                  </Badge>
                </div>

                {/* Meta Description Preview */}
                {metaDescription && (
                  <div className="p-4 rounded-lg text-sm bg-blue-50">
                    <strong className="block mb-1 text-foreground">Meta Descrição:</strong>
                    <p className="text-muted-foreground">
                      Descubra tudo sobre {keyword || '[palavra-chave]'}. 
                      Guia completo com dicas práticas e informações atualizadas para {new Date().getFullYear()}.
                    </p>
                  </div>
                )}

                {/* Content Placeholder */}
                <div className="p-6 rounded-lg border-2 border-dashed text-center border-border">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    O conteúdo do artigo aparecerá aqui quando gerado
                  </p>
                </div>

                {/* Included Elements */}
                <div className="pt-4 border-t border-border">
                  <p className="text-sm font-medium mb-3 text-foreground">
                    Elementos incluídos:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {metaDescription && (
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                        📝 Meta Descrição
                      </Badge>
                    )}
                    {lists && (
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                        📋 Listas
                      </Badge>
                    )}
                    {tables && (
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                        📊 Tabelas
                      </Badge>
                    )}
                    {conclusion && (
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                        ✅ Conclusão
                      </Badge>
                    )}
                    {faq && (
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                        ❓ FAQ
                      </Badge>
                    )}
                    {internalLinking && (
                      <Badge variant="secondary" className="bg-green-50 text-green-700">
                        🔗 Linkagem Interna
                      </Badge>
                    )}
                    {seoOptimization && (
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                        🔍 SEO Otimizado
                      </Badge>
                    )}
                    {realtimeData && (
                      <Badge variant="secondary" className="bg-green-50 text-green-700">
                        🌐 Dados em Tempo Real
                      </Badge>
                    )}
                    {humanizeContent && (
                      <Badge variant="secondary" className="bg-orange-50 text-orange-700">
                        👤 Conteúdo Humanizado
                      </Badge>
                    )}
                    {generateImages && (
                      <Badge variant="secondary" className="bg-pink-50 text-pink-700">
                        🖼️ {imageCount} {imageCount === 1 ? 'Imagem' : 'Imagens'} IA
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Model Info */}
                <div className="p-3 rounded-lg text-xs bg-muted">
                  <strong className="text-foreground">Modelo:</strong>{' '}
                  <span className="text-muted-foreground">
                    {selectedCreditTier.label} ({selectedCreditTier.credits} {selectedCreditTier.credits === 1 ? 'crédito' : 'créditos'})
                  </span>
                </div>
              </article>
            ) : (
              <div className="flex flex-col items-center justify-center h-[400px] text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-primary/10">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-medium mb-2 text-foreground">
                  Prévia do Artigo
                </h3>
                <p className="text-sm max-w-xs text-muted-foreground">
                  Comece digitando a palavra-chave para ver a prévia do seu artigo
                </p>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
