import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
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
  X,
  CheckCircle2,
  PartyPopper,
  Folder,
  Check,
  Bell,
  Coins,
  ChevronDown,
  Globe,
  Calendar,
  Clock,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useArticles } from '@/hooks/useArticles';
import { useProjects } from '@/hooks/useProjects';
import { useWordPressPublish } from '@/hooks/useWordPressPublish';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string; bgColor: string }> = {
  draft: { 
    label: 'Rascunho', 
    icon: <FileText className="w-3 h-3" />,
    className: 'bg-muted text-muted-foreground border-muted-foreground/20',
    bgColor: 'bg-muted/30'
  },
  generating: { 
    label: 'Em criação', 
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    className: 'bg-amber-100 text-amber-700 border-amber-200',
    bgColor: 'bg-amber-50'
  },
  ready: { 
    label: 'Finalizado', 
    icon: <CheckCircle2 className="w-3 h-3" />,
    className: 'bg-blue-100 text-blue-700 border-blue-200',
    bgColor: 'bg-blue-50'
  },
  published: { 
    label: 'Publicado', 
    icon: <Globe className="w-3 h-3" />,
    className: 'bg-green-100 text-green-700 border-green-200',
    bgColor: 'bg-green-50'
  },
  error: { 
    label: 'Erro', 
    icon: <AlertCircle className="w-3 h-3" />,
    className: 'bg-red-100 text-red-700 border-red-200',
    bgColor: 'bg-red-50'
  },
  queued: { 
    label: 'Na Fila', 
    icon: <Clock className="w-3 h-3" />,
    className: 'bg-orange-100 text-orange-700 border-orange-200',
    bgColor: 'bg-orange-50'
  },
  scheduled: { 
    label: 'Agendado', 
    icon: <Calendar className="w-3 h-3" />,
    className: 'bg-purple-100 text-purple-700 border-purple-200',
    bgColor: 'bg-purple-50'
  },
};

const statusTabs = [
  { value: 'all', label: 'Todos', count: 0 },
  { value: 'published', label: 'Publicado', count: 0 },
  { value: 'scheduled', label: 'Agendado', count: 0 },
  { value: 'ready', label: 'Finalizado', count: 0 },
  { value: 'generating', label: 'Em criação', count: 0 },
  { value: 'queued', label: 'Na Fila', count: 0 },
  { value: 'error', label: 'Erro', count: 0 },
];

