import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  RefreshCw, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  Share2,
  FileText,
  Layers,
  Activity,
  TrendingUp
} from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QueueItem {
  id: number;
  queue_type: string;
  action: string;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  post_id?: number;
  article_id?: string;
}

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  paused: number;
  total: number;
  completed_last_hour: number;
  avg_attempts: number;
}

interface SocialQueueItem {
  id: number;
  platform: string;
  post_id: number;
  status: string;
  scheduled_at: string;
  posted_at?: string;
  message: string;
  error_message?: string;
}

const statusIcons = {
  pending: Clock,
  processing: RefreshCw,
  completed: CheckCircle,
  failed: XCircle,
  cancelled: XCircle,
  paused: Pause,
};

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  paused: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

const platformColors: Record<string, string> = {
  facebook: "bg-blue-600",
  twitter: "bg-sky-500",
  linkedin: "bg-blue-700",
  instagram: "bg-pink-500",
  pinterest: "bg-red-600",
  telegram: "bg-sky-400",
  whatsapp: "bg-green-500",
};

export default function QueueMonitor() {
  const { projects } = useProjects();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Get connected WordPress projects
  const connectedProjects = projects?.filter(p => p.is_connected && p.wordpress_url) || [];

  useEffect(() => {
    if (connectedProjects.length > 0 && !selectedProject) {
      setSelectedProject(connectedProjects[0].id);
    }
  }, [connectedProjects, selectedProject]);

  const selectedProjectData = connectedProjects.find(p => p.id === selectedProject);

  // Fetch content queue stats
  const { data: contentQueueStats, isLoading: loadingContent, refetch: refetchContent } = useQuery({
    queryKey: ['content-queue-stats', selectedProject],
    queryFn: async (): Promise<QueueStats> => {
      if (!selectedProjectData?.wordpress_url) {
        throw new Error("Projeto não conectado");
      }

      const response = await fetch(`${selectedProjectData.wordpress_url}/wp-json/cfrdm/v1/queue/stats`, {
        headers: {
          'X-CFRDM-API-Key': selectedProjectData.wordpress_app_password || '',
        },
      });

      if (!response.ok) {
        throw new Error("Erro ao buscar estatísticas da fila");
      }

      return response.json();
    },
    enabled: !!selectedProjectData?.wordpress_url,
    refetchInterval: autoRefresh ? 10000 : false,
  });

  // Fetch content queue items
  const { data: contentQueueItems, isLoading: loadingItems, refetch: refetchItems } = useQuery({
    queryKey: ['content-queue-items', selectedProject],
    queryFn: async (): Promise<QueueItem[]> => {
      if (!selectedProjectData?.wordpress_url) {
        throw new Error("Projeto não conectado");
      }

      const response = await fetch(`${selectedProjectData.wordpress_url}/wp-json/cfrdm/v1/queue?limit=50`, {
        headers: {
          'X-CFRDM-API-Key': selectedProjectData.wordpress_app_password || '',
        },
      });

      if (!response.ok) {
        throw new Error("Erro ao buscar itens da fila");
      }

      const data = await response.json();
      return data.items || [];
    },
    enabled: !!selectedProjectData?.wordpress_url,
    refetchInterval: autoRefresh ? 10000 : false,
  });

  // Fetch social queue stats
  const { data: socialQueueStats, isLoading: loadingSocial, refetch: refetchSocial } = useQuery({
    queryKey: ['social-queue-stats', selectedProject],
    queryFn: async (): Promise<QueueStats> => {
      if (!selectedProjectData?.wordpress_url) {
        throw new Error("Projeto não conectado");
      }

      const response = await fetch(`${selectedProjectData.wordpress_url}/wp-json/cfrdm/v1/social/queue-stats`, {
        headers: {
          'X-CFRDM-API-Key': selectedProjectData.wordpress_app_password || '',
        },
      });

      if (!response.ok) {
        throw new Error("Erro ao buscar estatísticas social");
      }

      return response.json();
    },
    enabled: !!selectedProjectData?.wordpress_url,
    refetchInterval: autoRefresh ? 10000 : false,
  });

  // Fetch social queue items
  const { data: socialQueueItems, isLoading: loadingSocialItems } = useQuery({
    queryKey: ['social-queue-items', selectedProject],
    queryFn: async (): Promise<SocialQueueItem[]> => {
      if (!selectedProjectData?.wordpress_url) {
        throw new Error("Projeto não conectado");
      }

      const response = await fetch(`${selectedProjectData.wordpress_url}/wp-json/cfrdm/v1/social/queue?limit=50`, {
        headers: {
          'X-CFRDM-API-Key': selectedProjectData.wordpress_app_password || '',
        },
      });

      if (!response.ok) {
        throw new Error("Erro ao buscar fila social");
      }

      const data = await response.json();
      return data.items || [];
    },
    enabled: !!selectedProjectData?.wordpress_url,
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const handleRetryItem = async (itemId: number, queueType: 'content' | 'social') => {
    if (!selectedProjectData?.wordpress_url) return;

    try {
      const endpoint = queueType === 'content' 
        ? `${selectedProjectData.wordpress_url}/wp-json/cfrdm/v1/queue/${itemId}/retry`
        : `${selectedProjectData.wordpress_url}/wp-json/cfrdm/v1/social/queue/${itemId}/retry`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'X-CFRDM-API-Key': selectedProjectData.wordpress_app_password || '',
        },
      });

      if (!response.ok) throw new Error("Erro ao reprocessar item");

      toast.success("Item adicionado para reprocessamento");
      refetchItems();
      refetchContent();
    } catch (error) {
      toast.error("Erro ao reprocessar item");
    }
  };

  const handlePauseItem = async (itemId: number) => {
    if (!selectedProjectData?.wordpress_url) return;

    try {
      const response = await fetch(`${selectedProjectData.wordpress_url}/wp-json/cfrdm/v1/queue/${itemId}/pause`, {
        method: 'POST',
        headers: {
          'X-CFRDM-API-Key': selectedProjectData.wordpress_app_password || '',
        },
      });

      if (!response.ok) throw new Error("Erro ao pausar item");

      toast.success("Item pausado");
      refetchItems();
    } catch (error) {
      toast.error("Erro ao pausar item");
    }
  };

  const handleRefreshAll = () => {
    refetchContent();
    refetchItems();
    refetchSocial();
    toast.success("Dados atualizados");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (connectedProjects.length === 0) {
    return (
      <div className="p-6">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum Projeto Conectado</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Conecte um projeto WordPress para monitorar as filas de processamento em tempo real.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            Monitor de Filas
          </h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe o processamento de conteúdo e posts sociais em tempo real
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Project Selector */}
          {connectedProjects.length > 1 && (
            <select
              value={selectedProject || ''}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            >
              {connectedProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? "text-green-600" : ""}
          >
            {autoRefresh ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Auto
              </>
            ) : (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Pausado
              </>
            )}
          </Button>

          <Button variant="outline" size="sm" onClick={handleRefreshAll}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {loadingContent ? <Skeleton className="w-8 h-7" /> : contentQueueStats?.pending || 0}
                </p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <RefreshCw className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {loadingContent ? <Skeleton className="w-8 h-7" /> : contentQueueStats?.processing || 0}
                </p>
                <p className="text-xs text-muted-foreground">Processando</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {loadingContent ? <Skeleton className="w-8 h-7" /> : contentQueueStats?.completed || 0}
                </p>
                <p className="text-xs text-muted-foreground">Completos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {loadingContent ? <Skeleton className="w-8 h-7" /> : contentQueueStats?.failed || 0}
                </p>
                <p className="text-xs text-muted-foreground">Falhas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {loadingContent ? <Skeleton className="w-8 h-7" /> : contentQueueStats?.completed_last_hour || 0}
                </p>
                <p className="text-xs text-muted-foreground">Última Hora</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/30">
                <Share2 className="w-5 h-5 text-pink-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {loadingSocial ? <Skeleton className="w-8 h-7" /> : socialQueueStats?.pending || 0}
                </p>
                <p className="text-xs text-muted-foreground">Social Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Queue Types */}
      <Tabs defaultValue="content" className="space-y-4">
        <TabsList>
          <TabsTrigger value="content" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Fila de Conteúdo
            {contentQueueStats && contentQueueStats.pending > 0 && (
              <Badge variant="secondary" className="ml-1">
                {contentQueueStats.pending}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="social" className="flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Fila Social
            {socialQueueStats && socialQueueStats.pending > 0 && (
              <Badge variant="secondary" className="ml-1">
                {socialQueueStats.pending}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Content Queue Tab */}
        <TabsContent value="content">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Itens na Fila de Conteúdo</span>
                {contentQueueStats && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {contentQueueStats.total} total
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingItems ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !contentQueueItems || contentQueueItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum item na fila</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {contentQueueItems.map((item) => {
                    const StatusIcon = statusIcons[item.status as keyof typeof statusIcons] || Clock;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${statusColors[item.status as keyof typeof statusColors] || statusColors.pending}`}>
                            <StatusIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-medium">{item.action}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>{item.queue_type}</span>
                              <span>•</span>
                              <span>Tentativa {item.attempts}/{item.max_attempts}</span>
                              {item.post_id && (
                                <>
                                  <span>•</span>
                                  <span>Post #{item.post_id}</span>
                                </>
                              )}
                            </div>
                            {item.error_message && (
                              <p className="text-xs text-red-500 mt-1 line-clamp-1">
                                {item.error_message}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right text-sm text-muted-foreground">
                            <p>{formatDate(item.created_at)}</p>
                            <Badge variant="outline" className="text-xs">
                              P{item.priority}
                            </Badge>
                          </div>

                          <div className="flex gap-1">
                            {item.status === 'failed' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRetryItem(item.id, 'content')}
                                title="Reprocessar"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            )}
                            {item.status === 'pending' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handlePauseItem(item.id)}
                                title="Pausar"
                              >
                                <Pause className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Social Queue Tab */}
        <TabsContent value="social">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Fila de Posts Sociais</span>
                {socialQueueStats && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {socialQueueStats.total} total
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSocialItems ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !socialQueueItems || socialQueueItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Share2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum post social na fila</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {socialQueueItems.map((item) => {
                    const StatusIcon = statusIcons[item.status as keyof typeof statusIcons] || Clock;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${platformColors[item.platform] || 'bg-gray-500'}`}>
                            <Share2 className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="font-medium capitalize">{item.platform}</p>
                            <p className="text-sm text-muted-foreground line-clamp-1 max-w-md">
                              {item.message || `Post #${item.post_id}`}
                            </p>
                            {item.error_message && (
                              <p className="text-xs text-red-500 mt-1">
                                {item.error_message}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <Badge className={statusColors[item.status as keyof typeof statusColors] || statusColors.pending}>
                              {item.status}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(item.scheduled_at)}
                            </p>
                          </div>

                          {item.status === 'failed' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRetryItem(item.id, 'social')}
                              title="Reprocessar"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
