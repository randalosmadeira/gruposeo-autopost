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
  History,
  Sparkles,
  Bug,
  Wrench,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PLUGIN_VERSION = '3.2.0';
const PLUGIN_LAST_UPDATE = '2026-02-10';

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
    icon: Shield,
    title: 'SEO Completo + IA',
    description: 'Geração de SEO via IA: slug, meta description, tags e títulos virais automáticos.',
  },
  {
    icon: Zap,
    title: 'Meta Auditor IA',
    description: 'Auditoria automática a cada 6h: verifica e corrige meta descriptions, OG tags e focus keywords.',
    isNew: true,
  },
  {
    icon: Webhook,
    title: 'IndexNow + Ping',
    description: 'Notificação instantânea ao Google, Bing e Yandex quando artigos são publicados ou atualizados.',
    isNew: true,
  },
  {
    icon: Settings,
    title: 'Descoberta por IA',
    description: 'Endpoints llms.txt + headers HTTP para ChatGPT, Claude e Gemini encontrarem seus artigos.',
    isNew: true,
  },
  {
    icon: FileText,
    title: 'Duplicador de Posts',
    description: 'Clone posts e páginas com um clique. Exclusão em massa de múltiplos posts selecionados.',
    isNew: true,
  },
  {
    icon: Zap,
    title: 'Sitemap Otimizado',
    description: 'Sitemap dinâmico com prioridades automáticas, News Sitemap e robots.txt para crawlers de IA.',
    isNew: true,
  },
  {
    icon: Shield,
    title: 'Atualização Segura',
    description: 'Pre-update checks, rollback automático e verificação de integridade pós-atualização.',
    isNew: true,
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

const changelog = [
  {
    version: '3.2.0',
    date: '2026-02-10',
    type: 'major' as const,
    changes: [
      { type: 'feature', text: 'Sistema de notificações automáticas no dashboard para artigos gerados por cron' },
      { type: 'feature', text: 'Monitoramento de portais com scraping HTML e RSS integrado' },
      { type: 'feature', text: 'Reescrita automática com score de originalidade (95%+)' },
      { type: 'feature', text: 'Painel de diagnóstico com reparo de tabelas via AJAX fallback' },
      { type: 'improvement', text: 'Integração em tempo real: portal monitoring → rewrite → publish → notify' },
      { type: 'improvement', text: 'Notificações com badge de não-lidas e link direto ao editor' },
      { type: 'improvement', text: 'Sincronização de WordPress Stats otimizada com upsert' },
    ],
  },
  {
    version: '3.1.0',
    date: '2026-02-09',
    type: 'major' as const,
    changes: [
      { type: 'feature', text: 'Auditor de Meta Descriptions com IA (cron automático a cada 6 horas)' },
      { type: 'feature', text: 'IndexNow: notificação instantânea ao Google/Bing/Yandex ao publicar' },
      { type: 'feature', text: 'llms.txt + headers AI-friendly para ChatGPT, Claude e Gemini' },
      { type: 'feature', text: 'Duplicador de Posts/Páginas com ação individual e em lote' },
      { type: 'feature', text: 'Exclusão em massa de posts selecionados' },
      { type: 'feature', text: 'News Sitemap para Google News' },
      { type: 'feature', text: 'Sitemap Optimizer com prioridades dinâmicas baseadas em data' },
      { type: 'feature', text: 'robots.txt otimizado para crawlers de IA (GPTBot, Claude-Web, etc.)' },
      { type: 'feature', text: 'Open Graph e Twitter Cards auto-preenchidos pela IA' },
      { type: 'improvement', text: 'Módulos conectados em tempo real: publicação → meta audit → IndexNow → llms.txt' },
      { type: 'improvement', text: 'Pre-update checks (PHP, WP, disco, DB) antes de atualizar' },
      { type: 'improvement', text: 'Rollback automático em caso de falha na atualização' },
      { type: 'improvement', text: 'Verificação de integridade pós-update com notificação à plataforma' },
    ],
  },
  {
    version: '3.0.2',
    date: '2026-02-08',
    type: 'patch' as const,
    changes: [
      { type: 'fix', text: 'CRÍTICO: Correção da ordem de registro de intervalos de cron durante ativação' },
      { type: 'fix', text: 'Prevenção de fatal errors em módulos v3.0 durante init' },
      { type: 'improvement', text: 'Fallback automático para intervalos nativos (every_6_hours → twicedaily)' },
      { type: 'improvement', text: 'Try-catch em inicialização de módulos para maior resiliência' },
    ],
  },
  {
    version: '3.0.1',
    date: '2026-02-08',
    type: 'patch' as const,
    changes: [
      { type: 'fix', text: 'Correção do botão "Reparar Tabelas" que retornava erro HTML' },
      { type: 'feature', text: 'Fallback AJAX para reparo de tabelas quando REST API falha' },
      { type: 'improvement', text: 'Melhor tratamento de erros com mensagens detalhadas' },
      { type: 'improvement', text: 'Feedback visual com animação de loading durante reparo' },
      { type: 'improvement', text: 'Botão de verificação/reparo sempre visível na página de diagnóstico' },
    ],
  },
  {
    version: '3.0.0',
    date: '2026-02-08',
    type: 'major' as const,
    changes: [
      { type: 'feature', text: 'Integração nativa com Google Search Console via OAuth 2.0' },
      { type: 'feature', text: 'Sistema de correção automática de erros 404 via IA com redirecionamentos 301' },
      { type: 'feature', text: 'Fila de correção inteligente (cfrdm_fix_queue) com priorização' },
      { type: 'feature', text: 'Sincronização com Ubersuggest para dados de SEO e prioridade' },
      { type: 'feature', text: 'HTTPS Enforcer para forçar URLs seguras automaticamente' },
      { type: 'feature', text: 'AI Content Enhancer para otimização automática de conteúdo' },
      { type: 'feature', text: 'Página de diagnóstico avançada com status de tabelas e cron jobs' },
      { type: 'improvement', text: 'Painel de configurações expandido com opções GSC e AI Auto-Fix' },
      { type: 'improvement', text: 'Intervalos de cron customizados (every_6_hours, weekly)' },
      { type: 'fix', text: 'Correção de intervalos de cron inválidos que causavam falha na ativação' },
    ],
  },
  {
    version: '2.6.2',
    date: '2026-02-08',
    type: 'minor' as const,
    changes: [
      { type: 'improvement', text: 'Paginação completa para buscar TODOS os artigos sem limite de 100' },
      { type: 'improvement', text: 'Análise básica automática quando créditos de IA esgotarem' },
      { type: 'fix', text: 'Sincronização agora processa sites com centenas de artigos' },
    ],
  },
  {
    version: '2.6.1',
    date: '2026-02-08',
    type: 'minor' as const,
    changes: [
      { type: 'fix', text: 'CRÍTICO: Corrigido registro de endpoints REST do Article Indexer para funcionar fora do contexto admin' },
      { type: 'fix', text: 'Endpoints /articles-for-indexing e /export-articles-batch agora respondem corretamente via API externa' },
      { type: 'improvement', text: 'Article Indexer é carregado nas dependências principais para suporte completo à REST API' },
    ],
  },
  {
    version: '2.6.0',
    date: '2026-02-08',
    type: 'major' as const,
    changes: [
      { type: 'feature', text: 'Verificação automática de saúde do plugin ao selecionar projeto' },
      { type: 'feature', text: 'Barra de status de qualidade de conexão com latência em tempo real' },
      { type: 'feature', text: 'Testes de conectividade integrados no painel de integrações' },
      { type: 'feature', text: 'Guia visual de instalação do plugin quando não detectado' },
      { type: 'feature', text: 'Fallback automático para REST API padrão quando plugin não instalado' },
      { type: 'improvement', text: 'Sistema de indexação automática com crawling periódico (2x/dia)' },
      { type: 'improvement', text: 'Endpoints REST para sincronização em batch de artigos' },
      { type: 'fix', text: 'Erros específicos do WordPress agora exibem mensagens claras' },
    ],
  },
  {
    version: '2.5.1',
    date: '2026-02-07',
    type: 'minor' as const,
    changes: [
      { type: 'feature', text: 'Sistema de linkagem interna inteligente com IA para sincronização automática de artigos WordPress' },
      { type: 'feature', text: 'Novo indexador de artigos com análise semântica e detecção de clusters temáticos' },
      { type: 'feature', text: 'Regras de linkagem automática por palavras-chave com priorização' },
      { type: 'improvement', text: 'Integração de links internos em todos os geradores de conteúdo (massa, notícias, landing pages)' },
    ],
  },
  {
    version: '2.5.0',
    date: '2026-02-06',
    type: 'major' as const,
    changes: [
      { type: 'feature', text: 'Novo sistema de fila de conteúdo com retry exponencial e backoff' },
      { type: 'feature', text: 'Social Auto-Poster com criptografia AES-256-CBC para credenciais' },
      { type: 'feature', text: 'Motor de mídia com conversão automática para WebP e deduplicação MD5' },
      { type: 'feature', text: 'Sistema de diagnóstico proativo com proteção contra conflitos de Page Builders' },
      { type: 'improvement', text: 'Utilitário de reparo de tabelas para restauração de estruturas de banco' },
    ],
  },
  {
    version: '2.4.0',
    date: '2026-01-28',
    type: 'minor' as const,
    changes: [
      { type: 'feature', text: 'Suporte a SEO via IA: geração automática de slug, meta description e tags' },
      { type: 'feature', text: 'Integração com Cron Scheduler interno com diagnóstico e histórico' },
      { type: 'improvement', text: 'Melhorias no sistema de logs estruturados' },
      { type: 'fix', text: 'Correção de compatibilidade com PHP 8.2+' },
    ],
  },
  {
    version: '2.3.0',
    date: '2026-01-15',
    type: 'minor' as const,
    changes: [
      { type: 'feature', text: 'Suporte a schemas HowTo, Review e FAQ no editor de artigos' },
      { type: 'feature', text: 'Sistema de internal linking automático' },
      { type: 'improvement', text: 'Otimização de imagens com compressão inteligente' },
      { type: 'fix', text: 'Correção de timeout em uploads de imagens grandes' },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-01-02',
    type: 'minor' as const,
    changes: [
      { type: 'feature', text: 'Validador de Schema JSON-LD integrado' },
      { type: 'feature', text: 'Sincronização bidirecional com ContentFactory' },
      { type: 'improvement', text: 'Interface administrativa redesenhada' },
    ],
  },
  {
    version: '2.1.0',
    date: '2025-12-18',
    type: 'minor' as const,
    changes: [
      { type: 'feature', text: 'Sistema de webhooks para eventos de publicação' },
      { type: 'improvement', text: 'Melhorias de performance no carregamento de artigos' },
      { type: 'fix', text: 'Correção de encoding UTF-8 em títulos especiais' },
    ],
  },
  {
    version: '2.0.0',
    date: '2025-12-01',
    type: 'major' as const,
    changes: [
      { type: 'feature', text: 'Nova arquitetura modular com classes separadas' },
      { type: 'feature', text: 'API REST completa para integração' },
      { type: 'feature', text: 'Sistema de autenticação via API Key' },
      { type: 'improvement', text: 'Reescrita completa do plugin para melhor manutenibilidade' },
    ],
  },
];

const getChangeTypeIcon = (type: string) => {
  switch (type) {
    case 'feature':
      return <Sparkles className="w-3.5 h-3.5 text-primary" />;
    case 'improvement':
      return <Wrench className="w-3.5 h-3.5 text-secondary-foreground" />;
    case 'fix':
      return <Bug className="w-3.5 h-3.5 text-destructive" />;
    default:
      return <CheckCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const getChangeTypeLabel = (type: string) => {
  switch (type) {
    case 'feature':
      return 'Novo';
    case 'improvement':
      return 'Melhoria';
    case 'fix':
      return 'Correção';
    default:
      return type;
  }
};

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
      
      // Fetch all plugin files (v3.1.0 includes all modules)
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
        { path: 'includes/class-cfrdm-social-poster.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-social-poster.php' },
        { path: 'includes/class-cfrdm-social-admin.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-social-admin.php' },
        { path: 'includes/class-cfrdm-cron-scheduler.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-cron-scheduler.php' },
        { path: 'includes/class-cfrdm-content-queue.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-content-queue.php' },
        { path: 'includes/class-cfrdm-article-indexer.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-article-indexer.php' },
        // v3.0.0
        { path: 'includes/class-cfrdm-gsc-integration.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-gsc-integration.php' },
        { path: 'includes/class-cfrdm-ai-auto-fix.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-ai-auto-fix.php' },
        { path: 'includes/class-cfrdm-ai-content-enhancer.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-ai-content-enhancer.php' },
        { path: 'includes/class-cfrdm-ubersuggest-sync.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-ubersuggest-sync.php' },
        { path: 'includes/class-cfrdm-https-enforcer.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-https-enforcer.php' },
        { path: 'includes/class-cfrdm-auto-update.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-auto-update.php' },
        // v3.1.0
        { path: 'includes/class-cfrdm-meta-auditor.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-meta-auditor.php' },
        { path: 'includes/class-cfrdm-indexnow.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-indexnow.php' },
        { path: 'includes/class-cfrdm-llms-txt.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-llms-txt.php' },
        { path: 'includes/class-cfrdm-post-duplicator.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-post-duplicator.php' },
        { path: 'includes/class-cfrdm-sitemap-optimizer.php', url: '/wordpress-plugin/contentfactory-rdm/includes/class-cfrdm-sitemap-optimizer.php' },
        // Assets
        { path: 'assets/css/admin.css', url: '/wordpress-plugin/contentfactory-rdm/assets/css/admin.css' },
        { path: 'assets/js/admin.js', url: '/wordpress-plugin/contentfactory-rdm/assets/js/admin.js' },
        // Version manifest
        { path: 'version.json', url: '/wordpress-plugin/contentfactory-rdm/version.json' },
      ];
      
      // Fetch each file and add to zip
      const fetchPromises = files.map(async (file) => {
        const url = `${file.url}?v=${encodeURIComponent(`${PLUGIN_VERSION}-${PLUGIN_LAST_UPDATE}`)}`;
        const response = await fetch(url, { cache: 'no-store' });
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
          <Card key={feature.title} className={(feature as any).isNew ? 'border-primary/30' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <CardTitle className="text-base">{feature.title}</CardTitle>
                {(feature as any).isNew && (
                  <Badge className="text-[10px] px-1.5 py-0">v3.1</Badge>
                )}
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="install">
            <Download className="w-4 h-4 mr-2" />
            Instalação
          </TabsTrigger>
          <TabsTrigger value="changelog">
            <History className="w-4 h-4 mr-2" />
            Changelog
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

        <TabsContent value="changelog" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Histórico de Versões
              </CardTitle>
              <CardDescription>
                Acompanhe as atualizações e melhorias do plugin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-6">
                  {changelog.map((release, idx) => (
                    <div key={release.version} className="relative">
                      {idx < changelog.length - 1 && (
                        <div className="absolute left-[11px] top-10 bottom-0 w-px bg-border" />
                      )}
                      <div className="flex items-start gap-4">
                        <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                          release.type === 'major' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          <span className="text-xs font-bold">
                            {release.version.split('.')[0]}
                          </span>
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-3">
                            <Badge variant={release.type === 'major' ? 'default' : 'secondary'}>
                              v{release.version}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(release.date).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </span>
                            {release.type === 'major' && (
                              <Badge variant="outline" className="text-xs">
                                Major Release
                              </Badge>
                            )}
                          </div>
                          <ul className="space-y-2">
                            {release.changes.map((change, changeIdx) => (
                              <li key={changeIdx} className="flex items-start gap-2 text-sm">
                                {getChangeTypeIcon(change.type)}
                                <span className="flex-1">{change.text}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
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
