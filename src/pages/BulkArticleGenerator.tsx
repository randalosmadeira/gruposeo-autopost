import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Layers,
  Plus,
  Trash2,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Settings,
  Upload,
  Eye,
  Copy,
  RefreshCw,
  Sparkles,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// Types
interface ArticleVariation {
  id: string;
  keyword: string;
  title: string;
  customData: Record<string, string>;
  status: 'pending' | 'generating' | 'completed' | 'error';
  articleId?: string;
  error?: string;
  progress?: number;
}

interface TemplateConfig {
  tone: string;
  pointOfView: string;
  size: string;
  language: string;
  projectId: string;
  category: string;
  includeFaq: boolean;
  includeTables: boolean;
  includeLists: boolean;
  includeConclusion: boolean;
  autoPublish: boolean;
  publishStatus: 'draft' | 'publish';
}

type GenerationStatus = 'idle' | 'running' | 'paused' | 'completed';

const tones = [
  { value: 'profissional', label: 'Profissional' },
  { value: 'casual', label: 'Casual' },
  { value: 'academico', label: 'Acadêmico' },
  { value: 'persuasivo', label: 'Persuasivo' },
  { value: 'educativo', label: 'Educativo' },
];

const pointsOfView = [
  { value: 'terceira', label: 'Terceira Pessoa' },
  { value: 'primeira', label: 'Primeira Pessoa' },
  { value: 'segunda', label: 'Segunda Pessoa' },
];

const articleSizes = [
  { value: 'short', label: 'Curto (~750 palavras)' },
  { value: 'medium', label: 'Médio (~1.500 palavras)' },
  { value: 'long', label: 'Longo (~2.500 palavras)' },
  { value: 'very-long', label: 'Muito Longo (~4.000 palavras)' },
];

const defaultTemplate: TemplateConfig = {
  tone: 'profissional',
  pointOfView: 'segunda',
  size: 'medium',
  language: 'pt-BR',
  projectId: '',
  category: '',
  includeFaq: true,
  includeTables: false,
  includeLists: true,
  includeConclusion: true,
  autoPublish: false,
  publishStatus: 'draft',
};

