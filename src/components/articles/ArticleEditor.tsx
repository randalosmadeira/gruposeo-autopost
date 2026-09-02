import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  Upload,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { sanitizeHTML } from '@/lib/sanitize';
import { ArticleEditorToolbar } from './editor/ArticleEditorToolbar';
import { ArticleEditorContent } from './editor/ArticleEditorContent';
import { ArticleEditorSidebar } from './editor/ArticleEditorSidebar';
import { ReportProblemDialog } from './editor/ReportProblemDialog';
import { RecreateArticleButton } from './editor/RecreateArticleButton';
import { VersionHistoryPanel } from './editor/VersionHistoryPanel';
import { FirstSentencePreview } from './editor/FirstSentencePreview';

interface ArticleConfig {
  type?: string;
  source_url?: string;
  source_name?: string;
  niche?: string;
  segment?: string;
  module_key?: string;
  article_length?: string;
  analysis_angle?: string;
  [key: string]: unknown;
}

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
  scheduled_at?: Date | null;
  config?: ArticleConfig | null;
}

interface ArticleEditorProps {
  article: Article;
  onSave?: (article: Article) => void | Promise<void>;
  onPublish?: (article: Article) => void | Promise<void>;
  isPublishing?: boolean;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  generating: { label: 'Em criação', className: 'bg-amber-100 text-amber-700' },
  ready: { label: 'Finalizado', className: 'bg-green-100 text-green-700' },
  published: { label: 'Publicado', className: 'bg-blue-100 text-blue-700' },
  error: { label: 'Erro', className: 'bg-red-100 text-red-700' },
};

const AUTOSAVE_DELAY = 3000;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeFilename(value: string) {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const clean = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return clean.slice(0, 100) || 'artigo';
}

async function functionErrorMessage(error: unknown, data: any, fallback: string) {
  if (data?.error) return String(data.error);
  const maybe = error as { message?: string; context?: Response } | null;
  const response = maybe?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      if (payload?.error) return String(payload.error);
      if (payload?.message) return String(payload.message);
    } catch {
      try {
        const text = await response.clone().text();
        if (text.trim()) return text.slice(0, 500);
      } catch {
        // fallback abaixo
      }
    }
  }
  return maybe?.message || fallback;
}

