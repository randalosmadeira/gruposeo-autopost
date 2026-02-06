import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Rss, 
  Plus, 
  X, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

interface RSSFeedManagerProps {
  feeds: string[];
  onFeedsChange: (feeds: string[]) => void;
  maxFeeds?: number;
}

export function RSSFeedManager({ feeds, onFeedsChange, maxFeeds = 5 }: RSSFeedManagerProps) {
  const [inputValue, setInputValue] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validatedFeeds, setValidatedFeeds] = useState<Record<string, { valid: boolean; title?: string; itemCount?: number }>>({});
  const [previewItems, setPreviewItems] = useState<RSSItem[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const { toast } = useToast();

  const validateFeed = async (url: string): Promise<{ valid: boolean; title?: string; itemCount?: number }> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        return { valid: false };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-rss`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ feedUrls: [url], limit: 5 }),
        }
      );

      if (!response.ok) return { valid: false };

      const data = await response.json();
      const feed = data.feeds?.[0]?.feed;
      
      if (feed) {
        return { 
          valid: true, 
          title: feed.title,
          itemCount: feed.items?.length || 0
        };
      }
      
      return { valid: false };
    } catch {
      return { valid: false };
    }
  };

  const addFeed = async () => {
    const url = inputValue.trim();
    
    if (!url) return;
    
    // Basic URL validation
    try {
      new URL(url);
    } catch {
      toast({
        title: 'URL inválida',
        description: 'Por favor, insira uma URL válida',
        variant: 'destructive',
      });
      return;
    }

    if (feeds.includes(url)) {
      toast({
        title: 'Feed duplicado',
        description: 'Este feed já foi adicionado',
        variant: 'destructive',
      });
      return;
    }

    if (feeds.length >= maxFeeds) {
      toast({
        title: 'Limite atingido',
        description: `Máximo de ${maxFeeds} feeds permitido`,
        variant: 'destructive',
      });
      return;
    }

    setIsValidating(true);
    const result = await validateFeed(url);
    setIsValidating(false);

    if (result.valid) {
      onFeedsChange([...feeds, url]);
      setValidatedFeeds(prev => ({ ...prev, [url]: result }));
      setInputValue('');
      toast({
        title: 'Feed adicionado!',
        description: result.title || 'Feed validado com sucesso',
      });
    } else {
      toast({
        title: 'Feed inválido',
        description: 'Não foi possível validar este feed RSS. Verifique a URL.',
        variant: 'destructive',
      });
    }
  };

  const removeFeed = (url: string) => {
    onFeedsChange(feeds.filter(f => f !== url));
    setValidatedFeeds(prev => {
      const next = { ...prev };
      delete next[url];
      return next;
    });
  };

  const loadPreview = async () => {
    if (feeds.length === 0) return;

    setIsLoadingPreview(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-rss`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ feedUrls: feeds, limit: 10 }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setPreviewItems(data.items || []);
      }
    } catch (error) {
      console.error('Error loading preview:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Feed Input */}
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="https://example.com/feed.xml"
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeed())}
        />
        <Button 
          type="button"
          onClick={addFeed} 
          disabled={isValidating || !inputValue.trim()}
          className="shrink-0"
        >
          {isValidating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Feed List */}
      {feeds.length > 0 && (
        <div className="space-y-2">
          {feeds.map((url) => {
            const info = validatedFeeds[url];
            return (
              <div 
                key={url} 
                className="flex items-center gap-2 p-2 rounded-lg border bg-muted/50"
              >
                <Rss className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  {info?.title ? (
                    <p className="text-sm font-medium truncate">{info.title}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground truncate">{url}</p>
                  )}
                  {info?.itemCount !== undefined && (
                    <p className="text-xs text-muted-foreground">
                      {info.itemCount} itens disponíveis
                    </p>
                  )}
                </div>
                {info?.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                ) : info === undefined ? null : (
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                )}
                <Button 
                  type="button"
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeFeed(url)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Feed Count */}
      <p className="text-xs text-muted-foreground">
        {feeds.length}/{maxFeeds} feeds adicionados
      </p>

      {/* Preview Section */}
      {feeds.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Preview das Notícias</CardTitle>
              <Button 
                type="button"
                variant="outline" 
                size="sm" 
                onClick={loadPreview}
                disabled={isLoadingPreview}
              >
                {isLoadingPreview ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span className="ml-2">Atualizar</span>
              </Button>
            </div>
            <CardDescription className="text-xs">
              Últimas notícias dos feeds cadastrados
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {previewItems.length > 0 ? (
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {previewItems.map((item, index) => (
                    <div key={index} className="p-2 rounded border bg-background">
                      <a 
                        href={item.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm font-medium hover:text-primary line-clamp-2 flex items-start gap-1"
                      >
                        {item.title}
                        <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
                      </a>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {item.source}
                        </Badge>
                        {item.pubDate && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(item.pubDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Clique em "Atualizar" para ver as notícias
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Popular Feeds Suggestions */}
      {feeds.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Feeds populares:</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'G1 Tecnologia', url: 'https://g1.globo.com/rss/g1/tecnologia/' },
              { label: 'Folha Mercado', url: 'https://feeds.folha.uol.com.br/mercado/rss091.xml' },
              { label: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
            ].map((suggestion) => (
              <Button
                key={suggestion.url}
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  setInputValue(suggestion.url);
                }}
              >
                <Rss className="w-3 h-3 mr-1" />
                {suggestion.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
