import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Save, 
  Eye, 
  Code, 
  Image as ImageIcon, 
  Loader2,
  Check,
  Upload
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
}

interface ArticleEditorProps {
  article: Article;
  onSave?: (article: Article) => void;
  onPublish?: (article: Article) => void;
  isPublishing?: boolean;
}

export function ArticleEditor({ article, onSave, onPublish, isPublishing }: ArticleEditorProps) {
  const [editedArticle, setEditedArticle] = useState<Article>(article);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'visual' | 'html'>('visual');
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

  // Simple HTML to text for preview
  const htmlToPreview = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">Editor de Artigo</CardTitle>
            <Badge variant={editedArticle.status === 'ready' ? 'default' : 'secondary'}>
              {editedArticle.status}
            </Badge>
            {hasChanges && (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                Não salvo
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="ml-2">Salvar</span>
            </Button>
            <Button
              size="sm"
              onClick={handlePublish}
              disabled={isPublishing || hasChanges}
            >
              {isPublishing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span className="ml-2">Publicar no WordPress</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Title & Slug */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={editedArticle.title || ''}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="Título do artigo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={editedArticle.slug || ''}
              onChange={(e) => updateField('slug', e.target.value)}
              placeholder="url-do-artigo"
            />
          </div>
        </div>

        {/* Excerpt */}
        <div className="space-y-2">
          <Label htmlFor="excerpt">Meta Description / Excerpt</Label>
          <Textarea
            id="excerpt"
            value={editedArticle.excerpt || ''}
            onChange={(e) => updateField('excerpt', e.target.value)}
            placeholder="Descrição curta para SEO (150-160 caracteres)"
            rows={2}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            {(editedArticle.excerpt?.length || 0)}/160 caracteres
          </p>
        </div>

        {/* Featured Image */}
        <div className="space-y-2">
          <Label>Imagem Destacada</Label>
          <div className="flex items-start gap-4">
            {editedArticle.featured_image_url ? (
              <img
                src={editedArticle.featured_image_url}
                alt="Featured"
                className="w-32 h-20 object-cover rounded-lg border"
              />
            ) : (
              <div className="w-32 h-20 bg-muted rounded-lg border flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1">
              <Input
                value={editedArticle.featured_image_url || ''}
                onChange={(e) => updateField('featured_image_url', e.target.value)}
                placeholder="URL da imagem destacada"
              />
            </div>
          </div>
        </div>

        {/* Content Editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Conteúdo</Label>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'visual' | 'html')}>
              <TabsList className="h-8">
                <TabsTrigger value="visual" className="text-xs px-3">
                  <Eye className="w-3 h-3 mr-1" />
                  Visual
                </TabsTrigger>
                <TabsTrigger value="html" className="text-xs px-3">
                  <Code className="w-3 h-3 mr-1" />
                  HTML
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {activeTab === 'html' ? (
            <Textarea
              value={editedArticle.content || ''}
              onChange={(e) => updateField('content', e.target.value)}
              placeholder="<h2>Título da seção</h2><p>Conteúdo...</p>"
              rows={20}
              className="font-mono text-sm"
            />
          ) : (
            <div 
              className="min-h-[400px] max-h-[600px] overflow-y-auto p-4 border rounded-lg bg-card prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: editedArticle.content || '<p>Sem conteúdo</p>' }}
            />
          )}

          <p className="text-xs text-muted-foreground">
            {editedArticle.content?.split(/\s+/).filter(Boolean).length || 0} palavras
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