export function ArticleEditor({ article, onSave, onPublish, isPublishing }: ArticleEditorProps) {
  const [editedArticle, setEditedArticle] = useState<Article>(article);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'visual' | 'html'>('visual');
  const [isRegenerating, setIsRegenerating] = useState<'title' | 'excerpt' | 'image' | 'content' | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const { toast } = useToast();
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditedArticle(article);
  }, [article]);

  const updateField = useCallback(<K extends keyof Article>(field: K, value: Article[K]) => {
    setEditedArticle(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }, []);

  const persistArticle = async (showToast: boolean): Promise<Article> => {
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    setIsSaving(true);
    try {
      const wordCount = editedArticle.content?.split(/\s+/).filter(Boolean).length || 0;
      const currentConfig = editedArticle.config || {};
      const updatedConfig = {
        ...currentConfig,
        wordpress_categories: editedArticle.wordpress_categories || [],
      };
      const sanitizedContent = sanitizeHTML(editedArticle.content || '');

      const { error } = await supabase
        .from('articles')
        .update({
          title: editedArticle.title,
          content: sanitizedContent,
          excerpt: editedArticle.excerpt,
          slug: editedArticle.slug,
          featured_image_url: editedArticle.featured_image_url,
          word_count: wordCount,
          config: updatedConfig,
        })
        .eq('id', editedArticle.id);

      if (error) throw error;

      const savedArticle: Article = {
        ...editedArticle,
        content: sanitizedContent,
        word_count: wordCount,
        config: updatedConfig,
      };
      setEditedArticle(savedArticle);
      setHasChanges(false);
      setLastSaved(new Date());
      await onSave?.(savedArticle);

      if (showToast) {
        toast({
          title: 'Artigo salvo!',
          description: 'As alterações foram salvas com sucesso.',
        });
      }
      return savedArticle;
    } catch (error) {
      console.error('Save error:', error);
      if (showToast) {
        toast({
          title: 'Erro ao salvar',
          description: error instanceof Error ? error.message : 'Não foi possível salvar as alterações.',
          variant: 'destructive',
        });
      }
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    try {
      await persistArticle(true);
    } catch {
      // Toast já exibido em persistArticle.
    }
  };

  const performAutoSave = async () => {
    if (!hasChanges || isSaving) return;
    try {
      await persistArticle(false);
    } catch (error) {
      console.error('Autosave error:', error);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && !isSaving) void handleSave();
        return;
      }

      if (!isInputField && editorRef.current) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
          e.preventDefault();
          document.execCommand('bold', false);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
          e.preventDefault();
          document.execCommand('italic', false);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
          e.preventDefault();
          document.execCommand('underline', false);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          const url = prompt('Digite a URL do link:');
          if (url) document.execCommand('createLink', false, url);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, isSaving, editedArticle]);

  useEffect(() => {
    if (!hasChanges || isSaving) return;
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => {
      void performAutoSave();
    }, AUTOSAVE_DELAY);
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [editedArticle, hasChanges, isSaving]);

  const handlePublish = async () => {
    const contentText = (editedArticle.content || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').trim();
    if (!contentText || contentText.length < 50) {
      toast({
        title: 'Conteúdo insuficiente',
        description: 'O artigo não possui conteúdo suficiente para publicação. Gere ou escreva o conteúdo antes de publicar.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const articleToPublish = hasChanges ? await persistArticle(false) : editedArticle;
      await onPublish?.(articleToPublish);
    } catch (error) {
      console.error('Publish preparation error:', error);
      toast({
        title: 'Não foi possível publicar',
        description: error instanceof Error ? error.message : 'Falha ao salvar as alterações antes da publicação.',
        variant: 'destructive',
      });
    }
  };

  const handleExport = () => {
    try {
      const title = editedArticle.title || editedArticle.keyword || 'Artigo';
      const description = editedArticle.excerpt || '';
      const body = sanitizeHTML(editedArticle.content || '');
      const html = `<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${escapeHtml(title)}</title>\n<meta name="description" content="${escapeHtml(description)}">\n</head>\n<body>\n<article>\n<h1>${escapeHtml(title)}</h1>\n${body}\n</article>\n</body>\n</html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeFilename(editedArticle.slug || title)}.html`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Artigo exportado', description: 'O arquivo HTML foi gerado com título, meta-descrição e conteúdo.' });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'Erro ao exportar', description: 'Não foi possível gerar o arquivo do artigo.', variant: 'destructive' });
    }
  };

  const handleRegenerate = async (type: 'title' | 'excerpt' | 'image' | 'content') => {
    setIsRegenerating(type);
    try {
      if (type === 'image') {
        const { data, error } = await supabase.functions.invoke('generate-image', {
          body: {
            articleId: editedArticle.id,
            projectId: editedArticle.project_id || null,
            moduleKey: String(editedArticle.config?.module_key || 'article'),
            segment: String(editedArticle.config?.segment || ''),
            title: editedArticle.title || editedArticle.keyword || 'Imagem destacada',
            keywords: editedArticle.keyword,
            context: editedArticle.excerpt || editedArticle.title || '',
            content: editedArticle.content || '',
            aspectRatio: '16:9',
            quality: 'high',
            allowAiGeneration: true,
          },
        });
        if (error || data?.success === false) {
          throw new Error(await functionErrorMessage(error, data, 'Falha ao gerar imagem destacada'));
        }
        const image = data?.image || data?.imageUrl;
        if (!image) throw new Error('O gerador não devolveu uma imagem válida.');
        updateField('featured_image_url', String(image));
        toast({ title: 'Imagem refeita', description: `Imagem destacada atualizada${data?.source ? ` via ${data.source}` : ''}.` });
        return;
      }

      const { data, error } = await supabase.functions.invoke('regenerate-content', {
        body: {
          type,
          articleId: editedArticle.id,
          keyword: editedArticle.keyword,
          currentTitle: editedArticle.title,
          currentContent: editedArticle.content,
          currentExcerpt: editedArticle.excerpt,
          language: 'pt-BR',
        },
      });

      if (error || data?.success === false) {
        throw new Error(await functionErrorMessage(error, data, 'Falha ao regenerar conteúdo'));
      }
      if (!data?.result) throw new Error('A IA não devolveu conteúdo utilizável.');

      const result = String(data.result);
      if (type === 'title') updateField('title', result);
      if (type === 'excerpt') updateField('excerpt', result);
      if (type === 'content') updateField('content', result);

      toast({
        title: 'Conteúdo regenerado!',
        description: `${type === 'title' ? 'Título' : type === 'excerpt' ? 'Meta-descrição' : 'Conteúdo'} atualizado com sucesso${data?.provider ? ` por ${data.provider}` : ''}.`,
      });
    } catch (error) {
      console.error('Regenerate error:', error);
      toast({
        title: 'Erro ao regenerar',
        description: error instanceof Error ? error.message : 'Não foi possível regenerar o conteúdo.',
        variant: 'destructive',
      });
    } finally {
      setIsRegenerating(null);
    }
  };

  const status = statusLabels[editedArticle.status] || statusLabels.draft;
  const hasError = editedArticle.status === 'error';
  const isEmpty = !editedArticle.content ||
    editedArticle.content.trim() === '' ||
    editedArticle.content.includes('Clique aqui para começar a escrever') ||
    editedArticle.content.length < 100;

  const formatLastSaved = () => {
    if (!lastSaved) return null;
    const diff = Math.floor((Date.now() - lastSaved.getTime()) / 1000);
    if (diff < 60) return 'Salvo agora';
    if (diff < 3600) return `Salvo há ${Math.floor(diff / 60)} min`;
    return `Salvo às ${lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const handleRecreateComplete = (newContent: string, newTitle: string, newExcerpt: string) => {
    setEditedArticle(prev => ({ ...prev, content: newContent, title: newTitle, excerpt: newExcerpt }));
    setHasChanges(false);
    setLastSaved(new Date());
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-background">
      <header className="flex items-center justify-between px-4 py-3 bg-card border-b">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-base font-semibold truncate max-w-md">
            {editedArticle.title || editedArticle.keyword}
          </h1>
          <Badge className={`${status.className} font-normal shrink-0`}>
            • {status.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <RecreateArticleButton
            articleId={editedArticle.id}
            keyword={editedArticle.keyword}
            onRecreateComplete={handleRecreateComplete}
            hasError={hasError}
            isEmpty={isEmpty}
            articleConfig={editedArticle.config || undefined}
          />

          <VersionHistoryPanel
            articleId={editedArticle.id}
            currentTitle={editedArticle.title}
            currentContent={editedArticle.content}
            onRestoreVersion={(title, content, excerpt) => {
              updateField('title', title);
              updateField('content', content);
              updateField('excerpt', excerpt);
            }}
          />

          <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" />
            Exportar
          </Button>
          <Button
            size="sm"
            onClick={() => void handlePublish()}
            disabled={isPublishing || isSaving}
            className="gap-2"
          >
            {isPublishing || isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {hasChanges ? 'Salvar e publicar' : 'Publicar'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsReportDialogOpen(true)}
            className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <AlertTriangle className="w-4 h-4" />
            Reportar
          </Button>
        </div>
      </header>

      <ReportProblemDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        articleId={editedArticle.id}
        articleTitle={editedArticle.title}
        articleKeyword={editedArticle.keyword}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <ArticleEditorToolbar
            hasChanges={hasChanges}
            isSaving={isSaving}
            lastSaved={formatLastSaved()}
            editorRef={editorRef}
          />

          <div className="flex-1 overflow-hidden p-4 space-y-3">
            <FirstSentencePreview content={editedArticle.content} />
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
