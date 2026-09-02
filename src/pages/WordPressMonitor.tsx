import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, AlertTriangle, CheckCircle2, Clock, Download, ExternalLink, RefreshCw, Server, Settings, ShieldCheck, XCircle, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjects } from '@/hooks/useProjects';
import { supabase } from '@/integrations/supabase/client';
import { PLUGIN_VERSION } from '@/lib/plugin-version';
import { cn } from '@/lib/utils';

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
    canPublish: boolean;
    pluginVersion?: string;
    endpointMode?: string;
    credentialSource?: string;
  };
}

function baseSite(project: { id: string; name: string; domain: string; wordpress_url?: string | null }): SiteHealth {
  return {
    id: project.id,
    name: project.name,
    domain: project.domain,
    wordpress_url: project.wordpress_url || null,
    status: 'checking',
  };
}

export default function WordPressMonitor() {
  const navigate = useNavigate();
  const { projects, isLoading: projectsLoading } = useProjects();
  const [sites, setSites] = useState<SiteHealth[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [lastFullCheck, setLastFullCheck] = useState<Date | null>(null);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);

  const wpProjects = useMemo(() => projects?.filter((project) => project.wordpress_url) || [], [projects]);

  const checkSiteHealth = useCallback(async (projectId: string): Promise<Partial<SiteHealth>> => {
    const startedAt = performance.now();

    try {
      const { data, error } = await supabase.functions.invoke('test-wordpress-connection', {
        body: { project_id: projectId },
      });
      const responseTime = Math.max(1, Math.round(performance.now() - startedAt));
      const payload = data as Record<string, any> | null;

      if (!error && payload?.success) {
        const updateRequired = Boolean(payload.updateRequired || payload.isOutdated);
        const slow = responseTime > 5000;
        const status: SiteHealth['status'] = updateRequired || slow ? 'degraded' : 'healthy';
        const pluginVersion = String(payload.pluginVersion || payload.site?.version || PLUGIN_VERSION);

        return {
          status,
          responseTime,
          message: updateRequired
            ? `Conector ${pluginVersion} desatualizado. Atualize para ${payload.minimumVersion || PLUGIN_VERSION}.`
            : slow
              ? 'Conector autenticado, porém respondendo lentamente.'
              : `Zica Posts ${pluginVersion} conectado e autenticado.`,
          lastChecked: new Date(),
          details: {
            restApi: true,
            authentication: true,
            canPublish: payload.canPublish !== false,
            pluginVersion,
            endpointMode: String(payload.endpointMode || 'auto'),
            credentialSource: String(payload.credentialSource || 'vault'),
          },
        };
      }

      const errorMsg = String(payload?.error || error?.message || 'Falha na verificação do conector.');
      const lower = errorMsg.toLowerCase();
      const authFailure = lower.includes('api key') || lower.includes('credencial') || lower.includes('autentic') || lower.includes('401') || lower.includes('403');
      const pluginFailure = lower.includes('plugin') || lower.includes('zica posts') || lower.includes('não encontrado');

      return {
        status: authFailure || pluginFailure ? 'degraded' : 'offline',
        responseTime,
        message: errorMsg.slice(0, 180),
        lastChecked: new Date(),
        details: {
          restApi: pluginFailure || authFailure,
          authentication: false,
          canPublish: false,
        },
      };
    } catch (error) {
      return {
        status: 'offline',
        responseTime: Math.max(1, Math.round(performance.now() - startedAt)),
        message: error instanceof Error ? error.message : 'Falha na conexão com o servidor.',
        lastChecked: new Date(),
        details: { restApi: false, authentication: false, canPublish: false },
      };
    }
  }, []);

  const checkAllSites = useCallback(async () => {
    if (wpProjects.length === 0) return;

    setIsChecking(true);
    setSites(wpProjects.map(baseSite));

    try {
      const results = await Promise.all(wpProjects.map((project) => checkSiteHealth(project.id)));
      setSites(wpProjects.map((project, index) => ({ ...baseSite(project), ...results[index] })));
      setLastFullCheck(new Date());
    } finally {
      setIsChecking(false);
    }
  }, [checkSiteHealth, wpProjects]);

  useEffect(() => {
    if (!projectsLoading && wpProjects.length > 0) void checkAllSites();
  }, [checkAllSites, projectsLoading, wpProjects.length]);

  const statusCounts = {
    healthy: sites.filter((site) => site.status === 'healthy').length,
    degraded: sites.filter((site) => site.status === 'degraded').length,
    offline: sites.filter((site) => site.status === 'offline').length,
    checking: sites.filter((site) => site.status === 'checking').length,
  };

  const getStatusIcon = (status: SiteHealth['status'], size: 'sm' | 'lg' = 'sm') => {
    const sizeClass = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
    if (status === 'healthy') return <CheckCircle2 className={cn(sizeClass, 'text-green-500')} />;
    if (status === 'degraded') return <AlertTriangle className={cn(sizeClass, 'text-yellow-500')} />;
    if (status === 'offline') return <XCircle className={cn(sizeClass, 'text-destructive')} />;
    return <RefreshCw className={cn(sizeClass, 'animate-spin text-muted-foreground')} />;
  };

  const getStatusLabel = (status: SiteHealth['status']) => {
    if (status === 'healthy') return 'Saudável';
    if (status === 'degraded') return 'Degradado';
    if (status === 'offline') return 'Offline';
    return 'Verificando';
  };

  if (projectsLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Skeleton className="h-24" />
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
          <div className="mb-4 rounded-full bg-muted p-4"><Server className="h-12 w-12 text-muted-foreground" /></div>
          <h2 className="mb-2 text-xl font-semibold">Nenhum site WordPress conectado</h2>
          <p className="mb-6 max-w-md text-muted-foreground">Conecte seus sites WordPress para monitorar o Zica Posts, autenticação e publicação.</p>
          <Button onClick={() => navigate('/projects')}><Settings className="mr-2 h-4 w-4" />Configurar Projetos</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold">Monitor WordPress</h1>
          <p className="mt-1 text-muted-foreground">Saúde do site, Zica Posts, credencial Vault e capacidade de publicação.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {lastFullCheck && <span className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-4 w-4" />Atualizado às {lastFullCheck.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
          <Button onClick={() => void checkAllSites()} disabled={isChecking}><RefreshCw className={cn('mr-2 h-4 w-4', isChecking && 'animate-spin')} />{isChecking ? 'Verificando...' : 'Atualizar Todos'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2"><Server className="h-5 w-5 text-primary" /></div><div><p className="text-2xl font-bold">{wpProjects.length}</p><p className="text-sm text-muted-foreground">Sites Monitorados</p></div></div></CardContent></Card>
        <Card className="border-green-500/30"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30"><CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" /></div><div><p className="text-2xl font-bold text-green-600 dark:text-green-400">{statusCounts.healthy}</p><p className="text-sm text-muted-foreground">Saudáveis</p></div></div></CardContent></Card>
        <Card className="border-yellow-500/30"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-yellow-100 p-2 dark:bg-yellow-900/30"><AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" /></div><div><p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{statusCounts.degraded}</p><p className="text-sm text-muted-foreground">Degradados</p></div></div></CardContent></Card>
        <Card className="border-destructive/30"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-destructive/10 p-2"><XCircle className="h-5 w-5 text-destructive" /></div><div><p className="text-2xl font-bold text-destructive">{statusCounts.offline}</p><p className="text-sm text-muted-foreground">Offline</p></div></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Status dos Sites</CardTitle><CardDescription>Clique em um site para ver o diagnóstico do conector.</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sites.map((site) => (
              <div key={site.id} onClick={() => setSelectedSite(selectedSite === site.id ? null : site.id)} className={cn('cursor-pointer rounded-lg border p-4 transition-all', site.status === 'offline' && 'border-destructive/30 bg-destructive/5', site.status === 'degraded' && 'border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-900/10', site.status === 'healthy' && 'border-green-500/30 bg-green-50/50 dark:bg-green-900/10', site.status === 'checking' && 'border-muted bg-muted/30', selectedSite === site.id && 'ring-2 ring-primary')}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-4">{getStatusIcon(site.status, 'lg')}<div><p className="font-semibold">{site.name}</p><p className="text-sm text-muted-foreground">{site.wordpress_url || site.domain}</p></div></div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    {site.responseTime && site.status !== 'checking' ? <div className="text-right"><p className={cn('text-sm font-medium', site.responseTime > 5000 ? 'text-yellow-600' : 'text-green-600')}>{site.responseTime}ms</p><p className="text-xs text-muted-foreground">Tempo de resposta</p></div> : null}
                    <Badge className={cn(site.status === 'healthy' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', site.status === 'degraded' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', site.status === 'offline' && 'bg-destructive/10 text-destructive', site.status === 'checking' && 'bg-muted text-muted-foreground')}>{getStatusLabel(site.status)}</Badge>
                  </div>
                </div>

                {selectedSite === site.id && site.status !== 'checking' ? (
                  <div className="mt-4 space-y-4 border-t pt-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="flex items-center gap-2">{site.details?.restApi ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}<span className="text-sm">REST API</span></div>
                      <div className="flex items-center gap-2">{site.details?.authentication ? <ShieldCheck className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}<span className="text-sm">Vault/API Key</span></div>
                      <div className="flex items-center gap-2">{site.details?.canPublish ? <Zap className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}<span className="text-sm">Publicação</span></div>
                      <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><span className="text-sm">Zica Posts {site.details?.pluginVersion || '—'} · {site.details?.endpointMode || 'auto'}</span></div>
                    </div>

                    {site.message ? <div className={cn('flex items-start gap-2 rounded-lg p-3', site.status === 'offline' && 'bg-destructive/10', site.status === 'degraded' && 'bg-yellow-100 dark:bg-yellow-900/20', site.status === 'healthy' && 'bg-green-100 dark:bg-green-900/20')}><AlertCircle className={cn('mt-0.5 h-4 w-4', site.status === 'offline' && 'text-destructive', site.status === 'degraded' && 'text-yellow-600', site.status === 'healthy' && 'text-green-600')} /><p className="text-sm">{site.message}</p></div> : null}

                    {site.status !== 'healthy' ? <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); navigate('/wordpress-plugin'); }}><Download className="mr-2 h-4 w-4" />Baixar Plugin v{PLUGIN_VERSION}</Button><Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); window.open(site.wordpress_url || `https://${site.domain}`, '_blank', 'noopener,noreferrer'); }}><ExternalLink className="mr-2 h-4 w-4" />Abrir Site</Button></div> : null}

                    {site.lastChecked ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />Última verificação: {site.lastChecked.toLocaleString('pt-BR')}</p> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
