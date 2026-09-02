import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Pencil, ExternalLink, Calendar, Tag, FileText, BarChart3, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArticleBreadcrumbs } from '@/components/articles/ArticleBreadcrumbs';
import { ArticleContentRenderer } from '@/components/articles/ArticleContentRenderer';
import { ArticleLoadError, ArticleLoadErrorCode, getArticleById, isValidUuid } from '@/services/articles';

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

type ErrorState = { code: ArticleLoadErrorCode; message: string } | null;

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
  const [error, setError] = useState<ErrorState>(null);

  const loadArticle = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    setArticle(null);

    if (!isValidUuid(id)) {
      setError({ code: 'INVALID_ID', message: 'O endereço do artigo contém um identificador inválido.' });
      setIsLoading(false);
      return;
    }

    try {
      const data = await getArticleById<Article>(id);
      setArticle(data);
    } catch (loadError) {
      if (loadError instanceof ArticleLoadError) {
        setError({ code: loadError.code, message: loadError.message });
      } else {
        setError({ code: 'TECHNICAL', message: 'Falha técnica inesperada ao carregar o artigo.' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadArticle();
  }, [loadArticle]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3" role="status" aria-live="polite">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando artigo...</p>
      </div>
    );
  }

  if (error || !article) {
    const state = error || { code: 'NOT_FOUND' as const, message: 'Artigo não encontrado.' };
    const retryable = state.code === 'TIMEOUT' || state.code === 'TECHNICAL';
    const title = state.code === 'NOT_FOUND'
      ? 'Artigo não encontrado'
      : state.code === 'INVALID_ID'
        ? 'Endereço inválido'
        : state.code === 'TIMEOUT'
          ? 'Tempo de resposta excedido'
          : 'Falha técnica ao carregar';

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          {state.code === 'TIMEOUT' ? <WifiOff className="w-6 h-6 text-muted-foreground" /> : <FileText className="w-6 h-6 text-muted-foreground" />}
        </div>
        <div className="space-y-1 max-w-xl">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-muted-foreground">{state.message}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
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

  const status = statusLabels[article.status] || statusLabels.draft;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/articles')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <ArticleBreadcrumbs articleTitle={article.title || article.keyword} mode="view" />
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

      <div className="border-b bg-muted/30">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10"><FileText className="w-4 h-4 text-primary" /></div>
                  <div><p className="text-xs text-muted-foreground">Palavras</p><p className="text-lg font-semibold">{article.word_count || 0}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-info/10"><Tag className="w-4 h-4 text-info" /></div>
                  <div><p className="text-xs text-muted-foreground">Palavra-chave</p><p className="text-sm font-medium truncate max-w-[120px]">{article.keyword}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success/10"><Calendar className="w-4 h-4 text-success" /></div>
                  <div><p className="text-xs text-muted-foreground">Criado em</p><p className="text-sm font-medium">{format(new Date(article.created_at), 'dd/MM/yy', { locale: ptBR })}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10"><BarChart3 className="w-4 h-4 text-accent" /></div>
                  <div><p className="text-xs text-muted-foreground">Tempo de leitura</p><p className="text-lg font-semibold">{Math.max(1, Math.ceil((article.word_count || 0) / 200))} min</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <ArticleContentRenderer
          content={article.content || ''}
          rawMarkdown={article.content || ''}
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
