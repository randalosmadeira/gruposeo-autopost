import { useState } from 'react';
import JSZip from 'jszip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Download,
  Plug,
  Settings,
  Webhook,
  FileText,
  Shield,
  Zap,
  CheckCircle,
  Code,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PLUGIN_VERSION = '2.4.0';
const PLUGIN_LAST_UPDATE = '2025-02-06';

const features = [
  {
    icon: Plug,
    title: 'Conexão Segura',
    description: 'API Key única com verificação automática de conexão entre WordPress e ContentFactory.',
  },
  {
    icon: FileText,
    title: 'Gestão de Artigos',
    description: 'Crie, edite e publique artigos com suporte a schemas HowTo, Review e FAQ.',
  },
  {
    icon: Webhook,
    title: 'Webhooks em Tempo Real',
    description: 'Receba notificações automáticas quando posts são criados, editados ou excluídos.',
  },
  {
    icon: Settings,
    title: 'Autor Padrão',
    description: 'Configure autor, categoria e status padrão para artigos publicados via API.',
  },
  {
    icon: Shield,
    title: 'SEO Completo + IA',
    description: 'Geração de SEO via IA: slug, meta description, tags e títulos virais automáticos.',
  },
  {
    icon: Zap,
    title: 'Deduplicação de Imagens',
    description: 'Sistema MD5 com filtro anti-logo que evita baixar ícones como featured image.',
  },
];

const installSteps = [
  { step: 1, title: 'Baixe o Plugin', description: 'Clique no botão "Baixar Plugin" acima para fazer o download do arquivo ZIP.' },
  { step: 2, title: 'Acesse o WordPress', description: 'No painel do WordPress, vá em Plugins → Adicionar Novo → Enviar Plugin.' },
  { step: 3, title: 'Faça Upload', description: 'Selecione o arquivo ZIP baixado e clique em "Instalar Agora".' },
  { step: 4, title: 'Ative o Plugin', description: 'Após a instalação, clique em "Ativar Plugin".' },
  { step: 5, title: 'Copie a API Key', description: 'Acesse ContentFactory no menu lateral e copie sua API Key.' },
  { step: 6, title: 'Configure o Projeto', description: 'No ContentFactory, vá em Configurações do projeto e cole a API Key.' },
];

