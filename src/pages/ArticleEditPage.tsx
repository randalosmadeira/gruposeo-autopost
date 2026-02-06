import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArticleEditor } from '@/components/articles/ArticleEditor';
import { ArticleBreadcrumbs } from '@/components/articles/ArticleBreadcrumbs';
import { useWordPressPublish } from '@/hooks/useWordPressPublish';

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
  config: Record<string, unknown> | null;
}

export default function ArticleEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [article, setArticle] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { publishArticle, isPublishing } = useWordPressPublish();

  useEffect(() => {
    const fetchArticle = async () => {
      if (!id) {
        setError('ID do artigo não fornecido');
        setIsLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('articles')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (fetchError) {
          console.error('Error fetching article:', fetchError);
          setError('Erro ao carregar artigo');
          return;
        }

        if (!data) {
          setError('Artigo não encontrado');
          return;
        }

        // Extract wordpress_categories from config if available
        const config = data.config as Record<string, unknown> | null;
        const wordpressCategories = (config?.wordpress_categories as number[]) || [];

        setArticle({
          ...data,
          wordpress_categories: wordpressCategories,
        } as Article & { wordpress_categories: number[] });
      } catch (err) {
        console.error('Unexpected error:', err);
        setError('Erro inesperado ao carregar artigo');
      } finally {
        setIsLoading(false);
      }
    };

    fetchArticle();
  }, [id]);

  const handleSave = (updatedArticle: Article) => {
    setArticle(updatedArticle);
  };

  const handlePublish = async (articleToPublish: Article & { wordpress_categories?: number[] }) => {
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
    });
    
    if (result.success) {
      // Refresh article data
      const { data } = await supabase
        .from('articles')
        .select('*')
        .eq('id', articleToPublish.id)
        .single();
      
      if (data) {
        const config = data.config as Record<string, unknown> | null;
        const wordpressCategories = (config?.wordpress_categories as number[]) || [];
        setArticle({
          ...data,
          wordpress_categories: wordpressCategories,
        } as Article & { wordpress_categories: number[] });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-lg text-muted-foreground">{error || 'Artigo não encontrado'}</p>
        <Button variant="outline" onClick={() => navigate('/articles')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para lista
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Breadcrumbs */}
      <header className="sticky top-0 z-40 bg-card border-b">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/articles')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <ArticleBreadcrumbs 
              articleTitle={article.title || article.keyword} 
              mode="edit" 
            />
          </div>
        </div>
      </header>

      {/* Editor */}
      <div className="p-6">
        <ArticleEditor
          article={article}
          onSave={handleSave}
          onPublish={handlePublish}
          isPublishing={isPublishing}
        />
      </div>
    </div>
  );
}
