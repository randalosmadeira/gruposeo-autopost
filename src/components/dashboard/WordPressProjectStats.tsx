import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Globe, 
  RefreshCw, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  MessageSquare,
  Link2,
  Image,
  Search,
  TrendingUp,
  Wrench,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWordPressStats } from '@/hooks/useWordPressStats';
import { useProjects } from '@/hooks/useProjects';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ProjectStatsCardProps {
  projectId: string;
  projectName: string;
  projectDomain: string;
  isConnected: boolean;
}

function ProjectStatsCard({ projectId, projectName, projectDomain, isConnected }: ProjectStatsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { stats, isLoading, syncStats, isSyncing } = useWordPressStats(projectId);

  const handleSync = () => {
    syncStats(projectId);
  };

  if (!isConnected) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <Globe className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-base">{projectName}</CardTitle>
                <CardDescription className="text-xs">{projectDomain}</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-muted-foreground">
              Não conectado
            </Badge>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">{projectName}</CardTitle>
              <CardDescription className="text-xs flex items-center gap-1">
                {projectDomain}
                <ExternalLink className="w-3 h-3" />
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSync}
              disabled={isSyncing}
            >
              <RefreshCw className={cn("w-4 h-4 mr-1", isSyncing && "animate-spin")} />
              Sincronizar
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Quick Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <FileText className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{stats?.total_articles || 0}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="text-center p-3 bg-green-500/10 rounded-lg">
            <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-green-500" />
            <p className="text-2xl font-bold text-green-600">{stats?.published_articles || 0}</p>
            <p className="text-xs text-muted-foreground">Publicados</p>
          </div>
          <div className="text-center p-3 bg-amber-500/10 rounded-lg">
            <Clock className="w-5 h-5 mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold text-amber-600">{stats?.draft_articles || 0}</p>
            <p className="text-xs text-muted-foreground">Rascunhos</p>
          </div>
          <div className="text-center p-3 bg-blue-500/10 rounded-lg">
            <MessageSquare className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold text-blue-600">{stats?.total_comments || 0}</p>
            <p className="text-xs text-muted-foreground">Comentários</p>
          </div>
        </div>

        {/* Last Sync */}
        {stats?.last_sync_at && (
          <p className="text-xs text-muted-foreground text-center">
            Última sincronização: {formatDistanceToNow(new Date(stats.last_sync_at), { 
              addSuffix: true, 
              locale: ptBR 
            })}
          </p>
        )}

        {/* Expanded Details */}
        {expanded && stats && (
          <div className="pt-4 border-t space-y-4">
            <Tabs defaultValue="health" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="health">Saúde</TabsTrigger>
                <TabsTrigger value="links">Links</TabsTrigger>
                <TabsTrigger value="sync">Sincronização</TabsTrigger>
              </TabsList>
              
              <TabsContent value="health" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium">{stats.articles_needing_attention}</p>
                      <p className="text-xs text-muted-foreground">Precisam atenção</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <Image className="w-5 h-5 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium">{stats.missing_featured_images}</p>
                      <p className="text-xs text-muted-foreground">Sem imagem destaque</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <Search className="w-5 h-5 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium">{stats.seo_issues}</p>
                      <p className="text-xs text-muted-foreground">Problemas SEO</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <Link2 className="w-5 h-5 text-destructive" />
                    <div>
                      <p className="text-sm font-medium">{stats.broken_links}</p>
                      <p className="text-xs text-muted-foreground">Links quebrados</p>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="links" className="space-y-4 pt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Links internos totais</span>
                    <span className="font-medium">{stats.total_internal_links}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Artigos sem links</span>
                    <span className="font-medium text-amber-600">{stats.articles_without_links}</span>
                  </div>
                  {stats.total_articles > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Cobertura de links</span>
                        <span>
                          {Math.round(((stats.total_articles - stats.articles_without_links) / stats.total_articles) * 100)}%
                        </span>
                      </div>
                      <Progress 
                        value={((stats.total_articles - stats.articles_without_links) / stats.total_articles) * 100} 
                      />
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="sync" className="space-y-4 pt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Artigos sincronizados</span>
                    <span className="font-medium text-green-600">{stats.synced_articles}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Erros de sincronização</span>
                    <span className="font-medium text-destructive">{stats.sync_errors}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Auto-correções aplicadas</span>
                    <span className="font-medium">{stats.auto_corrections_applied}</span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WordPressProjectStats() {
  const { projects, isLoading } = useProjects();
  const { allStats, allLoading, syncStats, isSyncing } = useWordPressStats();

  const handleSyncAll = () => {
    const connectedProjects = projects?.filter(p => p.is_connected) || [];
    connectedProjects.forEach(project => {
      syncStats(project.id);
    });
  };

  if (isLoading || allLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Estatísticas WordPress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const connectedProjects = projects?.filter(p => p.is_connected) || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Estatísticas WordPress
            </CardTitle>
            <CardDescription>
              {connectedProjects.length} projeto(s) conectado(s)
            </CardDescription>
          </div>
          {connectedProjects.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSyncAll}
              disabled={isSyncing}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
              Sincronizar Todos
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {projects?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum projeto cadastrado</p>
            <p className="text-sm">Crie um projeto para ver as estatísticas do WordPress</p>
          </div>
        ) : (
          projects?.map(project => (
            <ProjectStatsCard
              key={project.id}
              projectId={project.id}
              projectName={project.name}
              projectDomain={project.domain}
              isConnected={project.is_connected}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
