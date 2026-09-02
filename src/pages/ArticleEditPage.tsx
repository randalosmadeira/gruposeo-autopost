import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArticleEditor } from '@/components/articles/ArticleEditor';
import { useWordPressPublish } from '@/hooks/useWordPressPublish';
import { ArticleLoadError, ArticleLoadErrorCode, getArticleById, isValidUuid } from '@/services/articles';
import { cancelWordPressSchedule, scheduleWordPressArticle } from '@/services/wordpressOperations';

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
  project_id: string | null;
  scheduled_at?: Date | null;
  config: Record<string, unknown> | null;
  wordpress_categories?: number[];
}

type ErrorState = { code: ArticleLoadErrorCode; message: string } | null;

function scheduleIso(value?: Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function ArticleEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [article, setArticle] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ErrorState>(null);
  const { publishArticle, isPublishing } = useWordPressPublish();

  const loadArticle = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    if (!isValidUuid(id)) {
      setError({ code: 'INVALID_ID', message: 'O endereço contém um identificador de artigo inválido.' });
      setIsLoading(false);
      return;
    }

    try {
      const data = await getArticleById<Record<string, any>>(id);
      const config = data.config && typeof data.config === 'object' ? data.config as Record<string, unknown> : null;
      const wordpressCategories = (config?.wordpress_categories as number[]) || [];
      setArticle({
        id: String(data.id),
        title: data.title ?? null,
        keyword: String(data.keyword || ''),
        content: data.content ?? null,
        excerpt: data.excerpt ?? null,
        slug: data.slug ?? null,
        featured_image_url: data.featured_image_url ?? null,
        status: String(data.status || 'draft'),
        word_count: data.word_count ?? null,
        project_id: data.project_id ?? null,
        scheduled_at: data.scheduled_at ? new Date(data.scheduled_at) : null,
        config,
        wordpress_categories: wordpressCategories,
      });
    } catch (loadError) {
      if (loadError instanceof ArticleLoadError) setError({ code: loadError.code, message: loadError.message });
      else setError({ code: 'TECHNICAL', message: 'Falha técnica inesperada ao carregar o artigo.' });
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadArticle();
  }, [loadArticle]);

  const handleSave = useCallback(async (updatedArticle: Article) => {
    const previousScheduled = scheduleIso(article?.scheduled_at);
    const nextScheduled = scheduleIso(updatedArticle.scheduled_at);
    setArticle(updatedArticle);

    if (previousScheduled === nextScheduled) return;

    try {
      if (!updatedArticle.project_id) {
        const { error: dbError } = await supabase
          .from('articles')
          .update({ scheduled_at: nextScheduled })
          .eq('id', updatedArticle.id);
        if (dbError) throw dbError;
        if (nextScheduled) {
          toast({
            title: 'Data salva, projeto pendente',
            description: 'Vincule o artigo a um projeto WordPress para ativar a publicação automática.',
          });
        }
        return;
      }

      if (nextScheduled && Date.parse(nextScheduled) > Date.now()) {
        await scheduleWordPressArticle({
          articleId: updatedArticle.id,
          projectId: updatedArticle.project_id,
          scheduledAt: nextScheduled,
          publishStatus: 'publish',
        });
        toast({ title: 'Publicação agendada', description: `Agendamento salvo em scheduled_at e enviado ao brain do WordPress.` });
      } else {
        await cancelWordPressSchedule(updatedArticle.id);
      }
    } catch (scheduleError) {
      console.error('[ArticleEditPage] schedule sync failed:', scheduleError);
      toast({
        title: 'Falha ao sincronizar agendamento',
        description: scheduleError instanceof Error ? scheduleError.message : 'O agendamento não foi sincronizado com a fila.',
        variant: 'destructive',
      });
    }
  }, [article?.scheduled_at, toast]);

  const handlePublish = async (articleToPublish: Article) => {
    if (!articleToPublish.project_id) {
      toast({
        title: 'Projeto não definido',
        description: 'Este artigo não está associado a um projeto WordPress.',
        variant: 'destructive',
      });
      return;
    }

    const result = await publishArticle({
      id: articleToPublish.id,
      title: articleToPublish.title,
      project_id: articleToPublish.project_id,
      scheduled_at: scheduleIso(articleToPublish.scheduled_at),
    });

    if (result.success && !result.scheduled) await loadArticle();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3" role="status" aria-live="polite">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando editor...</p>
      </div>
    );
  }

  if (error || !article) {
    const state = error || { code: 'NOT_FOUND' as const, message: 'Artigo não encontrado.' };
    const retryable = state.code === 'TIMEOUT' || state.code === 'TECHNICAL';
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{state.code === 'NOT_FOUND' ? 'Artigo não encontrado' : state.code === 'INVALID_ID' ? 'Endereço inválido' : state.code === 'TIMEOUT' ? 'Tempo de resposta excedido' : 'Falha técnica'}</h1>
          <p className="text-muted-foreground">{state.message}</p>
        </div>
        <div className="flex gap-2">
          {retryable && (
            <Button onClick={() => void loadArticle()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Tentar novamente
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate('/articles')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para lista
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ArticleEditor
        article={article}
        onSave={handleSave}
        onPublish={handlePublish}
        isPublishing={isPublishing}
      />
    </div>
  );
}
