import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Video, Youtube, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VideoInsertPopoverProps {
  onInsertVideo: (embedHtml: string) => void;
}

export function VideoInsertPopover({ onInsertVideo }: VideoInsertPopoverProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoWidth, setVideoWidth] = useState('100%');
  const [videoHeight, setVideoHeight] = useState('400');

  // Extract video ID from YouTube or Vimeo URL
  const parseVideoUrl = (url: string): { platform: 'youtube' | 'vimeo' | null; videoId: string | null } => {
    // YouTube patterns
    const youtubePatterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    
    for (const pattern of youtubePatterns) {
      const match = url.match(pattern);
      if (match) {
        return { platform: 'youtube', videoId: match[1] };
      }
    }
    
    // Vimeo patterns
    const vimeoPatterns = [
      /vimeo\.com\/(\d+)/,
      /player\.vimeo\.com\/video\/(\d+)/,
    ];
    
    for (const pattern of vimeoPatterns) {
      const match = url.match(pattern);
      if (match) {
        return { platform: 'vimeo', videoId: match[1] };
      }
    }
    
    return { platform: null, videoId: null };
  };

  const generateEmbedHtml = (): string | null => {
    const { platform, videoId } = parseVideoUrl(videoUrl);
    
    if (!platform || !videoId) {
      return null;
    }
    
    const width = videoWidth.includes('%') ? videoWidth : `${videoWidth}px`;
    const height = `${videoHeight}px`;
    
    if (platform === 'youtube') {
      return `<div class="video-embed my-6" style="max-width: ${width};">
        <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px;">
          <iframe 
            src="https://www.youtube.com/embed/${videoId}?rel=0" 
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen
            loading="lazy"
          ></iframe>
        </div>
      </div>`;
    }
    
    if (platform === 'vimeo') {
      return `<div class="video-embed my-6" style="max-width: ${width};">
        <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px;">
          <iframe 
            src="https://player.vimeo.com/video/${videoId}?dnt=1" 
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"
            allow="autoplay; fullscreen; picture-in-picture" 
            allowfullscreen
            loading="lazy"
          ></iframe>
        </div>
      </div>`;
    }
    
    return null;
  };

  const handleInsertVideo = () => {
    const embedHtml = generateEmbedHtml();
    
    if (!embedHtml) {
      toast({
        title: 'URL inválida',
        description: 'Por favor, insira uma URL válida do YouTube ou Vimeo.',
        variant: 'destructive',
      });
      return;
    }
    
    onInsertVideo(embedHtml);
    setVideoUrl('');
    setIsOpen(false);
    
    toast({
      title: 'Vídeo inserido!',
      description: 'O vídeo foi adicionado ao conteúdo.',
    });
  };

  const { platform } = parseVideoUrl(videoUrl);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          title="Inserir vídeo (YouTube/Vimeo)"
        >
          <Video className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="start">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            <h4 className="font-semibold">Inserir Vídeo</h4>
          </div>
          
          {/* Platforms info */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <Youtube className="w-5 h-5 text-red-600" />
            <span className="text-sm">YouTube</span>
            <span className="text-muted-foreground mx-2">•</span>
            <Play className="w-5 h-5 text-blue-500" />
            <span className="text-sm">Vimeo</span>
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm">URL do Vídeo</Label>
            <Input
              placeholder="https://youtube.com/watch?v=... ou https://vimeo.com/..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
            {videoUrl && platform && (
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                ✓ {platform === 'youtube' ? 'YouTube' : 'Vimeo'} detectado
              </p>
            )}
            {videoUrl && !platform && (
              <p className="text-xs text-destructive">
                URL não reconhecida
              </p>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm">Largura</Label>
              <Input
                placeholder="100% ou 560"
                value={videoWidth}
                onChange={(e) => setVideoWidth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Altura (px)</Label>
              <Input
                type="number"
                placeholder="400"
                value={videoHeight}
                onChange={(e) => setVideoHeight(e.target.value)}
              />
            </div>
          </div>
          
          <Button 
            onClick={handleInsertVideo} 
            className="w-full"
            disabled={!videoUrl || !platform}
          >
            Inserir Vídeo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
