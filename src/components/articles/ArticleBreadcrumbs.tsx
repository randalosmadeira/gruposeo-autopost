import { Link } from 'react-router-dom';
import { ChevronRight, Home, FileText, Pencil, Eye } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface ArticleBreadcrumbsProps {
  articleTitle?: string | null;
  mode?: 'view' | 'edit' | 'list';
}

export function ArticleBreadcrumbs({ articleTitle, mode = 'list' }: ArticleBreadcrumbsProps) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <Home className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Início</span>
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        
        <BreadcrumbSeparator>
          <ChevronRight className="w-3.5 h-3.5" />
        </BreadcrumbSeparator>
        
        <BreadcrumbItem>
          {mode === 'list' ? (
            <BreadcrumbPage className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Artigos
            </BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link to="/articles" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <FileText className="w-3.5 h-3.5" />
                Artigos
              </Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        
        {articleTitle && (
          <>
            <BreadcrumbSeparator>
              <ChevronRight className="w-3.5 h-3.5" />
            </BreadcrumbSeparator>
            
            <BreadcrumbItem>
              {mode === 'edit' ? (
                <BreadcrumbLink asChild>
                  <Link 
                    to={`/articles/${window.location.pathname.split('/')[2]}`}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground max-w-[200px] truncate"
                  >
                    {articleTitle}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="max-w-[200px] truncate">
                  {articleTitle}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
            
            {mode === 'edit' && (
              <>
                <BreadcrumbSeparator>
                  <ChevronRight className="w-3.5 h-3.5" />
                </BreadcrumbSeparator>
                
                <BreadcrumbItem>
                  <BreadcrumbPage className="flex items-center gap-1.5">
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
