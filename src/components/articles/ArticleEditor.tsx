import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Download,
  Upload,
  Loader2,
  AlertTriangle,
  Save,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { sanitizeHTML } from '@/lib/sanitize';
import { ArticleEditorToolbar } from './editor/ArticleEditorToolbar';
import { ArticleEditorContent } from './editor/ArticleEditorContent';
import { ArticleEditorSidebar } from './editor/ArticleEditorSidebar';

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
  ready: { label: 'Finalizado', className: 'bg-green-100 text-green-700' },
  published: { label: 'Publicado', className: 'bg-blue-100 text-blue-700' },
  error: { label: 'Erro', className: 'bg-red-100 text-red-700' },
};

const AUTOSAVE_DELAY = 3000; // 3 seconds

export function ArticleEditor({ article, onSave, onPublish, isPublishing }: ArticleEditorProps) {
  const [editedArticle, setEditedArticle] = useState<Article>(article);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'visual' | 'html'>('visual');
  const [isRegenerating, setIsRegenerating] = useState<'title' | 'excerpt' | 'image' | 'content' | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const { toast } = useToast();
  
  // Autosave refs
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const updateField = useCallback(<K extends keyof Article>(field: K, value: Article[K]) => {
    setEditedArticle(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }, []);

  // Autosave effect
  useEffect(() => {
    if (!hasChanges) return;
    
    // Clear previous timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Set new timeout for autosave
    autoSaveTimeoutRef.current = setTimeout(() => {
      performAutoSave();
    }, AUTOSAVE_DELAY);
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [editedArticle, hasChanges]);

  const performAutoSave = async () => {
    if (!hasChanges) return;
    
    setIsSaving(true);
    try {
      const wordCount = editedArticle.content?.split(/\s+/).filter(Boolean).length || 0;
      
      const currentConfig = (editedArticle as any).config || {};
      const updatedConfig = {
        ...currentConfig,
        wordpress_categories: editedArticle.wordpress_categories || [],
      };
      
      const { error } = await supabase
        .from('articles')
        .update({
          title: editedArticle.title,
          content: sanitizeHTML(editedArticle.content || ''),
          excerpt: editedArticle.excerpt,
          slug: editedArticle.slug,
          featured_image_url: editedArticle.featured_image_url,
          word_count: wordCount,
          config: updatedConfig,
        })
        .eq('id', editedArticle.id);

      if (error) throw error;

      setHasChanges(false);
      setLastSaved(new Date());
      onSave?.({ ...editedArticle, word_count: wordCount });
    } catch (error) {
      console.error('Autosave error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    // Clear any pending autosave
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    setIsSaving(true);
    try {
      const wordCount = editedArticle.content?.split(/\s+/).filter(Boolean).length || 0;
      
      const currentConfig = (editedArticle as any).config || {};
      const updatedConfig = {
        ...currentConfig,
        wordpress_categories: editedArticle.wordpress_categories || [],
      };
      
      const { error } = await supabase
        .from('articles')
        .update({
          title: editedArticle.title,
          content: sanitizeHTML(editedArticle.content || ''),
          excerpt: editedArticle.excerpt,
          slug: editedArticle.slug,
          featured_image_url: editedArticle.featured_image_url,
          word_count: wordCount,
          config: updatedConfig,
        })
        .eq('id', editedArticle.id);

      if (error) throw error;

      setHasChanges(false);
      setLastSaved(new Date());
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

  // Format last saved time
  const formatLastSaved = () => {
    if (!lastSaved) return null;
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSaved.getTime()) / 1000);
    if (diff < 60) return 'Salvo agora';
    if (diff < 3600) return `Salvo há ${Math.floor(diff / 60)} min`;
    return `Salvo às ${lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-card border-b">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold truncate max-w-md">
            {editedArticle.title || editedArticle.keyword}
          </h1>
          <Badge className={`${status.className} font-normal`}>
            • {status.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Exportar
          </Button>
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={isPublishing || hasChanges}
            className="gap-2"
          >
            {isPublishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Publicar
          </Button>
          {editedArticle.status === 'error' && (
            <Button variant="destructive" size="icon" className="w-8 h-8">
              <AlertTriangle className="w-4 h-4" />
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <ArticleEditorToolbar 
            hasChanges={hasChanges} 
            isSaving={isSaving}
            lastSaved={formatLastSaved()}
            editorRef={editorRef}
          />

          {/* Content with scroll */}
          <div className="flex-1 overflow-hidden">
            <ArticleEditorContent
              content={editedArticle.content}
              featuredImageUrl={editedArticle.featured_image_url}
              title={editedArticle.title}
              activeTab={activeTab}
              onContentChange={(content) => updateField('content', content)}
              editorRef={editorRef}
            />
          </div>
        </div>

        {/* Sidebar */}
        <ArticleEditorSidebar
          article={editedArticle}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          onFieldUpdate={updateField}
          onRegenerate={handleRegenerate}
          isRegenerating={isRegenerating}
          onSave={handleSave}
          isSaving={isSaving}
          hasChanges={hasChanges}
        />
      </div>
    </div>
  );
}