// Success Modal Component
function SuccessModal({ 
  isOpen, 
  onClose, 
  successCount, 
  failedCount 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  successCount: number; 
  failedCount: number;
}) {
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md text-center border-0 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50">
        <div className="flex flex-col items-center py-6 space-y-4">
          {/* Animated Icon */}
          <div className="relative">
            <div className="absolute inset-0 animate-ping bg-green-400/30 rounded-full" />
            <div className="relative bg-gradient-to-br from-green-500 to-emerald-600 p-4 rounded-full animate-scale-in">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
          </div>

          {/* Confetti Animation */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-fade-in"
                style={{
                  left: `${10 + (i % 6) * 15}%`,
                  top: `${20 + Math.floor(i / 6) * 30}%`,
                  animationDelay: `${i * 0.1}s`,
                }}
              >
                <PartyPopper 
                  className="w-5 h-5 text-amber-500 opacity-60" 
                  style={{ transform: `rotate(${i * 30}deg)` }}
                />
              </div>
            ))}
          </div>

          {/* Success Message */}
          <div className="space-y-2 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <h3 className="text-2xl font-bold text-green-700 dark:text-green-400">
              Publicação Concluída! 🎉
            </h3>
            <p className="text-green-600 dark:text-green-300">
              {successCount} artigo{successCount > 1 ? 's' : ''} publicado{successCount > 1 ? 's' : ''} com sucesso
              {failedCount > 0 && (
                <span className="block text-sm text-amber-600 dark:text-amber-400 mt-1">
                  {failedCount} artigo{failedCount > 1 ? 's' : ''} não {failedCount > 1 ? 'puderam' : 'pôde'} ser publicado{failedCount > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>

          {/* Progress Bar Animation */}
          <div className="w-full max-w-xs h-1.5 bg-green-200 dark:bg-green-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-[3500ms] ease-linear"
              style={{ width: isOpen ? '100%' : '0%' }}
            />
          </div>

          <Button 
            variant="outline" 
            onClick={onClose}
            className="mt-2 border-green-300 text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/50"
          >
            Continuar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Publishing Progress Component
function PublishingProgress({ 
  isPublishing, 
  current, 
  total 
}: { 
  isPublishing: boolean; 
  current: number; 
  total: number;
}) {
  if (!isPublishing) return null;

  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
      <div className="bg-card border shadow-lg rounded-xl p-4 min-w-[280px]">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
          <div>
            <p className="font-medium text-sm">Publicando artigos...</p>
            <p className="text-xs text-muted-foreground">
              {current} de {total} concluído{current > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ArticlesList() {
  const navigate = useNavigate();
  const { articles, isLoading, deleteArticle } = useArticles();
  const { projects } = useProjects();
  const { publishMultiple, isPublishing } = useWordPressPublish();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [publishResult, setPublishResult] = useState({ success: 0, failed: 0 });
  
  // Publishing progress state
  const [publishProgress, setPublishProgress] = useState({ current: 0, total: 0 });
  
  // Recently published articles for highlight animation
  const [recentlyPublished, setRecentlyPublished] = useState<Set<string>>(new Set());

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: articles.length };
    articles.forEach(a => {
      counts[a.status] = (counts[a.status] || 0) + 1;
    });
    return counts;
  }, [articles]);

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

  // Bulk publish with progress tracking
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

    setPublishProgress({ current: 0, total: articlesToPublish.length });

    const result = await publishMultiple(articlesToPublish);
    
    // Set recently published for animation
    const publishedIds = new Set(articlesToPublish.slice(0, result.success).map(a => a.id));
    setRecentlyPublished(publishedIds);
    
    // Show success modal
    setPublishResult(result);
    setShowSuccessModal(true);
    
    clearSelection();

    // Clear recently published highlight after animation
    setTimeout(() => {
      setRecentlyPublished(new Set());
    }, 3000);
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

  // Get project name
  const getProjectName = (projectId: string | null) => {
    if (!projectId) return null;
    return projects.find(p => p.id === projectId)?.name;
  };

  // Get user initials
  const userInitials = user?.email?.substring(0, 2).toUpperCase() || 'U';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <header className="sticky top-0 z-40 bg-card border-b">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Left Side */}
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">Artigos</h1>
            <Badge 
              variant="secondary"
              className="bg-primary/10 text-primary text-sm px-2.5 py-0.5 font-medium"
            >
              Total: {filteredArticles.length}
            </Badge>
          </div>
          
          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* New Article Button */}
            <Button asChild className="bg-primary hover:bg-primary/90">
              <Link to="/gerador-artigos">
                <Plus className="w-4 h-4 mr-2" />
                Novo Artigo
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Filters and Actions Bar */}
      <div className="px-6 py-4 bg-card border-b space-y-4">
        {/* Row 1: Search and Project Filter */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Pesquisar artigos..."
              className="pl-10 pr-4 py-2 text-sm bg-background"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          
          {/* Project Filter Dropdown */}
          <Select value={projectFilter} onValueChange={handleFilterChange(setProjectFilter)}>
            <SelectTrigger className="w-full lg:w-64 bg-background">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-amber-500" />
                <span className="text-sm truncate">
                  {projectFilter === 'all' 
                    ? 'Todos os projetos' 
                    : getProjectName(projectFilter) || 'Projeto'}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-amber-500" />
                  <span>Todos os projetos</span>
                </div>
              </SelectItem>
              
              <DropdownMenuSeparator />
              
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-amber-600" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{project.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {project.domain || 'Sem website'}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Spacer */}
          <div className="flex-1 hidden lg:block" />
          
          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            {/* Publish in Bulk */}
            <Button
              variant="default"
              size="sm"
              disabled={selectedArticles.size === 0 || isPublishing}
              onClick={handleBulkPublish}
              className="bg-primary hover:bg-primary/90 flex-1 lg:flex-none"
            >
              {isPublishing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Publicar em massa
            </Button>
            
            {/* Delete Selected */}
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedArticles.size === 0}
              onClick={() => setShowDeleteDialog(true)}
              className="flex-1 lg:flex-none"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir ({selectedArticles.size})
            </Button>
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="px-6 py-3 bg-muted/30 border-b">
        <div className="flex items-center justify-between">
          <Tabs value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)} className="w-auto">
            <TabsList className="bg-transparent h-auto p-0 gap-1">
              {statusTabs.map((tab) => {
                const count = statusCounts[tab.value] || 0;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                      "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm",
                      "data-[state=inactive]:bg-background data-[state=inactive]:hover:bg-muted"
                    )}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className={cn(
                        "ml-1.5 text-xs",
                        statusFilter === tab.value ? "opacity-80" : "text-muted-foreground"
                      )}>
                        ({count})
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.reload()}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Selection Info Bar */}
      {selectedArticles.size > 0 && (
        <div className="px-6 py-3 bg-primary/5 border-b animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary text-primary-foreground">
                {selectedArticles.size} selecionado{selectedArticles.size > 1 ? 's' : ''}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="text-muted-foreground h-7"
              >
                <X className="w-3 h-3 mr-1" />
                Limpar seleção
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Table */}
      <div className="p-6">
        <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
          {filteredArticles.length === 0 ? (
            <div className="p-16 text-center">
              <FileText className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {articles.length === 0 ? 'Nenhum artigo criado' : 'Nenhum resultado encontrado'}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                {articles.length === 0 
                  ? 'Comece criando seu primeiro artigo com IA' 
                  : 'Tente ajustar os filtros de busca'}
              </p>
              {articles.length === 0 && (
                <Button asChild>
                  <Link to="/gerador-artigos">
                    <Plus className="w-4 h-4 mr-2" />
                    Criar Primeiro Artigo
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedArticles.size === paginatedArticles.length && paginatedArticles.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-24">Imagem</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead className="w-40">Projeto</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="w-36">Data</TableHead>
                    <TableHead className="w-20 text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedArticles.map((article) => {
                    const status = statusConfig[article.status] || statusConfig.draft;
                    const isRecentlyPublished = recentlyPublished.has(article.id);
                    const projectName = getProjectName(article.project_id);
                    
                    return (
                      <TableRow 
                        key={article.id} 
                        className={cn(
                          "group transition-all duration-500",
                          selectedArticles.has(article.id) && "bg-primary/5",
                          isRecentlyPublished && "bg-green-100 dark:bg-green-900/30 animate-pulse"
                        )}
                      >
                        {/* Checkbox */}
                        <TableCell>
                          <div className="relative">
                            <Checkbox
                              checked={selectedArticles.has(article.id)}
                              onCheckedChange={() => toggleSelect(article.id)}
                            />
                            {isRecentlyPublished && (
                              <div className="absolute -right-1 -top-1">
                                <CheckCircle2 className="w-4 h-4 text-green-600 animate-scale-in" />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        
                        {/* Image */}
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
                                <span className="text-[9px] text-muted-foreground">Sem imagem</span>
                              </div>
                            </div>
                          )}
                        </TableCell>
                        
                        {/* Title */}
                        <TableCell>
                          <div className="space-y-1 max-w-md">
                            <p className="font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors cursor-pointer"
                               onClick={() => navigate(`/articles/${article.id}`)}>
                              {article.title || article.keyword}
                            </p>
                            {article.excerpt && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {article.excerpt}
                              </p>
                            )}
                            {article.word_count && (
                              <span className="text-xs text-muted-foreground">
                                {article.word_count.toLocaleString()} palavras
                              </span>
                            )}
                          </div>
                        </TableCell>
                        
                        {/* Project */}
                        <TableCell>
                          {projectName ? (
                            <div className="flex items-center gap-2">
                              <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                              <span className="text-sm text-foreground truncate max-w-[120px]">
                                {projectName}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        
                        {/* Status */}
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className={cn(
                              'font-normal transition-all duration-300 gap-1.5',
                              status.className,
                              isRecentlyPublished && 'bg-green-500 text-white border-green-500 animate-scale-in'
                            )}
                          >
                            {isRecentlyPublished ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                Publicado!
                              </>
                            ) : (
                              <>
                                {status.icon}
                                {status.label}
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        
                        {/* Date */}
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(article.created_at), "dd MMM yyyy", { locale: ptBR })}
                          </div>
                          <div className="text-xs text-muted-foreground/70">
                            {format(new Date(article.created_at), "HH:mm", { locale: ptBR })}
                          </div>
                        </TableCell>
                        
                        {/* Actions */}
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => navigate(`/articles/${article.id}`)}>
                                <Eye className="w-4 h-4 mr-2" />
                                Ver artigo
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/articles/${article.id}/edit`)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              {article.published_url && (
                                <DropdownMenuItem asChild>
                                  <a href={article.published_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Ver publicado
                                  </a>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                disabled={!article.project_id || article.status === 'published'}
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                Publicar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
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
              <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-4 border-t bg-muted/30 gap-4">
                <div className="text-sm text-muted-foreground">
                  {selectedArticles.size > 0 ? (
                    <span className="font-medium text-primary">
                      {selectedArticles.size} de {filteredArticles.length} selecionados
                    </span>
                  ) : (
                    <span>Total: {filteredArticles.length} artigos</span>
                  )}
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Items per page */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground whitespace-nowrap">Itens por página</span>
                    <Select
                      value={String(itemsPerPage)}
                      onValueChange={(val) => {
                        setItemsPerPage(Number(val));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="w-16 h-8 bg-background">
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
                  
                  {/* Page info */}
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    Página {currentPage} de {totalPages}
                  </span>
                  
                  {/* Navigation */}
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
      </div>

      {/* Success Modal */}
      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        successCount={publishResult.success}
        failedCount={publishResult.failed}
      />

      {/* Publishing Progress */}
      <PublishingProgress
        isPublishing={isPublishing}
        current={publishProgress.current}
        total={publishProgress.total}
      />

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
