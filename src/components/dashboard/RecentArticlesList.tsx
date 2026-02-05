import { Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Article {
  id: string;
  title: string | null;
  keyword: string;
  created_at: string;
  status: string;
}

interface RecentArticlesListProps {
  articles: Article[];
}

export function RecentArticlesList({ articles }: RecentArticlesListProps) {
  if (articles.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Send className="w-5 h-5 text-primary" />
          Últimos artigos gerados
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {articles.map((article) => (
            <Link 
              key={article.id} 
              to={`/articles`}
              className="block px-6 py-4 hover:bg-muted/50 transition-colors"
            >
              <p className="font-medium text-primary hover:underline">
                {article.title || article.keyword}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Geração • {format(new Date(article.created_at), "dd/MM, HH:mm", { locale: ptBR })}
              </p>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
