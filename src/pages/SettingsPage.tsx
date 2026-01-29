import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Settings,
  User,
  Key,
  Globe,
  CheckCircle2,
  AlertCircle,
  Save,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/hooks/useProfile';
import { useSettings } from '@/hooks/useSettings';
import { useProjects } from '@/hooks/useProjects';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  const { user } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { settings, apiStatus, updateSettings } = useSettings();
  const { projects } = useProjects();
  
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [emailNotifications, setEmailNotifications] = useState(settings?.email_notifications ?? true);
  
  // API Keys state
  const [openaiKey, setOpenaiKey] = useState(settings?.openai_api_key || '');
  const [anthropicKey, setAnthropicKey] = useState(settings?.anthropic_api_key || '');
  const [serperKey, setSerperKey] = useState(settings?.serper_api_key || '');

  const toggleShowApiKey = (key: string) => {
    setShowApiKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveProfile = async () => {
    await updateProfile.mutateAsync({ full_name: fullName });
  };

  const handleSaveSettings = async () => {
    await updateSettings.mutateAsync({
      openai_api_key: openaiKey || null,
      anthropic_api_key: anthropicKey || null,
      serper_api_key: serperKey || null,
      email_notifications: emailNotifications,
    });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          Configurações
        </h1>
        <p className="text-muted-foreground">
          Gerencie suas preferências e integrações
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="profile" className="gap-2">
            <User className="w-4 h-4" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2">
            <Key className="w-4 h-4" />
            Chaves API
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Globe className="w-4 h-4" />
            Integrações
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Informações Pessoais</CardTitle>
              <CardDescription>
                Atualize suas informações de perfil
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Nome Completo</Label>
                  <Input 
                    value={fullName} 
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={user?.email || ''} disabled />
                  <p className="text-xs text-muted-foreground">
                    Entre em contato com o suporte para alterar seu email
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Notificações por Email</p>
                  <p className="text-sm text-muted-foreground">
                    Receber atualizações sobre artigos e publicações
                  </p>
                </div>
                <Switch 
                  checked={emailNotifications} 
                  onCheckedChange={setEmailNotifications}
                />
              </div>

              <Button 
                onClick={handleSaveProfile} 
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Alterações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="api" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>OpenAI API</CardTitle>
              <CardDescription>
                Configure sua chave de API para geração de conteúdo com GPT
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Badge className={apiStatus.openai ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}>
                  {apiStatus.openai ? (
                    <><CheckCircle2 className="w-3 h-3 mr-1" />Conectado</>
                  ) : (
                    <><AlertCircle className="w-3 h-3 mr-1" />Não Configurado</>
                  )}
                </Badge>
              </div>
              <div className="space-y-2">
                <Label>Chave API</Label>
                <div className="flex gap-2">
                  <Input
                    type={showApiKeys.openai ? 'text' : 'password'}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-proj-..."
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => toggleShowApiKey('openai')}
                  >
                    {showApiKeys.openai ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Anthropic (Claude)</CardTitle>
              <CardDescription>
                Opcional - Use Claude como alternativa ao GPT
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Badge className={apiStatus.anthropic ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}>
                  {apiStatus.anthropic ? (
                    <><CheckCircle2 className="w-3 h-3 mr-1" />Conectado</>
                  ) : (
                    <><AlertCircle className="w-3 h-3 mr-1" />Não Configurado</>
                  )}
                </Badge>
              </div>
              <div className="space-y-2">
                <Label>Chave API</Label>
                <div className="flex gap-2">
                  <Input
                    type={showApiKeys.anthropic ? 'text' : 'password'}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => toggleShowApiKey('anthropic')}
                  >
                    {showApiKeys.anthropic ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Serper (Pesquisa Web)</CardTitle>
              <CardDescription>
                API para pesquisa na internet e citação de fontes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Badge className={apiStatus.serper ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}>
                  {apiStatus.serper ? (
                    <><CheckCircle2 className="w-3 h-3 mr-1" />Conectado</>
                  ) : (
                    <><AlertCircle className="w-3 h-3 mr-1" />Não Configurado</>
                  )}
                </Badge>
              </div>
              <div className="space-y-2">
                <Label>Chave API</Label>
                <div className="flex gap-2">
                  <Input
                    type={showApiKeys.serper ? 'text' : 'password'}
                    value={serperKey}
                    onChange={(e) => setSerperKey(e.target.value)}
                    placeholder="Sua chave Serper"
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => toggleShowApiKey('serper')}
                  >
                    {showApiKeys.serper ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button 
            onClick={handleSaveSettings} 
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar Alterações
          </Button>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle>Integrações WordPress</CardTitle>
              <CardDescription>
                Sites conectados para publicação automática
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {projects.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum projeto criado ainda. Crie um projeto para configurar integrações.
                </p>
              ) : (
                projects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                        <Globe className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{project.name}</p>
                        <p className="text-sm text-muted-foreground">{project.domain}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          project.is_connected
                            ? 'bg-success/10 text-success'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {project.is_connected ? 'Conectado' : 'Desconectado'}
                      </Badge>
                      <Button variant="outline" size="sm">
                        {project.is_connected ? 'Configurar' : 'Conectar'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
