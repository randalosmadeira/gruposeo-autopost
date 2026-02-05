import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Save, 
  Eye, 
  Code, 
  Image as ImageIcon, 
  Loader2,
  Upload,
  Sparkles,
  RefreshCw,
  Settings,
  Search as SearchIcon,
  Download,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { WordPressCategorySelector } from './WordPressCategorySelector';

interface Article {
  id: string;
  title: string | null;
  keyword: string;
  content: string | null;
  excerpt: string | null;
  slug: string | null;
  featured_image_url: string | null;
  status: string;
  word_count: number | null;
  project_id?: string | null;
  wordpress_categories?: number[];
}

interface ArticleEditorProps {
  article: Article;
  onSave?: (article: Article) => void;
  onPublish?: (article: Article) => void;
  isPublishing?: boolean;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  generating: { label: 'Em criação', className: 'bg-amber-100 text-amber-700' },
  ready: { label: 'Pronto', className: 'bg-blue-100 text-blue-700' },
  published: { label: 'Publicado', className: 'bg-green-100 text-green-700' },
  error: { label: 'Erro', className: 'bg-red-100 text-red-700' },
};

export function ArticleEditor({ article, onSave, onPublish, isPublishing }: ArticleEditorProps) {
  const [editedArticle, setEditedArticle] = useState<Article>(article);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'visual' | 'html'>('visual');
  const [configTab, setConfigTab] = useState<'config' | 'seo'>('config');
  const [isRegenerating, setIsRegenerating] = useState<'title' | 'excerpt' | 'image' | 'content' | null>(null);
  const { toast } = useToast();

  const updateField = useCallback(<K extends keyof Article>(field: K, value: Article[K]) => {
    setEditedArticle(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const wordCount = editedArticle.content?.split(/\s+/).filter(Boolean).length || 0;
      
      const { error } = await supabase
        .from('articles')
        .update({
          title: editedArticle.title,
          content: editedArticle.content,
          excerpt: editedArticle.excerpt,
          slug: editedArticle.slug,
          featured_image_url: editedArticle.featured_image_url,
          word_count: wordCount,
        })
        .eq('id', editedArticle.id);

      if (error) throw error;

      setHasChanges(false);
      onSave?.({ ...editedArticle, word_count: wordCount });
      
      toast({
        title: 'Artigo salvo!',
        description: 'As alterações foram salvas com sucesso.',
      });
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as alterações.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = () => {
    onPublish?.(editedArticle);
  };

  const handleRegenerate = async (type: 'title' | 'excerpt' | 'image' | 'content') => {
    setIsRegenerating(type);
    try {
      const { data, error } = await supabase.functions.invoke('regenerate-content', {
        body: {
          type,
          keyword: editedArticle.keyword,
          currentTitle: editedArticle.title,
          currentContent: editedArticle.content,
          language: 'pt-BR',
        },
      });

      if (error) throw error;

      if (data?.result) {
        switch (type) {
          case 'title':
            updateField('title', data.result);
            break;
          case 'excerpt':
            updateField('excerpt', data.result);
            break;
          case 'image':
            updateField('featured_image_url', data.result);
            break;
          case 'content':
            updateField('content', data.result);
            break;
        }
        toast({
          title: 'Conteúdo regenerado!',
          description: `${type === 'title' ? 'Título' : type === 'excerpt' ? 'Meta-descrição' : type === 'image' ? 'Imagem' : 'Conteúdo'} atualizado com sucesso.`,
        });
      }
    } catch (error) {
      console.error('Regenerate error:', error);
      toast({
        title: 'Erro ao regenerar',
        description: 'Não foi possível regenerar o conteúdo.',
        variant: 'destructive',
      });
    } finally {
      setIsRegenerating(null);
    }
  };

  const status = statusLabels[editedArticle.status] || statusLabels.draft;
  const wordCount = editedArticle.content?.split(/\s+/).filter(Boolean).length || 0;
  const excerptLength = editedArticle.excerpt?.length || 0;

  return (
    <div className="flex gap-6 h-full">
      {/* Main Editor */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold truncate max-w-md">
              {editedArticle.title || editedArticle.keyword}
            </h1>
            <Badge className={status.className}>{status.label}</Badge>
            {hasChanges && (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                Não salvo
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
            <Button
              size="sm"
              onClick={handlePublish}
              disabled={isPublishing || hasChanges}
              className="bg-primary"
            >
              {isPublishing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Publicar
            </Button>
            {editedArticle.status === 'error' && (
              <Button variant="destructive" size="icon">
                <AlertTriangle className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 p-2 border rounded-lg mb-4 bg-card">
          <select className="px-3 py-1.5 border rounded text-sm bg-background">
            <option>Título 1 (H1)</option>
            <option>Título 2 (H2)</option>
            <option>Título 3 (H3)</option>
            <option>Parágrafo</option>
          </select>
          <div className="h-6 w-px bg-border" />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 font-bold">B</Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 italic">I</Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">🔗</Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 line-through">S</Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 underline">U</Button>
          <div className="h-6 w-px bg-border" />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">•</Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">1.</Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">→</Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">←</Button>
          <div className="h-6 w-px bg-border" />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">🖼️</Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">📊</Button>
          <div className="flex-1" />
          <Badge variant="outline" className="text-primary border-primary">
            ✓ Pronto
          </Badge>
        </div>

        {/* Content Area */}
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0 h-full">
            {activeTab === 'html' ? (
              <Textarea
                value={editedArticle.content || ''}
                onChange={(e) => updateField('content', e.target.value)}
                placeholder="<h2>Título da seção</h2><p>Conteúdo...</p>"
                className="h-full min-h-[500px] font-mono text-sm border-0 rounded-none resize-none"
              />
            ) : (
              <ScrollArea className="h-full">
                <div 
                  className="p-6 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: editedArticle.content || '<p class="text-muted-foreground">Sem conteúdo</p>' }}
                />
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Word count */}
        <div className="mt-2 text-sm text-muted-foreground">
          {wordCount} palavras
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-80 flex flex-col">
        {/* Config/SEO Tabs */}
        <Tabs value={configTab} onValueChange={(v) => setConfigTab(v as 'config' | 'seo')} className="flex-1">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="config" className="flex-1">
              <Settings className="w-4 h-4 mr-2" />
              Config
            </TabsTrigger>
            <TabsTrigger value="seo" className="flex-1">
              <SearchIcon className="w-4 h-4 mr-2" />
              SEO
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-4 mt-0">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Configurações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Title */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Título</Label>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleRegenerate('title')}
                      disabled={isRegenerating === 'title'}
                      className="bg-primary h-7 text-xs"
                    >
                      {isRegenerating === 'title' ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Sparkles className="w-3 h-3 mr-1" />
                      )}
                      Recriar com IA
                    </Button>
                  </div>
                  <Input
                    value={editedArticle.title || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Título do artigo"
                    className="text-sm"
                  />
                </div>

                {/* Featured Image */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Imagem Destacada</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRegenerate('image')}
                      disabled={isRegenerating === 'image'}
                      className="h-7 text-xs"
                    >
                      {isRegenerating === 'image' ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <RefreshCw className="w-3 h-3 mr-1" />
                      )}
                      Refazer
                    </Button>
                  </div>
                  {editedArticle.featured_image_url ? (
                    <img
                      src={editedArticle.featured_image_url}
                      alt="Featured"
                      className="w-full h-40 object-cover rounded-lg border"
                    />
                  ) : (
                    <div className="w-full h-40 bg-muted rounded-lg border flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Meta Description */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Meta-Descrição</Label>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleRegenerate('excerpt')}
                      disabled={isRegenerating === 'excerpt'}
                      className="bg-primary h-7 text-xs"
                    >
                      {isRegenerating === 'excerpt' ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Sparkles className="w-3 h-3 mr-1" />
                      )}
                      Recriar com IA
                    </Button>
                  </div>
                  <Textarea
                    value={editedArticle.excerpt || ''}
                    onChange={(e) => updateField('excerpt', e.target.value)}
                    placeholder="Descrição curta para SEO"
                    rows={4}
                    className="text-sm resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {excerptLength}/160 caracteres
                  </p>
                </div>

                {/* Content Regenerate */}
                <div className="pt-2 border-t">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleRegenerate('content')}
                    disabled={isRegenerating === 'content'}
                  >
                    {isRegenerating === 'content' ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Recriar Conteúdo com IA
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* WordPress Categories */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" />
                  Publicação WordPress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <WordPressCategorySelector
                  projectId={editedArticle.project_id || null}
                  selectedCategories={editedArticle.wordpress_categories || []}
                  onCategoriesChange={(categories) => updateField('wordpress_categories', categories)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="seo" className="space-y-4 mt-0">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Análise SEO</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Palavra-chave</span>
                  <Badge variant="secondary">{editedArticle.keyword}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Contagem de palavras</span>
                  <Badge variant={wordCount >= 1500 ? 'default' : 'secondary'}>
                    {wordCount}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Meta descrição</span>
                  <Badge variant={excerptLength >= 150 && excerptLength <= 160 ? 'default' : 'secondary'}>
                    {excerptLength}/160
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Editor/HTML Toggle */}
        <div className="mt-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'visual' | 'html')}>
            <TabsList className="w-full">
              <TabsTrigger value="visual" className="flex-1">
                <Eye className="w-4 h-4 mr-2" />
                Editor
              </TabsTrigger>
              <TabsTrigger value="html" className="flex-1">
                <Code className="w-4 h-4 mr-2" />
                HTML
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Save Button */}
        <Button
          className="mt-4 w-full"
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Salvar Alterações
        </Button>
      </div>
    </div>
  );
}
