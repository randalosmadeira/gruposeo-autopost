import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  FileText,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ArrowRight,
  Info,
  Wand2,
  Play,
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
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { ToneVoiceConfig, AIModelSelector, ContentStructureConfig } from '@/components/shared';

// Types
interface ArticleRow {
  id: string;
  keyword: string;
  title: string;
  size: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  articleId?: string;
  error?: string;
}

const articleSizes = [
  { value: 'short', label: 'Curto (~750)' },
  { value: 'medium', label: 'Médio (~1.500)' },
  { value: 'long', label: 'Longo (~2.500)' },
  { value: 'very-long', label: 'Muito Longo (~4.000)' },
];

export default function BulkArticleGenerator() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [articles, setArticles] = useState<ArticleRow[]>(() => {
    // Initialize with 30 empty rows
    return Array.from({ length: 30 }, (_, i) => ({
      id: crypto.randomUUID(),
      keyword: '',
      title: '',
      size: 'medium',
      status: 'pending' as const,
    }));
  });
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [defaultSize, setDefaultSize] = useState('medium');
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
  const completedCount = articles.filter(a => a.status === 'completed').length;
  const errorCount = articles.filter(a => a.status === 'error').length;
  
  // Calculate estimated time and credits (1 credit per article, ~2min per article)
  const estimatedCredits = totalCount;
  const estimatedTime = totalCount > 0 ? `${Math.ceil(totalCount * 2 / 60)}h` : '0';

  // Update a single article row
  const updateArticle = useCallback((id: string, field: keyof ArticleRow, value: string) => {
    setArticles(prev => prev.map(a => 
      a.id === id ? { ...a, [field]: value } : a
    ));
  }, []);

  // Add more rows
  const addRows = useCallback((count: number = 10) => {
    setArticles(prev => [
      ...prev,
      ...Array.from({ length: count }, () => ({
        id: crypto.randomUUID(),
        keyword: '',
        title: '',
        size: defaultSize,
        status: 'pending' as const,
      })),
    ]);
  }, [defaultSize]);

  // Remove empty rows at the end
  const removeRow = useCallback((id: string) => {
    setArticles(prev => prev.filter(a => a.id !== id));
  }, []);

  // Apply size to all
  const applyDefaultSize = useCallback((size: string) => {
    setDefaultSize(size);
    setArticles(prev => prev.map(a => ({ ...a, size })));
  }, []);

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
    
    // Simulate title generation
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setArticles(prev => prev.map(a => {
      if (a.keyword.trim() && !a.title.trim()) {
        return { ...a, title: `${a.keyword}: Guia Completo ${new Date().getFullYear()}` };
      }
      return a;
    }));
    
    setGeneratingTitles(false);
    setShowTitlesDialog(false);
    
    toast({
      title: 'Títulos gerados!',
      description: `${articlesWithKeywords.length} títulos foram gerados com sucesso.`,
    });
  }, [articles, toast]);

  // Handle paste for bulk input
  const handlePaste = useCallback((e: React.ClipboardEvent, startIndex: number) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    
    if (lines.length > 1) {
      e.preventDefault();
      
      setArticles(prev => {
        const newArticles = [...prev];
        lines.forEach((line, i) => {
          const targetIndex = startIndex + i;
          if (targetIndex < newArticles.length) {
            // Check if line contains separator (tab or comma)
            const parts = line.split(/[\t,]/).map(p => p.trim());
            newArticles[targetIndex] = {
              ...newArticles[targetIndex],
              keyword: parts[0] || '',
              title: parts[1] || '',
            };
          } else {
            newArticles.push({
              id: crypto.randomUUID(),
              keyword: line,
              title: '',
              size: defaultSize,
              status: 'pending',
            });
          }
        });
        return newArticles;
      });
      
      toast({
        title: `${lines.length} linhas coladas`,
        description: 'As palavras-chave foram distribuídas nas linhas.',
      });
    }
  }, [defaultSize, toast]);

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
          <Badge className="gap-1 bg-green-100 text-green-700 hover:bg-green-100">
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

            {/* Stats Cards */}
            <div className="flex items-center gap-3">
              <Card className="border shadow-sm">
                <CardContent className="px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Total de artigos</p>
                  <p className="text-2xl font-bold text-foreground">{totalCount}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Créditos estimados</p>
                  <p className="text-2xl font-bold text-foreground">{estimatedCredits}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Tempo estimado</p>
                  <p className="text-2xl font-bold text-foreground">{estimatedTime}</p>
                </CardContent>
              </Card>
            </div>
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

        {/* Action Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Lista de Artigos</h2>
                <p className="text-sm text-muted-foreground">
                  Configure palavra-chave, título e tamanho para cada artigo
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={() => addRows(10)} 
                  variant="outline" 
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar
                </Button>
                <Button 
                  onClick={() => setShowTitlesDialog(true)}
                  variant="outline" 
                  className="gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  Gerar Títulos
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="mb-6">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-14 text-center">#</TableHead>
                  <TableHead className="w-[30%]">Palavra-chave</TableHead>
                  <TableHead className="w-[35%]">Título</TableHead>
                  <TableHead className="w-[15%]">Tamanho</TableHead>
                  <TableHead className="w-[10%] text-center">Status</TableHead>
                  <TableHead className="w-14"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.map((article, index) => (
                  <TableRow key={article.id}>
                    <TableCell className="text-center font-medium text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Ex: marketing digital"
                        value={article.keyword}
                        onChange={(e) => updateArticle(article.id, 'keyword', e.target.value)}
                        onPaste={(e) => handlePaste(e, index)}
                        disabled={article.status === 'generating' || article.status === 'completed'}
                        className="h-9"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Ex: Guia Completo de Marketing Digital"
                          value={article.title}
                          onChange={(e) => updateArticle(article.id, 'title', e.target.value)}
                          disabled={article.status === 'generating' || article.status === 'completed'}
                          className="h-9"
                        />
                        {!article.title && article.keyword && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => updateArticle(article.id, 'title', `${article.keyword}: Guia Completo`)}
                          >
                            <Wand2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={article.size}
                        onValueChange={(v) => updateArticle(article.id, 'size', v)}
                        disabled={article.status === 'generating' || article.status === 'completed'}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {articleSizes.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(article.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {article.keyword.trim() && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => {
                              setPreviewArticle(article);
                              setShowPreviewDialog(true);
                            }}
                            title="Preview do Prompt"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {article.status === 'pending' && !article.keyword && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeRow(article.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>

        {/* Apply size to all */}
        <Card className="mb-6">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Aplicar tamanho a todos:</span>
              <Select value={defaultSize} onValueChange={applyDefaultSize}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Selecionar tamanho padrão" />
                </SelectTrigger>
                <SelectContent>
                  {articleSizes.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tip */}
        <Card className="mb-6 bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center gap-3">
            <Info className="w-5 h-5 text-primary shrink-0" />
            <p className="text-sm text-muted-foreground">
              <strong>Dica:</strong> Cole múltiplas linhas usando Ctrl+V para adicionar vários artigos de uma vez.
            </p>
          </CardContent>
        </Card>

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
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 gap-1">
                      <Sparkles className="w-3 h-3" />
                      Otimização SEO
                    </Badge>
                  )}
                  {globalConfig.humanizeContent && (
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 gap-1">
                      <Bot className="w-3 h-3" />
                      Humanizar Conteúdo
                    </Badge>
                  )}
                  {globalConfig.internalLinking && (
                    <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 gap-1">
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
