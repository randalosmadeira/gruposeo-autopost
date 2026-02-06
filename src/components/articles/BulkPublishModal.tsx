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
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// WordPress Icon Component
function WordPressIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 1.5c4.687 0 8.5 3.813 8.5 8.5 0 4.687-3.813 8.5-8.5 8.5-4.687 0-8.5-3.813-8.5-8.5 0-4.687 3.813-8.5 8.5-8.5zM4.5 12c0 1.846.673 3.536 1.784 4.847L9.67 7.5c.127-.32.287-.55.48-.69-.846.272-1.59.72-2.24 1.345A6.99 6.99 0 0 0 5 12h-.5zm7.5 7c-1.1 0-2.136-.257-3.06-.71l3.24-9.41c.323-.94.583-1.62.78-2.03.1-.2.2-.37.28-.5.09-.14.16-.24.24-.31l.06-.06c.1-.1.23-.15.38-.18.04-.01.08-.01.12-.01.16 0 .32.05.45.15.13.1.23.23.3.4.06.17.1.35.1.55 0 .2-.04.42-.13.68l-2.33 6.77 1.17.4c.26.1.48.25.65.45.17.2.29.45.36.73.07.28.08.57.05.87-.03.3-.13.58-.3.85l-.17.25-.02.02-.01.01c-.15.15-.34.28-.57.37-.23.1-.49.14-.78.14l-.4-.02-2.48-.83.08-.23.77-2.24-1.37 3.98c-.32.93-.17 1.24.07 1.45.16.14.37.23.61.27.16.03.34.04.52.04zm6.5-2.5l-3.57-9.5c.16-.02.32-.02.48-.02 1.1 0 2.136.257 3.06.71l-.92 2.66 2.14 6.23c.2-.53.35-1.08.45-1.65.1-.57.15-1.15.15-1.73 0-1.1-.18-2.15-.53-3.13a7.012 7.012 0 0 0-1.47-2.56 7.012 7.012 0 0 0-2.25-1.74c-.84-.43-1.75-.7-2.7-.82l-.06.18-.88 2.58 3.03 8.79c.63-.35 1.2-.78 1.7-1.28.5-.5.93-1.06 1.27-1.68a6.99 6.99 0 0 0 .65-1.87l-.59-.07z"/>
    </svg>
  );
}

// Wix Icon Component
function WixIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 12c0 4.41-3.59 8-8 8s-8-3.59-8-8 3.59-8 8-8 8 3.59 8 8zm-8-6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 9l-3-3 1.41-1.41L11 12.17l3.59-3.58L16 10l-5 5z"/>
    </svg>
  );
}

type PublishStatus = 'waiting' | 'publishing' | 'success' | 'error';
type Platform = 'wordpress' | 'wix' | null;
type Step = 'destination' | 'categories' | 'publishing';

interface ArticleWithCategories {
  id: string;
  title: string;
  selectedCategories: string[];
  publishStatus: PublishStatus;
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
  onPublish: (articles: ArticleWithCategories[], projectId: string) => Promise<{ success: number; failed: number }>;
  isPublishing: boolean;
}

