import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, ExternalLink, Eye, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface Article {
  id: string;
  title: string | null;
  keyword: string;
  status: 'draft' | 'generating' | 'ready' | 'published' | 'error';
  word_count: number | null;
  seo_score: number | null;
  project_id?: string | null;
  projects?: { id: string; name: string } | null;
}

const statusConfig = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  generating: { label: 'Gerando', className: 'bg-warning/10 text-warning' },
  ready: { label: 'Pronto', className: 'bg-info/10 text-info' },
  published: { label: 'Publicado', className: 'bg-success/10 text-success' },
  error: { label: 'Erro', className: 'bg-destructive/10 text-destructive' },
};

export function RecentArticles({ articles }: { articles: Article[] }) {
  if (articles.length === 0) {
    return (
      <div className="bg-card rounded-2xl shadow-card p-12 text-center">
        <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Nenhum artigo criado ainda</p>
        <Button asChild className="mt-4"><Link to="/articles/new">Criar Primeiro Artigo</Link></Button>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">Artigos Recentes</h3>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/articles" className="text-primary">Ver todos<ExternalLink className="w-4 h-4 ml-1" /></Link>
        </Button>
      </div>
      <div className="divide-y divide-border">
        {articles.map((article) => (
          <div key={article.id} className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
            <div className={cn('w-1 h-12 rounded-full', article.status === 'published' ? 'bg-success' : article.status === 'ready' ? 'bg-info' : article.status === 'error' ? 'bg-destructive' : 'bg-muted-foreground')} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground line-clamp-1">{article.title || article.keyword}</p>
              <p className="text-xs text-muted-foreground">{article.projects?.name || 'Sem projeto'} • {article.keyword}</p>
            </div>
            <Badge className={cn('shrink-0', statusConfig[article.status].className)}>{statusConfig[article.status].label}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem><Eye className="w-4 h-4 mr-2" />Visualizar</DropdownMenuItem>
                <DropdownMenuItem>Editar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </div>
  );
}
