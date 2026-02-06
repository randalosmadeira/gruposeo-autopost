import { useState, useEffect, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Upload,
  Globe,
  Link as LinkIcon,
  Search,
  Check,
  CheckCircle2,
  Tag,
  RefreshCw,
  Loader2,
  Clock,
  AlertCircle,
  X,
  RotateCcw,
  WifiOff,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// WordPress Icon Component
function WordPressIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 1.5c4.687 0 8.5 3.813 8.5 8.5 0 4.687-3.813 8.5-8.5 8.5-4.687 0-8.5-3.813-8.5-8.5 0-4.687 3.813-8.5 8.5-8.5z"/>
    </svg>
  );
}

// Wix Icon Component (disabled for now)
function WixIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 12c0 4.41-3.59 8-8 8s-8-3.59-8-8 3.59-8 8-8 8 3.59 8 8zm-8-6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z"/>
    </svg>
  );
}

type PublishStatus = 'waiting' | 'publishing' | 'success' | 'error';
type Platform = 'wordpress' | 'wix' | null;
type Step = 'destination' | 'categories' | 'publishing';

interface ArticleWithCategories {
  id: string;
  title: string;
  selectedCategories: number[];
  publishStatus: PublishStatus;
  errorMessage?: string;
}

interface Category {
  id: number;
  name: string;
}

interface BulkPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedArticles: Array<{ id: string; title: string | null; project_id: string | null }>;
  projects: Array<{ id: string; name: string; domain: string; wordpress_url?: string | null }>;
  onPublishComplete: (result: { success: number; failed: number }) => void;
}

