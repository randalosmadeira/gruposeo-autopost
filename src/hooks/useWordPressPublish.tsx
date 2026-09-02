import { useState, useCallback } from 'react';
import { useToast } from './use-toast';
import { publishWordPressArticle } from '@/services/wordpressOperations';

interface Article {
  id: string;
  title: string | null;
  project_id: string | null;
  scheduled_at?: string | null;
}

interface PublishResult {
  success: boolean;
  scheduled?: boolean;
  postId?: number;
  postUrl?: string;
  error?: string;
  [key: string]: unknown;
}

export function useWordPressPublish() {
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedArticles, setPublishedArticles] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const publishArticle = useCallback(async (article: Article): Promise<PublishResult> => {
    if (!article.project_id) {
      toast({
        title: 'Erro',
        description: 'Artigo não está vinculado a um projeto WordPress.',
        variant: 'destructive',
      });
      return { success: false, error: 'No project linked' };
    }

    setIsPublishing(true);
    try {
      const data = await publishWordPressArticle({
        articleId: article.id,
        projectId: article.project_id,
        publishStatus: 'publish',
        scheduledAt: article.scheduled_at || null,
      }) as PublishResult;

      if (data.scheduled) {
        toast({
          title: 'Publicação agendada',
          description: `"${article.title}" foi enviado para a fila e será publicado no horário programado.`,
        });
        return { ...data, success: true, scheduled: true };
      }

      setPublishedArticles(prev => new Set([...prev, article.id]));
      toast({
        title: 'Artigo publicado!',
        description: `"${article.title}" foi publicado no WordPress.`,
      });
      return { ...data, success: true };
    } catch (error) {
      console.error('Publish error:', error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro ao publicar',
        description: message,
        variant: 'destructive',
      });
      return { success: false, error: message };
    } finally {
      setIsPublishing(false);
    }
  }, [toast]);

  const publishMultiple = useCallback(async (articles: Article[]): Promise<{ success: number; failed: number }> => {
    let success = 0;
    let failed = 0;
    for (const article of articles) {
      const result = await publishArticle(article);
      if (result.success) success++;
      else failed++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    toast({
      title: 'Publicação em lote concluída',
      description: `${success} operações aceitas, ${failed} falharam.`,
    });
    return { success, failed };
  }, [publishArticle, toast]);

  return {
    publishArticle,
    publishMultiple,
    isPublishing,
    publishedArticles,
    isPublished: (articleId: string) => publishedArticles.has(articleId),
  };
}
