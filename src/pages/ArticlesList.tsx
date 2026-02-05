import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  FileText, 
  Plus, 
  Search, 
  MoreHorizontal, 
  Eye, 
  Pencil, 
  Trash2, 
  Upload,
  RefreshCw,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useArticles } from '@/hooks/useArticles';
import { useProjects } from '@/hooks/useProjects';
import { useWordPressPublish } from '@/hooks/useWordPressPublish';
import { useToast } from '@/hooks/use-toast';

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  generating: { label: 'Em criação', className: 'bg-amber-100 text-amber-700' },
  ready: { label: 'Finalizado', className: 'bg-blue-100 text-blue-700' },
  published: { label: 'Publicado', className: 'bg-green-100 text-green-700' },
  error: { label: 'Erro', className: 'bg-red-100 text-red-700' },
  queued: { label: 'Na Fila', className: 'bg-orange-100 text-orange-700' },
  scheduled: { label: 'Agendado', className: 'bg-purple-100 text-purple-700' },
};

const statusTabs = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Publicado' },
  { value: 'scheduled', label: 'Agendado' },
  { value: 'ready', label: 'Finalizado' },
  { value: 'generating', label: 'Em criação' },
  { value: 'queued', label: 'Na Fila' },
  { value: 'error', label: 'Erro' },
];

export default function ArticlesList() {
  const { articles, isLoading, deleteArticle } = useArticles();
  const { projects } = useProjects();
  const { publishMultiple, isPublishing } = useWordPressPublish();
  const { toast } = useToast();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter articles
  const filteredArticles = useMemo(() => {
    return articles.filter((a) => {
      const matchesSearch = 
        a.title?.toLowerCase().includes(search.toLowerCase()) || 
        a.keyword.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      const matchesProject = projectFilter === 'all' || a.project_id === projectFilter;
      return matchesSearch && matchesStatus && matchesProject;
    });
  }, [articles, search, statusFilter, projectFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredArticles.length / itemsPerPage) || 1;
  const paginatedArticles = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredArticles.slice(start, start + itemsPerPage);
  }, [filteredArticles, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  const handleFilterChange = (setter: (val: string) => void) => (val: string) => {
    setter(val);
    setCurrentPage(1);
  };

  const toggleSelectAll = () => {
    if (selectedArticles.size === paginatedArticles.length) {
      setSelectedArticles(new Set());
    } else {
      setSelectedArticles(new Set(paginatedArticles.map(a => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedArticles);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedArticles(newSelected);
  };

  const clearSelection = () => {
    setSelectedArticles(new Set());
  };

  // Bulk publish
  const handleBulkPublish = async () => {
    const selectedItems = articles.filter(a => selectedArticles.has(a.id));
    const articlesToPublish = selectedItems
      .filter(a => a.project_id && a.status !== 'published')
      .map(a => ({ id: a.id, title: a.title, project_id: a.project_id }));

    if (articlesToPublish.length === 0) {
      toast({
        title: 'Nenhum artigo para publicar',
        description: 'Selecione artigos vinculados a projetos WordPress.',
        variant: 'destructive',
      });
      return;
    }

    await publishMultiple(articlesToPublish);
    clearSelection();
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    setIsDeleting(true);
    let deleted = 0;
    let failed = 0;

    for (const id of selectedArticles) {
      try {
        await deleteArticle.mutateAsync(id);
        deleted++;
      } catch {
        failed++;
      }
    }

    setIsDeleting(false);
    setShowDeleteDialog(false);
    clearSelection();

    toast({
      title: 'Exclusão concluída',
      description: `${deleted} artigos excluídos${failed > 0 ? `, ${failed} falharam` : ''}.`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Artigos</h1>
          <Badge variant="secondary" className="text-sm">
            Total: {filteredArticles.length}
          </Badge>
        </div>
        <Button asChild className="bg-primary hover:bg-primary/90">
          <Link to="/articles/new">
            <Plus className="w-4 h-4 mr-2" />
            Novo Artigo
          </Link>
        </Button>
      </div>

      {/* Bulk Actions Bar */}
      {selectedArticles.size > 0 && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <Badge className="bg-primary text-primary-foreground">
              {selectedArticles.size} selecionado{selectedArticles.size > 1 ? 's' : ''}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="text-muted-foreground"
            >
              <X className="w-4 h-4 mr-1" />
              Limpar
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleBulkPublish}
              disabled={isPublishing}
              className="bg-primary"
            >
              {isPublishing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Publicar Selecionados
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir Selecionados
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card rounded-xl p-4 shadow-sm space-y-4">
        {/* Search and Project Filter */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar artigos..."
              className="pl-10"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <Select value={projectFilter} onValueChange={handleFilterChange(setProjectFilter)}>
            <SelectTrigger className="w-full lg:w-[200px]">
              <span className="flex items-center gap-2">
                <span className="text-lg">📁</span>
                <SelectValue placeholder="Todos os projetos" />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os projetos</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Tabs */}
        <div className="flex flex-wrap gap-2">
          {statusTabs.map((tab) => (
            <Button
              key={tab.value}
              variant={statusFilter === tab.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange(setStatusFilter)(tab.value)}
              className={cn(
                'rounded-full',
                statusFilter === tab.value && 'bg-primary text-primary-foreground'
              )}
            >
              {tab.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-sm overflow-hidden">
        {filteredArticles.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {articles.length === 0 ? 'Nenhum artigo criado' : 'Nenhum resultado encontrado'}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedArticles.size === paginatedArticles.length && paginatedArticles.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-24">Imagem</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedArticles.map((article) => {
                  const status = statusConfig[article.status] || statusConfig.draft;
                  return (
                    <TableRow 
                      key={article.id} 
                      className={cn(
                        "group hover:bg-muted/30",
                        selectedArticles.has(article.id) && "bg-primary/5"
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedArticles.has(article.id)}
                          onCheckedChange={() => toggleSelect(article.id)}
                        />
                      </TableCell>
                      <TableCell>
                        {article.featured_image_url ? (
                          <img
                            src={article.featured_image_url}
                            alt=""
                            className="w-20 h-14 object-cover rounded-lg border"
                          />
                        ) : (
                          <div className="w-20 h-14 bg-muted rounded-lg border flex items-center justify-center">
                            <div className="text-center">
                              <ImageIcon className="w-5 h-5 text-muted-foreground mx-auto" />
                              <span className="text-[10px] text-muted-foreground">Sem imagem</span>
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium line-clamp-2">
                            {article.title || article.keyword}
                          </p>
                          {article.excerpt && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {article.excerpt}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('font-normal', status.className)}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="w-4 h-4 mr-2" />
                              Ver
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Pencil className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Upload className="w-4 h-4 mr-2" />
                              Publicar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteArticle.mutate(article.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
              <div className="text-sm text-muted-foreground">
                Total: {filteredArticles.length} artigos
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Página {currentPage} de {totalPages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Itens por página</span>
                  <Select
                    value={String(itemsPerPage)}
                    onValueChange={(val) => {
                      setItemsPerPage(Number(val));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-16 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir artigos selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir {selectedArticles.size} artigo{selectedArticles.size > 1 ? 's' : ''}. 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir {selectedArticles.size} artigo{selectedArticles.size > 1 ? 's' : ''}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
