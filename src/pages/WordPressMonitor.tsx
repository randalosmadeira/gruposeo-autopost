import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Globe, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  ExternalLink,
  Activity,
  Clock,
  Server,
  Zap,
  AlertCircle,
  Download,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useProjects } from '@/hooks/useProjects';
import { useNavigate } from 'react-router-dom';

interface SiteHealth {
  id: string;
  name: string;
  domain: string;
  wordpress_url: string | null;
  status: 'healthy' | 'degraded' | 'offline' | 'checking';
  responseTime?: number;
  message?: string;
  lastChecked?: Date;
  details?: {
    restApi: boolean;
    authentication: boolean;
    categories: number;
  };
}

export default function WordPressMonitor() {
  const navigate = useNavigate();
  const { projects, isLoading: projectsLoading } = useProjects();
  const [sites, setSites] = useState<SiteHealth[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [lastFullCheck, setLastFullCheck] = useState<Date | null>(null);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);

  // Filter only WordPress sites
  const wpProjects = projects?.filter(p => p.wordpress_url) || [];

  // Initialize sites
  useEffect(() => {
    if (wpProjects.length > 0) {
      setSites(wpProjects.map(p => ({
        id: p.id,
        name: p.name,
        domain: p.domain,
        wordpress_url: p.wordpress_url || null,
        status: 'checking',
      })));
    }
  }, [projects]);

  // Check health of a single site
  const checkSiteHealth = useCallback(async (projectId: string): Promise<Partial<SiteHealth>> => {
    const startTime = Date.now();
    
    try {
      const { data, error } = await supabase.functions.invoke('wordpress-api', {
        body: { action: 'get-categories', projectId, perPage: 100 },
      });

      const responseTime = Date.now() - startTime;

      if (error || !data?.success) {
        const errorMsg = data?.error || error?.message || 'Erro desconhecido';
        
        // Check for critical errors
        if (errorMsg.includes('<p>') || errorMsg.includes('erro crítico') || errorMsg.includes('500')) {
          return {
            status: 'offline',
            responseTime,
            message: 'Erro crítico no WordPress (HTTP 500). Possível conflito de plugins.',
            lastChecked: new Date(),
            details: { restApi: false, authentication: false, categories: 0 },
          };
        }

        if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
          return {
            status: 'degraded',
            responseTime,
            message: 'Falha na autenticação. Verifique as credenciais.',
            lastChecked: new Date(),
            details: { restApi: true, authentication: false, categories: 0 },
          };
        }

        return {
          status: 'offline',
          responseTime,
          message: errorMsg.substring(0, 100),
          lastChecked: new Date(),
          details: { restApi: false, authentication: false, categories: 0 },
        };
      }

      const categories = Array.isArray(data?.data) ? data.data.length : 0;

      return {
        status: responseTime > 5000 ? 'degraded' : 'healthy',
        responseTime,
        message: responseTime > 5000 ? 'API respondendo lentamente' : 'Funcionando normalmente',
        lastChecked: new Date(),
        details: { restApi: true, authentication: true, categories },
      };
    } catch (error) {
      return {
        status: 'offline',
        responseTime: Date.now() - startTime,
        message: 'Falha na conexão com o servidor',
        lastChecked: new Date(),
        details: { restApi: false, authentication: false, categories: 0 },
      };
    }
  }, []);

  // Check all sites
  const checkAllSites = useCallback(async () => {
    if (wpProjects.length === 0) return;

    setIsChecking(true);

    // Set all to checking
    setSites(prev => prev.map(s => ({ ...s, status: 'checking' as const })));

    // Check each site sequentially
    for (const project of wpProjects) {
      const result = await checkSiteHealth(project.id);
      setSites(prev => prev.map(s => 
        s.id === project.id ? { ...s, ...result } : s
      ));
    }

    setLastFullCheck(new Date());
    setIsChecking(false);
  }, [wpProjects, checkSiteHealth]);

  // Initial check on mount
  useEffect(() => {
    if (wpProjects.length > 0 && sites.length > 0 && sites.every(s => s.status === 'checking')) {
      checkAllSites();
    }
  }, [sites.length, wpProjects.length]);

  // Get status counts
  const statusCounts = {
    healthy: sites.filter(s => s.status === 'healthy').length,
    degraded: sites.filter(s => s.status === 'degraded').length,
    offline: sites.filter(s => s.status === 'offline').length,
    checking: sites.filter(s => s.status === 'checking').length,
  };

  const getStatusIcon = (status: SiteHealth['status'], size: 'sm' | 'lg' = 'sm') => {
    const sizeClass = size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className={cn(sizeClass, "text-green-500")} />;
      case 'degraded':
        return <AlertTriangle className={cn(sizeClass, "text-yellow-500")} />;
      case 'offline':
        return <XCircle className={cn(sizeClass, "text-destructive")} />;
      case 'checking':
        return <RefreshCw className={cn(sizeClass, "text-muted-foreground animate-spin")} />;
    }
  };

  const getStatusLabel = (status: SiteHealth['status']) => {
    switch (status) {
      case 'healthy': return 'Saudável';
      case 'degraded': return 'Degradado';
      case 'offline': return 'Offline';
      case 'checking': return 'Verificando';
    }
  };

  if (projectsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (wpProjects.length === 0) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 bg-muted rounded-full mb-4">
            <Globe className="w-12 h-12 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Nenhum site WordPress conectado</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Conecte seus sites WordPress para monitorar a saúde e o status de cada um em tempo real.
          </p>
          <Button onClick={() => navigate('/projects')}>
            <Settings className="w-4 h-4 mr-2" />
            Configurar Projetos
          </Button>
        </div>
      </div>
    );
  }

  const selectedSiteData = sites.find(s => s.id === selectedSite);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitor WordPress</h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe a saúde e disponibilidade dos seus sites WordPress conectados
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastFullCheck && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Atualizado às {lastFullCheck.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button onClick={checkAllSites} disabled={isChecking}>
            <RefreshCw className={cn("w-4 h-4 mr-2", isChecking && "animate-spin")} />
            {isChecking ? 'Verificando...' : 'Atualizar Todos'}
          </Button>
        </div>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Server className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{wpProjects.length}</p>
                <p className="text-sm text-muted-foreground">Sites Monitorados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{statusCounts.healthy}</p>
                <p className="text-sm text-muted-foreground">Saudáveis</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-yellow-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{statusCounts.degraded}</p>
                <p className="text-sm text-muted-foreground">Degradados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-destructive/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">{statusCounts.offline}</p>
                <p className="text-sm text-muted-foreground">Offline</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sites List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Status dos Sites
          </CardTitle>
          <CardDescription>
            Clique em um site para ver detalhes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sites.map(site => (
              <div 
                key={site.id}
                onClick={() => setSelectedSite(selectedSite === site.id ? null : site.id)}
                className={cn(
                  "p-4 rounded-lg border transition-all cursor-pointer",
                  site.status === 'offline' && "border-destructive/30 bg-destructive/5",
                  site.status === 'degraded' && "border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-900/10",
                  site.status === 'healthy' && "border-green-500/30 bg-green-50/50 dark:bg-green-900/10",
                  site.status === 'checking' && "border-muted bg-muted/30",
                  selectedSite === site.id && "ring-2 ring-primary"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {getStatusIcon(site.status, 'lg')}
                    <div>
                      <p className="font-semibold">{site.name}</p>
                      <p className="text-sm text-muted-foreground">{site.wordpress_url || site.domain}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {site.responseTime && site.status !== 'checking' && (
                      <div className="text-right">
                        <p className={cn(
                          "text-sm font-medium",
                          site.responseTime > 5000 ? "text-yellow-600" : "text-green-600"
                        )}>
                          {site.responseTime}ms
                        </p>
                        <p className="text-xs text-muted-foreground">Tempo de resposta</p>
                      </div>
                    )}
                    <Badge className={cn(
                      site.status === 'healthy' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                      site.status === 'degraded' && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                      site.status === 'offline' && "bg-destructive/10 text-destructive",
                      site.status === 'checking' && "bg-muted text-muted-foreground"
                    )}>
                      {getStatusLabel(site.status)}
                    </Badge>
                  </div>
                </div>

                {/* Expanded Details */}
                {selectedSite === site.id && site.status !== 'checking' && (
                  <div className="mt-4 pt-4 border-t space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center gap-2">
                        {site.details?.restApi ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-destructive" />
                        )}
                        <span className="text-sm">REST API</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {site.details?.authentication ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-destructive" />
                        )}
                        <span className="text-sm">Autenticação</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" />
                        <span className="text-sm">{site.details?.categories || 0} categorias</span>
                      </div>
                    </div>

                    {site.message && (
                      <div className={cn(
                        "p-3 rounded-lg flex items-start gap-2",
                        site.status === 'offline' && "bg-destructive/10",
                        site.status === 'degraded' && "bg-yellow-100 dark:bg-yellow-900/20",
                        site.status === 'healthy' && "bg-green-100 dark:bg-green-900/20"
                      )}>
                        <AlertCircle className={cn(
                          "w-4 h-4 mt-0.5",
                          site.status === 'offline' && "text-destructive",
                          site.status === 'degraded' && "text-yellow-600",
                          site.status === 'healthy' && "text-green-600"
                        )} />
                        <p className="text-sm">{site.message}</p>
                      </div>
                    )}

                    {site.status === 'offline' && (
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/wordpress-plugin');
                          }}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Baixar Plugin v2.2.1
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(site.wordpress_url || `https://${site.domain}`, '_blank');
                          }}
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Abrir Site
                        </Button>
                      </div>
                    )}

                    {site.lastChecked && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Última verificação: {site.lastChecked.toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
