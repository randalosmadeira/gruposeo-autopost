import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ArrowRight,
  Settings,
  Eye,
  ListChecks,
  TableIcon,
  HelpCircle,
  FileCheck,
  Bot,
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ToneVoiceConfig, AIModelSelector, ContentStructureConfig, ArticleListManager } from '@/components/shared';
import { BulkGenerationHistory } from '@/components/bulk-generator';
import type { ArticleItem } from '@/components/shared/ArticleListManager';

// Extended article type for generation tracking
interface ArticleRow extends ArticleItem {
  articleId?: string;
  error?: string;
}

const articleSizes = [
  { value: 'muito_pequeno', label: 'Muito Pequeno (600-1200 palavras)' },
  { value: 'pequeno', label: 'Pequeno (1200-2400 palavras)' },
  { value: 'medio', label: 'Médio (2400-3600 palavras)' },
  { value: 'grande', label: 'Grande (2600-5200 palavras)' },
];

export default function BulkArticleGenerator() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTitlesDialog, setShowTitlesDialog] = useState(false);
  const [generatingTitles, setGeneratingTitles] = useState(false);

  // Global configuration for all articles
  const [globalConfig, setGlobalConfig] = useState({
    tone: 'profissional',
    customTone: '',
    pointOfView: 'terceira-singular',
    language: 'pt-BR',
    aiModel: 'standard',
    // Content structure options (using same naming as ContentStructureConfig)
    metaDescription: true,
    lists: true,
    tables: false,
    conclusion: true,
    faq: true,
    internalLinking: false,
    projectId: '',
    // SEO options
    seoOptimization: true,
    humanizeContent: false,
    // AI Auto Optimization - analyzes all keywords and improves content automatically
    aiAutoOptimization: true,
  });

  // Projects for internal linking
  const { projects } = useProjects();
  const connectedProjects = projects.filter(p => p.is_connected);

  // Preview dialog state
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewArticle, setPreviewArticle] = useState<ArticleRow | null>(null);

  // Stats
  const filledArticles = articles.filter(a => a.keyword.trim());
  const totalCount = filledArticles.length;

  // Generate titles for all keywords
  const handleGenerateTitles = useCallback(async () => {
    const articlesWithKeywords = articles.filter(a => a.keyword.trim() && !a.title.trim());
    
    if (articlesWithKeywords.length === 0) {
      toast({
        title: 'Nenhum título para gerar',
        description: 'Adicione palavras-chave primeiro ou todos já possuem título.',
      });
      return;
    }

    setGeneratingTitles(true);
    
    try {
      // Generate titles via AI for each keyword
      const updatedArticles = [...articles];
      for (const article of articlesWithKeywords) {
        try {
          const { data, error } = await supabase.functions.invoke('ai-api', {
            body: { action: 'generate-title', prompt: article.keyword },
          });
          if (!error && data?.titles?.length > 0) {
            const idx = updatedArticles.findIndex(a => a.keyword === article.keyword && !a.title.trim());
            if (idx !== -1) {
              updatedArticles[idx] = { ...updatedArticles[idx], title: data.titles[0] };
            }
          }
        } catch (err) {
          console.error(`Erro ao gerar título para "${article.keyword}":`, err);
        }
      }
      
      setArticles(updatedArticles);
    } catch (err) {
      console.error('Erro ao gerar títulos:', err);
    }
    
    setGeneratingTitles(false);
    setShowTitlesDialog(false);
    
    toast({
      title: 'Títulos gerados com IA!',
      description: `${articlesWithKeywords.length} títulos foram gerados com sucesso.`,
    });
  }, [articles, toast]);

  // Start generation
  const handleStartGeneration = useCallback(async () => {
    const toGenerate = filledArticles.filter(a => a.status === 'pending');
    
    if (toGenerate.length === 0) {
      toast({
        title: 'Nenhum artigo para gerar',
        description: 'Adicione palavras-chave primeiro.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    
    for (const article of toGenerate) {
      // Update status to generating
      setArticles(prev => prev.map(a => 
        a.id === article.id ? { ...a, status: 'generating' } : a
      ));

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        // Create article with full config
        const { data: createdArticle, error: createError } = await supabase
          .from('articles')
          .insert({
            user_id: session.user.id,
            keyword: article.keyword,
            title: article.title || `${article.keyword}: Guia Completo ${new Date().getFullYear()}`,
            status: 'generating',
            type: 'blog',
            config: { 
              size: article.size, 
              bulkGenerated: true,
              ...globalConfig,
            },
          })
          .select('id')
          .single();

        if (createError) throw createError;

        // Call generation function with full globalConfig including tone/voice
        const { error } = await supabase.functions.invoke('generate-article', {
          body: {
            config: {
              keyword: article.keyword,
              title: article.title || `${article.keyword}: Guia Completo ${new Date().getFullYear()}`,
              wordCount: article.size,
              type: 'blog',
              // Tone and voice settings from globalConfig
              tone: globalConfig.tone === 'custom' ? globalConfig.customTone : globalConfig.tone,
              pointOfView: globalConfig.pointOfView,
              language: globalConfig.language,
              // Content structure from globalConfig
              seoOptimization: globalConfig.seoOptimization,
              includeFaq: globalConfig.faq,
              faqCount: 5,
              includeTable: globalConfig.tables,
              includeList: globalConfig.lists,
              includeConclusion: globalConfig.conclusion,
              includeMetaDescription: globalConfig.metaDescription,
              humanizeContent: globalConfig.humanizeContent,
              secondaryKeywords: '',
            },
          },
        });

        if (error) throw error;

        setArticles(prev => prev.map(a => 
          a.id === article.id 
            ? { ...a, status: 'completed', articleId: createdArticle.id }
            : a
        ));
      } catch (error) {
        setArticles(prev => prev.map(a => 
          a.id === article.id 
            ? { ...a, status: 'error', error: error instanceof Error ? error.message : 'Erro' }
            : a
        ));
      }

      // Small delay between generations
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setIsGenerating(false);
    toast({
      title: 'Geração concluída!',
      description: `${toGenerate.length} artigos foram processados.`,
    });
  }, [filledArticles, globalConfig, toast]);

  const getStatusBadge = (status: ArticleRow['status']) => {
    switch (status) {
      case 'generating':
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Gerando...
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="gap-1 bg-success/10 text-success hover:bg-success/10">
            <CheckCircle2 className="w-3 h-3" />
            Pronto
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="w-3 h-3" />
            Erro
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header Card */}
      <div className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Title Section */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Criar Artigos Informativos
                </h1>
                <p className="text-sm text-muted-foreground">
                  Configure múltiplos artigos com estrutura completa, voz consistente e publicação automatizada.
                </p>
              </div>
            </div>

            {/* Stats are now shown in ArticleListManager */}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Global Configuration Section */}
        <Accordion type="single" collapsible className="space-y-4">
          <AccordionItem value="global-config" className="border rounded-lg bg-background">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-primary" />
                <div className="text-left">
                  <h3 className="font-semibold">Configurações Globais</h3>
                  <p className="text-sm text-muted-foreground">
                    Defina tom de voz, ponto de vista e modelo de IA para todos os artigos
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6 space-y-6">
              {/* Tom de Voz e Estilo */}
              <ToneVoiceConfig
                tone={globalConfig.tone}
                onToneChange={(v) => setGlobalConfig(prev => ({ ...prev, tone: v }))}
                customTone={globalConfig.customTone}
                onCustomToneChange={(v) => setGlobalConfig(prev => ({ ...prev, customTone: v }))}
                pointOfView={globalConfig.pointOfView}
                onPointOfViewChange={(v) => setGlobalConfig(prev => ({ ...prev, pointOfView: v }))}
                language={globalConfig.language}
                onLanguageChange={(v) => setGlobalConfig(prev => ({ ...prev, language: v }))}
              />

              {/* Content Structure */}
              <ContentStructureConfig
                metaDescription={globalConfig.metaDescription}
                onMetaDescriptionChange={(v) => setGlobalConfig(prev => ({ ...prev, metaDescription: v }))}
                lists={globalConfig.lists}
                onListsChange={(v) => setGlobalConfig(prev => ({ ...prev, lists: v }))}
                tables={globalConfig.tables}
                onTablesChange={(v) => setGlobalConfig(prev => ({ ...prev, tables: v }))}
                conclusion={globalConfig.conclusion}
                onConclusionChange={(v) => setGlobalConfig(prev => ({ ...prev, conclusion: v }))}
                faq={globalConfig.faq}
                onFaqChange={(v) => setGlobalConfig(prev => ({ ...prev, faq: v }))}
                internalLinking={globalConfig.internalLinking}
                onInternalLinkingChange={(v) => setGlobalConfig(prev => ({ ...prev, internalLinking: v }))}
                projectId={globalConfig.projectId}
                onProjectIdChange={(v) => setGlobalConfig(prev => ({ ...prev, projectId: v }))}
                connectedProjects={connectedProjects}
              />

              {/* AI Model */}
              <AIModelSelector
                value={globalConfig.aiModel}
                onChange={(v) => setGlobalConfig(prev => ({ ...prev, aiModel: v }))}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Article List Manager - Replaces manual table */}
        <ArticleListManager
          items={articles.map(a => ({
            id: a.id,
            keyword: a.keyword,
            title: a.title,
            size: a.size,
            status: a.status,
          }))}
          onItemsChange={(newItems) => {
            setArticles(prev => {
              // Merge with existing articles to preserve articleId and error
              const merged = newItems.map(item => {
                const existing = prev.find(a => a.id === item.id);
                return {
                  ...item,
                  articleId: existing?.articleId,
                  error: existing?.error,
                };
              });
              return merged;
            });
          }}
          onGenerateTitles={handleGenerateTitles}
          isGeneratingTitles={generatingTitles}
          type="blog"
          accentColor="#4169E1"
        />

        {/* Footer Action */}
        <div className="flex justify-center">
          <Button 
            size="lg"
            className="gap-2 px-8"
            onClick={handleStartGeneration}
            disabled={totalCount === 0 || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                Próxima etapa
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>

        {/* Bulk Generation History */}
        <BulkGenerationHistory />
      </div>

      {/* Generate Titles Dialog */}
      <Dialog open={showTitlesDialog} onOpenChange={setShowTitlesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar Títulos com IA</DialogTitle>
            <DialogDescription>
              Gerar títulos automaticamente para todas as palavras-chave que ainda não possuem título.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm">
              <strong>{articles.filter(a => a.keyword.trim() && !a.title.trim()).length}</strong> artigos 
              receberão títulos gerados automaticamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTitlesDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleGenerateTitles} disabled={generatingTitles} className="gap-2">
              {generatingTitles ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Gerar Títulos
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Prompt Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              Preview do Prompt
            </DialogTitle>
            <DialogDescription>
              Prévia do que será enviado para a IA para gerar o artigo.
            </DialogDescription>
          </DialogHeader>
          {previewArticle && (
            <div className="space-y-4 py-4">
              {/* Article Info */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground">Informações do Artigo</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Palavra-chave:</span>
                    <p className="font-medium">{previewArticle.keyword}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Título:</span>
                    <p className="font-medium">{previewArticle.title || `${previewArticle.keyword}: Guia Completo`}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tamanho:</span>
                    <p className="font-medium">{articleSizes.find(s => s.value === previewArticle.size)?.label || previewArticle.size}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tipo:</span>
                    <p className="font-medium">Blog Informativo</p>
                  </div>
                </div>
              </div>

              {/* Tone & Voice */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground">Tom de Voz & Estilo</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Tom:</span>
                    <p className="font-medium capitalize">{globalConfig.tone === 'custom' ? globalConfig.customTone : globalConfig.tone}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ponto de Vista:</span>
                    <p className="font-medium">{globalConfig.pointOfView}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Idioma:</span>
                    <p className="font-medium">{globalConfig.language}</p>
                  </div>
                </div>
              </div>

              {/* Content Structure */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground">Estrutura do Conteúdo</h4>
                <div className="flex flex-wrap gap-2">
                  {globalConfig.metaDescription && (
                    <Badge variant="secondary" className="gap-1">
                      <FileCheck className="w-3 h-3" />
                      Meta Descrição
                    </Badge>
                  )}
                  {globalConfig.lists && (
                    <Badge variant="secondary" className="gap-1">
                      <ListChecks className="w-3 h-3" />
                      Listas
                    </Badge>
                  )}
                  {globalConfig.tables && (
                    <Badge variant="secondary" className="gap-1">
                      <TableIcon className="w-3 h-3" />
                      Tabelas
                    </Badge>
                  )}
                  {globalConfig.conclusion && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Conclusão
                    </Badge>
                  )}
                  {globalConfig.faq && (
                    <Badge variant="secondary" className="gap-1">
                      <HelpCircle className="w-3 h-3" />
                      FAQ
                    </Badge>
                  )}
                </div>
              </div>

              {/* SEO Options */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground">Opções SEO</h4>
                <div className="flex flex-wrap gap-2">
                  {globalConfig.seoOptimization && (
                    <Badge className="bg-success/10 text-success gap-1">
                      <Sparkles className="w-3 h-3" />
                      Otimização SEO
                    </Badge>
                  )}
                  {globalConfig.humanizeContent && (
                    <Badge className="bg-primary/10 text-primary gap-1">
                      <Bot className="w-3 h-3" />
                      Humanizar Conteúdo
                    </Badge>
                  )}
                  {globalConfig.internalLinking && (
                    <Badge className="bg-accent/10 text-accent gap-1">
                      <ArrowRight className="w-3 h-3" />
                      Linkagem Interna
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
