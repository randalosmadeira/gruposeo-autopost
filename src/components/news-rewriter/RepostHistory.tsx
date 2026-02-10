import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  } | null;
}

type AuditStatus = 'approved' | 'review' | 'rejected' | 'pending';

const getAuditStatus = (item: RepostHistoryItem): AuditStatus => {
  if (item.config?.audit_status) return item.config.audit_status;
  
  const originality = item.config?.originality_score || 0;
  const quality = item.config?.quality_score || 0;
  
  if (originality >= 95 && quality >= 85) return 'approved';
  if (originality >= 85 && quality >= 70) return 'review';
  if (originality < 85) return 'rejected';
  return 'pending';
};

const statusConfig: Record<AuditStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  approved: { label: 'Aprovado', icon: CheckCircle2, color: 'text-success' },
  review: { label: 'Revisão', icon: AlertTriangle, color: 'text-warning' },
  rejected: { label: 'Reprovado', icon: XCircle, color: 'text-destructive' },
  pending: { label: 'Pendente', icon: Clock, color: 'text-muted-foreground' },
};

interface RepostHistoryProps {
  limit?: number;
  showRefresh?: boolean;
  compact?: boolean;
}

export function RepostHistory({ limit = 10, showRefresh = true, compact = false }: RepostHistoryProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<RepostHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, created_at, status, config')
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
  }, [limit]);

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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" />
            Histórico de Repostagens
          </CardTitle>
          {showRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchHistory(true)}
              disabled={refreshing}
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className={compact ? "h-[250px]" : "h-[350px]"}>
          <div className="divide-y divide-border">
            {items.map((item) => {
              const auditStatus = getAuditStatus(item);
              const StatusIcon = statusConfig[auditStatus].icon;

              return (
                <div
                  key={item.id}
                  className="p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/articles/${item.id}/edit`)}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5", statusConfig[auditStatus].color)}>
                      <StatusIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm line-clamp-1">
                        {item.title || 'Sem título'}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {statusConfig[auditStatus].label}
                        </Badge>
                        {item.config?.niche && (
                          <Badge variant="outline" className="text-xs">
                            {item.config.niche}
                          </Badge>
                        )}
                        {item.config?.originality_score && (
                          <span className="text-xs text-muted-foreground">
                            {item.config.originality_score}% original
                          </span>
                        )}
                        <EmotionalTriggerBadge
                          trigger={(item.config as any)?.emotional_trigger}
                          compact
                        />
                        {item.config?.auto_published && (
                          <Badge className="text-xs bg-success/20 text-success border-success/30">
                            Auto-publicado
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {item.config?.source_name && (
                          <span className="text-xs text-muted-foreground">
                            Fonte: {item.config.source_name}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(item.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                    {item.config?.wordpress_post_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(item.config?.wordpress_post_url, '_blank');
                        }}
                      >
                        <ExternalLink className="w-4 h-4" />
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
  );
}