export function BulkPublishModal({
  isOpen,
  onClose,
  selectedArticles,
  projects,
  onPublish,
  isPublishing
}: BulkPublishModalProps) {
  const [step, setStep] = useState<Step>('destination');
  const [platform, setPlatform] = useState<Platform>(null);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [siteSearch, setSiteSearch] = useState('');
  const [applySameCategoriesForAll, setApplySameCategoriesForAll] = useState(true);
  const [globalCategories, setGlobalCategories] = useState<string[]>([]);
  const [articlesWithCategories, setArticlesWithCategories] = useState<ArticleWithCategories[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [publishingResults, setPublishingResults] = useState({ success: 0, failed: 0 });

  // Fetch categories from WordPress
  const fetchCategories = useCallback(async (projectId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('wordpress-api', {
        body: { action: 'get-categories', projectId, perPage: 100 },
      });
      if (error) throw error;
      return data?.data || [];
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
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
      setPublishingResults({ success: 0, failed: 0 });
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
    try {
      const result = await fetchCategories(selectedProject);
      if (result?.categories) {
        setCategories(result.categories);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  useEffect(() => {
    if (selectedProject && platform === 'wordpress') {
      handleLoadCategories();
    }
  }, [selectedProject, platform]);

  // Toggle global category
  const toggleGlobalCategory = (categoryName: string) => {
    setGlobalCategories(prev => 
      prev.includes(categoryName)
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    );
  };

  // Toggle individual article category
  const toggleArticleCategory = (articleId: string, categoryName: string) => {
    setArticlesWithCategories(prev => 
      prev.map(a => {
        if (a.id !== articleId) return a;
        return {
          ...a,
          selectedCategories: a.selectedCategories.includes(categoryName)
            ? a.selectedCategories.filter(c => c !== categoryName)
            : [...a.selectedCategories, categoryName]
        };
      })
    );
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

  // Start publishing
  const handleStartPublishing = async () => {
    setStep('publishing');
    
    // Update articles status to publishing one by one
    for (let i = 0; i < articlesWithCategories.length; i++) {
      const article = articlesWithCategories[i];
      
      // Set current article to publishing
      setArticlesWithCategories(prev => 
        prev.map((a, idx) => 
          idx === i ? { ...a, publishStatus: 'publishing' } : a
        )
      );

      // Simulate publishing delay (in real implementation, this would be actual API call)
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

      // Set article to success or error (90% success rate for demo)
      const isSuccess = Math.random() > 0.1;
      setArticlesWithCategories(prev => 
        prev.map((a, idx) => 
          idx === i ? { ...a, publishStatus: isSuccess ? 'success' : 'error' } : a
        )
      );

      setPublishingResults(prev => ({
        success: prev.success + (isSuccess ? 1 : 0),
        failed: prev.failed + (isSuccess ? 0 : 1)
      }));
    }
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
  const canProceed = step === 'destination' 
    ? platform && selectedProject 
    : step === 'categories' 
      ? true 
      : false;

  const getPublishStatusLabel = (status: PublishStatus): string => {
    const labels = {
      success: 'Publicado',
      publishing: 'Publicando...',
      waiting: 'Aguardando',
      error: 'Erro ao publicar'
    };
    return labels[status];
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
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
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          
          <div className="mt-3">
            <Badge className="bg-primary/10 text-primary text-sm px-3 py-1">
              {selectedArticles.length} artigos selecionados
            </Badge>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 mt-4">
            {['destination', 'categories', 'publishing'].map((s, idx) => (
              <div key={s} className="flex items-center">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                  step === s 
                    ? "bg-primary text-primary-foreground" 
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
                    "w-12 h-0.5 mx-2",
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
          {/* STEP 1: Destination */}
          {step === 'destination' && (
            <div className="space-y-6">
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
                <div className="grid grid-cols-2 gap-4">
                  {/* WordPress Card */}
                  <button
                    onClick={() => setPlatform('wordpress')}
                    className={cn(
                      "p-4 border-2 rounded-lg transition-all text-left",
                      "hover:border-primary/50 hover:bg-primary/5",
                      platform === 'wordpress'
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
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
                        <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                      )}
                    </div>
                  </button>
                  
                  {/* Wix Card */}
                  <button
                    onClick={() => setPlatform('wix')}
                    className={cn(
                      "p-4 border-2 rounded-lg transition-all text-left opacity-50 cursor-not-allowed",
                      "border-border bg-card"
                    )}
                    disabled
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
              
              {/* Site Selection */}
              {platform && (
                <section className="space-y-3">
                  <label className="text-sm font-medium text-foreground">
                    Site conectado
                  </label>
                  
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger className="w-full">
                      <div className="flex items-center gap-2">
                        <LinkIcon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          {projects.find(p => p.id === selectedProject)?.domain || 'Selecione um site'}
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
                            Nenhum site encontrado
                          </div>
                        ) : (
                          filteredSites.map(site => (
                            <SelectItem key={site.id} value={site.id}>
                              <div className="flex items-center gap-3 py-1">
                                <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                                <div>
                                  <span className="text-sm font-medium">{site.name}</span>
                                  <span className="text-xs text-muted-foreground ml-2">
                                    {site.domain}
                                  </span>
                                </div>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </div>
                    </SelectContent>
                  </Select>

                  {filteredSites.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum projeto WordPress configurado. Configure um projeto primeiro.
                    </p>
                  )}
                </section>
              )}
              
              {/* Categories Section - WordPress Only */}
              {platform === 'wordpress' && selectedProject && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Tag className="w-5 h-5 text-purple-600" />
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

                  {/* Global Categories Selection */}
                  {applySameCategoriesForAll && categories.length > 0 && (
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-foreground">
                        Selecione as categorias
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {categories.map(category => (
                          <div key={category.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`global-${category.id}`}
                              checked={globalCategories.includes(category.name)}
                              onCheckedChange={() => toggleGlobalCategory(category.name)}
                            />
                            <label
                              htmlFor={`global-${category.id}`}
                              className="text-sm text-foreground cursor-pointer"
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

          {/* STEP 2: Categories */}
          {step === 'categories' && (
            <div className="space-y-6">
              {applySameCategoriesForAll ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
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
                      {globalCategories.map(cat => (
                        <Badge key={cat} className="bg-primary/10 text-primary">
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Tag className="w-5 h-5 text-purple-600" />
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

                  {articlesWithCategories.map((article, index) => (
                    <article key={article.id} className="space-y-3">
                      <h4 className="text-sm font-medium text-foreground">
                        {article.title}
                      </h4>
                      
                      {article.selectedCategories.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {article.selectedCategories.map(category => (
                            <Badge 
                              key={category}
                              className="bg-primary/10 text-primary text-xs px-2 py-1"
                            >
                              {category}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-3">
                        {categories.map(category => (
                          <div key={category.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`${article.id}-${category.id}`}
                              checked={article.selectedCategories.includes(category.name)}
                              onCheckedChange={() => toggleArticleCategory(article.id, category.name)}
                            />
                            <label
                              htmlFor={`${article.id}-${category.id}`}
                              className="text-sm text-foreground cursor-pointer"
                            >
                              {category.name}
                            </label>
                          </div>
                        ))}
                      </div>
                      
                      {index < articlesWithCategories.length - 1 && (
                        <div className="border-b border-border mt-6" />
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Publishing */}
          {step === 'publishing' && (
            <div className="space-y-6">
              {/* Success Counter */}
              <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-sm font-medium text-green-800">
                  Status da publicação
                </span>
                <Badge className="bg-green-600 text-white px-3 py-1">
                  {statusCounts.success} sucesso{statusCounts.success !== 1 ? 's' : ''}
                </Badge>
              </div>
              
              {/* Publishing List */}
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {articlesWithCategories.map(article => (
                  <div
                    key={article.id}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-lg border-2 transition-all",
                      article.publishStatus === 'success' && "bg-green-50 border-green-200",
                      article.publishStatus === 'publishing' && "bg-blue-50 border-blue-200",
                      article.publishStatus === 'waiting' && "bg-muted/50 border-border",
                      article.publishStatus === 'error' && "bg-red-50 border-red-200"
                    )}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {article.publishStatus === 'success' && (
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
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
                      
                      <span className="text-sm font-medium text-foreground truncate">
                        {article.title}
                      </span>
                    </div>
                    
                    <span className={cn(
                      "text-sm font-medium ml-4 flex-shrink-0",
                      article.publishStatus === 'success' && "text-green-700",
                      article.publishStatus === 'publishing' && "text-blue-700",
                      article.publishStatus === 'waiting' && "text-muted-foreground",
                      article.publishStatus === 'error' && "text-red-700"
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
                
                {allProcessed ? (
                  <Button onClick={onClose}>
                    Fechar
                  </Button>
                ) : (
                  <Button disabled className="bg-primary">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Publicando...
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        {step !== 'publishing' && (
          <DialogFooter className="px-6 py-4 border-t">
            <div className="flex items-center justify-between w-full">
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
                <Button variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleNextStep}
                  disabled={!canProceed}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {step === 'destination' ? 'Continuar' : `Publicar ${selectedArticles.length} artigos`}
                </Button>
              </div>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BulkPublishModal;
