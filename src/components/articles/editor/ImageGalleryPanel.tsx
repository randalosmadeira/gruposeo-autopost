import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Check,
  Image as ImageIcon,
  Star,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GeneratedImage {
  image: string;
  alt?: string;
  title?: string;
}

interface ImageGalleryPanelProps {
  images: GeneratedImage[];
  featuredImage: string | null;
  onSelectFeatured: (imageUrl: string) => void;
  onInsertToContent?: (imageUrl: string) => void;
  onRemoveImage?: (imageUrl: string) => void;
  onRegenerateImages?: () => void;
  isGenerating?: boolean;
  maxImages?: number;
}

export function ImageGalleryPanel({
  images,
  featuredImage,
  onSelectFeatured,
  onInsertToContent,
  onRemoveImage,
  onRegenerateImages,
  isGenerating = false,
  maxImages = 5,
}: ImageGalleryPanelProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  if (images.length === 0 && !isGenerating) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Nenhuma imagem gerada</p>
        <p className="text-xs">Gere imagens ao criar o artigo com a opção "Gerar Imagens" habilitada</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Galeria de Imagens</span>
          <Badge variant="secondary" className="text-xs">
            {images.length}/{maxImages}
          </Badge>
        </div>
        {onRegenerateImages && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRegenerateImages}
            disabled={isGenerating}
            className="h-7 text-xs"
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            Regenerar
          </Button>
        )}
      </div>

      {/* Image Grid */}
      <ScrollArea className="px-4 pb-2">
        <div className="grid grid-cols-2 gap-2">
          {images.map((img, index) => {
            const isFeatured = img.image === featuredImage;
            const isSelected = img.image === selectedImage;

            return (
              <div
                key={index}
                className={cn(
                  "relative group rounded-lg overflow-hidden border-2 cursor-pointer transition-all",
                  isFeatured 
                    ? "border-primary ring-2 ring-primary/20" 
                    : isSelected 
                      ? "border-primary/50" 
                      : "border-transparent hover:border-muted-foreground/30"
                )}
                onClick={() => setSelectedImage(isSelected ? null : img.image)}
              >
                <img
                  src={img.image}
                  alt={img.alt || `Imagem ${index + 1}`}
                  className="w-full h-24 object-cover"
                />
                
                {/* Featured Badge */}
                {isFeatured && (
                  <div className="absolute top-1 left-1">
                    <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
                      <Star className="w-2.5 h-2.5 mr-0.5" />
                      Destacada
                    </Badge>
                  </div>
                )}

                {/* Hover Actions */}
                <div className={cn(
                  "absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1 transition-opacity",
                  isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}>
                  {!isFeatured && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-6 text-[10px] px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectFeatured(img.image);
                      }}
                    >
                      <Star className="w-2.5 h-2.5 mr-1" />
                      Definir como Destaque
                    </Button>
                  )}
                  
                  {onInsertToContent && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-6 text-[10px] px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInsertToContent(img.image);
                      }}
                    >
                      <Plus className="w-2.5 h-2.5 mr-1" />
                      Inserir no Conteúdo
                    </Button>
                  )}

                  {onRemoveImage && !isFeatured && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 text-[10px] px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveImage(img.image);
                      }}
                    >
                      <Trash2 className="w-2.5 h-2.5 mr-1" />
                      Remover
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading Placeholder */}
          {isGenerating && (
            <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg h-24 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Info */}
      <div className="px-4 pb-2">
        <p className="text-[10px] text-muted-foreground text-center">
          Clique em uma imagem para ver opções. A imagem destacada será a Featured Image do artigo.
        </p>
      </div>
    </div>
  );
}
