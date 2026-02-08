import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  History,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  FileText,
  Calendar,
  RefreshCw,
  Folder,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

interface BulkGenerationGroup {
  date: string;
  hour: string;
  totalCount: number;
  completedCount: number;
  errorCount: number;
  generatingCount: number;
  draftCount: number;
  publishedCount: number;
  scheduledCount: number;
  articles: Array<{
    id: string;
    keyword: string;
    title: string | null;
    status: string;
    project_id: string | null;
    created_at: string;
    scheduled_at: string | null;
    published_at: string | null;
  }>;
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100, 200, 500];

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Publicado' },
  { value: 'ready', label: 'Finalizado' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'generating', label: 'Em criação' },
  { value: 'error', label: 'Erro' },
];

export function BulkGenerationHistory() {
  const { toast } = useToast();
  const { projects } = useProjects();
  const connectedProjects = projects.filter(p => p.is_connected);
  
  const [isLoading, setIsLoading] = useState(true);
  const [groups, setGroups] = useState<BulkGenerationGroup[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishProjectId, setPublishProjectId] = useState<string>('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [totalArticles, setTotalArticles] = useState(0);
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Fetch articles and group them by date/hour
  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      // Fetch recent articles (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: articles, error } = await supabase
        .from('articles')
        .select('id, keyword, title, status, project_id, created_at, scheduled_at, published_at')
        .eq('user_id', session.user.id)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by date and hour
      const groupedMap = new Map<string, BulkGenerationGroup>();

      (articles || []).forEach(article => {
        const createdAt = new Date(article.created_at);
        const dateKey = format(createdAt, 'yyyy-MM-dd');
        const hourKey = format(createdAt, 'HH:00');
        const groupKey = `${dateKey}-${hourKey}`;

        if (!groupedMap.has(groupKey)) {
          groupedMap.set(groupKey, {
            date: dateKey,
            hour: hourKey,
            totalCount: 0,
            completedCount: 0,
            errorCount: 0,
            generatingCount: 0,
            draftCount: 0,
            publishedCount: 0,
            scheduledCount: 0,
            articles: [],
          });
        }

        const group = groupedMap.get(groupKey)!;
        group.totalCount++;
        group.articles.push(article);

        switch (article.status) {
          case 'ready':
            group.completedCount++;
            break;
          case 'draft':
            group.draftCount++;
            break;
          case 'error':
            group.errorCount++;
            break;
          case 'generating':
            group.generatingCount++;
            break;
          case 'published':
            group.publishedCount++;
            break;
        }
        
        if (article.scheduled_at) {
          group.scheduledCount++;
        }
      });

      // Convert to array and sort by date/hour (newest first)
      const groupedArray = Array.from(groupedMap.values()).sort((a, b) => {
        const dateA = `${a.date} ${a.hour}`;
        const dateB = `${b.date} ${b.hour}`;
        return dateB.localeCompare(dateA);
      });

      setGroups(groupedArray);
      setTotalArticles(articles?.length || 0);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Filter groups by status
  const filteredGroups = groups.map(group => {
    if (statusFilter === 'all') return group;
    
    const filteredArticles = group.articles.filter(a => a.status === statusFilter);
    if (filteredArticles.length === 0) return null;
    
    return {
      ...group,
      articles: filteredArticles,
      totalCount: filteredArticles.length,
      completedCount: filteredArticles.filter(a => a.status === 'ready').length,
      errorCount: filteredArticles.filter(a => a.status === 'error').length,
      generatingCount: filteredArticles.filter(a => a.status === 'generating').length,
      draftCount: filteredArticles.filter(a => a.status === 'draft').length,
      publishedCount: filteredArticles.filter(a => a.status === 'published').length,
      scheduledCount: filteredArticles.filter(a => a.scheduled_at).length,
    };
  }).filter(Boolean) as BulkGenerationGroup[];

  const filteredArticlesCount = filteredGroups.reduce((acc, g) => acc + g.totalCount, 0);
  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);
  const paginatedGroups = filteredGroups.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Toggle article selection
  const toggleArticle = (articleId: string) => {
    setSelectedArticles(prev => {
      const next = new Set(prev);
      if (next.has(articleId)) {
        next.delete(articleId);
      } else {
        next.add(articleId);
      }
      return next;
    });
  };

  // Toggle group selection (select all articles in group)
  const toggleGroup = (group: BulkGenerationGroup) => {
    const readyArticles = group.articles.filter(a => a.status === 'ready' || a.status === 'draft');
    const allSelected = readyArticles.every(a => selectedArticles.has(a.id));
    
    setSelectedArticles(prev => {
      const next = new Set(prev);
      if (allSelected) {
        readyArticles.forEach(a => next.delete(a.id));
      } else {
        readyArticles.forEach(a => next.add(a.id));
      }
      return next;
    });
  };

  // Toggle expand/collapse group
  const toggleExpand = (groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Publish selected articles
  const handlePublish = async () => {
    if (!publishProjectId || selectedArticles.size === 0) {
      toast({
        title: 'Selecione um projeto',
        description: 'Escolha o projeto WordPress para publicar os artigos.',
        variant: 'destructive',
      });
      return;
    }

    setIsPublishing(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Não autenticado');

      const articleIds = Array.from(selectedArticles);
      let successCount = 0;
      let errorCount = 0;

      for (const articleId of articleIds) {
        try {
          const response = await supabase.functions.invoke('publish-to-wordpress', {
            body: {
              articleId,
              projectId: publishProjectId,
            },
          });

          if (response.error) throw response.error;
          successCount++;
        } catch (error) {
          console.error(`Error publishing article ${articleId}:`, error);
          errorCount++;
        }
      }

      toast({
        title: 'Publicação concluída',
        description: `${successCount} artigos publicados, ${errorCount} erros`,
      });

      setSelectedArticles(new Set());
      setShowPublishDialog(false);
      fetchHistory();
    } catch (error) {
      toast({
        title: 'Erro na publicação',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // Get project name by id
  const getProjectName = (projectId: string | null) => {
    if (!projectId) return 'Sem projeto';
    const project = projects.find(p => p.id === projectId);
    return project?.name || 'Projeto não encontrado';
  };

  // Status badge component
  const getStatusBadge = (status: string, scheduled_at: string | null) => {
    if (scheduled_at && status !== 'published') {
      return (
        <Badge variant="outline" className="gap-1 text-primary border-primary">
          <Calendar className="w-3 h-3" />
          Agendado
        </Badge>
      );
    }
    
    switch (status) {
      case 'published':
        return (
          <Badge className="gap-1 bg-success/10 text-success hover:bg-success/10">
            <CheckCircle2 className="w-3 h-3" />
            Publicado
          </Badge>
        );
      case 'ready':
        return (
          <Badge variant="secondary" className="gap-1">
            <FileText className="w-3 h-3" />
            Finalizado
          </Badge>
        );
      case 'draft':
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="w-3 h-3" />
            Rascunho
          </Badge>
        );
      case 'generating':
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Em criação
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="w-3 h-3" />
            Erro
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="w-3 h-3" />
            Na fila
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Histórico de Geração em Massa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          Histórico de Geração em Massa
        </CardTitle>
        <div className="flex items-center gap-2">
          {selectedArticles.size > 0 && (
            <Button 
              onClick={() => setShowPublishDialog(true)}
              className="gap-2"
            >
              <Send className="w-4 h-4" />
              Publicar {selectedArticles.size} selecionados
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={fetchHistory}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>Nenhuma geração encontrada nos últimos 7 dias</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filters and stats */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Status:</span>
                {STATUS_FILTERS.map((filter) => (
                  <Button
                    key={filter.value}
                    variant={statusFilter === filter.value ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setStatusFilter(filter.value);
                      setCurrentPage(1);
                    }}
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {filteredGroups.length} grupos ({filteredArticlesCount} artigos)
                </span>
                <Select 
                  value={String(itemsPerPage)} 
                  onValueChange={(v) => {
                    setItemsPerPage(Number(v));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-[130px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size} por página
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Paginated groups */}
            {paginatedGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>Nenhum artigo encontrado com o filtro selecionado</p>
              </div>
            ) : paginatedGroups.map((group) => {
              const groupKey = `${group.date}-${group.hour}`;
              const isExpanded = expandedGroups.has(groupKey);
              const readyArticles = group.articles.filter(a => a.status === 'ready' || a.status === 'draft');
              const allSelected = readyArticles.length > 0 && readyArticles.every(a => selectedArticles.has(a.id));
              const someSelected = readyArticles.some(a => selectedArticles.has(a.id));

              return (
                <div key={groupKey} className="border rounded-lg overflow-hidden">
                  {/* Group Header */}
                  <div 
                    className="flex items-center justify-between px-4 py-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleExpand(groupKey)}
                  >
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={() => toggleGroup(group)}
                        onClick={(e) => e.stopPropagation()}
                        className={someSelected && !allSelected ? 'data-[state=checked]:bg-primary/50' : ''}
                      />
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          <Calendar className="w-4 h-4 text-primary" />
                          {format(new Date(`${group.date}T${group.hour}`), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                          <span className="text-muted-foreground">às {group.hour}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {group.totalCount} artigo{group.totalCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    
                    {/* Status Summary */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {group.publishedCount > 0 && (
                        <Badge className="gap-1 bg-success/10 text-success">
                          <CheckCircle2 className="w-3 h-3" />
                          {group.publishedCount} Publicados
                        </Badge>
                      )}
                      {group.scheduledCount > 0 && (
                        <Badge variant="outline" className="gap-1 text-primary border-primary">
                          <Calendar className="w-3 h-3" />
                          {group.scheduledCount} Agendados
                        </Badge>
                      )}
                      {group.completedCount > 0 && (
                        <Badge variant="secondary" className="gap-1">
                          <FileText className="w-3 h-3" />
                          {group.completedCount} Finalizados
                        </Badge>
                      )}
                      {group.generatingCount > 0 && (
                        <Badge variant="secondary" className="gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {group.generatingCount} Em criação
                        </Badge>
                      )}
                      {group.draftCount > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <Clock className="w-3 h-3" />
                          {group.draftCount} Na fila
                        </Badge>
                      )}
                      {group.errorCount > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="w-3 h-3" />
                          {group.errorCount} Erros
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Articles Table (Expanded) */}
                  {isExpanded && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Keyword</TableHead>
                          <TableHead>Título</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Projeto</TableHead>
                          <TableHead>Horário</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.articles.map((article) => (
                          <TableRow key={article.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedArticles.has(article.id)}
                                onCheckedChange={() => toggleArticle(article.id)}
                                disabled={article.status === 'published' || article.status === 'generating'}
                              />
                            </TableCell>
                            <TableCell className="font-medium max-w-[200px] truncate">
                              {article.keyword}
                            </TableCell>
                            <TableCell className="max-w-[250px] truncate">
                              {article.title || '-'}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(article.status, article.scheduled_at)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Folder className="w-3 h-3" />
                                {getProjectName(article.project_id)}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(article.created_at), 'HH:mm:ss')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              );
            })}

            {/* Pagination Controls */}
            {filteredGroups.length > itemsPerPage && (
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Página {currentPage} de {totalPages}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  {/* Page numbers */}
                  <div className="flex items-center gap-1 mx-2">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Publish Dialog */}
      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Publicar Artigos em Massa
            </DialogTitle>
            <DialogDescription>
              Selecione o projeto WordPress para publicar os {selectedArticles.size} artigos selecionados.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Projeto Final</label>
              <Select value={publishProjectId} onValueChange={setPublishProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o projeto WordPress" />
                </SelectTrigger>
                <SelectContent>
                  {connectedProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4" />
                        {project.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="bg-muted/50 p-3 rounded-lg text-sm">
              <strong>{selectedArticles.size}</strong> artigos serão publicados no projeto selecionado.
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPublishDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handlePublish} 
              disabled={isPublishing || !publishProjectId}
              className="gap-2"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Publicando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Publicar em Massa
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
