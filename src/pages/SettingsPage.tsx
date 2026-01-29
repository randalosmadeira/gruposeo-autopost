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

export default function SettingsPage() {
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const toggleShowApiKey = (key: string) => {
    setShowApiKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
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
                  <Input defaultValue="Rândalos Dias Madeira" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input defaultValue="gestor@gruposeomkt.com.br" disabled />
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
                <Switch defaultChecked />
              </div>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
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
                <Badge className="bg-success/10 text-success">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Conectado
                </Badge>
              </div>
              <div className="space-y-2">
                <Label>Chave API</Label>
                <div className="flex gap-2">
                  <Input
                    type={showApiKeys.openai ? 'text' : 'password'}
                    defaultValue="sk-proj-xxxxxxxxxxxxxxxxxxxx"
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
                <Badge className="bg-muted text-muted-foreground">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Não Configurado
                </Badge>
              </div>
              <div className="space-y-2">
                <Label>Chave API</Label>
                <div className="flex gap-2">
                  <Input
                    type={showApiKeys.anthropic ? 'text' : 'password'}
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
                <Badge className="bg-success/10 text-success">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Conectado
                </Badge>
              </div>
              <div className="space-y-2">
                <Label>Chave API</Label>
                <div className="flex gap-2">
                  <Input
                    type={showApiKeys.serper ? 'text' : 'password'}
                    defaultValue="xxxxxxxxxxxxxxxxxx"
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

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
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
              {[
                { name: 'RDM Advogados', domain: 'rdmadvogados.com.br', connected: true },
                { name: 'Grupo SEO Marketing', domain: 'gruposeomkt.com.br', connected: true },
                { name: 'Portal Jurídico', domain: 'portaljuridico.com.br', connected: false },
              ].map((site) => (
                <div
                  key={site.domain}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                      <Globe className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{site.name}</p>
                      <p className="text-sm text-muted-foreground">{site.domain}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        site.connected
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {site.connected ? 'Conectado' : 'Desconectado'}
                    </Badge>
                    <Button variant="outline" size="sm">
                      {site.connected ? 'Configurar' : 'Conectar'}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}