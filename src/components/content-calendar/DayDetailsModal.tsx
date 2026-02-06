import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Calendar, 
  Plus, 
  ExternalLink, 
  FileText, 
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ImageIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ContentItem, statusConfig } from './types';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const statusIcons = {
  scheduled: Clock,
  generating: RefreshCw,
  draft: FileText,
  ready: CheckCircle2,
  published: CheckCircle2,
  error: AlertCircle,
};

interface DayDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  content: ContentItem[];
}

export function DayDetailsModal({ open, onOpenChange, date, content }: DayDetailsModalProps) {
  const navigate = useNavigate();

  // Early return must come after hooks
  if (!date) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Carregando...</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const handleArticleClick = (item: ContentItem) => {
    navigate(`/articles/${item.id}`);
    onOpenChange(false);
  };

  const handleCreateNew = () => {
    navigate('/articles/new');
    onOpenChange(false);
  };

  // Group content by status
  const groupedContent = content.reduce((acc, item) => {
    if (!acc[item.status]) acc[item.status] = [];
    acc[item.status].push(item);
    return acc;
  }, {} as Record<string, ContentItem[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg capitalize">
                  {format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {content.length} {content.length === 1 ? 'conteúdo' : 'conteúdos'}
                </p>
              </div>
            </div>
            <Button onClick={handleCreateNew} size="sm" className="bg-gradient-accent">
              <Plus className="w-4 h-4 mr-2" />
              Novo Conteúdo
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] mt-4">
          {content.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-2">Nenhum conteúdo nesta data</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Crie um novo artigo ou arraste um existente para esta data.
              </p>
              <Button onClick={handleCreateNew} variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Criar Artigo
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedContent).map(([status, items]) => {
                const config = statusConfig[status as keyof typeof statusConfig];
                const Icon = statusIcons[status as keyof typeof statusIcons];
                
                return (
                  <div key={status}>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="secondary" className={cn('gap-1', config.bgColor, config.color)}>
                        <Icon className="w-3 h-3" />
                        {config.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ({items.length})
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      {items.map(item => (
                        <div
                          key={item.id}
                          className="flex items-start gap-4 p-4 rounded-xl border bg-card hover:shadow-md transition-all cursor-pointer group"
                          onClick={() => handleArticleClick(item)}
                        >
                          {item.imageUrl ? (
                            <img 
                              src={item.imageUrl} 
                              alt=""
                              className="w-20 h-14 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-20 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                              <ImageIcon className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                              {item.title}
                            </h4>
                            {item.excerpt && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {item.excerpt}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2">
                              {item.projectName && (
                                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                  {item.projectName}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {item.keyword}
                              </span>
                            </div>
                          </div>
                          
                          <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
