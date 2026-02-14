import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  Globe,
  Pencil,
  Trash2,
  Plus,
  CheckCircle2,
  Loader2,
  BookOpen,
  Plug,
  Key,
  ExternalLink,
  XCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  Activity,
  Download,
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const SEO_PLUGINS = [
  { value: 'none', label: 'Nenhum' },
  { value: 'yoast', label: 'Yoast SEO' },
  { value: 'rankmath', label: 'Rank Math' },
  { value: 'aioseo', label: 'All in One SEO' },
];

interface ConnectionHealth {
  status: 'unknown' | 'testing' | 'healthy' | 'degraded' | 'offline';
  responseTime?: number;
  lastChecked?: Date;
  canPublish?: boolean;
  pluginActive?: boolean;
  message?: string;
  pluginVersion?: string;
  updateRequired?: boolean;
  updateMessage?: string;
}

export function WordPressSitesCard() {
  const { toast } = useToast();
  const { projects, createProject, updateProject, deleteProject } = useProjects();
  
  // Standard connection (Application Password)
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [newSiteUsername, setNewSiteUsername] = useState('');
  const [newSitePassword, setNewSitePassword] = useState('');
  
  // Plugin connection (API Key)
  const [pluginSiteName, setPluginSiteName] = useState('');
  const [pluginSiteUrl, setPluginSiteUrl] = useState('');
  const [pluginApiKey, setPluginApiKey] = useState('');
  
  const [isCreating, setIsCreating] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [connectionMethod, setConnectionMethod] = useState<'standard' | 'plugin'>('standard');
  
  // Connection health tracking
  const [connectionHealth, setConnectionHealth] = useState<Record<string, ConnectionHealth>>({});
  
  // Edit mode
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    wordpress_url: '',
    wordpress_username: '',
    wordpress_app_password: '',
  });

  // Auto-test connection health on mount
  const checkConnectionHealth = useCallback(async (projectId: string, silent = false) => {
    const project = projects.find(p => p.id === projectId);
    if (!project?.wordpress_url || !project?.wordpress_app_password) return;

    const startTime = Date.now();
    setConnectionHealth(prev => ({
      ...prev,
      [projectId]: { ...prev[projectId], status: 'testing' }
    }));

    const isPluginAuth = project.wordpress_username === '__CFRDM_PLUGIN__';

    try {
      const { data, error } = await supabase.functions.invoke('test-wordpress-connection', {
        body: isPluginAuth ? {
          wordpress_url: project.wordpress_url,
          use_plugin: true,
          api_key: project.wordpress_app_password,
        } : {
          wordpress_url: project.wordpress_url,
          wordpress_username: project.wordpress_username,
          wordpress_app_password: project.wordpress_app_password,
        },
      });

      const responseTime = Date.now() - startTime;

      if (error) throw new Error(error.message);

      if (data?.success) {
        setConnectionHealth(prev => ({
          ...prev,
          [projectId]: {
            status: responseTime > 3000 ? 'degraded' : 'healthy',
            responseTime,
            lastChecked: new Date(),
            canPublish: data.canPublish !== false,
            pluginActive: isPluginAuth ? true : undefined,
            message: responseTime > 3000 ? 'Conexão lenta' : 'Conexão OK',
            pluginVersion: data.pluginVersion,
            updateRequired: data.updateRequired || data.isOutdated,
            updateMessage: data.updateMessage,
          }
        }));
      } else {
        setConnectionHealth(prev => ({
          ...prev,
          [projectId]: {
            status: 'offline',
            responseTime,
            lastChecked: new Date(),
            message: data?.error || 'Falha na conexão',
          }
        }));
      }
    } catch (error) {
      setConnectionHealth(prev => ({
        ...prev,
        [projectId]: {
          status: 'offline',
          lastChecked: new Date(),
          message: error instanceof Error ? error.message : 'Erro desconhecido',
        }
      }));
    }
  }, [projects]);

  // Check all connections on mount
  useEffect(() => {
    projects.forEach(project => {
      if (project.is_connected && !connectionHealth[project.id]) {
        checkConnectionHealth(project.id, true);
      }
    });
  }, [projects, checkConnectionHealth, connectionHealth]);

  const openEditDialog = (project: any) => {
    setEditingProject(project);
    setEditForm({
      name: project.name,
      wordpress_url: project.wordpress_url || '',
      wordpress_username: project.wordpress_username || '',
      wordpress_app_password: '', // Don't show existing password
    });
  };

  const handleSaveEdit = async () => {
    if (!editingProject) return;
    
    try {
      const updates: any = {
        id: editingProject.id,
        name: editForm.name,
        wordpress_url: editForm.wordpress_url,
      };
      
      // Only update credentials if provided
      if (editForm.wordpress_username && editingProject.wordpress_username !== '__CFRDM_PLUGIN__') {
        updates.wordpress_username = editForm.wordpress_username;
      }
      if (editForm.wordpress_app_password) {
        updates.wordpress_app_password = editForm.wordpress_app_password;
      }
      
      await updateProject.mutateAsync(updates);
      
      toast({
        title: 'Site atualizado!',
        description: 'As configurações foram salvas.',
      });
      
      setEditingProject(null);
      
      // Retest connection
      checkConnectionHealth(editingProject.id);
    } catch (error) {
      toast({
        title: 'Erro ao salvar',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  const getHealthColor = (health?: ConnectionHealth) => {
    if (!health || health.status === 'unknown') return 'bg-muted';
    if (health.status === 'testing') return 'bg-muted animate-pulse';
    if (health.status === 'healthy') return 'bg-emerald-500';
    if (health.status === 'degraded') return 'bg-amber-500';
    return 'bg-destructive';
  };

  const getHealthIcon = (health?: ConnectionHealth) => {
    if (!health || health.status === 'unknown') return <Wifi className="w-4 h-4 text-muted-foreground" />;
    if (health.status === 'testing') return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    if (health.status === 'healthy') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (health.status === 'degraded') return <Activity className="w-4 h-4 text-amber-500" />;
    return <WifiOff className="w-4 h-4 text-destructive" />;
  };

  const getHealthProgress = (health?: ConnectionHealth) => {
    if (!health || health.status === 'unknown') return 0;
    if (health.status === 'testing') return 50;
    if (health.status === 'healthy') return 100;
    if (health.status === 'degraded') return 60;
    return 15;
  };

  const handleAddSite = async () => {
    if (!newSiteName || !newSiteUrl || !newSiteUsername || !newSitePassword) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha todos os campos para adicionar o site.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      const url = new URL(newSiteUrl);
      const domain = url.hostname;

      await createProject.mutateAsync({
        name: newSiteName,
        domain,
        wordpress_url: newSiteUrl,
        wordpress_username: newSiteUsername,
        wordpress_app_password: newSitePassword,
        is_connected: false,
      });

      setNewSiteName('');
      setNewSiteUrl('');
      setNewSiteUsername('');
      setNewSitePassword('');

      toast({
        title: 'Site adicionado!',
        description: 'O site WordPress foi adicionado com sucesso.',
      });
    } catch (error: any) {
      console.error('[handleAddSite] Error:', error);
      toast({
        title: 'Erro ao adicionar site',
        description: error instanceof Error ? error.message : (error?.message || 'Erro desconhecido'),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddPluginSite = async () => {
    if (!pluginSiteName || !pluginSiteUrl || !pluginApiKey) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha todos os campos para adicionar o site.',
        variant: 'destructive',
      });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(pluginSiteUrl);
    } catch {
      toast({
        title: 'URL inválida',
        description: 'Insira uma URL válida (ex: https://meusite.com.br).',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      // Clean URL: remove wp-json, cfrdm paths, and trailing slashes
      let cleanUrl = pluginSiteUrl.replace(/\/$/, '');
      cleanUrl = cleanUrl.replace(/\/wp-json(\/.*)?$/, '');
      cleanUrl = cleanUrl.replace(/\/(cfrdm|wp)(\/.*)?$/, '');

      // Step 1: Test connection BEFORE saving
      const { data: testData, error: testError } = await supabase.functions.invoke('test-wordpress-connection', {
        body: {
          wordpress_url: cleanUrl,
          use_plugin: true,
          api_key: pluginApiKey,
        },
      });

      if (testError) {
        throw new Error(`Falha ao testar conexão: ${testError.message || 'Servidor indisponível. Tente novamente em alguns minutos.'}`);
      }

      if (!testData?.success) {
        const errorMsg = testData?.error || 'Plugin não encontrado ou API Key inválida.';
        const hint = testData?.hint || '';
        throw new Error(`${errorMsg}${hint ? ` ${hint}` : ''}`);
      }

      // Step 2: Save to database only after successful connection test
      const finalUrl = testData.correctedUrl || pluginSiteUrl;
      const domain = new URL(finalUrl).hostname;

      await createProject.mutateAsync({
        name: pluginSiteName,
        domain,
        wordpress_url: finalUrl,
        wordpress_username: '__CFRDM_PLUGIN__',
        wordpress_app_password: pluginApiKey,
        is_connected: true,
      });

      setPluginSiteName('');
      setPluginSiteUrl('');
      setPluginApiKey('');

      toast({
        title: 'Site adicionado e conectado! ✓',
        description: `Conectado a: ${testData.site?.name || finalUrl}${testData.pluginVersion ? ` (Plugin v${testData.pluginVersion})` : ''}`,
      });
    } catch (error: any) {
      const message = error instanceof Error 
        ? error.message 
        : (error?.message || error?.error_description || error?.details || JSON.stringify(error) || 'Erro desconhecido');
      const isNetworkError = message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('fetch') || message.includes('Load failed');
      
      console.error('[handleAddPluginSite] Error:', error);
      
      toast({
        title: 'Erro ao adicionar site',
        description: isNetworkError 
          ? 'Sessão expirada ou servidor indisponível. Recarregue a página e tente novamente.'
          : message,
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleTestConnection = async (projectId: string) => {
    setTestingId(projectId);
    const project = projects.find(p => p.id === projectId);
    
    if (!project?.wordpress_url || !project?.wordpress_app_password) {
      toast({
        title: 'Dados incompletos',
        description: 'Configure a URL e credenciais do WordPress.',
        variant: 'destructive',
      });
      setTestingId(null);
      return;
    }

    const isPluginAuth = project.wordpress_username === '__CFRDM_PLUGIN__';

    try {
      if (isPluginAuth) {
        // Test via ContentFactory RDM Plugin API
        const { data, error } = await supabase.functions.invoke('test-wordpress-connection', {
          body: {
            wordpress_url: project.wordpress_url,
            use_plugin: true,
            api_key: project.wordpress_app_password,
          },
        });

        if (error) throw new Error(error.message);

        if (data?.success) {
          // If a subpath was discovered, update the project URL
          if (data.correctedUrl && data.correctedUrl !== project.wordpress_url) {
            await updateProject.mutateAsync({
              id: projectId,
              is_connected: true,
              wordpress_url: data.correctedUrl,
              domain: new URL(data.correctedUrl).hostname,
            });
            
            toast({
              title: 'Conexão via Plugin bem-sucedida! ✓',
              description: `WordPress detectado em ${data.discoveredPath}. URL atualizada automaticamente.`,
            });
          } else {
            await updateProject.mutateAsync({
              id: projectId,
              is_connected: true,
            });
            
            toast({
              title: 'Conexão via Plugin bem-sucedida! ✓',
              description: `Conectado a: ${data.site?.name || project.wordpress_url}`,
            });
          }
        } else {
          let errorDescription = data?.error || 'Verifique se o plugin ContentFactory RDM está ativo e a API Key está correta.';
          if (data?.hint) {
            errorDescription += ` ${data.hint}`;
          }
          
          toast({
            title: 'Falha na conexão via Plugin',
            description: errorDescription,
            variant: 'destructive',
          });
        }
      } else {
        // Standard Application Password test
        const { data, error } = await supabase.functions.invoke('test-wordpress-connection', {
          body: {
            wordpress_url: project.wordpress_url,
            wordpress_username: project.wordpress_username,
            wordpress_app_password: project.wordpress_app_password,
          },
        });

        if (error) throw new Error(error.message);

        if (data?.success) {
          // If a subpath was discovered, update the project URL
          if (data.correctedUrl && data.correctedUrl !== project.wordpress_url) {
            await updateProject.mutateAsync({
              id: projectId,
              is_connected: true,
              wordpress_url: data.correctedUrl,
              domain: new URL(data.correctedUrl).hostname,
            });
            
            const message = data.canPublish 
              ? `WordPress detectado em ${data.discoveredPath}. URL atualizada. Usuário: ${data.user?.name || 'N/A'}`
              : `WordPress detectado em ${data.discoveredPath}. Usuário pode não ter permissão para publicar.`;
            
            toast({
              title: 'Conexão bem-sucedida! ✓',
              description: message,
            });
          } else {
            await updateProject.mutateAsync({
              id: projectId,
              is_connected: true,
            });
            
            const message = data.canPublish 
              ? `Conectado com sucesso! Usuário: ${data.user?.name || 'N/A'}`
              : 'Conectado, mas o usuário pode não ter permissão para publicar.';
            
            toast({
              title: 'Conexão bem-sucedida! ✓',
              description: message,
            });
          }
        } else {
          let errorDescription = data?.error || 'Erro desconhecido';
          if (data?.hint) {
            errorDescription += ` ${data.hint}`;
          }
          
          toast({
            title: 'Falha na conexão',
            description: errorDescription,
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      console.error('Connection test error:', error);
      toast({
        title: 'Erro de conexão',
        description: error instanceof Error ? error.message : 'Não foi possível conectar ao site.',
        variant: 'destructive',
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleSeoPluginChange = async (projectId: string, plugin: string) => {
    await updateProject.mutateAsync({
      id: projectId,
      seo_plugin: plugin,
    });
  };

  const handleDeleteSite = async (projectId: string) => {
    if (!confirm('Tem certeza que deseja remover este site?')) return;
    
    await deleteProject.mutateAsync(projectId);
    toast({
      title: 'Site removido',
      description: 'O site WordPress foi removido.',
    });
  };

  const isPluginConnection = (project: any) => project.wordpress_username === '__CFRDM_PLUGIN__';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          Sites WordPress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sites List */}
        <div className="space-y-4">
          {projects.map((project) => {
            const health = connectionHealth[project.id];
            
            return (
              <div 
                key={project.id}
                className="p-4 border rounded-lg bg-background space-y-3"
              >
                {/* Plugin Update Required Warning */}
                {health?.updateRequired && isPluginConnection(project) && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          Atualização Obrigatória do Plugin
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          {health.updateMessage || `Versão instalada: v${health.pluginVersion}. Atualize para v3.2.7+ para acessar todas as funcionalidades.`}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/50"
                        asChild
                      >
                        <Link to="/plugin-wp">
                          <Download className="w-3 h-3 mr-1" />
                          Baixar v3.2.7
                        </Link>
                      </Button>
                    </div>
                  </div>
                )}
                
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{project.name}</h4>
                        {isPluginConnection(project) && (
                          <Badge variant="secondary" className="text-xs">
                            <Plug className="w-3 h-3 mr-1" />
                            Plugin
                            {health?.pluginVersion && (
                              <span className={cn(
                                "ml-1",
                                health.updateRequired ? "text-amber-600" : "text-muted-foreground"
                              )}>
                                v{health.pluginVersion}
                              </span>
                            )}
                          </Badge>
                        )}
                        {project.is_connected && getHealthIcon(health)}
                      </div>
                      <p className="text-sm text-muted-foreground">{project.domain}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Plugin SEO:</Label>
                        <Select 
                          value={(project as any).seo_plugin || 'none'} 
                          onValueChange={(value) => handleSeoPluginChange(project.id, value)}
                        >
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SEO_PLUGINS.map((plugin) => (
                              <SelectItem key={plugin.value} value={plugin.value}>
                                {plugin.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {(project as any).seo_plugin && (project as any).seo_plugin !== 'none' && (
                        <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Meta SEO será preenchido
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(project.id)}
                      disabled={testingId === project.id}
                    >
                      {testingId === project.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Testar'
                      )}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => openEditDialog(project)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteSite(project.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Connection Quality Bar */}
                {project.is_connected && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Qualidade da Conexão</span>
                      <div className="flex items-center gap-2">
                        {health?.responseTime && (
                          <span className={cn(
                            "font-mono",
                            health.responseTime < 1000 ? "text-emerald-600" :
                            health.responseTime < 3000 ? "text-amber-600" : "text-destructive"
                          )}>
                            {health.responseTime}ms
                          </span>
                        )}
                        {health?.status === 'healthy' && (
                          <span className="text-emerald-600">Saudável</span>
                        )}
                        {health?.status === 'degraded' && (
                          <span className="text-amber-600">Degradada</span>
                        )}
                        {health?.status === 'offline' && (
                          <span className="text-destructive">Offline</span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => checkConnectionHealth(project.id)}
                          disabled={health?.status === 'testing'}
                        >
                          <RefreshCw className={cn(
                            "w-3 h-3",
                            health?.status === 'testing' && "animate-spin"
                          )} />
                        </Button>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          getHealthColor(health)
                        )}
                        style={{ width: `${getHealthProgress(health)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add New Site Form with Tabs */}
        <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
          <Label className="text-sm font-medium uppercase text-muted-foreground">
            Novo Site
          </Label>
          
          <Tabs defaultValue="standard" onValueChange={(v) => setConnectionMethod(v as 'standard' | 'plugin')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="standard" className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                Senha de Aplicação
              </TabsTrigger>
              <TabsTrigger value="plugin" className="flex items-center gap-2">
                <Plug className="w-4 h-4" />
                Plugin + API Key
              </TabsTrigger>
            </TabsList>

            <TabsContent value="standard" className="space-y-4 mt-4">
              {/* Standard Connection Instructions */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <BookOpen className="w-4 h-4 text-blue-600 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-medium text-blue-900 dark:text-blue-100">Como conectar:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-blue-800 dark:text-blue-200">
                      <li>No WordPress: <strong>Usuários → Perfil → Senhas de Aplicação</strong></li>
                      <li>Crie uma nova senha e copie (ela só aparece uma vez!)</li>
                      <li>Cole abaixo com seu usuário e URL do site</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Nome do Site (ex: Meu Blog)"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                />
                <Input
                  placeholder="URL base (ex: https://meusite.com)"
                  value={newSiteUrl}
                  onChange={(e) => setNewSiteUrl(e.target.value)}
                />
                <Input
                  placeholder="Usuário WordPress"
                  value={newSiteUsername}
                  onChange={(e) => setNewSiteUsername(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Senha de Aplicação"
                  value={newSitePassword}
                  onChange={(e) => setNewSitePassword(e.target.value)}
                />
              </div>
              <Button 
                onClick={handleAddSite} 
                disabled={isCreating}
                className="w-full"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Adicionar Site
              </Button>
            </TabsContent>

            <TabsContent value="plugin" className="space-y-4 mt-4">
              {/* Plugin Connection Instructions */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-start gap-3">
                  <Plug className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-medium text-emerald-900 dark:text-emerald-100">
                      Conexão via Plugin ContentFactory RDM:
                    </p>
                    <ol className="list-decimal list-inside space-y-0.5 text-emerald-800 dark:text-emerald-200">
                      <li>
                        <Link to="/wordpress-plugin" className="underline hover:no-underline">
                          Baixe e instale o plugin
                        </Link>
                      </li>
                      <li>No WordPress: <strong>ContentFactory → Dashboard</strong></li>
                      <li>Copie a API Key gerada automaticamente</li>
                      <li>Cole abaixo junto com a URL do site</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* Advantages of Plugin */}
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                <p className="text-xs font-medium text-primary mb-2">✨ Vantagens do Plugin:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Funciona mesmo com plugins de segurança que bloqueiam a REST API</li>
                  <li>• Não precisa de Senha de Aplicação</li>
                  <li>• Webhooks bidirecionais para sincronização</li>
                  <li>• API Key pode ser regenerada a qualquer momento</li>
                </ul>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Nome do Site (ex: Meu Blog)"
                  value={pluginSiteName}
                  onChange={(e) => setPluginSiteName(e.target.value)}
                />
                <Input
                  placeholder="URL base (ex: https://meusite.com)"
                  value={pluginSiteUrl}
                  onChange={(e) => setPluginSiteUrl(e.target.value)}
                />
              </div>
              <Input
                placeholder="API Key do Plugin (encontrada em ContentFactory → Dashboard)"
                value={pluginApiKey}
                onChange={(e) => setPluginApiKey(e.target.value)}
                className="font-mono"
              />
              <div className="flex gap-2">
                <Button 
                  onClick={handleAddPluginSite} 
                  disabled={isCreating}
                  className="flex-1"
                >
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Adicionar Site via Plugin
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/wordpress-plugin">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Baixar Plugin
                  </Link>
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Troubleshooting Guide */}
        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm space-y-3">
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Problemas de conexão? Verifique:
              </p>
              <ul className="space-y-2 text-amber-800 dark:text-amber-200">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-amber-600">1.</span>
                  <span><strong>REST API bloqueada?</strong> Use a aba "Plugin + API Key" - funciona mesmo com Wordfence, iThemes, etc.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-amber-600">2.</span>
                  <span><strong>REST API ativa:</strong> Acesse <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">seusite.com/wp-json/</code> no navegador - deve retornar JSON</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-amber-600">3.</span>
                  <span><strong>URL correta:</strong> Use a URL base (ex: https://meusite.com), sem <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">/wp-admin</code></span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
      
      {/* Edit Dialog */}
      <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Site WordPress</DialogTitle>
            <DialogDescription>
              Atualize as configurações de conexão do site.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome do Site</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-url">URL do WordPress</Label>
              <Input
                id="edit-url"
                value={editForm.wordpress_url}
                onChange={(e) => setEditForm(prev => ({ ...prev, wordpress_url: e.target.value }))}
              />
            </div>
            
            {editingProject && !isPluginConnection(editingProject) && (
              <div className="space-y-2">
                <Label htmlFor="edit-username">Usuário</Label>
                <Input
                  id="edit-username"
                  value={editForm.wordpress_username}
                  onChange={(e) => setEditForm(prev => ({ ...prev, wordpress_username: e.target.value }))}
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="edit-password">
                {editingProject && isPluginConnection(editingProject) ? 'Nova API Key' : 'Nova Senha de Aplicação'}
              </Label>
              <Input
                id="edit-password"
                type="password"
                placeholder="Deixe em branco para manter a atual"
                value={editForm.wordpress_app_password}
                onChange={(e) => setEditForm(prev => ({ ...prev, wordpress_app_password: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Deixe em branco para manter a credencial atual.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProject(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
