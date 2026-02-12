import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  History,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Newspaper,
  Image as ImageIcon,
  FileText,
  Send,
  Eye,
  ExternalLink,
  Wand2,
  ImagePlus,
  Upload,
  CheckSquare,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EmotionalTriggerBadge } from '@/components/shared/EmotionalTriggerBadge';
import { BulkPublishModal } from '@/components/articles/BulkPublishModal';
import { useProjects } from '@/hooks/useProjects';

interface RepostHistoryItem {
  id: string;
  title: string | null;
  created_at: string;
  status: string;
  featured_image_url: string | null;
  excerpt: string | null;
  published_url: string | null;
  published_at: string | null;
  keyword: string;
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
  showRefresh?: boolean;
  compact?: boolean;
}

export function RepostHistory({ showRefresh = true, compact = false }: RepostHistoryProps) {
  const navigate = useNavigate();
  const { projects } = useProjects();
  const { toast } = useToast();
  const [items, setItems] = useState<RepostHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkImageLoading, setBulkImageLoading] = useState(false);
  const [bulkSeoLoading, setBulkSeoLoading] = useState(false);
  const [bulkPublishOpen, setBulkPublishOpen] = useState(false);
  const [bulkImageProgress, setBulkImageProgress] = useState({ current: 0, total: 0 });
  const [bulkSeoProgress, setBulkSeoProgress] = useState({ current: 0, total: 0 });

  const fetchHistory = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('articles')
          .select('id, title, created_at, status, config, featured_image_url, excerpt, published_url, published_at, keyword')
          .eq('config->>type', 'rewrite')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allData = allData.concat(data);
          from += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      setItems(allData as RepostHistoryItem[]);
    } catch (error) {
      console.error('Error fetching repost history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();

    // Realtime subscription for rewrite articles - real-time status updates
    const channel = supabase
      .channel('repost-history-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'articles',
      }, (payload) => {
        const record = payload.new as any;
        const oldRecord = payload.old as any;

        if (payload.eventType === 'UPDATE' && record) {
          // Update in-place for real-time status changes
          setItems(prev => prev.map(item => 
            item.id === record.id 
              ? { ...item, ...record } 
              : item
          ));
        } else if (record?.config?.type === 'rewrite' || oldRecord?.config?.type === 'rewrite') {
          fetchHistory(true);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Selection handlers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const selectedItems = items.filter(i => selectedIds.has(i.id));

  // Bulk SEO Analysis
  const handleBulkSeoAnalysis = useCallback(async () => {
    if (selectedIds.size === 0) {
      toast({ title: 'Selecione artigos', description: 'Selecione pelo menos um artigo para análise.' });
      return;
    }

    setBulkSeoLoading(true);
    setBulkSeoProgress({ current: 0, total: selectedIds.size });
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada');

      let completed = 0;
      const articleIds = Array.from(selectedIds);

      for (const articleId of articleIds) {
        const article = items.find(i => i.id === articleId);
        if (!article) continue;

        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-seo-advanced`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ articleId }),
            }
          );

          if (!response.ok) {
            console.error(`SEO analysis failed for ${articleId}:`, await response.text());
          }
        } catch (err) {
          console.error(`SEO analysis error for ${articleId}:`, err);
        }

        completed++;
        setBulkSeoProgress({ current: completed, total: articleIds.length });
        
        // Small delay to avoid rate limiting
        if (completed < articleIds.length) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      toast({ 
        title: '✅ Análise SEO concluída', 
        description: `${completed} artigo(s) analisados com sucesso.` 
      });
      fetchHistory(true);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setBulkSeoLoading(false);
      setBulkSeoProgress({ current: 0, total: 0 });
    }
  }, [selectedIds, items, toast]);

  // Bulk Image Generation
  const handleBulkImageGeneration = useCallback(async () => {
    const articlesWithoutImage = selectedItems.filter(i => !i.featured_image_url);
    if (articlesWithoutImage.length === 0) {
      toast({ title: 'Sem artigos', description: 'Todos os artigos selecionados já possuem imagem.' });
      return;
    }

    setBulkImageLoading(true);
    setBulkImageProgress({ current: 0, total: articlesWithoutImage.length });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada');

      let generated = 0;

      for (const article of articlesWithoutImage) {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                title: article.title || article.keyword,
                keywords: article.keyword,
                context: article.config?.niche || 'geral',
                quality: 'high',
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.image) {
              await supabase
                .from('articles')
                .update({ 
                  featured_image_url: data.image, 
                  image_prompt: data.prompt,
                  image_source: data.model || 'ai',
                })
                .eq('id', article.id);
              generated++;
            }
          }
        } catch (err) {
          console.error(`Image generation error for ${article.id}:`, err);
        }

        setBulkImageProgress(prev => ({ ...prev, current: prev.current + 1 }));

        // Delay between requests to prevent rate limiting
        if (generated < articlesWithoutImage.length) {
          await new Promise(r => setTimeout(r, 2500));
        }
      }

      toast({ 
        title: '✅ Imagens geradas', 
        description: `${generated}/${articlesWithoutImage.length} imagens criadas com sucesso.` 
      });
      fetchHistory(true);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setBulkImageLoading(false);
      setBulkImageProgress({ current: 0, total: 0 });
    }
  }, [selectedItems, toast]);

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

  const hasSelection = selectedIds.size > 0;
  const allSelected = selectedIds.size === filteredItems.length && filteredItems.length > 0;

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card 
          className={cn(
            "cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-md",
            filter === 'all' 
              ? "border-primary ring-2 ring-primary/20 shadow-md bg-primary/5" 
              : "border-border"
          )} 
          onClick={() => setFilter(filter === 'all' ? 'all' : 'all')}
        >
          <CardContent className="py-3 px-4 text-center">
            <p className={cn("text-2xl font-bold transition-colors", filter === 'all' && "text-primary")}>{stats.total}</p>
            <p className={cn("text-xs transition-colors", filter === 'all' ? "text-primary font-medium" : "text-muted-foreground")}>Total</p>
          </CardContent>
        </Card>
        <Card 
          className={cn(
            "cursor-pointer transition-all duration-200 hover:border-blue-500/50 hover:shadow-md",
            filter === 'generating' 
              ? "border-blue-500 ring-2 ring-blue-500/20 shadow-md bg-blue-500/5" 
              : "border-border"
          )} 
          onClick={() => setFilter(filter === 'generating' ? 'all' : 'generating')}
        >
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold text-blue-500">{stats.generating}</p>
            <p className={cn("text-xs transition-colors", filter === 'generating' ? "text-blue-600 font-medium" : "text-muted-foreground")}>Em criação</p>
          </CardContent>
        </Card>
        <Card 
          className={cn(
            "cursor-pointer transition-all duration-200 hover:border-amber-500/50 hover:shadow-md",
            filter === 'draft' 
              ? "border-amber-500 ring-2 ring-amber-500/20 shadow-md bg-amber-500/5" 
              : "border-border"
          )} 
          onClick={() => setFilter(filter === 'draft' ? 'all' : 'draft')}
        >
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold text-amber-500">{stats.draft}</p>
            <p className={cn("text-xs transition-colors", filter === 'draft' ? "text-amber-600 font-medium" : "text-muted-foreground")}>Analisados</p>
          </CardContent>
        </Card>
        <Card 
          className={cn(
            "cursor-pointer transition-all duration-200 hover:border-green-500/50 hover:shadow-md",
            filter === 'published' 
              ? "border-green-500 ring-2 ring-green-500/20 shadow-md bg-green-500/5" 
              : "border-border"
          )} 
          onClick={() => setFilter(filter === 'published' ? 'all' : 'published')}
        >
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold text-green-500">{stats.published}</p>
            <p className={cn("text-xs transition-colors", filter === 'published' ? "text-green-600 font-medium" : "text-muted-foreground")}>Publicados</p>
          </CardContent>
        </Card>
        <Card 
          className={cn(
            "cursor-pointer transition-all duration-200 hover:border-destructive/50 hover:shadow-md",
            filter === 'error' 
              ? "border-destructive ring-2 ring-destructive/20 shadow-md bg-destructive/5" 
              : "border-border"
          )} 
          onClick={() => setFilter(filter === 'error' ? 'all' : 'error')}
        >
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.error}</p>
            <p className={cn("text-xs transition-colors", filter === 'error' ? "text-destructive font-medium" : "text-muted-foreground")}>Erros</p>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Action Bar */}
      <Card className="border-dashed">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSelectAll}
                className="gap-1.5 text-xs"
              >
                {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                {allSelected ? 'Desmarcar' : 'Selecionar'} todos
              </Button>
              {hasSelection && (
                <Badge variant="secondary" className="text-xs">
                  {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* SEO AI Analysis */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkSeoAnalysis}
                disabled={!hasSelection || bulkSeoLoading}
                className="gap-1.5 text-xs border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
              >
                {bulkSeoLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {bulkSeoProgress.current}/{bulkSeoProgress.total}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    Análise SEO IA
                  </>
                )}
              </Button>

              {/* Bulk Image Generation */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkImageGeneration}
                disabled={!hasSelection || bulkImageLoading}
                className="gap-1.5 text-xs border-purple-500/50 text-purple-600 hover:bg-purple-500/10"
              >
                {bulkImageLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {bulkImageProgress.current}/{bulkImageProgress.total}
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-3.5 h-3.5" />
                    Imagens IA em Massa
                  </>
                )}
              </Button>

              {/* Bulk Publish */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkPublishOpen(true)}
                disabled={!hasSelection}
                className="gap-1.5 text-xs border-green-500/50 text-green-600 hover:bg-green-500/10"
              >
                <Upload className="w-3.5 h-3.5" />
                Publicar em Massa
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
                const isSelected = selectedIds.has(item.id);

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "p-3 hover:bg-muted/50 cursor-pointer transition-colors",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                      </div>

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
                      <div 
                        className="flex-1 min-w-0"
                        onClick={() => navigate(`/articles/${item.id}/edit`)}
                      >
                        <p className="font-medium text-sm line-clamp-1">
                          {item.title || 'Sem título'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", pipelineConfig[pipeline].bg)}>
                            {pipelineConfig[pipeline].label}
                          </Badge>

                          {item.config?.niche && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {item.config.niche}
                            </Badge>
                          )}

                          {item.config?.originality_score && (
                            <span className="text-[10px] text-muted-foreground">
                              {item.config.originality_score}% original
                            </span>
                          )}

                          {item.featured_image_url && (
                            <ImageIcon className="w-3 h-3 text-green-500" />
                          )}

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

      {/* Bulk Publish Modal */}
      <BulkPublishModal
        isOpen={bulkPublishOpen}
        onClose={() => setBulkPublishOpen(false)}
        selectedArticles={selectedItems.map(i => ({ id: i.id, title: i.title, project_id: null }))}
        projects={(projects || []).map(p => ({ id: p.id, name: p.name, domain: p.domain, wordpress_url: p.wordpress_url }))}
        onPublishComplete={() => { setBulkPublishOpen(false); fetchHistory(true); }}
      />
    </div>
  );
}
