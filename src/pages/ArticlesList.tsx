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
import { useArticlesList } from '@/hooks/useArticlesList';
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

export default function ArticlesList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { 
    articles, total, totalPages, isLoading, 
    filters, statusCounts, updateFilter, refreshArticles, deleteArticle 
  } = useArticlesList();
  const { projects } = useProjects();
  const { toast } = useToast();
  
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [publishResult, setPublishResult] = useState({ success: 0, failed: 0 });
  
  // Recently published articles for highlight animation
  const [recentlyPublished, setRecentlyPublished] = useState<Set<string>>(new Set());
  
  // Bulk SEO Analysis state
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  const [bulkAnalysisProgress, setBulkAnalysisProgress] = useState(0);

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Bulk Image Generation state
  const [isBulkGeneratingImages, setIsBulkGeneratingImages] = useState(false);
  const [bulkImageProgress, setBulkImageProgress] = useState(0);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      updateFilter('search', searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, updateFilter]);

  // Status tabs
  const statusTabs = useMemo(() => [
    { value: 'all', label: 'Todos', count: statusCounts.all },
    { value: 'published', label: 'Publicado', count: statusCounts.published },
    { value: 'scheduled', label: 'Agendado', count: statusCounts.scheduled },
    { value: 'ready', label: 'Finalizado', count: statusCounts.ready },
    { value: 'generating', label: 'Em criação', count: statusCounts.generating },
    { value: 'draft', label: 'Na Fila', count: statusCounts.draft },
    { value: 'error', label: 'Erro', count: statusCounts.error },
  ], [statusCounts]);

  const toggleSelectAll = () => {
    if (selectedArticles.size === articles.length) {
      setSelectedArticles(new Set());
    } else {
      setSelectedArticles(new Set(articles.map(a => a.id)));
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
    const publishedIds = new Set(Array.from(selectedArticles).slice(0, result.success));
    setRecentlyPublished(publishedIds);
    setShowSuccessModal(true);
    clearSelection();
    setTimeout(() => setRecentlyPublished(new Set()), 3000);
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

  // Bulk SEO Analysis
  const handleBulkSEOAnalysis = async () => {
    if (selectedArticles.size === 0) return;
    setIsBulkAnalyzing(true);
    setBulkAnalysisProgress(0);

    const ids = Array.from(selectedArticles);
    const batchSize = 2;
    let processed = 0;
    let totalScore = 0;
    let optimizedCount = 0;
    let generatedCount = 0;
    let republishedCount = 0;
    let failedCount = 0;

    toast({
      title: `🔄 SEO IA: Processando ${ids.length} artigos...`,
      description: 'Gerando conteúdo, links, CTAs, FAQ e imagens. Isso pode levar alguns minutos.',
    });

    try {
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        
        try {
          const { data, error } = await supabase.functions.invoke('analyze-seo-advanced', {
            body: { article_ids: batch, mode: 'optimize' },
          });

          if (error) {
            failedCount += batch.length;
            processed += batch.length;
            setBulkAnalysisProgress(processed);
            continue;
          }

          processed += batch.length;
          setBulkAnalysisProgress(processed);

          if (data?.results) {
            for (const r of data.results) {
              totalScore += r.score || 0;
              if (r.generated) generatedCount++;
              else if (r.optimized) optimizedCount++;
              if (r.error) failedCount++;
              
              if (r.optimized && r.status === 'published' && r.project_id) {
                try {
                  const { error: pubError } = await supabase.functions.invoke('publish-to-wordpress', {
                    body: { articleId: r.article_id, projectId: r.project_id },
                  });
                  if (!pubError) republishedCount++;
                } catch {}
              }
            }
          }
        } catch {
          failedCount += batch.length;
          processed += batch.length;
          setBulkAnalysisProgress(processed);
        }
      }

      const avgScore = ids.length > 0 ? Math.round(totalScore / ids.length) : 0;
      const parts: string[] = [];
      if (generatedCount > 0) parts.push(`${generatedCount} artigos criados do zero`);
      if (optimizedCount > 0) parts.push(`${optimizedCount} artigos otimizados`);
      if (republishedCount > 0) parts.push(`${republishedCount} republicados`);
      if (failedCount > 0) parts.push(`${failedCount} falharam`);
      
      toast({
        title: `SEO IA: Concluído ✅`,
        description: `${parts.join('. ')}. Score médio: ${avgScore}/100.`,
      });
      
      refreshArticles();
    } catch {
      toast({ title: 'Erro na otimização em massa', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsBulkAnalyzing(false);
      setBulkAnalysisProgress(0);
    }
  };

  // Bulk Image Generation
  const handleBulkImageGeneration = async () => {
    if (selectedArticles.size === 0) return;
    setIsBulkGeneratingImages(true);
    setBulkImageProgress(0);

    const ids = Array.from(selectedArticles);
    let processed = 0;
    let successCount = 0;
    let failedCount = 0;

    toast({
      title: `🖼️ Gerando imagens para ${ids.length} artigos...`,
      description: 'Criando imagens cinematográficas com IA.',
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: 'Sessão expirada', description: 'Faça login novamente.', variant: 'destructive' });
        setIsBulkGeneratingImages(false);
        return;
      }

      for (const articleId of ids) {
        try {
          const article = articles.find(a => a.id === articleId);
          if (!article?.title) { failedCount++; processed++; setBulkImageProgress(processed); continue; }
          if (article.featured_image_url) { processed++; setBulkImageProgress(processed); successCount++; continue; }

          const project = article.project_id ? projects.find(p => p.id === article.project_id) : null;

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              title: article.title,
              keywords: article.keyword,
              context: article.excerpt || '',
              segment: project?.nicho || 'general',
              style: 'photorealistic',
              aspectRatio: '16:9',
              quality: 'high',
              articleId: article.id,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.image) {
              await supabase.from('articles').update({
                featured_image_url: data.image,
                image_prompt: data.prompt,
                image_source: 'ai-bulk-generated',
              }).eq('id', articleId);
              successCount++;
            } else failedCount++;
          } else failedCount++;
        } catch {
          failedCount++;
        }

        processed++;
        setBulkImageProgress(processed);
        if (processed < ids.length) await new Promise(resolve => setTimeout(resolve, 2500));
      }

      toast({
        title: `🖼️ Geração concluída ✅`,
        description: `${successCount} imagens geradas${failedCount > 0 ? `, ${failedCount} falharam` : ''}.`,
      });

      refreshArticles();
    } catch {
      toast({ title: 'Erro na geração em massa', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsBulkGeneratingImages(false);
      setBulkImageProgress(0);
    }
  };

  const handleCopyLink = (articleId: string) => {
    const article = articles.find(a => a.id === articleId);
    if (article?.published_url) {
      navigator.clipboard.writeText(article.published_url);
      toast({ title: 'Link copiado!' });
    }
  };

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return null;
    return projects.find(p => p.id === projectId)?.name;
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshArticles();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  // Date filter helper
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  useEffect(() => {
    if (dateFilter) {
      const formatted = format(dateFilter, 'yyyy-MM-dd');
      updateFilter('dateFilter', formatted);
    } else {
      updateFilter('dateFilter', undefined);
    }
  }, [dateFilter, updateFilter]);

  if (isLoading && articles.length === 0) {
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
              Total: {statusCounts.all}
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          
          {/* Project Filter */}
          <Select value={filters.projectId} onValueChange={(val) => updateFilter('projectId', val)}>
            <SelectTrigger className="w-full lg:w-56 bg-background">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-amber-500" />
                <span className="text-sm truncate">
                  {filters.projectId === 'all' 
                    ? 'Todos os projetos' 
                    : getProjectName(filters.projectId) || 'Projeto'}
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
                    }}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={dateFilter}
                onSelect={(date) => setDateFilter(date)}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          
          {/* Sort Options */}
          <Select 
            value={`${filters.sortBy}-${filters.sortOrder}`} 
            onValueChange={(val) => {
              const [newSortBy, newSortOrder] = val.split('-') as ['created_at' | 'scheduled_at', 'asc' | 'desc'];
              updateFilter('sortBy', newSortBy);
              updateFilter('sortOrder', newSortOrder);
            }}
          >
            <SelectTrigger className="w-full lg:w-52 bg-background">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  {filters.sortBy === 'created_at' 
                    ? (filters.sortOrder === 'desc' ? 'Mais recentes' : 'Mais antigos')
                    : (filters.sortOrder === 'desc' ? 'Agendados (próx.)' : 'Agendados (dist.)')}
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
            variant="outline"
            size="sm"
            disabled={selectedArticles.size === 0 || isBulkGeneratingImages}
            onClick={handleBulkImageGeneration}
          >
            {isBulkGeneratingImages ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4 mr-2" />
            )}
            {isBulkGeneratingImages ? `Gerando... (${bulkImageProgress}/${selectedArticles.size})` : `Gerar Imagens (${selectedArticles.size})`}
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
              onClick={() => updateFilter('status', tab.value)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap",
                filters.status === tab.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  "ml-2 px-1.5 py-0.5 text-xs rounded",
                  filters.status === tab.value
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
            disabled={isRefreshing}
            className="p-2 ml-2 text-muted-foreground hover:text-foreground hover:bg-muted 
                       rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Main Content - Table */}
      <div className="p-6">
        <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
          {articles.length === 0 && !isLoading ? (
            <div className="p-16 text-center">
              <FileText className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {statusCounts.all === 0 ? 'Nenhum artigo criado' : 'Nenhum resultado encontrado'}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                {statusCounts.all === 0 
                  ? 'Comece criando seu primeiro artigo com IA' 
                  : 'Tente ajustar os filtros de busca'}
              </p>
              {statusCounts.all === 0 && (
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
                        checked={selectedArticles.size === articles.length && articles.length > 0}
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
                  {articles.map((article) => {
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
                        <TableCell className="px-6 py-4">
                          <Checkbox
                            checked={selectedArticles.has(article.id)}
                            onCheckedChange={() => toggleSelect(article.id)}
                            className="w-4 h-4"
                          />
                        </TableCell>
                        
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
                    de {total} linha(s) selecionada(s)
                  </span>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    Página {filters.page} de {totalPages}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Itens por página:
                    </span>
                    <Select
                      value={String(filters.perPage)}
                      onValueChange={(val) => updateFilter('perPage', Number(val))}
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
                      onClick={() => updateFilter('page', Math.max(1, filters.page - 1))}
                      disabled={filters.page <= 1}
                      className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => updateFilter('page', Math.min(totalPages, filters.page + 1))}
                      disabled={filters.page >= totalPages}
                      className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Modals */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão em massa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedArticles.size} artigo(s)? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {isDeleting ? 'Excluindo...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showPublishModal && (
        <BulkPublishModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          selectedArticles={Array.from(selectedArticles).map(id => {
            const a = articles.find(art => art.id === id);
            return { id, title: a?.title || '', project_id: a?.project_id || '' };
          })}
          projects={projects}
          onPublishComplete={handlePublishComplete}
        />
      )}

      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        successCount={publishResult.success}
        failedCount={publishResult.failed}
      />
    </div>
  );
}
