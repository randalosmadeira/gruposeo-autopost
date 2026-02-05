import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const SEO_PLUGINS = [
  { value: 'none', label: 'Nenhum' },
  { value: 'yoast', label: 'Yoast SEO' },
  { value: 'rankmath', label: 'Rank Math' },
  { value: 'aioseo', label: 'All in One SEO' },
];

export function WordPressSitesCard() {
  const { toast } = useToast();
  const { projects, createProject, updateProject, deleteProject } = useProjects();
  
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [newSiteUsername, setNewSiteUsername] = useState('');
  const [newSitePassword, setNewSitePassword] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

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
      // Extract domain from URL
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

  const handleTestConnection = async (projectId: string) => {
    setTestingId(projectId);
    const project = projects.find(p => p.id === projectId);
    
    if (!project?.wordpress_url || !project?.wordpress_username || !project?.wordpress_app_password) {
      toast({
        title: 'Dados incompletos',
        description: 'Configure a URL, usuário e senha do WordPress.',
        variant: 'destructive',
      });
      setTestingId(null);
      return;
    }

    try {
      // Test the WordPress REST API via edge function (avoids CORS)
      const { data, error } = await supabase.functions.invoke('test-wordpress-connection', {
        body: {
          wordpress_url: project.wordpress_url,
          wordpress_username: project.wordpress_username,
          wordpress_app_password: project.wordpress_app_password,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.success) {
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
      } else {
        // Build detailed error message with troubleshooting steps
        let errorTitle = 'Falha na conexão';
        let errorDescription = data?.error || 'Erro desconhecido';
        
        // Add hint if available
        if (data?.hint) {
          errorDescription += ` ${data.hint}`;
        }
        
        toast({
          title: errorTitle,
          description: errorDescription,
          variant: 'destructive',
        });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          Sites WordPress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Instructions */}
        <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm space-y-2">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Como conectar seu WordPress:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-blue-800 dark:text-blue-200">
                <li>Acesse o painel do WordPress: <strong>Usuários → Perfil</strong></li>
                <li>Role até "Senhas de Aplicação"</li>
                <li>Digite um nome (ex: "MAA") e clique em "Adicionar Nova Senha"</li>
                <li>Copie a senha gerada (ela só aparece uma vez!)</li>
                <li>Cole nossos campos abaixo junto com seu usuário e URL do site</li>
              </ol>
            </div>
          </div>
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
                  <span><strong>REST API ativa:</strong> Acesse <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">seusite.com/wp-json/</code> no navegador - deve retornar JSON</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-amber-600">2.</span>
                  <span><strong>Plugins de segurança:</strong> Wordfence, iThemes, etc. podem bloquear a API - adicione exceção ou desative temporariamente</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-amber-600">3.</span>
                  <span><strong>Senha de Aplicação:</strong> Certifique-se que criou em <em>Usuários → Perfil → Senhas de Aplicação</em> (não é a senha do login)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-amber-600">4.</span>
                  <span><strong>URL correta:</strong> Use a URL base do site (ex: https://meusite.com), sem <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">/wp-admin</code></span>
                </li>
              </ul>
            </div>
          </div>
        </div>

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
                    <h4 className="font-medium">{project.name}</h4>
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

        {/* Add New Site Form */}
        <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
          <Label className="text-sm font-medium uppercase text-muted-foreground">
            Novo Site
          </Label>
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
              className="bg-primary/5"
            />
            <Input
              type="password"
              placeholder="Senha de Aplicação"
              value={newSitePassword}
              onChange={(e) => setNewSitePassword(e.target.value)}
              className="bg-primary/5"
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
            Site
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
