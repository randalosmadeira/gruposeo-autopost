import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  FileText, 
  Plus, 
  Search, 
  MoreVertical, 
  Eye, 
  Pencil, 
  Trash2, 
  Upload,
  Sparkles,
  RefreshCw,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  CheckCircle2,
  PartyPopper,
  Folder,
  Globe,
  Calendar,
  Clock,
  AlertCircle,
  ExternalLink,
  Link as LinkIcon,
  FileCheck,
  Inbox,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  CalendarDays
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useArticles } from '@/hooks/useArticles';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BulkPublishModal } from '@/components/articles/BulkPublishModal';
import { EmotionalTriggerBadge } from '@/components/shared/EmotionalTriggerBadge';

// Status configuration with icons and colors
const statusConfig: Record<string, { 
  label: string; 
  icon: React.ReactNode; 
  bgColor: string;
  textColor: string;
  borderColor: string;
}> = {
  draft: { 
    label: 'Na Fila', 
    icon: <Inbox className="w-3 h-3" />,
    bgColor: 'bg-muted',
    textColor: 'text-muted-foreground',
    borderColor: 'border-muted'
  },
  generating: { 
    label: 'Em criação', 
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    bgColor: 'bg-warning/20',
    textColor: 'text-warning-foreground',
    borderColor: 'border-warning/30'
  },
  ready: { 
    label: 'Finalizado', 
    icon: <FileCheck className="w-3 h-3" />,
    bgColor: 'bg-primary/10',
    textColor: 'text-primary',
    borderColor: 'border-primary/20'
  },
  published: { 
    label: 'Publicado', 
    icon: <CheckCircle2 className="w-3 h-3" />,
    bgColor: 'bg-success/10',
    textColor: 'text-success',
    borderColor: 'border-success/20'
  },
  error: { 
    label: 'Erro', 
    icon: <AlertCircle className="w-3 h-3" />,
    bgColor: 'bg-destructive/10',
    textColor: 'text-destructive',
    borderColor: 'border-destructive/20'
  },
  scheduled: { 
    label: 'Agendado', 
    icon: <Clock className="w-3 h-3" />,
    bgColor: 'bg-accent/50',
    textColor: 'text-accent-foreground',
    borderColor: 'border-accent'
  },
};

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
      <DialogContent className="sm:max-w-md text-center border-0 bg-gradient-to-br from-green-50 to-emerald-50">
        <div className="flex flex-col items-center py-6 space-y-4">
          <div className="relative">
            <div className="absolute inset-0 animate-ping bg-green-400/30 rounded-full" />
            <div className="relative bg-gradient-to-br from-green-500 to-emerald-600 p-4 rounded-full">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
          </div>

          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="absolute"
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

          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-green-700">
              Publicação Concluída! 🎉
            </h3>
            <p className="text-green-600">
              {successCount} artigo{successCount > 1 ? 's' : ''} publicado{successCount > 1 ? 's' : ''} com sucesso
              {failedCount > 0 && (
                <span className="block text-sm text-amber-600 mt-1">
                  {failedCount} artigo{failedCount > 1 ? 's' : ''} não {failedCount > 1 ? 'puderam' : 'pôde'} ser publicado{failedCount > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>

          <div className="w-full max-w-xs h-1.5 bg-green-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-[3500ms] ease-linear"
              style={{ width: isOpen ? '100%' : '0%' }}
            />
          </div>

          <Button 
            variant="outline" 
            onClick={onClose}
            className="mt-2 border-green-300 text-green-700 hover:bg-green-100"
          >
            Continuar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Using BulkPublishModal from @/components/articles/BulkPublishModal

export default function ArticlesList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { articles, isLoading, deleteArticle } = useArticles();
  const { projects } = useProjects();
  const { toast } = useToast();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [publishResult, setPublishResult] = useState({ success: 0, failed: 0 });
  
  // Recently published articles for highlight animation
  const [recentlyPublished, setRecentlyPublished] = useState<Set<string>>(new Set());
  
  // Sorting and date filter states
  const [sortBy, setSortBy] = useState<'created_at' | 'scheduled_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  
  // Bulk SEO Analysis state
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  const [bulkAnalysisProgress, setBulkAnalysisProgress] = useState(0);

  // Status tabs configuration - proper counting based on DB status + scheduled_at field
  const statusTabs = useMemo(() => {
    // Count articles by actual database status
    const counts: Record<string, number> = { 
      all: articles.length,
      published: 0,
      scheduled: 0, // This is virtual - based on scheduled_at field
      ready: 0,
      generating: 0,
      draft: 0,
      error: 0,
    };
    
    articles.forEach(a => {
      // Count by actual status
      if (a.status === 'published') {
        counts.published++;
      } else if (a.status === 'ready') {
        // Check if it's scheduled (has scheduled_at but not published yet)
        if (a.scheduled_at && new Date(a.scheduled_at) > new Date()) {
          counts.scheduled++;
        } else {
          counts.ready++;
        }
      } else if (a.status === 'generating') {
        counts.generating++;
      } else if (a.status === 'draft') {
        counts.draft++;
      } else if (a.status === 'error') {
        counts.error++;
      }
    });
    
    return [
      { value: 'all', label: 'Todos', count: counts.all },
      { value: 'published', label: 'Publicado', count: counts.published },
      { value: 'scheduled', label: 'Agendado', count: counts.scheduled },
      { value: 'ready', label: 'Finalizado', count: counts.ready },
      { value: 'generating', label: 'Em criação', count: counts.generating },
      { value: 'draft', label: 'Na Fila', count: counts.draft },
      { value: 'error', label: 'Erro', count: counts.error },
    ];
  }, [articles]);

  // Filter and sort articles - proper status matching
  const filteredArticles = useMemo(() => {
    let filtered = articles.filter((a) => {
      const matchesSearch = 
        a.title?.toLowerCase().includes(search.toLowerCase()) || 
        a.keyword.toLowerCase().includes(search.toLowerCase());
      
      // Status matching with special handling for 'scheduled' virtual status
      let matchesStatus = false;
      if (statusFilter === 'all') {
        matchesStatus = true;
      } else if (statusFilter === 'scheduled') {
        // Scheduled = has scheduled_at in future and status is ready
        matchesStatus = a.status === 'ready' && a.scheduled_at && new Date(a.scheduled_at) > new Date();
      } else if (statusFilter === 'ready') {
        // Ready = status is ready but NOT scheduled for future
        matchesStatus = a.status === 'ready' && (!a.scheduled_at || new Date(a.scheduled_at) <= new Date());
      } else {
        matchesStatus = a.status === statusFilter;
      }
      
      const matchesProject = projectFilter === 'all' || a.project_id === projectFilter;
      
      // Date filter
      let matchesDate = true;
      if (dateFilter) {
        const articleDate = new Date(a.created_at);
        matchesDate = 
          articleDate.getFullYear() === dateFilter.getFullYear() &&
          articleDate.getMonth() === dateFilter.getMonth() &&
          articleDate.getDate() === dateFilter.getDate();
      }
      
      return matchesSearch && matchesStatus && matchesProject && matchesDate;
    });
    
    // Sort articles
    filtered.sort((a, b) => {
      const dateA = new Date(sortBy === 'scheduled_at' && a.scheduled_at ? a.scheduled_at : a.created_at).getTime();
      const dateB = new Date(sortBy === 'scheduled_at' && b.scheduled_at ? b.scheduled_at : b.created_at).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
    
    return filtered;
  }, [articles, search, statusFilter, projectFilter, dateFilter, sortBy, sortOrder]);

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

  // Handle publish complete callback from BulkPublishModal
  const handlePublishComplete = (result: { success: number; failed: number }) => {
    setPublishResult(result);
    
    // Set recently published articles for highlight effect
    const publishedIds = new Set(
      Array.from(selectedArticles).slice(0, result.success)
    );
    setRecentlyPublished(publishedIds);
    
    // Show success modal
    setShowSuccessModal(true);
    
    // Clear selection
    clearSelection();
    
    // Remove highlight after 3 seconds
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

  // Bulk SEO Analysis + Auto-Fix + Republish
  const handleBulkSEOAnalysis = async () => {
    if (selectedArticles.size === 0) return;
    setIsBulkAnalyzing(true);
    setBulkAnalysisProgress(0);

    const ids = Array.from(selectedArticles);
    const batchSize = 3; // smaller batches for optimize mode
    let processed = 0;
    let totalScore = 0;
    let optimizedCount = 0;
    let republishedCount = 0;

    try {
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        
        // Step 1: Analyze + Auto-fix
        const { data, error } = await supabase.functions.invoke('analyze-seo-advanced', {
          body: { article_ids: batch, mode: 'optimize' },
        });

        if (error) throw error;
        processed += batch.length;
        setBulkAnalysisProgress(processed);

        if (data?.results) {
          for (const r of data.results) {
            totalScore += r.score;
            if (r.optimized) {
              optimizedCount++;
              
              // Step 2: Republish if article was already published and has a project
              if (r.status === 'published' && r.project_id) {
                try {
                  const { error: pubError } = await supabase.functions.invoke('publish-to-wordpress', {
                    body: { articleId: r.article_id, projectId: r.project_id },
                  });
                  if (!pubError) republishedCount++;
                } catch (pubErr) {
                  console.error(`Republish failed for ${r.article_id}:`, pubErr);
                }
              }
            }
          }
        }
      }

      const avgScore = Math.round(totalScore / ids.length);
      toast({
        title: `SEO IA: Otimização Concluída ✅`,
        description: `${optimizedCount} artigos corrigidos. Score médio: ${avgScore}/100.${republishedCount > 0 ? ` ${republishedCount} republicados no WordPress.` : ''}`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['articles'] });
    } catch (e) {
      toast({ title: 'Erro na otimização em massa', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsBulkAnalyzing(false);
      setBulkAnalysisProgress(0);
    }
  };

  // Copy article link
  const handleCopyLink = (articleId: string) => {
    const article = articles.find(a => a.id === articleId);
    if (article?.published_url) {
      navigator.clipboard.writeText(article.published_url);
      toast({ title: 'Link copiado!' });
    }
  };

  // Get project name
  const getProjectName = (projectId: string | null) => {
    if (!projectId) return null;
    return projects.find(p => p.id === projectId)?.name;
  };

  // Refresh handler - invalidate cache for instant update
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['articles'] });
  };

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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">Artigos</h1>
            <Badge 
              variant="secondary"
              className="bg-primary/10 text-primary text-sm px-2.5 py-0.5 font-medium"
            >
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
      </header>

      {/* Filters and Actions Bar */}
      <div className="px-6 py-4 bg-card border-b space-y-4">
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
          
          {/* Project Filter */}
          <Select value={projectFilter} onValueChange={handleFilterChange(setProjectFilter)}>
            <SelectTrigger className="w-full lg:w-56 bg-background">
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
                    <span className="text-sm font-medium">{project.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Date Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className={cn(
                  "w-full lg:w-48 justify-start text-left font-normal bg-background",
                  dateFilter && "text-foreground"
                )}
              >
                <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                {dateFilter ? format(dateFilter, "dd/MM/yyyy", { locale: ptBR }) : "Filtrar por data"}
                {dateFilter && (
                  <X 
                    className="ml-auto h-4 w-4 hover:text-destructive cursor-pointer" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setDateFilter(undefined);
                      setCurrentPage(1);
                    }}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={dateFilter}
                onSelect={(date) => {
                  setDateFilter(date);
                  setCurrentPage(1);
                }}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          
          {/* Sort Options */}
          <Select 
            value={`${sortBy}-${sortOrder}`} 
            onValueChange={(val) => {
              const [newSortBy, newSortOrder] = val.split('-') as ['created_at' | 'scheduled_at', 'asc' | 'desc'];
              setSortBy(newSortBy);
              setSortOrder(newSortOrder);
            }}
          >
            <SelectTrigger className="w-full lg:w-52 bg-background">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  {sortBy === 'created_at' 
                    ? (sortOrder === 'desc' ? 'Mais recentes' : 'Mais antigos')
                    : (sortOrder === 'desc' ? 'Agendados (próx.)' : 'Agendados (dist.)')}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at-desc">
                <div className="flex items-center gap-2">
                  <ArrowDown className="w-4 h-4" />
                  <span>Mais recentes primeiro</span>
                </div>
              </SelectItem>
              <SelectItem value="created_at-asc">
                <div className="flex items-center gap-2">
                  <ArrowUp className="w-4 h-4" />
                  <span>Mais antigos primeiro</span>
                </div>
              </SelectItem>
              <DropdownMenuSeparator />
              <SelectItem value="scheduled_at-desc">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Agendados (próximos)</span>
                </div>
              </SelectItem>
              <SelectItem value="scheduled_at-asc">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Agendados (distantes)</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap">
          <Button
            variant="default"
            size="sm"
            disabled={selectedArticles.size === 0}
            onClick={() => setShowPublishModal(true)}
            className="bg-primary hover:bg-primary/90"
          >
            <Upload className="w-4 h-4 mr-2" />
            Publicar em massa
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={selectedArticles.size === 0 || isBulkAnalyzing}
            onClick={handleBulkSEOAnalysis}
          >
            {isBulkAnalyzing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {isBulkAnalyzing ? `Otimizando... (${bulkAnalysisProgress}/${selectedArticles.size})` : `Análise SEO IA (${selectedArticles.size})`}
          </Button>
          
          <Button
            variant="destructive"
            size="sm"
            disabled={selectedArticles.size === 0}
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Excluir selecionados ({selectedArticles.size})
          </Button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="px-6 py-3 bg-card border-b overflow-x-auto">
        <div className="flex items-center gap-2">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleFilterChange(setStatusFilter)(tab.value)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap",
                statusFilter === tab.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  "ml-2 px-1.5 py-0.5 text-xs rounded",
                  statusFilter === tab.value
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
          
          <button 
            onClick={handleRefresh}
            className="p-2 ml-2 text-muted-foreground hover:text-foreground hover:bg-muted 
                       rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

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
                  <Link to="/articles/new">
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
                    <TableHead className="w-12 px-6">
                      <Checkbox
                        checked={selectedArticles.size === paginatedArticles.length && paginatedArticles.length > 0}
                        onCheckedChange={toggleSelectAll}
                        className="w-4 h-4"
                      />
                    </TableHead>
                    <TableHead className="px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Imagem
                    </TableHead>
                    <TableHead className="px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Título
                    </TableHead>
                    <TableHead className="px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Projeto Final
                    </TableHead>
                    <TableHead className="px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </TableHead>
                    <TableHead className="px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Data/Hora
                    </TableHead>
                    <TableHead className="w-16 px-4 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Ações
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedArticles.map((article) => {
                    const status = statusConfig[article.status] || statusConfig.draft;
                    const isRecentlyPublished = recentlyPublished.has(article.id);
                    
                    return (
                      <TableRow 
                        key={article.id} 
                        className={cn(
                          "hover:bg-muted/30 transition-colors",
                          selectedArticles.has(article.id) && "bg-primary/5",
                          isRecentlyPublished && "bg-green-50 animate-pulse"
                        )}
                      >
                        {/* Checkbox */}
                        <TableCell className="px-6 py-4">
                          <Checkbox
                            checked={selectedArticles.has(article.id)}
                            onCheckedChange={() => toggleSelect(article.id)}
                            className="w-4 h-4"
                          />
                        </TableCell>
                        
                        {/* Thumbnail */}
                        <TableCell className="px-4 py-4">
                          <div className="w-20 h-14 rounded-lg overflow-hidden bg-muted">
                            {article.featured_image_url ? (
                              <img
                                src={article.featured_image_url}
                                alt={article.title || ''}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        
                        {/* Title & Description */}
                        <TableCell className="px-4 py-4">
                          <div className="space-y-1 max-w-lg">
                            <h3 
                              className="text-sm font-medium text-foreground line-clamp-1 cursor-pointer hover:text-primary transition-colors"
                              onClick={() => navigate(`/articles/${article.id}`)}
                            >
                              {article.title || article.keyword}
                            </h3>
                            {article.excerpt && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {article.excerpt}
                              </p>
                            )}
                            {article.emotional_trigger && (
                              <EmotionalTriggerBadge
                                trigger={article.emotional_trigger}
                                confidence={article.emotional_confidence}
                                compact
                              />
                            )}
                          </div>
                        </TableCell>
                        
                        {/* Project Column */}
                        <TableCell className="px-4 py-4">
                          {article.project_id ? (
                            <div className="flex items-center gap-2">
                              <Folder className="w-4 h-4 text-amber-500" />
                              <span className="text-sm text-foreground font-medium truncate max-w-[140px]">
                                {getProjectName(article.project_id) || 'Projeto'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        
                        {/* Status Badge */}
                        <TableCell className="px-4 py-4">
                          <Badge 
                            variant="outline"
                            className={cn(
                              'inline-flex items-center gap-1.5 font-normal border',
                              status.bgColor,
                              status.textColor,
                              status.borderColor,
                              isRecentlyPublished && 'bg-green-500 text-white border-green-500'
                            )}
                          >
                            {isRecentlyPublished ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              status.icon
                            )}
                            {isRecentlyPublished ? 'Publicado!' : status.label}
                          </Badge>
                        </TableCell>
                        
                        {/* Date/Time Column */}
                        <TableCell className="px-4 py-4">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-sm text-foreground">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                              {format(new Date(article.created_at), "dd/MM/yyyy", { locale: ptBR })}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {format(new Date(article.created_at), "HH:mm", { locale: ptBR })}
                              {article.scheduled_at && (
                                <span className="ml-1.5 text-blue-600 font-medium">
                                  (Agendado: {format(new Date(article.scheduled_at), "dd/MM HH:mm", { locale: ptBR })})
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        
                        {/* Actions Menu */}
                        <TableCell className="px-4 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1.5 hover:bg-muted rounded transition-colors">
                                <MoreVertical className="w-4 h-4 text-muted-foreground" />
                              </button>
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
                                <>
                                  <DropdownMenuItem onClick={() => handleCopyLink(article.id)}>
                                    <LinkIcon className="w-4 h-4 mr-2" />
                                    Copiar link
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <a href={article.published_url} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="w-4 h-4 mr-2" />
                                      Ver publicado
                                    </a>
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                onClick={() => deleteArticle.mutate(article.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Apagar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination Footer */}
              <div className="px-6 py-4 bg-muted/30 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Selection Counter */}
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "flex items-center justify-center w-8 h-8 text-sm font-medium rounded",
                    selectedArticles.size > 0 
                      ? "bg-primary/10 text-primary" 
                      : "bg-muted text-muted-foreground"
                  )}>
                    {selectedArticles.size}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    de {filteredArticles.length} linha(s) selecionada(s)
                  </span>
                </div>
                
                {/* Pagination Controls */}
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Itens por página:
                    </span>
                    <Select
                      value={String(itemsPerPage)}
                      onValueChange={(val) => {
                        setItemsPerPage(Number(val));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="w-20 h-8 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(p => p - 1)}
                      disabled={currentPage === 1}
                      className="p-2 hover:bg-muted rounded disabled:opacity-50 
                                 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={currentPage === totalPages}
                      className="p-2 hover:bg-muted rounded disabled:opacity-50 
                                 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
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

      {/* Bulk Publish Modal */}
      <BulkPublishModal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        selectedArticles={articles.filter(a => selectedArticles.has(a.id)).map(a => ({ 
          id: a.id, 
          title: a.title, 
          project_id: a.project_id 
        }))}
        projects={projects}
        onPublishComplete={handlePublishComplete}
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
