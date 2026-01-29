import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Pencil,
  Copy,
  Trash2,
  Globe,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Article {
  id: string;
  title: string;
  keyword: string;
  status: 'draft' | 'ready' | 'published' | 'error';
  type: 'blog' | 'sales' | 'review';
  wordCount: number;
  seoScore: number;
  createdAt: string;
  projectName: string;
  publishedUrl?: string;
}

const mockArticles: Article[] = [
  {
    id: '1',
    title: 'Como Calcular Rescisão Trabalhista: Guia Completo 2024',
    keyword: 'rescisão trabalhista',
    status: 'published',
    type: 'blog',
    wordCount: 2450,
    seoScore: 92,
    createdAt: '2024-01-27',
    projectName: 'RDM Advogados',
    publishedUrl: 'https://rdmadvogados.com.br/rescisao-trabalhista',
  },
  {
    id: '2',
    title: 'Direitos do Trabalhador CLT: O Que Você Precisa Saber',
    keyword: 'direitos trabalhador clt',
    status: 'ready',
    type: 'blog',
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
    type: 'blog',
    wordCount: 1650,
    seoScore: 75,
    createdAt: '2024-01-25',
    projectName: 'RDM Advogados',
  },
  {
    id: '4',
    title: 'Advogado Trabalhista São Paulo - Consulta Gratuita',
    keyword: 'advogado trabalhista são paulo',
    status: 'published',
    type: 'sales',
    wordCount: 2100,
    seoScore: 95,
    createdAt: '2024-01-24',
    projectName: 'RDM Advogados',
    publishedUrl: 'https://rdmadvogados.com.br/advogado-trabalhista-sp',
  },
  {
    id: '5',
    title: 'Seguro Desemprego 2024: Requisitos e Valores',
    keyword: 'seguro desemprego 2024',
    status: 'error',
    type: 'blog',
    wordCount: 0,
    seoScore: 0,
    createdAt: '2024-01-23',
    projectName: 'RDM Advogados',
  },
  {
    id: '6',
    title: 'Férias CLT: Cálculo, Regras e Direitos do Trabalhador',
    keyword: 'férias clt',
    status: 'published',
    type: 'blog',
    wordCount: 2320,
    seoScore: 91,
    createdAt: '2024-01-22',
    projectName: 'RDM Advogados',
  },
];

const statusConfig = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  ready: { label: 'Pronto', className: 'bg-info/10 text-info' },
  published: { label: 'Publicado', className: 'bg-success/10 text-success' },
  error: { label: 'Erro', className: 'bg-destructive/10 text-destructive' },
};

const typeConfig = {
  blog: { label: 'Blog', className: 'bg-primary/10 text-primary' },
  sales: { label: 'Vendas', className: 'bg-accent/10 text-accent' },
  review: { label: 'Review', className: 'bg-premium/10 text-premium' },
};

function getSeoScoreColor(score: number) {
  if (score >= 90) return 'text-success';
  if (score >= 70) return 'text-warning';
  if (score > 0) return 'text-destructive';
  return 'text-muted-foreground';
}

export default function ArticlesList() {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Artigos
          </h1>
          <p className="text-muted-foreground">
            Gerencie todos os seus artigos e conteúdos
          </p>
        </div>
        <Button asChild className="bg-gradient-primary hover:opacity-90 shadow-glow-primary/30">
          <Link to="/articles/new">
            <Plus className="w-4 h-4 mr-2" />
            Novo Artigo
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl p-4 shadow-card">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título ou keyword..."
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Select defaultValue="all">
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="draft">Rascunho</SelectItem>
                <SelectItem value="ready">Pronto</SelectItem>
                <SelectItem value="published">Publicado</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="blog">Blog</SelectItem>
                <SelectItem value="sales">Vendas</SelectItem>
                <SelectItem value="review">Review</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon">
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[400px]">Artigo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Palavras</TableHead>
              <TableHead className="text-right">SEO</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockArticles.map((article) => (
              <TableRow key={article.id} className="group">
                <TableCell>
                  <div className="space-y-1">
                    <Link
                      to={`/articles/${article.id}`}
                      className="font-medium text-foreground hover:text-primary transition-colors line-clamp-1"
                    >
                      {article.title}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{article.projectName}</span>
                      <span>•</span>
                      <span className="text-primary">{article.keyword}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={cn('font-normal', typeConfig[article.type].className)}>
                    {typeConfig[article.type].label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge className={cn('font-normal', statusConfig[article.status].className)}>
                      {statusConfig[article.status].label}
                    </Badge>
                    {article.publishedUrl && (
                      <a
                        href={article.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {article.wordCount > 0 ? article.wordCount.toLocaleString() : '-'}
                </TableCell>
                <TableCell className={cn('text-right font-medium', getSeoScoreColor(article.seoScore))}>
                  {article.seoScore > 0 ? `${article.seoScore}%` : '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(article.createdAt).toLocaleDateString('pt-BR')}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Eye className="w-4 h-4 mr-2" />
                        Visualizar
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Pencil className="w-4 h-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      {article.status === 'ready' && (
                        <DropdownMenuItem>
                          <Globe className="w-4 h-4 mr-2" />
                          Publicar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}