export default function BulkArticleGenerator() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { projects } = useProjects();
  
  const [template, setTemplate] = useState<TemplateConfig>(defaultTemplate);
  const [variations, setVariations] = useState<ArticleVariation[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [bulkKeywords, setBulkKeywords] = useState('');
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const connectedProjects = projects.filter(p => p.is_connected);

  // Stats
  const totalCount = variations.length;
  const completedCount = variations.filter(v => v.status === 'completed').length;
  const errorCount = variations.filter(v => v.status === 'error').length;
  const pendingCount = variations.filter(v => v.status === 'pending').length;
  const overallProgress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Add single variation
  const addVariation = useCallback(() => {
    if (!newKeyword.trim()) {
      toast({
        title: 'Palavra-chave obrigatória',
        description: 'Digite uma palavra-chave para adicionar.',
        variant: 'destructive',
      });
      return;
    }

    const newVariation: ArticleVariation = {
      id: crypto.randomUUID(),
      keyword: newKeyword.trim(),
      title: newTitle.trim() || `${newKeyword.trim()}: Guia Completo`,
      customData: {},
      status: 'pending',
    };

    setVariations(prev => [...prev, newVariation]);
    setNewKeyword('');
    setNewTitle('');
    
    toast({
      title: 'Variação adicionada',
      description: `"${newVariation.keyword}" foi adicionada à lista.`,
    });
  }, [newKeyword, newTitle, toast]);

  // Add multiple variations from bulk input
  const addBulkVariations = useCallback(() => {
    const keywords = bulkKeywords
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (keywords.length === 0) {
      toast({
        title: 'Nenhuma palavra-chave',
        description: 'Digite pelo menos uma palavra-chave.',
        variant: 'destructive',
      });
      return;
    }

    const newVariations: ArticleVariation[] = keywords.map(keyword => ({
      id: crypto.randomUUID(),
      keyword,
      title: `${keyword}: Guia Completo`,
      customData: {},
      status: 'pending',
    }));

    setVariations(prev => [...prev, ...newVariations]);
    setBulkKeywords('');
    setShowBulkDialog(false);
    
    toast({
      title: `${newVariations.length} variações adicionadas`,
      description: 'As palavras-chave foram adicionadas à lista.',
    });
  }, [bulkKeywords, toast]);

  // Remove variation
  const removeVariation = useCallback((id: string) => {
    setVariations(prev => prev.filter(v => v.id !== id));
  }, []);

  // Duplicate variation
  const duplicateVariation = useCallback((variation: ArticleVariation) => {
    const newVariation: ArticleVariation = {
      ...variation,
      id: crypto.randomUUID(),
      status: 'pending',
      articleId: undefined,
      error: undefined,
    };
    setVariations(prev => [...prev, newVariation]);
  }, []);

  // Clear all
  const clearAll = useCallback(() => {
    setVariations([]);
    setGenerationStatus('idle');
    setCurrentIndex(0);
  }, []);

  // Generate single article
  const generateArticle = async (variation: ArticleVariation): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('Usuário não autenticado');
      }

      // Create article record
      const { data: article, error: createError } = await supabase
        .from('articles')
        .insert({
          user_id: session.user.id,
          keyword: variation.keyword,
          title: variation.title,
          status: 'generating',
          type: 'blog',
          project_id: template.projectId || null,
          config: {
            tone: template.tone,
            pointOfView: template.pointOfView,
            size: template.size,
            language: template.language,
            includeFaq: template.includeFaq,
            includeTables: template.includeTables,
            includeLists: template.includeLists,
            includeConclusion: template.includeConclusion,
            bulkGenerated: true,
          },
        })
        .select('id')
        .single();

      if (createError) throw createError;

      // Call generation function
      const { data, error } = await supabase.functions.invoke('generate-article', {
        body: {
          articleId: article.id,
          keyword: variation.keyword,
          title: variation.title,
          wordCount: template.size,
          tone: template.tone,
          pointOfView: template.pointOfView,
          language: template.language,
          type: 'blog',
          includeFaq: template.includeFaq,
          includeTable: template.includeTables,
          includeList: template.includeLists,
          includeConclusion: template.includeConclusion,
        },
      });

      if (error) throw error;

      // Update variation with article ID
      setVariations(prev => prev.map(v => 
        v.id === variation.id 
          ? { ...v, status: 'completed', articleId: article.id }
          : v
      ));

      return true;
    } catch (error) {
      console.error('Generation error:', error);
      setVariations(prev => prev.map(v => 
        v.id === variation.id 
          ? { ...v, status: 'error', error: error instanceof Error ? error.message : 'Erro desconhecido' }
          : v
      ));
      return false;
    }
  };

  // Start generation
  const startGeneration = useCallback(async () => {
    const pendingVariations = variations.filter(v => v.status === 'pending');
    
    if (pendingVariations.length === 0) {
      toast({
        title: 'Nenhum artigo pendente',
        description: 'Adicione variações para gerar.',
        variant: 'destructive',
      });
      return;
    }

    setGenerationStatus('running');
    
    for (let i = 0; i < pendingVariations.length; i++) {
      const variation = pendingVariations[i];
      setCurrentIndex(i);
      
      // Update status to generating
      setVariations(prev => prev.map(v => 
        v.id === variation.id ? { ...v, status: 'generating' } : v
      ));

      await generateArticle(variation);
      
      // Small delay between generations to avoid rate limiting
      if (i < pendingVariations.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    setGenerationStatus('completed');
    toast({
      title: 'Geração concluída!',
      description: `${completedCount + pendingVariations.length} artigos foram gerados.`,
    });
  }, [variations, toast, completedCount]);

  // Retry failed
  const retryFailed = useCallback(() => {
    setVariations(prev => prev.map(v => 
      v.status === 'error' ? { ...v, status: 'pending', error: undefined } : v
    ));
    toast({
      title: 'Artigos com erro marcados para reprocessar',
      description: 'Clique em "Iniciar Geração" para tentar novamente.',
    });
  }, [toast]);

  const updateTemplate = <K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) => {
    setTemplate(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate('/articles/new')}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Campanha de Artigos em Massa</h1>
                <p className="text-sm text-muted-foreground">
                  Gere múltiplos artigos com variações de um template base
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {generationStatus === 'idle' && variations.length > 0 && (
              <Button onClick={startGeneration} className="gap-2">
                <Play className="w-4 h-4" />
                Iniciar Geração ({pendingCount})
              </Button>
            )}
            {generationStatus === 'running' && (
              <Button variant="secondary" disabled className="gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Gerando... ({currentIndex + 1}/{pendingCount})
              </Button>
            )}
            {generationStatus === 'completed' && errorCount > 0 && (
              <Button variant="outline" onClick={retryFailed} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Reprocessar Erros ({errorCount})
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Panel - Template Config */}
        <div className="w-80 border-r bg-card overflow-hidden flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-semibold flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Template Base
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Configurações aplicadas a todos os artigos
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Tom */}
              <div className="space-y-2">
                <Label>Tom de Voz</Label>
                <Select value={template.tone} onValueChange={(v) => updateTemplate('tone', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tones.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ponto de Vista */}
              <div className="space-y-2">
                <Label>Ponto de Vista</Label>
                <Select value={template.pointOfView} onValueChange={(v) => updateTemplate('pointOfView', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pointsOfView.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tamanho */}
              <div className="space-y-2">
                <Label>Tamanho do Artigo</Label>
                <Select value={template.size} onValueChange={(v) => updateTemplate('size', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {articleSizes.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Projeto WordPress */}
              <div className="space-y-2">
                <Label>Projeto WordPress</Label>
                <Select 
                  value={template.projectId || 'none'} 
                  onValueChange={(v) => updateTemplate('projectId', v === 'none' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar projeto..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (não publicar)</SelectItem>
                    {connectedProjects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Content Options */}
              <div className="space-y-3">
                <Label>Elementos do Conteúdo</Label>
                <div className="space-y-2">
                  {[
                    { key: 'includeFaq' as const, label: 'Incluir FAQ' },
                    { key: 'includeTables' as const, label: 'Incluir Tabelas' },
                    { key: 'includeLists' as const, label: 'Incluir Listas' },
                    { key: 'includeConclusion' as const, label: 'Incluir Conclusão' },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={template[opt.key]}
                        onChange={(e) => updateTemplate(opt.key, e.target.checked)}
                        className="rounded border-input"
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel - Variations */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Stats Bar */}
          {variations.length > 0 && (
            <div className="p-4 border-b bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    Total: <strong>{totalCount}</strong>
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    Concluídos: <strong>{completedCount}</strong>
                  </span>
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <XCircle className="w-4 h-4" />
                      Erros: <strong>{errorCount}</strong>
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-muted-foreground">
                    Pendentes: <strong>{pendingCount}</strong>
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Limpar Tudo
                </Button>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>
          )}

          {/* Add Variation Form */}
          <div className="p-4 border-b bg-card">
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Palavra-chave principal *"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addVariation()}
                />
              </div>
              <div className="flex-1">
                <Input
                  placeholder="Título (opcional - será gerado automaticamente)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addVariation()}
                />
              </div>
              <Button onClick={addVariation} className="gap-2">
                <Plus className="w-4 h-4" />
                Adicionar
              </Button>
              <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Upload className="w-4 h-4" />
                    Em Massa
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar Palavras-chave em Massa</DialogTitle>
                    <DialogDescription>
                      Cole uma lista de palavras-chave (uma por linha)
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    placeholder="advogado criminal são paulo&#10;advogado trabalhista sp&#10;advogado de família&#10;..."
                    value={bulkKeywords}
                    onChange={(e) => setBulkKeywords(e.target.value)}
                    rows={10}
                  />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowBulkDialog(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={addBulkVariations}>
                      Adicionar {bulkKeywords.split('\n').filter(k => k.trim()).length} Palavras-chave
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Variations Table */}
          <ScrollArea className="flex-1">
            {variations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Layers className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Nenhuma variação adicionada</h3>
                <p className="text-sm text-muted-foreground max-w-md mb-4">
                  Adicione palavras-chave para criar artigos em massa. Cada palavra-chave
                  gerará um artigo único usando o template configurado.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowBulkDialog(true)} className="gap-2">
                    <Upload className="w-4 h-4" />
                    Adicionar em Massa
                  </Button>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Palavra-chave</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="w-28 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variations.map((variation, index) => (
                    <TableRow key={variation.id}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{variation.keyword}</TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {variation.title}
                      </TableCell>
                      <TableCell>
                        {variation.status === 'pending' && (
                          <Badge variant="outline" className="gap-1">
                            <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                            Pendente
                          </Badge>
                        )}
                        {variation.status === 'generating' && (
                          <Badge variant="secondary" className="gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Gerando...
                          </Badge>
                        )}
                        {variation.status === 'completed' && (
                          <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            <CheckCircle2 className="w-3 h-3" />
                            Concluído
                          </Badge>
                        )}
                        {variation.status === 'error' && (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="w-3 h-3" />
                            Erro
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {variation.articleId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => navigate(`/articles/${variation.articleId}/edit`)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => duplicateVariation(variation)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeVariation(variation.id)}
                            disabled={variation.status === 'generating'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
