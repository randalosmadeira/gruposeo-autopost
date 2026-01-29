import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, ExternalLink, Eye, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Article {
  id: string;
  title: string;
  keyword: string;
  status: 'draft' | 'ready' | 'published' | 'error';
  wordCount: number;
  seoScore: number;
  createdAt: string;
  projectName: string;
}

const mockArticles: Article[] = [
  {
    id: '1',
    title: 'Como Calcular Rescisão Trabalhista: Guia Completo 2024',
    keyword: 'rescisão trabalhista',
    status: 'published',
    wordCount: 2450,
    seoScore: 92,
    createdAt: '2024-01-27',
    projectName: 'RDM Advogados',
  },
  {
    id: '2',
    title: 'Direitos do Trabalhador CLT: O Que Você Precisa Saber',
    keyword: 'direitos trabalhador clt',
    status: 'ready',
    wordCount: 1890,
    seoScore: 88,
    createdAt: '2024-01-26',
    projectName: 'RDM Advogados',
  },
  {
    id: '3',
    title: 'FGTS: Como Funciona e Quando Pode Sacar',
    keyword: 'fgts como funciona',
    status: 'draft',
    wordCount: 1650,
    seoScore: 75,
    createdAt: '2024-01-25',
    projectName: 'RDM Advogados',
  },
  {
    id: '4',
    title: 'Aviso Prévio Indenizado: Entenda Seus Direitos',
    keyword: 'aviso prévio indenizado',
    status: 'published',
    wordCount: 2100,
    seoScore: 95,
    createdAt: '2024-01-24',
    projectName: 'RDM Advogados',
  },
  {
    id: '5',
    title: 'Seguro Desemprego 2024: Requisitos e Valores',
    keyword: 'seguro desemprego 2024',
    status: 'error',
    wordCount: 0,
    seoScore: 0,
    createdAt: '2024-01-23',
    projectName: 'RDM Advogados',
  },
];

const statusConfig = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  ready: { label: 'Pronto', className: 'bg-info/10 text-info' },
  published: { label: 'Publicado', className: 'bg-success/10 text-success' },
  error: { label: 'Erro', className: 'bg-destructive/10 text-destructive' },
};

function getSeoScoreColor(score: number) {
  if (score >= 90) return 'text-success';
  if (score >= 70) return 'text-warning';
  if (score > 0) return 'text-destructive';
  return 'text-muted-foreground';
}

export function RecentArticles() {
  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">Artigos Recentes</h3>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/articles" className="text-primary">
            Ver todos
            <ExternalLink className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </div>

      <div className="divide-y divide-border">
        {mockArticles.map((article) => (
          <div
            key={article.id}
            className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
          >
            {/* Status indicator */}
            <div className={cn(
              'w-1 h-12 rounded-full',
              article.status === 'published' && 'bg-success',
              article.status === 'ready' && 'bg-info',
              article.status === 'draft' && 'bg-muted-foreground',
              article.status === 'error' && 'bg-destructive'
            )} />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <Link
                to={`/articles/${article.id}`}
                className="font-medium text-foreground hover:text-primary transition-colors line-clamp-1"
              >
                {article.title}
              </Link>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {article.projectName}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  {article.keyword}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="hidden md:flex items-center gap-6">
              <div className="text-right">
                <p className="text-sm font-medium">{article.wordCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">palavras</p>
              </div>
              <div className="text-right">
                <p className={cn('text-sm font-medium', getSeoScoreColor(article.seoScore))}>
                  {article.seoScore > 0 ? `${article.seoScore}%` : '-'}
                </p>
                <p className="text-xs text-muted-foreground">SEO</p>
              </div>
            </div>

            {/* Status Badge */}
            <Badge className={cn('shrink-0', statusConfig[article.status].className)}>
              {statusConfig[article.status].label}
            </Badge>

            {/* Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Eye className="w-4 h-4 mr-2" />
                  Visualizar
                </DropdownMenuItem>
                <DropdownMenuItem>Editar</DropdownMenuItem>
                <DropdownMenuItem>Duplicar</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">Excluir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </div>
  );
}