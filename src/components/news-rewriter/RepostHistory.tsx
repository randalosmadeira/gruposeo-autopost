import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  History,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Newspaper,
  Image as ImageIcon,
  FileText,
  Send,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EmotionalTriggerBadge } from '@/components/shared/EmotionalTriggerBadge';

interface RepostHistoryItem {
  id: string;
  title: string | null;
  created_at: string;
  status: string;
  featured_image_url: string | null;
  excerpt: string | null;
  published_url: string | null;
  published_at: string | null;
  config: {
    type?: string;
    originality_score?: number;
    quality_score?: number;
    readability_score?: number;
    niche?: string;
    source_name?: string;
    source_url?: string;
    audit_status?: 'approved' | 'review' | 'rejected' | 'pending';
    auto_published?: boolean;
    wordpress_post_id?: number;
    wordpress_post_url?: string;
    emotional_trigger?: string;
  } | null;
}

// Article pipeline status
type PipelineStatus = 'generating' | 'ready' | 'published' | 'error' | 'draft';

const getPipelineStatus = (item: RepostHistoryItem): PipelineStatus => {
  if (item.status === 'error') return 'error';
  if (item.status === 'generating') return 'generating';
  if (item.status === 'published' || item.published_url) return 'published';
  if (item.status === 'ready') return 'ready';
  return 'draft';
};

const pipelineConfig: Record<PipelineStatus, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  generating: { label: 'Em criação', icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  draft: { label: 'Analisado', icon: Eye, color: 'text-amber-500', bg: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  ready: { label: 'Finalizado', icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10 text-green-600 border-green-500/30' },
  published: { label: 'Publicado', icon: Send, color: 'text-primary', bg: 'bg-primary/10 text-primary border-primary/30' },
  error: { label: 'Erro', icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10 text-destructive border-destructive/30' },
};

type FilterTab = 'all' | 'generating' | 'draft' | 'ready' | 'published' | 'error';

interface RepostHistoryProps {
  limit?: number;
  showRefresh?: boolean;
  compact?: boolean;
}

export function RepostHistory({ limit = 50, showRefresh = true, compact = false }: RepostHistoryProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<RepostHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');

  const fetchHistory = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, created_at, status, config, featured_image_url, excerpt, published_url, published_at')
        .eq('config->>type', 'rewrite')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      setItems((data as RepostHistoryItem[]) || []);
    } catch (error) {
      console.error('Error fetching repost history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();

    // Realtime subscription for rewrite articles
    const channel = supabase
      .channel('repost-history-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'articles',
      }, (payload) => {
        const record = payload.new as any;
        if (record?.config?.type === 'rewrite' || (payload.old as any)?.config?.type === 'rewrite') {
          fetchHistory(true);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [limit]);

  // Stats
  const stats = {
    total: items.length,
    generating: items.filter(i => getPipelineStatus(i) === 'generating').length,
    draft: items.filter(i => getPipelineStatus(i) === 'draft').length,
    ready: items.filter(i => getPipelineStatus(i) === 'ready').length,
    published: items.filter(i => getPipelineStatus(i) === 'published').length,
    error: items.filter(i => getPipelineStatus(i) === 'error').length,
    withImage: items.filter(i => !!i.featured_image_url).length,
    withMeta: items.filter(i => !!i.excerpt).length,
  };

  const filteredItems = filter === 'all' 
    ? items 
    : items.filter(i => getPipelineStatus(i) === filter);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Newspaper className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">Nenhuma repostagem realizada ainda</p>
          <p className="text-muted-foreground text-xs">Cole uma notícia e gere sua primeira repostagem</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setFilter('all')}>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-blue-500/50 transition-colors" onClick={() => setFilter('generating')}>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold text-blue-500">{stats.generating}</p>
            <p className="text-xs text-muted-foreground">Em criação</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-amber-500/50 transition-colors" onClick={() => setFilter('draft')}>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold text-amber-500">{stats.draft}</p>
            <p className="text-xs text-muted-foreground">Analisados</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-green-500/50 transition-colors" onClick={() => setFilter('published')}>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold text-green-500">{stats.published}</p>
            <p className="text-xs text-muted-foreground">Publicados</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-destructive/50 transition-colors" onClick={() => setFilter('error')}>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.error}</p>
            <p className="text-xs text-muted-foreground">Erros</p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" />
              Histórico de Repostagens
              {filter !== 'all' && (
                <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setFilter('all')}>
                  Filtro: {pipelineConfig[filter]?.label} ✕
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {filteredItems.length} artigo{filteredItems.length !== 1 ? 's' : ''}
              </span>
              {showRefresh && (
                <Button variant="ghost" size="sm" onClick={() => fetchHistory(true)} disabled={refreshing}>
                  <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className={compact ? "h-[300px]" : "h-[500px]"}>
            <div className="divide-y divide-border">
              {filteredItems.map((item) => {
                const pipeline = getPipelineStatus(item);
                const StatusIcon = pipelineConfig[pipeline].icon;

                return (
                  <div
                    key={item.id}
                    className="p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/articles/${item.id}/edit`)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Status icon */}
                      <div className={cn("mt-0.5", pipelineConfig[pipeline].color)}>
                        <StatusIcon className={cn("w-4 h-4", pipeline === 'generating' && "animate-spin")} />
                      </div>

                      {/* Thumbnail */}
                      {item.featured_image_url ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                          <img src={item.featured_image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg flex-shrink-0 bg-muted/50 flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm line-clamp-1">
                          {item.title || 'Sem título'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {/* Pipeline status badge */}
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", pipelineConfig[pipeline].bg)}>
                            {pipelineConfig[pipeline].label}
                          </Badge>

                          {/* Niche */}
                          {item.config?.niche && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {item.config.niche}
                            </Badge>
                          )}

                          {/* Originality */}
                          {item.config?.originality_score && (
                            <span className="text-[10px] text-muted-foreground">
                              {item.config.originality_score}% original
                            </span>
                          )}

                          {/* Image indicator */}
                          {item.featured_image_url && (
                            <ImageIcon className="w-3 h-3 text-green-500" />
                          )}

                          {/* Meta indicator */}
                          {item.excerpt && (
                            <FileText className="w-3 h-3 text-blue-500" />
                          )}

                          <EmotionalTriggerBadge
                            trigger={(item.config as any)?.emotional_trigger}
                            compact
                          />

                          {item.config?.auto_published && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-green-500/20 text-green-600 border-green-500/30">
                              Auto
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {item.config?.source_name && (
                            <span className="text-[10px] text-muted-foreground">
                              Fonte: {item.config.source_name}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(item.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                      </div>

                      {/* External link */}
                      {(item.published_url || item.config?.wordpress_post_url) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(item.published_url || item.config?.wordpress_post_url, '_blank');
                          }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
