import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

interface Article {
  id: string;
  title: string | null;
  project_id: string | null;
}

interface PublishResult {
  success: boolean;
  postId?: number;
  postUrl?: string;
  error?: string;
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
      const { data, error } = await supabase.functions.invoke<PublishResult>(
        'publish-to-wordpress',
        {
          body: {
            articleId: article.id,
            projectId: article.project_id,
          },
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to publish');
      }

      setPublishedArticles(prev => new Set([...prev, article.id]));

      toast({
        title: 'Artigo publicado! 🎉',
        description: `"${article.title}" foi publicado no WordPress.`,
      });

      return data;
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
      if (result.success) {
        success++;
      } else {
        failed++;
      }
      // Small delay between publishes to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    toast({
      title: 'Publicação em lote concluída',
      description: `${success} artigos publicados, ${failed} falharam.`,
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
