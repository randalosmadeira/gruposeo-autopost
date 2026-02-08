import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Rss, 
  Plus, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  RefreshCw,
  FileText,
  ArrowRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  content?: string;
}

interface RSSNewsImporterProps {
  onSelectNews: (news: RSSItem) => void;
  className?: string;
}

// Popular feeds suggestions by niche
const POPULAR_FEEDS = [
  { label: 'G1 Tecnologia', url: 'https://g1.globo.com/rss/g1/tecnologia/', niche: 'tecnologia' },
  { label: 'Folha Mercado', url: 'https://feeds.folha.uol.com.br/mercado/rss091.xml', niche: 'marketing' },
  { label: 'TechCrunch', url: 'https://techcrunch.com/feed/', niche: 'tecnologia' },
  { label: 'Conjur', url: 'https://www.conjur.com.br/rss.xml', niche: 'advocacia' },
  { label: 'Saúde Business', url: 'https://www.saudebusiness.com/feed', niche: 'saude' },
  { label: 'Exame', url: 'https://exame.com/feed/', niche: 'marketing' },
];

export function RSSNewsImporter({ onSelectNews, className }: RSSNewsImporterProps) {
  const [feedUrl, setFeedUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [newsItems, setNewsItems] = useState<RSSItem[]>([]);
  const [feedTitle, setFeedTitle] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchRSSNews = async (url: string) => {
    setIsLoading(true);
    setNewsItems([]);
    setFeedTitle(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: 'Erro de autenticação',
          description: 'Faça login para continuar',
          variant: 'destructive',
        });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-rss`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ feedUrls: [url], limit: 15 }),
        }
      );

      if (!response.ok) {
        throw new Error('Falha ao buscar feed RSS');
      }

      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        setNewsItems(data.items);
        setFeedTitle(data.feeds?.[0]?.feed?.title || null);
        toast({
          title: 'Feed carregado!',
          description: `${data.items.length} notícias encontradas`,
        });
      } else {
        toast({
          title: 'Feed vazio',
          description: 'Nenhuma notícia encontrada neste feed',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('RSS fetch error:', error);
      toast({
        title: 'Erro ao carregar feed',
        description: 'Verifique a URL e tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedUrl.trim()) return;
    
    try {
      new URL(feedUrl);
      fetchRSSNews(feedUrl);
    } catch {
      toast({
        title: 'URL inválida',
        description: 'Por favor, insira uma URL válida',
        variant: 'destructive',
      });
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

  const handleSelectNews = (item: RSSItem) => {
    onSelectNews(item);
    toast({
      title: 'Notícia selecionada',
      description: 'Conteúdo importado para repostagem',
    });
  };

  return (
    <Card className={cn("border-primary/20", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Rss className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Importar de Feed RSS</CardTitle>
        </div>
        <CardDescription>
          Busque notícias diretamente de feeds RSS para repostar
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Feed URL Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
            className="flex-1 border-border bg-background"
          />
          <Button 
            type="submit" 
            disabled={isLoading || !feedUrl.trim()}
            className="shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </form>

        {/* Popular Feeds */}
        {newsItems.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Feeds populares:</p>
            <div className="flex flex-wrap gap-2">
              {POPULAR_FEEDS.slice(0, 4).map((feed) => (
                <Button
                  key={feed.url}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    setFeedUrl(feed.url);
                    fetchRSSNews(feed.url);
                  }}
                  disabled={isLoading}
                >
                  <Rss className="w-3 h-3 mr-1" />
                  {feed.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* News List */}
        {newsItems.length > 0 && (
          <div className="space-y-2">
            {feedTitle && (
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{feedTitle}</p>
                <Badge variant="secondary" className="text-xs">
                  {newsItems.length} notícias
                </Badge>
              </div>
            )}
            
            <ScrollArea className="h-[280px]">
              <div className="space-y-2 pr-2">
                {newsItems.map((item, index) => (
                  <div 
                    key={index} 
                    className="p-3 rounded-lg border bg-background hover:border-primary/50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
                          {item.title}
                        </h4>
                        {item.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {item.description.replace(/<[^>]*>/g, '').substring(0, 150)}...
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
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
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => handleSelectNews(item)}
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          Usar
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                        <a 
                          href={item.link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 justify-end"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Ver original
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando notícias...</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
