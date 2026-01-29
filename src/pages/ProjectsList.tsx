import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  FolderKanban,
  Plus,
  Search,
  Globe,
  FileText,
  CheckCircle2,
  Settings,
  ExternalLink,
  MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
  domain: string;
  description?: string;
  wordpressConnected: boolean;
  totalArticles: number;
  publishedArticles: number;
  createdAt: string;
}

const mockProjects: Project[] = [
  {
    id: '1',
    name: 'RDM Advogados',
    domain: 'rdmadvogados.com.br',
    description: 'Site principal do escritório de advocacia trabalhista',
    wordpressConnected: true,
    totalArticles: 89,
    publishedArticles: 67,
    createdAt: '2024-01-01',
  },
  {
    id: '2',
    name: 'Grupo SEO Marketing',
    domain: 'gruposeomkt.com.br',
    description: 'Blog sobre marketing digital e SEO',
    wordpressConnected: true,
    totalArticles: 45,
    publishedArticles: 38,
    createdAt: '2024-01-10',
  },
  {
    id: '3',
    name: 'Portal Jurídico',
    domain: 'portaljuridico.com.br',
    description: 'Portal de notícias e artigos jurídicos',
    wordpressConnected: false,
    totalArticles: 23,
    publishedArticles: 0,
    createdAt: '2024-01-15',
  },
];

export default function ProjectsList() {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-primary" />
            Projetos
          </h1>
          <p className="text-muted-foreground">
            Gerencie seus sites e integrações WordPress
          </p>
        </div>
        <Button className="bg-gradient-primary hover:opacity-90 shadow-glow-primary/30">
          <Plus className="w-4 h-4 mr-2" />
          Novo Projeto
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar projetos..." className="pl-10" />
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockProjects.map((project) => (
          <Card
            key={project.id}
            className="group hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-primary text-primary-foreground">
                    <Globe className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <CardDescription className="text-xs">
                      <a
                        href={`https://${project.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-primary transition-colors"
                      >
                        {project.domain}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </CardDescription>
                  </div>
                </div>
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
                      <Settings className="w-4 h-4 mr-2" />
                      Configurações
                    </DropdownMenuItem>
                    <DropdownMenuItem>Ver Artigos</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {project.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {project.description}
                </p>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">
                    <strong>{project.totalArticles}</strong> artigos
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="text-sm">
                    <strong>{project.publishedArticles}</strong> publicados
                  </span>
                </div>
              </div>

              {/* WordPress Status */}
              <div className="flex items-center justify-between pt-3 border-t">
                <Badge
                  className={cn(
                    project.wordpressConnected
                      ? 'bg-success/10 text-success'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {project.wordpressConnected ? 'WordPress Conectado' : 'Não Conectado'}
                </Badge>
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/projects/${project.id}`}>Ver detalhes</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add Project Card */}
        <Card className="border-dashed hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer group">
          <CardContent className="flex flex-col items-center justify-center h-full min-h-[250px] text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-muted group-hover:bg-primary/10 transition-colors mb-4">
              <Plus className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="font-medium text-muted-foreground group-hover:text-foreground transition-colors">
              Adicionar Novo Projeto
            </p>
            <p className="text-sm text-muted-foreground">
              Configure um novo site WordPress
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}