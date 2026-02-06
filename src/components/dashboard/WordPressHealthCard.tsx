import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Globe, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  ExternalLink,
  Activity,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
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
}

interface WordPressHealthCardProps {
  projects: Array<{
    id: string;
    name: string;
    domain: string;
    wordpress_url?: string | null;
  }>;
  compact?: boolean;
}

export function WordPressHealthCard({ projects, compact = false }: WordPressHealthCardProps) {
  const navigate = useNavigate();
  const [sites, setSites] = useState<SiteHealth[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [lastFullCheck, setLastFullCheck] = useState<Date | null>(null);

  // Filter only WordPress sites
  const wpProjects = projects.filter(p => p.wordpress_url);

  // Initialize sites
  useEffect(() => {
    setSites(wpProjects.map(p => ({
      id: p.id,
      name: p.name,
      domain: p.domain,
      wordpress_url: p.wordpress_url || null,
      status: 'checking',
    })));
  }, [projects]);

  // Check health of a single site
  const checkSiteHealth = useCallback(async (projectId: string): Promise<Partial<SiteHealth>> => {
    const startTime = Date.now();
    
    try {
      const { data, error } = await supabase.functions.invoke('wordpress-api', {
        body: { action: 'get-categories', projectId, perPage: 1 },
      });

      const responseTime = Date.now() - startTime;

      if (error || !data?.success) {
        const errorMsg = data?.error || error?.message || 'Erro desconhecido';
        
        // Check for critical errors
        if (errorMsg.includes('<p>') || errorMsg.includes('erro crítico') || errorMsg.includes('500')) {
          return {
            status: 'offline',
            responseTime,
            message: 'Erro crítico no WordPress',
            lastChecked: new Date(),
          };
        }

        if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
          return {
            status: 'degraded',
            responseTime,
            message: 'Falha na autenticação',
            lastChecked: new Date(),
          };
        }

        return {
          status: 'offline',
          responseTime,
          message: errorMsg.substring(0, 50),
          lastChecked: new Date(),
        };
      }

      return {
        status: responseTime > 5000 ? 'degraded' : 'healthy',
        responseTime,
        message: responseTime > 5000 ? 'Resposta lenta' : 'Funcionando',
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        status: 'offline',
        responseTime: Date.now() - startTime,
        message: 'Falha na conexão',
        lastChecked: new Date(),
      };
    }
  }, []);

  // Check all sites
  const checkAllSites = useCallback(async () => {
    if (wpProjects.length === 0) return;

    setIsChecking(true);

    // Set all to checking
    setSites(prev => prev.map(s => ({ ...s, status: 'checking' as const })));

    // Check each site
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
    if (wpProjects.length > 0 && sites.some(s => s.status === 'checking')) {
      checkAllSites();
    }
  }, [wpProjects.length]);

  // Get status counts
  const statusCounts = {
    healthy: sites.filter(s => s.status === 'healthy').length,
    degraded: sites.filter(s => s.status === 'degraded').length,
    offline: sites.filter(s => s.status === 'offline').length,
    checking: sites.filter(s => s.status === 'checking').length,
  };

  const overallStatus = statusCounts.offline > 0 
    ? 'offline' 
    : statusCounts.degraded > 0 
      ? 'degraded' 
      : 'healthy';

  const getStatusIcon = (status: SiteHealth['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'offline':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'checking':
        return <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />;
    }
  };

  const getStatusBadge = (status: SiteHealth['status']) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Saudável</Badge>;
      case 'degraded':
        return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Lento</Badge>;
      case 'offline':
        return <Badge className="bg-destructive/10 text-destructive">Offline</Badge>;
      case 'checking':
        return <Badge variant="outline">Verificando...</Badge>;
    }
  };

  if (wpProjects.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <Card className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        overallStatus === 'offline' && "border-destructive/50",
        overallStatus === 'degraded' && "border-yellow-500/50"
      )} onClick={() => navigate('/wordpress-monitor')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                overallStatus === 'healthy' && "bg-green-100 dark:bg-green-900/30",
                overallStatus === 'degraded' && "bg-yellow-100 dark:bg-yellow-900/30",
                overallStatus === 'offline' && "bg-destructive/10"
              )}>
                <Activity className={cn(
                  "w-5 h-5",
                  overallStatus === 'healthy' && "text-green-600 dark:text-green-400",
                  overallStatus === 'degraded' && "text-yellow-600 dark:text-yellow-400",
                  overallStatus === 'offline' && "text-destructive"
                )} />
              </div>
              <div>
                <h4 className="text-sm font-semibold">Saúde WordPress</h4>
                <p className="text-xs text-muted-foreground">
                  {wpProjects.length} site{wpProjects.length !== 1 ? 's' : ''} monitorado{wpProjects.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {statusCounts.healthy > 0 && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {statusCounts.healthy} OK
                </Badge>
              )}
              {statusCounts.degraded > 0 && (
                <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  {statusCounts.degraded} Lento
                </Badge>
              )}
              {statusCounts.offline > 0 && (
                <Badge className="bg-destructive/10 text-destructive">
                  {statusCounts.offline} Offline
                </Badge>
              )}
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              overallStatus === 'healthy' && "bg-green-100 dark:bg-green-900/30",
              overallStatus === 'degraded' && "bg-yellow-100 dark:bg-yellow-900/30",
              overallStatus === 'offline' && "bg-destructive/10"
            )}>
              <Activity className={cn(
                "w-5 h-5",
                overallStatus === 'healthy' && "text-green-600 dark:text-green-400",
                overallStatus === 'degraded' && "text-yellow-600 dark:text-yellow-400",
                overallStatus === 'offline' && "text-destructive"
              )} />
            </div>
            <div>
              <CardTitle className="text-lg">Saúde dos Sites WordPress</CardTitle>
              <CardDescription>
                Monitoramento em tempo real de {wpProjects.length} site{wpProjects.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={checkAllSites}
            disabled={isChecking}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isChecking && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Status Summary */}
        <div className="flex items-center gap-4 mb-4 pb-4 border-b">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium">{statusCounts.healthy} saudável</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-medium">{statusCounts.degraded} lento</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-destructive" />
            <span className="text-sm font-medium">{statusCounts.offline} offline</span>
          </div>
          {lastFullCheck && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
              <Clock className="w-3 h-3" />
              Atualizado às {lastFullCheck.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>

        {/* Sites List */}
        <div className="space-y-3">
          {sites.map(site => (
            <div 
              key={site.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border transition-colors",
                site.status === 'offline' && "border-destructive/30 bg-destructive/5",
                site.status === 'degraded' && "border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-900/10",
                site.status === 'healthy' && "border-green-500/30 bg-green-50/50 dark:bg-green-900/10",
                site.status === 'checking' && "border-muted bg-muted/30"
              )}
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(site.status)}
                <div>
                  <p className="text-sm font-medium">{site.name}</p>
                  <p className="text-xs text-muted-foreground">{site.wordpress_url || site.domain}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {site.responseTime && site.status !== 'checking' && (
                  <span className="text-xs text-muted-foreground">
                    {site.responseTime}ms
                  </span>
                )}
                {getStatusBadge(site.status)}
              </div>
            </div>
          ))}
        </div>

        {/* View All Link */}
        <Button
          variant="ghost"
          className="w-full mt-4"
          onClick={() => navigate('/wordpress-monitor')}
        >
          Ver painel completo
          <ExternalLink className="w-4 h-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
