import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { 
  Maximize2, 
  Link2, 
  Link2Off, 
  RotateCcw,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';

interface ImageResizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageElement: HTMLImageElement | null;
  onApplyChanges: (styles: ImageStyles) => void;
}

interface ImageStyles {
  width: string;
  height: string;
  maxWidth: string;
  borderRadius: string;
  alignment: 'left' | 'center' | 'right';
}

export function ImageResizeModal({ 
  isOpen, 
  onClose, 
  imageElement, 
  onApplyChanges 
}: ImageResizeModalProps) {
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(0);
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [borderRadius, setBorderRadius] = useState(8);
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>('center');
  const [originalAspectRatio, setOriginalAspectRatio] = useState(1);

  useEffect(() => {
    if (imageElement && isOpen) {
      // Get natural dimensions
      const naturalWidth = imageElement.naturalWidth || imageElement.width;
      const naturalHeight = imageElement.naturalHeight || imageElement.height;
      setOriginalAspectRatio(naturalWidth / naturalHeight);
      
      // Parse current styles
      const currentWidth = imageElement.style.width || '100%';
      if (currentWidth.includes('%')) {
        setWidth(parseInt(currentWidth) || 100);
      } else {
        setWidth(100);
      }
      
      // Get current border radius
      const currentRadius = imageElement.style.borderRadius || '8px';
      setBorderRadius(parseInt(currentRadius) || 8);
      
      // Detect alignment
      const parentDiv = imageElement.parentElement;
      if (parentDiv?.style.textAlign === 'left' || parentDiv?.classList.contains('text-left')) {
        setAlignment('left');
      } else if (parentDiv?.style.textAlign === 'right' || parentDiv?.classList.contains('text-right')) {
        setAlignment('right');
      } else {
        setAlignment('center');
      }
    }
  }, [imageElement, isOpen]);

  const handleWidthChange = (value: number[]) => {
    setWidth(value[0]);
    if (keepAspectRatio && originalAspectRatio) {
      setHeight(Math.round(value[0] / originalAspectRatio));
    }
  };

  const handleReset = () => {
    setWidth(100);
    setHeight(0);
    setKeepAspectRatio(true);
    setBorderRadius(8);
    setAlignment('center');
  };

  const handleApply = () => {
    const styles: ImageStyles = {
      width: `${width}%`,
      height: keepAspectRatio ? 'auto' : height ? `${height}px` : 'auto',
      maxWidth: '100%',
      borderRadius: `${borderRadius}px`,
      alignment,
    };
    
    onApplyChanges(styles);
    onClose();
  };

  if (!imageElement) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Maximize2 className="w-5 h-5 text-primary" />
            Redimensionar Imagem
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Image Preview */}
          <div className="relative bg-muted/30 rounded-lg p-4 flex justify-center">
            <img
              src={imageElement.src}
              alt="Preview"
              className="max-h-40 object-contain"
              style={{
                width: `${width}%`,
                maxWidth: '100%',
                borderRadius: `${borderRadius}px`,
              }}
            />
          </div>

          {/* Width Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Largura: {width}%</Label>
              <div className="flex items-center gap-2">
                <Switch
                  id="aspect-ratio"
                  checked={keepAspectRatio}
                  onCheckedChange={setKeepAspectRatio}
                />
                <Label htmlFor="aspect-ratio" className="text-xs text-muted-foreground flex items-center gap-1">
                  {keepAspectRatio ? <Link2 className="w-3 h-3" /> : <Link2Off className="w-3 h-3" />}
                  Proporção
                </Label>
              </div>
            </div>
            <Slider
              value={[width]}
              onValueChange={handleWidthChange}
              min={10}
              max={100}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>10%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Border Radius */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Arredondamento: {borderRadius}px</Label>
            <Slider
              value={[borderRadius]}
              onValueChange={(value) => setBorderRadius(value[0])}
              min={0}
              max={32}
              step={2}
              className="w-full"
            />
          </div>

          {/* Alignment */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Alinhamento</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={alignment === 'left' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAlignment('left')}
                className="flex-1"
              >
                <AlignLeft className="w-4 h-4 mr-2" />
                Esquerda
              </Button>
              <Button
                type="button"
                variant={alignment === 'center' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAlignment('center')}
                className="flex-1"
              >
                <AlignCenter className="w-4 h-4 mr-2" />
                Centro
              </Button>
              <Button
                type="button"
                variant={alignment === 'right' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAlignment('right')}
                className="flex-1"
              >
                <AlignRight className="w-4 h-4 mr-2" />
                Direita
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Resetar
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleApply}>
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