export default function WordPressPluginPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  const handleDownload = async () => {
    setIsDownloading(true);
    
    try {
      const zip = new JSZip();
      const pluginFolder = zip.folder('contentfactory-rdm');
      
      if (!pluginFolder) {
        throw new Error('Erro ao criar pasta do plugin');
      }
      
      // Fetch all plugin files
      const files = [
        { path: 'contentfactory-rdm.php', url: '/wordpress-plugin/contentfactory-rdm/contentfactory-rdm.php' },
        { path: 'readme.txt', url: '/wordpress-plugin/contentfactory-rdm/readme.txt' },
        { path: 'includes/class-cfrdm-api.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-api.php' },
        { path: 'includes/class-cfrdm-webhooks.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-webhooks.php' },
        { path: 'includes/class-cfrdm-articles.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-articles.php' },
        { path: 'includes/class-cfrdm-admin.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-admin.php' },
        { path: 'includes/class-cfrdm-logger.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-logger.php' },
        { path: 'includes/class-cfrdm-image-optimizer.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-image-optimizer.php' },
        { path: 'includes/class-cfrdm-sync.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-sync.php' },
        { path: 'includes/class-cfrdm-internal-links.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-internal-links.php' },
        { path: 'includes/class-cfrdm-diagnostics.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-diagnostics.php' },
        { path: 'includes/class-cfrdm-diagnostics-page.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-diagnostics-page.php' },
        { path: 'includes/class-cfrdm-indexing.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-indexing.php' },
        { path: 'includes/class-cfrdm-schema-validator.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-schema-validator.php' },
        { path: 'includes/class-cfrdm-media.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-media.php' },
        { path: 'includes/class-cfrdm-seo.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-seo.php' },
        { path: 'includes/class-cfrdm-structured-logs.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-structured-logs.php' },
        { path: 'includes/class-cfrdm-ai-seo.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-ai-seo.php' },
        { path: 'includes/class-cfrdm-image-filter.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-image-filter.php' },
        { path: 'assets/css/admin.css', url: '/wordpress-plugin/contentfactory-rdm/assets/css/admin.css' },
        { path: 'assets/js/admin.js', url: '/wordpress-plugin/contentfactory-rdm/assets/js/admin.js' },
      ];
      
      // Fetch each file and add to zip
      const fetchPromises = files.map(async (file) => {
        const response = await fetch(file.url);
        if (!response.ok) {
          throw new Error(`Erro ao carregar ${file.path}`);
        }
        const content = await response.text();
        pluginFolder.file(file.path, content);
      });
      
      await Promise.all(fetchPromises);
      
      // Generate zip
      const blob = await zip.generateAsync({ type: 'blob' });
      
      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contentfactory-rdm-${PLUGIN_VERSION}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Download iniciado!',
        description: 'O arquivo ZIP do plugin está sendo baixado.',
      });
    } catch (error) {
      console.error('Erro ao gerar ZIP:', error);
      toast({
        title: 'Erro no download',
        description: 'Não foi possível gerar o arquivo ZIP do plugin.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    toast({
      title: 'Copiado!',
      description: `${label} copiado para a área de transferência.`,
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Plugin WordPress</h1>
          <p className="text-muted-foreground mt-1">
            Instale o plugin oficial para integrar seu WordPress com o ContentFactory
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col items-end gap-1">
            <Badge variant="secondary" className="text-sm px-3 py-1">
              v{PLUGIN_VERSION}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Atualizado em {new Date(PLUGIN_LAST_UPDATE).toLocaleDateString('pt-BR')}
            </span>
          </div>
          <Button onClick={handleDownload} size="lg" disabled={isDownloading}>
            {isDownloading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Gerando ZIP...
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                Baixar Plugin (.zip)
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <Card key={feature.title}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <CardTitle className="text-base">{feature.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="install" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="install">
            <Download className="w-4 h-4 mr-2" />
            Instalação
          </TabsTrigger>
          <TabsTrigger value="api">
            <Code className="w-4 h-4 mr-2" />
            API Reference
          </TabsTrigger>
          <TabsTrigger value="webhooks">
            <Webhook className="w-4 h-4 mr-2" />
            Webhooks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="install" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Guia de Instalação</CardTitle>
              <CardDescription>
                Siga os passos abaixo para instalar e configurar o plugin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {installSteps.map((item, index) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                      {item.step}
                    </div>
                    <div className="flex-1 pt-1">
                      <h4 className="font-medium">{item.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                      {index < installSteps.length - 1 && (
                        <div className="w-px h-8 bg-border ml-4 mt-3" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Endpoints da API</CardTitle>
              <CardDescription>
                REST API disponível após instalação do plugin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">GET</Badge>
                      <code className="text-sm font-mono">/wp-json/cfrdm/v1/health</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Verifica se o plugin está ativo</p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">GET</Badge>
                      <code className="text-sm font-mono">/wp-json/cfrdm/v1/test</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Testa a conexão com API Key</p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">GET</Badge>
                      <Badge variant="outline">POST</Badge>
                      <code className="text-sm font-mono">/wp-json/cfrdm/v1/articles</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Lista ou cria artigos</p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">GET</Badge>
                      <Badge variant="outline">PUT</Badge>
                      <Badge variant="outline">DELETE</Badge>
                      <code className="text-sm font-mono">/wp-json/cfrdm/v1/articles/{'{id}'}</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Operações em artigo específico</p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">GET</Badge>
                      <code className="text-sm font-mono">/wp-json/cfrdm/v1/categories</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Lista todas as categorias</p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">GET</Badge>
                      <code className="text-sm font-mono">/wp-json/cfrdm/v1/tags</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Lista todas as tags</p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">POST</Badge>
                      <code className="text-sm font-mono">/wp-json/cfrdm/v1/media</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Upload de imagem (base64)</p>
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Eventos de Webhook</CardTitle>
              <CardDescription>
                O plugin envia notificações para os seguintes eventos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <CheckCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">post_published</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Disparado quando um post é publicado
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Settings className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">post_updated</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Disparado quando um post publicado é atualizado
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">post_unpublished</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Disparado quando um post é despublicado
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <Shield className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <h4 className="font-medium">post_deleted</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Disparado quando um post é excluído permanentemente
                    </p>
                  </div>
                </div>

                <Separator className="my-6" />

                <div>
                  <h4 className="font-medium mb-3">Payload de Exemplo</h4>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre>{JSON.stringify({
                      event: "post_published",
                      timestamp: "2024-01-15T10:30:00Z",
                      site_url: "https://seusite.com.br",
                      data: {
                        post_id: 123,
                        post_title: "Título do Artigo",
                        post_url: "https://seusite.com.br/artigo",
                        post_status: "publish"
                      }
                    }, null, 2)}</pre>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
