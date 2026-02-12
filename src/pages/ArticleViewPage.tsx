import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Pencil, ExternalLink, Calendar, Tag, FileText, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArticleBreadcrumbs } from '@/components/articles/ArticleBreadcrumbs';
import { ArticleContentRenderer } from '@/components/articles/ArticleContentRenderer';

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
  created_at: string;
  published_at: string | null;
  published_url: string | null;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  generating: { label: 'Em criação', className: 'bg-warning/20 text-warning-foreground' },
  ready: { label: 'Pronto', className: 'bg-info/20 text-info' },
  published: { label: 'Publicado', className: 'bg-success/20 text-success' },
  error: { label: 'Erro', className: 'bg-destructive/20 text-destructive' },
};

export default function ArticleViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isLoading) {
        setError('O servidor está demorando para responder. Tente recarregar a página.');
        setIsLoading(false);
      }
    }, 12000);

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
          setError('Erro ao carregar artigo. Verifique sua conexão e tente novamente.');
          return;
        }

        if (!data) {
          setError('Artigo não encontrado');
          return;
        }

        setArticle(data as Article);
      } catch (err) {
        console.error('Unexpected error:', err);
        setError('Erro inesperado ao carregar artigo');
      } finally {
        setIsLoading(false);
      }
    };

    fetchArticle();
    return () => clearTimeout(timeout);
  }, [id]);

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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Recarregar página
          </Button>
          <Button variant="outline" onClick={() => navigate('/articles')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para lista
          </Button>
        </div>
      </div>
    );
  }

  const status = statusLabels[article.status] || statusLabels.draft;

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
              mode="view" 
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge className={status.className}>{status.label}</Badge>
            {article.published_url && (
              <Button variant="outline" size="sm" asChild>
                <a href={article.published_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Ver publicado
                </a>
              </Button>
            )}
            <Button size="sm" onClick={() => navigate(`/articles/${article.id}/edit`)}>
              <Pencil className="w-4 h-4 mr-2" />
              Editar
            </Button>
          </div>
        </div>
      </header>

      {/* Dashboard Stats */}
      <div className="border-b bg-muted/30">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Palavras</p>
                    <p className="text-lg font-semibold">{article.word_count || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-info/10">
                    <Tag className="w-4 h-4 text-info" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Palavra-chave</p>
                    <p className="text-sm font-medium truncate max-w-[120px]">{article.keyword}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success/10">
                    <Calendar className="w-4 h-4 text-success" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Criado em</p>
                    <p className="text-sm font-medium">
                      {format(new Date(article.created_at), "dd/MM/yy", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10">
                    <BarChart3 className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tempo de leitura</p>
                    <p className="text-lg font-semibold">
                      {Math.max(1, Math.ceil((article.word_count || 0) / 200))} min
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Article Content */}
      <div className="max-w-6xl mx-auto p-6">
        <ArticleContentRenderer
          content={article.content || ''}
          rawMarkdown={article.content || ''} // For FAQ Schema detection
          title={article.title || article.keyword}
          excerpt={article.excerpt || undefined}
          featuredImageUrl={article.featured_image_url || undefined}
          showTOC={true}
          enableFAQSchema={true}
        />
      </div>
    </div>
  );
}