export function BulkPublishModal({
  isOpen,
  onClose,
  selectedArticles,
  projects,
  onPublishComplete
}: BulkPublishModalProps) {
  const [step, setStep] = useState<Step>('destination');
  const [platform, setPlatform] = useState<Platform>(null);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [siteSearch, setSiteSearch] = useState('');
  const [applySameCategoriesForAll, setApplySameCategoriesForAll] = useState(true);
  const [globalCategories, setGlobalCategories] = useState<number[]>([]);
  const [articlesWithCategories, setArticlesWithCategories] = useState<ArticleWithCategories[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [isPublishing, setIsPublishing] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [retryMode, setRetryMode] = useState(false);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch categories from WordPress
  const fetchCategories = useCallback(async (projectId: string): Promise<{ categories: Category[], error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('wordpress-api', {
        body: { action: 'get-categories', projectId, perPage: 100 },
      });
      
      if (error) {
        return { categories: [], error: error.message };
      }
      
      if (!data?.success) {
        const errorMsg = data?.error || 'Erro ao buscar categorias';
        // Check for critical WordPress error (HTML error page)
        if (errorMsg.includes('erro crítico') || 
            errorMsg.includes('critical error') ||
            errorMsg.includes('<p>') ||
            errorMsg.includes('</p>')) {
          return { 
            categories: [], 
            error: 'O site WordPress está com erro crítico (HTTP 500). Possíveis soluções:\n\n1. Desative o plugin ContentFactory RDM via FTP ou WP Admin\n2. Instale a versão 2.2.1 do plugin (com correções de compatibilidade)\n3. Verifique conflitos com Elementor, Divi ou outros page builders' 
          };
        }
        return { categories: [], error: errorMsg };
      }
      
      // The API returns { success: true, data: [...categories] }
      const cats = Array.isArray(data?.data) ? data.data : [];
      return { categories: cats };
    } catch (error) {
      console.error('Error fetching categories:', error);
      return { categories: [], error: 'Falha na conexão com o WordPress' };
    }
  }, []);

  // Initialize articles with categories when modal opens
  useEffect(() => {
    if (isOpen) {
      setArticlesWithCategories(
        selectedArticles.map(a => ({
          id: a.id,
          title: a.title || 'Sem título',
          selectedCategories: [],
          publishStatus: 'waiting' as PublishStatus
        }))
      );
      setStep('destination');
      setPlatform(null);
      setSelectedProject('');
      setGlobalCategories([]);
      setCategories([]);
      setCategoryError(null);
      setConnectionStatus('idle');
      setIsPublishing(false);
      setRetryMode(false);
    }
  }, [isOpen, selectedArticles]);

  // Filter projects with WordPress connection
  const wordpressSites = useMemo(() => 
    projects.filter(p => p.wordpress_url || p.domain),
    [projects]
  );

  const filteredSites = useMemo(() => 
    wordpressSites.filter(site => 
      site.name.toLowerCase().includes(siteSearch.toLowerCase()) ||
      site.domain.toLowerCase().includes(siteSearch.toLowerCase())
    ),
    [wordpressSites, siteSearch]
  );

  // Load categories when project is selected
  const handleLoadCategories = async () => {
    if (!selectedProject) return;
    
    setIsLoadingCategories(true);
    setCategoryError(null);
    setConnectionStatus('testing');
    
    try {
      const result = await fetchCategories(selectedProject);
      
      if (result.error) {
        setCategoryError(result.error);
        setConnectionStatus('error');
        setCategories([]);
      } else {
        setCategories(result.categories);
        setConnectionStatus('connected');
      }
    } catch (error) {
      console.error('Error loading categories:', error);
      setCategoryError('Erro inesperado ao carregar categorias');
      setConnectionStatus('error');
    } finally {
      setIsLoadingCategories(false);
    }
  };

  useEffect(() => {
    if (selectedProject && platform === 'wordpress') {
      handleLoadCategories();
    }
  }, [selectedProject, platform]);

  // ========== VALIDATION FUNCTIONS ==========
  
  // Validation: Can proceed from destination to categories
  const canProceedToCategories = useMemo(() => {
    return !!(platform && selectedProject);
  }, [platform, selectedProject]);

  // Validation: Can publish
  const canPublish = useMemo(() => {
    if (!platform || !selectedProject) return false;
    
    // For WordPress, categories are optional - user can publish without them
    return true;
  }, [platform, selectedProject]);

  // Get validation message for disabled button
  const getValidationMessage = (): string | null => {
    if (!platform) return 'Selecione uma plataforma de destino';
    if (!selectedProject) return 'Selecione um site WordPress conectado';
    return null;
  };

  // Get selected project details
  const selectedProjectDetails = useMemo(() => {
    return projects.find(p => p.id === selectedProject);
  }, [projects, selectedProject]);

  // ========== END VALIDATION FUNCTIONS ==========

  // Toggle global category
  const toggleGlobalCategory = (categoryId: number) => {
    setGlobalCategories(prev => 
      prev.includes(categoryId)
        ? prev.filter(c => c !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Toggle individual article category
  const toggleArticleCategory = (articleId: string, categoryId: number) => {
    setArticlesWithCategories(prev => 
      prev.map(a => {
        if (a.id !== articleId) return a;
        return {
          ...a,
          selectedCategories: a.selectedCategories.includes(categoryId)
            ? a.selectedCategories.filter(c => c !== categoryId)
            : [...a.selectedCategories, categoryId]
        };
      })
    );
  };

  // Handle close with confirmation if publishing
  const handleClose = () => {
    if (isPublishing) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  // Handle next step
  const handleNextStep = () => {
    if (step === 'destination') {
      // Apply global categories if option is selected
      if (applySameCategoriesForAll && globalCategories.length > 0) {
        setArticlesWithCategories(prev => 
          prev.map(a => ({ ...a, selectedCategories: [...globalCategories] }))
        );
      }
      setStep('categories');
    } else if (step === 'categories') {
      handleStartPublishing();
    }
  };

  // Publish a single article
  const publishSingleArticle = async (articleId: string, categoryIds: number[]): Promise<{ success: boolean; error?: string }> => {
    // Check if online before attempting
    if (!navigator.onLine) {
      return { success: false, error: 'Sem conexão com a internet' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('publish-to-wordpress', {
        body: { 
          articleId, 
          projectId: selectedProject,
          categories: categoryIds
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Falha ao publicar');
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      };
    }
  };

  // Start publishing - real implementation
  const handleStartPublishing = async (onlyFailed: boolean = false) => {
    setStep('publishing');
    setIsPublishing(true);
    setRetryMode(onlyFailed);

    let successCount = 0;
    let failedCount = 0;

    // Get articles to process
    const articlesToProcess = onlyFailed 
      ? articlesWithCategories.filter(a => a.publishStatus === 'error')
      : articlesWithCategories;

    // Reset status for articles being processed
    if (onlyFailed) {
      setArticlesWithCategories(prev => 
        prev.map(a => 
          a.publishStatus === 'error' ? { ...a, publishStatus: 'waiting', errorMessage: undefined } : a
        )
      );
    }

    // Publish articles one by one with animation delay
    for (let i = 0; i < articlesToProcess.length; i++) {
      const article = articlesToProcess[i];
      
      // Check if still online
      if (!navigator.onLine) {
        // Mark remaining as error
        setArticlesWithCategories(prev => 
          prev.map(a => {
            if (a.publishStatus === 'waiting') {
              return { ...a, publishStatus: 'error', errorMessage: 'Conexão perdida' };
            }
            return a;
          })
        );
        failedCount += articlesToProcess.length - i;
        break;
      }

      // Find the actual index in articlesWithCategories
      const actualIndex = articlesWithCategories.findIndex(a => a.id === article.id);
      
      // Set current article to publishing
      setArticlesWithCategories(prev => 
        prev.map((a, idx) => 
          idx === actualIndex ? { ...a, publishStatus: 'publishing' } : a
        )
      );

      // Small delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 300));

      // Actually publish the article
      const result = await publishSingleArticle(article.id, article.selectedCategories);

      // Update article status with animation
      setArticlesWithCategories(prev => 
        prev.map((a, idx) => 
          idx === actualIndex ? { 
            ...a, 
            publishStatus: result.success ? 'success' : 'error',
            errorMessage: result.error
          } : a
        )
      );

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }

      // Small delay between articles to avoid rate limiting
      if (i < articlesToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsPublishing(false);
    onPublishComplete({ success: successCount, failed: failedCount });
  };

  // Retry failed articles
  const handleRetryFailed = () => {
    handleStartPublishing(true);
  };

  // Get publish status counts
  const statusCounts = useMemo(() => {
    const counts = { success: 0, publishing: 0, waiting: 0, error: 0 };
    articlesWithCategories.forEach(a => {
      counts[a.publishStatus]++;
    });
    return counts;
  }, [articlesWithCategories]);

  const allProcessed = statusCounts.waiting === 0 && statusCounts.publishing === 0;
  const hasFailedArticles = statusCounts.error > 0;

  const getPublishStatusLabel = (status: PublishStatus): string => {
    const labels = {
      success: 'Publicado',
      publishing: 'Publicando...',
      waiting: 'Aguardando',
      error: 'Erro ao publicar'
    };
    return labels[status];
  };

  const getCategoryName = (categoryId: number): string => {
    return categories.find(c => c.id === categoryId)?.name || `Categoria ${categoryId}`;
  };

  // Render action button with tooltip for disabled state
  const renderActionButton = () => {
    const validationMessage = getValidationMessage();
    const isDisabled = step === 'destination' ? !canProceedToCategories : !canPublish;

    const button = (
      <Button 
        onClick={handleNextStep}
        disabled={isDisabled}
        className="bg-primary hover:bg-primary/90"
      >
        <Upload className="w-4 h-4 mr-2" />
        {step === 'destination' ? 'Continuar' : `Publicar ${selectedArticles.length} artigo${selectedArticles.length !== 1 ? 's' : ''}`}
      </Button>
    );

    if (isDisabled && validationMessage) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="cursor-not-allowed">{button}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-destructive text-destructive-foreground">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <p>{validationMessage}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return button;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0 animate-scale-in">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Upload className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-xl font-semibold">
                  Publicar artigos em massa
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1">
                  Publique {selectedArticles.length} artigos selecionados de uma vez no destino escolhido.
                </DialogDescription>
              </div>
              {!isPublishing && (
                <button
                  onClick={handleClose}
                  className="p-1 hover:bg-muted rounded transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              )}
            </div>
            
            <div className="mt-3 flex items-center gap-2">
              <Badge className="bg-primary/10 text-primary text-sm px-3 py-1">
                {selectedArticles.length} artigos selecionados
              </Badge>
              {!isOnline && (
                <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-sm px-3 py-1 flex items-center gap-1">
                  <WifiOff className="w-3 h-3" />
                  Sem conexão
                </Badge>
              )}
            </div>

            {/* Step Indicator */}
            <div className="flex items-center gap-2 mt-4">
              {['destination', 'categories', 'publishing'].map((s, idx) => (
                <div key={s} className="flex items-center">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300",
                    step === s 
                      ? "bg-primary text-primary-foreground scale-110" 
                      : idx < ['destination', 'categories', 'publishing'].indexOf(step)
                        ? "bg-green-500 text-white"
                        : "bg-muted text-muted-foreground"
                  )}>
                    {idx < ['destination', 'categories', 'publishing'].indexOf(step) ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  {idx < 2 && (
                    <div className={cn(
                      "w-12 h-0.5 mx-2 transition-colors duration-300",
                      idx < ['destination', 'categories', 'publishing'].indexOf(step)
                        ? "bg-green-500"
                        : "bg-muted"
                    )} />
                  )}
                </div>
              ))}
            </div>
          </DialogHeader>
          
          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* Offline Banner */}
            {!isOnline && step === 'publishing' && (
              <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg flex items-center gap-3 animate-fade-in">
                <WifiOff className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    Conexão perdida
                  </p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    A publicação foi pausada. Tentando reconectar...
                  </p>
                </div>
              </div>
            )}

            {/* STEP 1: Destination */}
            {step === 'destination' && (
              <div className="space-y-6 animate-fade-in">
                {/* Platform Selection */}
                <section>
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Globe className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-foreground">
                        Escolha o destino da publicação
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Selecione a plataforma e o site conectado para enviar os artigos automaticamente.
                      </p>
                    </div>
                  </div>
                  
                  {/* Platform Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* WordPress Card */}
                    <button
                      onClick={() => setPlatform('wordpress')}
                      className={cn(
                        "p-4 border-2 rounded-lg transition-all text-left hover-scale",
                        "hover:border-primary/50 hover:bg-primary/5",
                        platform === 'wordpress'
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                          platform === 'wordpress' ? "bg-primary" : "bg-muted"
                        )}>
                          <WordPressIcon className={cn(
                            "w-6 h-6",
                            platform === 'wordpress' ? "text-primary-foreground" : "text-muted-foreground"
                          )} />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-foreground">
                            WordPress
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Publicação direta usando a REST API.
                          </p>
                        </div>
                        {platform === 'wordpress' && (
                          <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 animate-scale-in" />
                        )}
                      </div>
                    </button>
                    
                    {/* Wix Card - Disabled */}
                    <button
                      disabled
                      className="p-4 border-2 rounded-lg text-left opacity-50 cursor-not-allowed border-border bg-card"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-muted">
                          <WixIcon className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-foreground">
                            Wix
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Em breve - API oficial Wix.
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                </section>
                
                {/* Site Selection - Required */}
                {platform && (
                  <section className="space-y-3 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-foreground">
                        Site conectado
                      </label>
                      <Badge variant="outline" className="text-xs border-destructive text-destructive">
                        Obrigatório
                      </Badge>
                    </div>
                    
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                      <SelectTrigger className={cn(
                        "w-full",
                        !selectedProject && "border-destructive/50 focus:ring-destructive"
                      )}>
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-muted-foreground" />
                          <span className={cn(
                            "text-sm",
                            !selectedProject && "text-muted-foreground"
                          )}>
                            {selectedProjectDetails?.domain || 'Selecione o site de destino'}
                          </span>
                        </div>
                      </SelectTrigger>
                      
                      <SelectContent>
                        {/* Search */}
                        <div className="p-2 border-b">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              type="text"
                              placeholder="Buscar site..."
                              value={siteSearch}
                              onChange={(e) => setSiteSearch(e.target.value)}
                              className="pl-9"
                            />
                          </div>
                        </div>
                        
                        {/* Sites List */}
                        <div className="max-h-64 overflow-y-auto">
                          {filteredSites.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                              Nenhum site WordPress encontrado
                            </div>
                          ) : (
                            filteredSites.map(site => (
                              <SelectItem key={site.id} value={site.id}>
                                <div className="flex items-center gap-3 py-1">
                                  <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">{site.name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {site.wordpress_url || site.domain}
                                    </span>
                                  </div>
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </div>
                      </SelectContent>
                    </Select>

                    {/* Selected Site Preview with Connection Status */}
                    {selectedProjectDetails && (
                      <div className={cn(
                        "flex items-center gap-3 p-3 border rounded-lg animate-fade-in",
                        connectionStatus === 'error' 
                          ? "bg-destructive/5 border-destructive/30" 
                          : connectionStatus === 'connected'
                            ? "bg-primary/5 border-primary/20"
                            : "bg-muted/50 border-border"
                      )}>
                        <div className={cn(
                          "p-2 rounded-lg",
                          connectionStatus === 'error' 
                            ? "bg-destructive/10" 
                            : connectionStatus === 'connected'
                              ? "bg-primary/10"
                              : "bg-muted"
                        )}>
                          <Globe className={cn(
                            "w-4 h-4",
                            connectionStatus === 'error' 
                              ? "text-destructive" 
                              : connectionStatus === 'connected'
                                ? "text-primary"
                                : "text-muted-foreground"
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {selectedProjectDetails.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {selectedProjectDetails.wordpress_url || selectedProjectDetails.domain}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {connectionStatus === 'testing' && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Verificando...
                            </div>
                          )}
                          {connectionStatus === 'connected' && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Conectado
                            </Badge>
                          )}
                          {connectionStatus === 'error' && (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Erro
                            </Badge>
                          )}
                          {connectionStatus === 'idle' && (
                            <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    )}

                    {filteredSites.length === 0 && (
                      <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-destructive">
                            Nenhum site WordPress configurado
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Configure um projeto WordPress primeiro para publicar artigos.
                          </p>
                        </div>
                      </div>
                    )}
                  </section>
                )}
                
                {/* Categories Section - WordPress Only */}
                {platform === 'wordpress' && selectedProject && (
                  <section className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                          <Tag className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-foreground">
                            Categorias no WordPress
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Escolha como deseja aplicar as categorias aos artigos.
                          </p>
                        </div>
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLoadCategories}
                        disabled={isLoadingCategories}
                        className="flex-shrink-0"
                      >
                        {isLoadingCategories ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-2" />
                        )}
                        Atualizar
                      </Button>
                    </div>
                    
                    {/* Apply Same Categories Option */}
                    <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg border">
                      <Checkbox
                        id="apply-same-categories"
                        checked={applySameCategoriesForAll}
                        onCheckedChange={(checked) => setApplySameCategoriesForAll(checked as boolean)}
                      />
                      <label 
                        htmlFor="apply-same-categories"
                        className="text-sm font-medium text-foreground cursor-pointer"
                      >
                        Aplicar as mesmas categorias para todos os artigos
                      </label>
                    </div>

                    {/* Connection Error Message */}
                    {!isLoadingCategories && categoryError && (
                      <div className="flex items-start gap-3 p-4 bg-destructive/5 border border-destructive/30 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-destructive">
                            Erro ao conectar com o WordPress
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {categoryError}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={handleLoadCategories}
                          >
                            <RotateCcw className="w-3 h-3 mr-2" />
                            Tentar novamente
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* No Categories Message - Only show when connected but no categories */}
                    {!isLoadingCategories && !categoryError && categories.length === 0 && connectionStatus === 'connected' && (
                      <div className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg">
                        <Info className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            Este site não possui categorias cadastradas
                          </p>
                          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                            Os artigos serão publicados sem categoria definida.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Global Categories Selection */}
                    {applySameCategoriesForAll && categories.length > 0 && (
                      <div className="space-y-4 p-4 border rounded-lg bg-card">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-foreground">
                            Selecione as categorias para todos os artigos
                          </label>
                          {globalCategories.length > 0 && (
                            <Badge variant="secondary" className="bg-primary/10 text-primary">
                              {globalCategories.length} selecionada{globalCategories.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {categories.map(category => (
                            <div 
                              key={category.id} 
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-primary/50",
                                globalCategories.includes(category.id) 
                                  ? "border-primary bg-primary/5" 
                                  : "border-border bg-background"
                              )}
                              onClick={() => toggleGlobalCategory(category.id)}
                            >
                              <Checkbox
                                id={`global-${category.id}`}
                                checked={globalCategories.includes(category.id)}
                                onCheckedChange={() => toggleGlobalCategory(category.id)}
                              />
                              <label
                                htmlFor={`global-${category.id}`}
                                className="text-sm text-foreground cursor-pointer flex-1"
                              >
                                {category.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}

            {/* STEP 2: Categories Review */}
            {step === 'categories' && (
              <div className="space-y-6 animate-fade-in">
                {applySameCategoriesForAll ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3 animate-scale-in" />
                    <h3 className="text-lg font-medium text-foreground">
                      Categorias configuradas
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {globalCategories.length > 0 
                        ? `${globalCategories.length} categoria(s) serão aplicadas a todos os artigos`
                        : 'Nenhuma categoria selecionada - artigos serão publicados sem categoria'}
                    </p>
                    {globalCategories.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        {globalCategories.map(catId => (
                          <Badge key={catId} className="bg-primary/10 text-primary">
                            {getCategoryName(catId)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                        <Tag className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">
                          Categorias por artigo
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Selecione as categorias para cada artigo individualmente.
                        </p>
                      </div>
                    </div>

                    {categories.length === 0 ? (
                      <div className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg">
                        <Info className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                          Este site não possui categorias. Os artigos serão publicados sem categoria.
                        </p>
                      </div>
                    ) : (
                      articlesWithCategories.map((article, index) => (
                        <article 
                          key={article.id} 
                          className="p-4 border rounded-lg bg-card space-y-4 animate-fade-in" 
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-foreground line-clamp-1">
                              {article.title}
                            </h4>
                            {article.selectedCategories.length > 0 && (
                              <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
                                {article.selectedCategories.length} categoria{article.selectedCategories.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            {categories.map(category => (
                              <div 
                                key={category.id} 
                                className={cn(
                                  "flex items-center gap-3 p-2.5 rounded-md border cursor-pointer transition-all hover:border-primary/50",
                                  article.selectedCategories.includes(category.id) 
                                    ? "border-primary bg-primary/5" 
                                    : "border-border bg-background"
                                )}
                                onClick={() => toggleArticleCategory(article.id, category.id)}
                              >
                                <Checkbox
                                  id={`${article.id}-${category.id}`}
                                  checked={article.selectedCategories.includes(category.id)}
                                  onCheckedChange={() => toggleArticleCategory(article.id, category.id)}
                                />
                                <label
                                  htmlFor={`${article.id}-${category.id}`}
                                  className="text-sm text-foreground cursor-pointer flex-1"
                                >
                                  {category.name}
                                </label>
                              </div>
                            ))}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: Publishing */}
            {step === 'publishing' && (
              <div className="space-y-6 animate-fade-in">
                {/* Success Counter */}
                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg">
                  <span className="text-sm font-medium text-green-800 dark:text-green-200">
                    Status da publicação
                  </span>
                  <div className="flex gap-2">
                    <Badge className="bg-green-600 text-white px-3 py-1">
                      {statusCounts.success} sucesso{statusCounts.success !== 1 ? 's' : ''}
                    </Badge>
                    {statusCounts.error > 0 && (
                      <Badge className="bg-red-600 text-white px-3 py-1">
                        {statusCounts.error} erro{statusCounts.error !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {/* Publishing List */}
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                  {articlesWithCategories.map((article, index) => (
                    <div
                      key={article.id}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg border-2 transition-all duration-300",
                        article.publishStatus === 'success' && "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",
                        article.publishStatus === 'publishing' && "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 scale-[1.02]",
                        article.publishStatus === 'waiting' && "bg-muted/50 border-border",
                        article.publishStatus === 'error' && "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900"
                      )}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {article.publishStatus === 'success' && (
                          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 animate-scale-in" />
                        )}
                        {article.publishStatus === 'publishing' && (
                          <Loader2 className="w-5 h-5 text-blue-600 flex-shrink-0 animate-spin" />
                        )}
                        {article.publishStatus === 'waiting' && (
                          <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        )}
                        {article.publishStatus === 'error' && (
                          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-foreground truncate block">
                            {article.title}
                          </span>
                          {article.errorMessage && (
                            <span className="text-xs text-red-600 dark:text-red-400 truncate block">
                              {article.errorMessage}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <span className={cn(
                        "text-sm font-medium ml-4 flex-shrink-0",
                        article.publishStatus === 'success' && "text-green-700 dark:text-green-300",
                        article.publishStatus === 'publishing' && "text-blue-700 dark:text-blue-300",
                        article.publishStatus === 'waiting' && "text-muted-foreground",
                        article.publishStatus === 'error' && "text-red-700 dark:text-red-300"
                      )}>
                        {getPublishStatusLabel(article.publishStatus)}
                      </span>
                    </div>
                  ))}
                </div>
                
                {/* Progress Footer */}
                <div className="flex items-center justify-between p-4 bg-muted/50 border rounded-lg">
                  <span className="text-sm text-foreground">
                    {statusCounts.success + statusCounts.error} de {articlesWithCategories.length} processado{(statusCounts.success + statusCounts.error) !== 1 ? 's' : ''}
                  </span>
                  
                  <div className="flex gap-2">
                    {allProcessed && hasFailedArticles && (
                      <Button 
                        variant="outline" 
                        onClick={handleRetryFailed}
                        className="flex items-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Tentar novamente ({statusCounts.error})
                      </Button>
                    )}
                    
                    {allProcessed ? (
                      <Button onClick={onClose} className="bg-green-600 hover:bg-green-700">
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Concluído
                      </Button>
                    ) : (
                      <Button disabled className="bg-primary">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Publicando...
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Footer */}
          {step !== 'publishing' && (
            <DialogFooter className="px-6 py-4 border-t">
              <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
                <span className="text-sm text-muted-foreground">
                  {step === 'destination' 
                    ? `Pronto para publicar ${selectedArticles.length} artigos`
                    : 'Revise as categorias antes de publicar'}
                </span>
                <div className="flex gap-2">
                  {step === 'categories' && (
                    <Button variant="outline" onClick={() => setStep('destination')}>
                      Voltar
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleClose}>
                    Cancelar
                  </Button>
                  {renderActionButton()}
                </div>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Close Confirmation Dialog */}
      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar durante a publicação?</AlertDialogTitle>
            <AlertDialogDescription>
              A publicação está em andamento. Se você fechar, a publicação continuará em segundo plano, 
              mas você não poderá acompanhar o progresso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar acompanhando</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>
              Fechar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default BulkPublishModal;
