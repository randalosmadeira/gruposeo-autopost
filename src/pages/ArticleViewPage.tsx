import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Pencil, ExternalLink, Calendar, Tag, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeHTML } from '@/lib/sanitize';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
  generating: { label: 'Em criação', className: 'bg-amber-100 text-amber-700' },
  ready: { label: 'Pronto', className: 'bg-blue-100 text-blue-700' },
  published: { label: 'Publicado', className: 'bg-green-100 text-green-700' },
  error: { label: 'Erro', className: 'bg-red-100 text-red-700' },
};

export default function ArticleViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        setArticle(data as Article);
      } catch (err) {
        console.error('Unexpected error:', err);
        setError('Erro inesperado ao carregar artigo');
      } finally {
        setIsLoading(false);
      }
    };

    fetchArticle();
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
        <Button variant="outline" onClick={() => navigate('/articles')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para lista
        </Button>
      </div>
    );
  }

  const status = statusLabels[article.status] || statusLabels.draft;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/articles')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <div className="h-6 w-px bg-border" />
            <Badge className={status.className}>{status.label}</Badge>
          </div>
          <div className="flex items-center gap-2">
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

      {/* Content */}
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Featured Image */}
        {article.featured_image_url && (
          <div className="aspect-video rounded-xl overflow-hidden bg-muted">
            <img
              src={article.featured_image_url}
              alt={article.title || ''}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Article Header */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-foreground">
            {article.title || article.keyword}
          </h1>
          
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span>
                {format(new Date(article.created_at), "d 'de' MMMM, yyyy", { locale: ptBR })}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Tag className="w-4 h-4" />
              <span>{article.keyword}</span>
            </div>
            {article.word_count && (
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                <span>{article.word_count} palavras</span>
              </div>
            )}
          </div>

          {article.excerpt && (
            <p className="text-lg text-muted-foreground italic">
              {article.excerpt}
            </p>
          )}
        </div>

        {/* Article Content */}
        <Card>
          <CardContent className="pt-6">
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ 
                __html: sanitizeHTML(
                  article.content || '<p class="text-muted-foreground">Sem conteúdo</p>'
                ) 
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
