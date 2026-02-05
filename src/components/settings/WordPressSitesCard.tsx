import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

const SEO_PLUGINS = [
  { value: 'none', label: 'Nenhum' },
  { value: 'yoast', label: 'Yoast SEO' },
  { value: 'rankmath', label: 'Rank Math' },
  { value: 'aioseo', label: 'All in One SEO' },
];

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
    } catch (error) {
      toast({
        title: 'Erro ao adicionar site',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
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

    setIsCreating(true);
    try {
      const url = new URL(pluginSiteUrl);
      const domain = url.hostname;

      // For plugin connection, we store the API key in wordpress_app_password
      // and use a special marker in wordpress_username to identify plugin auth
      await createProject.mutateAsync({
        name: pluginSiteName,
        domain,
        wordpress_url: pluginSiteUrl,
        wordpress_username: '__CFRDM_PLUGIN__',
        wordpress_app_password: pluginApiKey,
        is_connected: false,
      });

      setPluginSiteName('');
      setPluginSiteUrl('');
      setPluginApiKey('');

      toast({
        title: 'Site adicionado!',
        description: 'O site WordPress foi adicionado via Plugin.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao adicionar site',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
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
          {projects.map((project) => (
            <div 
              key={project.id}
              className="p-4 border rounded-lg bg-background"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{project.name}</h4>
                      {isPluginConnection(project) && (
                        <Badge variant="secondary" className="text-xs">
                          <Plug className="w-3 h-3 mr-1" />
                          Plugin
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{project.domain}</p>
                  </div>
                  <div className="flex items-center gap-3">
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
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 bg-emerald-50">
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
                  <Button variant="ghost" size="icon" className="h-8 w-8">
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
            </div>
          ))}
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
    </Card>
  );
}
