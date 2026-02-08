import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Zap,
  Play,
  Sparkles,
  Bot,
  FileText,
  Loader2,
  Settings,
  RefreshCw,
  Eye,
  X,
  AlertCircle,
  Rocket,
  Target,
  Link2,
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useSettings } from '@/hooks/useSettings';
import { useArticleGeneration } from '@/hooks/useArticleGeneration';
import { useArticleAutoSave } from '@/hooks/useArticleAutoSave';
import { useWordPressPublish } from '@/hooks/useWordPressPublish';
import { useImageGeneration } from '@/hooks/useImageGeneration';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { 
  ProgressScreen, 
  defaultGenerationSteps,
  OutlineEditor,
  generateDefaultOutline,
  ArticleEditor,
  defaultArticleData,
  type OutlineSection,
  type ArticleData
} from '@/components/article-generator';
import {
  AIModelSelector,
  aiModels,
  getModelByValue,
  getProviderByModel,
  getCreditTierByValue,
  creditTierModels,
  ContentStructureConfig,
  AdvancedSettings,
  PublishingOptions,
  SEOAdvancedConfig,
  InternalLinksManager,
  type InternalLink,
  type AIProvider,
} from '@/components/shared';

// App states as per spec
type AppState = 
  | 'form'                // Initial form filling
  | 'generating-outline'  // Generating outline
  | 'editing-outline'     // Editing structure
  | 'generating-article'  // Generating full article
  | 'editing-article'     // Editing final article
  | 'publishing';         // Publishing

// Design system colors
const colors = {
  primary: '#4169E1',
  secondary: '#E8F5E9',
  tertiary: '#FFF3E0',
  pink: '#FCE4EC',
  lightBlue: '#E3F2FD',
  background: '#FFFFFF',
  backgroundSecondary: '#F5F7FA',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  border: '#E0E0E0',
  success: '#4CAF50',
  warning: '#FF9800',
};

const tones = [
  'Profissional',
  'Casual',
  'Acadêmico',
  'Persuasivo',
  'Educativo',
];

const pointsOfView = [
  { value: 'terceira', label: 'Terceira Pessoa (Neutro)' },
  { value: 'primeira', label: 'Primeira Pessoa (Eu)' },
  { value: 'segunda', label: 'Segunda Pessoa (Você)' },
];

const articleSizes = [
  { value: 'short', label: 'Curto', words: '~750 palavras' },
  { value: 'medium', label: 'Médio', words: '~1.500 palavras' },
  { value: 'long', label: 'Longo', words: '~2.500 palavras' },
  { value: 'very-long', label: 'Muito Longo', words: '~4.000 palavras' },
];

interface ArticleConfig {
  keyword: string;
  title: string;
  tone: string;
  pointOfView: string;
  size: string;
  language: string;
  aiModel: string;
  // SEO Advanced fields
  segment: string;
  contentType: string;
  goal: string;
  intentType: string;
  // Content elements
  metaDescription: boolean;
  lists: boolean;
  tables: boolean;
  conclusion: boolean;
  faq: boolean;
  // Internal linking
  internalLinking: boolean;
  projectId: string;
  // Advanced settings
  usePlatformCredits: boolean;
  seoOptimization: boolean;
  realtimeData: boolean;
  humanizeContent: boolean;
  generateImages: boolean;
  imageCount: number;
  imageStyle: string;
  // Publishing
  autoPublish: boolean;
}

const defaultConfig: ArticleConfig = {
  keyword: '',
  title: '',
  tone: 'profissional',
  pointOfView: 'segunda',
  size: 'medium',
  language: 'pt-BR',
  aiModel: 'standard',  // Credit tier: standard, premium, advanced, professional
  // SEO defaults
  segment: 'general',
  contentType: 'how-to',
  goal: 'inform',
  intentType: 'informational',
  // Content elements
  metaDescription: true,
  lists: true,
  tables: false,
  conclusion: true,
  faq: false,
  internalLinking: true,
  projectId: '',
  usePlatformCredits: true,
  seoOptimization: false,
  realtimeData: false,
  humanizeContent: false,
  generateImages: false,
  imageCount: 1,
  imageStyle: 'fotorrealístico',
  autoPublish: false,
};

export default function ArticleGeneratorV2() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { projects } = useProjects();
  const { settings } = useSettings();
  const { isGenerating, generateArticle, content: generatedContent } = useArticleGeneration();
  const { publishArticle, isPublishing } = useWordPressPublish();
  const { generateImage, isGenerating: isGeneratingImage, generatedImage } = useImageGeneration();
  const { 
    articleId, 
    isSaving, 
    lastSaved, 
    debouncedSave, 
    saveGeneratedArticle,
    setGeneratingStatus,
    setArticleId 
  } = useArticleAutoSave();
  const isMobile = useIsMobile();
  
  const [config, setConfig] = useState<ArticleConfig>(defaultConfig);
  const [aiProvider, setAiProvider] = useState<AIProvider>('openai');
  const [showTutorial, setShowTutorial] = useState(true);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [appState, setAppState] = useState<AppState>('form');
  const [showPreview, setShowPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [templateApplied, setTemplateApplied] = useState(false);

  // Load template from URL parameter
  useEffect(() => {
    if (templateApplied) return;
    
    const templateId = searchParams.get('template');
    if (templateId) {
      // Load template from localStorage
      const stored = localStorage.getItem('article_templates');
      const defaultTemplates = [
        { id: 'default-blog', tone: 'profissional', pointOfView: 'terceira', size: 'medium', language: 'pt-BR', aiModel: 'standard', faq: true, lists: true, tables: false, conclusion: true, metaDescription: true, seoOptimization: true, humanizeContent: false, generateImages: true, imageCount: 1, imageStyle: 'fotorrealístico', segment: 'general', contentType: 'how-to', goal: 'inform', intentType: 'informational' },
        { id: 'default-pillar', tone: 'educativo', pointOfView: 'segunda', size: 'very-long', language: 'pt-BR', aiModel: 'premium', faq: true, lists: true, tables: true, conclusion: true, metaDescription: true, seoOptimization: true, humanizeContent: true, generateImages: true, imageCount: 3, imageStyle: 'fotorrealístico', segment: 'general', contentType: 'pillar', goal: 'educate', intentType: 'informational' },
        { id: 'default-listicle', tone: 'casual', pointOfView: 'segunda', size: 'medium', language: 'pt-BR', aiModel: 'standard', faq: false, lists: true, tables: false, conclusion: true, metaDescription: true, seoOptimization: true, humanizeContent: false, generateImages: true, imageCount: 1, imageStyle: 'ilustração', segment: 'general', contentType: 'listicle', goal: 'engage', intentType: 'informational' },
      ];
      
      let allTemplates = [...defaultTemplates];
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          allTemplates = [...defaultTemplates, ...parsed];
        } catch {}
      }
      
      const template = allTemplates.find(t => t.id === templateId);
      if (template) {
        setConfig(prev => ({
          ...prev,
          // Basic settings
          tone: template.tone || prev.tone,
          pointOfView: template.pointOfView || prev.pointOfView,
          size: template.size || prev.size,
          language: template.language || prev.language,
          aiModel: template.aiModel || prev.aiModel,
          // SEO settings
          segment: template.segment || prev.segment,
          contentType: template.contentType || prev.contentType,
          goal: template.goal || prev.goal,
          intentType: template.intentType || prev.intentType,
          // Content elements
          faq: template.faq ?? prev.faq,
          lists: template.lists ?? prev.lists,
          tables: template.tables ?? prev.tables,
          conclusion: template.conclusion ?? prev.conclusion,
          metaDescription: template.metaDescription ?? prev.metaDescription,
          // Advanced options
          seoOptimization: template.seoOptimization ?? prev.seoOptimization,
          humanizeContent: template.humanizeContent ?? prev.humanizeContent,
          generateImages: template.generateImages ?? prev.generateImages,
          imageCount: template.imageCount || prev.imageCount,
          imageStyle: template.imageStyle || prev.imageStyle,
        }));
        setTemplateApplied(true);
        const templateName = (template as { name?: string }).name || 'Template';
        toast({
          title: 'Modelo aplicado!',
          description: `Configurações do modelo "${templateName}" foram carregadas.`,
        });
      }
    }
  }, [searchParams, templateApplied, toast]);

  // Internal links state
  const [internalLinks, setInternalLinks] = useState<InternalLink[]>([]);
  
  // Outline state
  const [outlineSections, setOutlineSections] = useState<OutlineSection[]>([]);
  
  // Generation progress state
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentGenerationStep, setCurrentGenerationStep] = useState('');
  const [generationSteps, setGenerationSteps] = useState(defaultGenerationSteps);
  
  // Article editor state
  const [articleData, setArticleData] = useState<ArticleData>(defaultArticleData);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  
  // Featured image state
  const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  
  // User credits (mock - in real implementation this would come from API)
  const [userCredits] = useState(10);

  // Connected projects for internal linking
  const connectedProjects = projects.filter(p => p.is_connected);

  const updateConfig = <K extends keyof ArticleConfig>(key: K, value: ArticleConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
  };

  // Calculate total credits based on selected options
  const selectedCreditTier = getCreditTierByValue(config.aiModel) || creditTierModels[0];
  const calculateTotalCredits = useCallback(() => {
    let total = selectedCreditTier.credits;
    if (config.realtimeData) total += 1;
    if (config.humanizeContent) total += 1;
    return total;
  }, [selectedCreditTier.credits, config.realtimeData, config.humanizeContent]);
  
  const totalCredits = calculateTotalCredits();
  
  // Validate form before generation
  const validateForm = useCallback((): string[] => {
    const errors: string[] = [];
    
    if (!config.keyword.trim()) {
      errors.push('Palavra-chave principal é obrigatória');
    }
    
    if (config.title.length > 80) {
      errors.push('Título deve ter no máximo 80 caracteres');
    }
    
    if (totalCredits > userCredits) {
      errors.push(`Créditos insuficientes. Necessário: ${totalCredits}, Disponível: ${userCredits}`);
    }
    
    if (config.internalLinking && config.projectId) {
      const selectedProject = projects.find(p => p.id === config.projectId);
      if (selectedProject && !selectedProject.is_connected) {
        errors.push('Projeto selecionado não está conectado');
      }
    }
    
    return errors;
  }, [config, totalCredits, userCredits, projects]);

  const handleGenerateTitle = async () => {
    if (!config.keyword.trim()) {
      toast({
        title: 'Palavra-chave necessária',
        description: 'Digite uma palavra-chave antes de gerar o título.',
        variant: 'destructive',
      });
      return;
    }
    setGeneratingTitle(true);
    setTimeout(() => {
      const generatedTitle = `${config.keyword}: Guia Completo para ${new Date().getFullYear()}`;
      updateConfig('title', generatedTitle);
      setGeneratingTitle(false);
      toast({
        title: 'Título gerado!',
        description: 'Você pode editar o título se desejar.',
      });
    }, 1500);
  };

  // Simulate generation progress
  const simulateGeneration = useCallback(async () => {
    const steps = [...defaultGenerationSteps];
    const stepDuration = 1500;
    
    for (let i = 0; i < steps.length; i++) {
      steps[i].status = 'in-progress';
      if (i > 0) steps[i - 1].status = 'completed';
      setGenerationSteps([...steps]);
      setCurrentGenerationStep(steps[i].title);
      setGenerationProgress(((i + 0.5) / steps.length) * 100);
      
      await new Promise(resolve => setTimeout(resolve, stepDuration));
      
      if (i === steps.length - 1) {
        steps[i].status = 'completed';
        setGenerationSteps([...steps]);
        setGenerationProgress(100);
      }
    }
  }, []);

  const handleGenerate = async () => {
    if (!config.keyword.trim()) {
      toast({
        title: 'Palavra-chave necessária',
        description: 'Digite uma palavra-chave para gerar o artigo.',
        variant: 'destructive',
      });
      return;
    }

    setAppState('generating-article');
    
    // Set status to generating if we have an articleId
    if (articleId) {
      await setGeneratingStatus();
    }
    
    // Start generating the article and image in parallel if enabled
    const articlePromise = (async () => {
      await simulateGeneration();
      return await generateArticle({
        keyword: config.keyword,
        title: config.title,
        secondaryKeywords: '',
        wordCount: config.size as 'short' | 'medium' | 'long' | 'very-long',
        tone: config.tone,
        pointOfView: config.pointOfView,
        language: config.language,
        type: config.contentType === 'review' ? 'review' : (config.contentType === 'comparative' ? 'comparison' : 'blog'),
        // Advanced SEO fields
        contentType: config.contentType as 'how-to' | 'listicle' | 'pillar' | 'comparative' | 'review' | 'opinion' | 'news',
        segment: config.segment as 'legal' | 'health' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'education' | 'general',
        goal: config.goal as 'inform' | 'convert' | 'educate' | 'engage',
        intentType: config.intentType as 'informational' | 'navigational' | 'transactional' | 'commercial',
        // Content elements
        includeFaq: config.faq,
        faqCount: 5,
        includeTable: config.tables,
        includeList: config.lists,
        includeConclusion: config.conclusion,
        includeMetaDescription: config.metaDescription,
        // SEO options
        seoOptimization: config.seoOptimization,
        humanizeContent: config.humanizeContent,
        realtimeData: config.realtimeData,
        // Internal links
        internalLinks: internalLinks.map(link => ({ anchor: link.anchor, url: link.url })),
      });
    })();

    // Generate featured image automatically if enabled
    let imageResult: { image: string } | null = null;
    if (config.generateImages) {
      setIsImageLoading(true);
      try {
        const imageModel = settings?.byok_enabled ? (settings?.image_model || undefined) : undefined;
        const inferredProvider = imageModel?.startsWith('dall-e')
          ? 'openai'
          : imageModel?.startsWith('gemini')
            ? 'gemini'
            : ((settings?.ai_provider as any) || 'auto');

        imageResult = await generateImage({
          title: config.title || config.keyword,
          keywords: config.keyword,
          segment: config.segment as 'legal' | 'health' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'education' | 'general',
          style: config.imageStyle === 'fotorrealístico' ? 'photorealistic' : 
                 config.imageStyle === 'ilustração' ? 'illustration' : 'abstract',
          quality: 'standard',
          // Use user's settings for image provider/model when BYOK is enabled
          provider: settings?.byok_enabled ? inferredProvider : 'auto',
          model: imageModel,
        });
      } catch (error) {
        console.error('Error generating image:', error);
      } finally {
        setIsImageLoading(false);
      }
    }

    const result = await articlePromise;
    const finalImageUrl = imageResult?.image || featuredImageUrl || null;

    if (result) {
      // Parse the generated content sections from the result
      const generatedTitle = config.title || `${config.keyword}: Guia Completo`;
      
      // Save the generated article to the database
      if (articleId) {
        await saveGeneratedArticle(result, generatedTitle, finalImageUrl);
      } else {
        // Create the article if it doesn't exist yet
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const wordCount = result.split(/\s+/).filter(Boolean).length;
          const { data: newArticle, error } = await supabase
            .from('articles')
            .insert({
              keyword: config.keyword,
              title: generatedTitle,
              content: result,
              word_count: wordCount,
              status: 'ready' as const,
              user_id: session.user.id,
              project_id: config.projectId || null,
              featured_image_url: finalImageUrl,
            })
            .select('id')
            .single();
          
          if (!error && newArticle) {
            setArticleId(newArticle.id);
          }
        }
      }
      
      setArticleData({
        title: generatedTitle,
        intro: result,
        sections: [],
        featuredImage: finalImageUrl || undefined,
      });
      
      setAppState('editing-article');
      toast({
        title: 'Artigo gerado!',
        description: config.generateImages && imageResult?.image 
          ? 'Artigo e imagem destacada gerados com sucesso.' 
          : 'Seu artigo está pronto para edição e publicação.',
      });
    } else {
      // Update article status to error if generation failed
      if (articleId) {
        await supabase
          .from('articles')
          .update({ status: 'error', error_message: 'Falha na geração do conteúdo' })
          .eq('id', articleId);
      }
      
      setAppState('editing-outline');
      toast({
        title: 'Erro na geração',
        description: 'Ocorreu um erro. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const handleGenerateOutline = async () => {
    if (!config.keyword.trim()) {
      toast({
        title: 'Palavra-chave necessária',
        description: 'Digite uma palavra-chave para gerar o esboço.',
        variant: 'destructive',
      });
      return;
    }
    
    const sections = generateDefaultOutline(config.keyword);
    setOutlineSections(sections);
    setAppState('editing-outline');
    
    debouncedSave(sections, {
      keyword: config.keyword,
      title: config.title,
      aiModel: config.aiModel,
      size: config.size,
      tone: config.tone,
      pointOfView: config.pointOfView,
      language: config.language,
      projectId: config.projectId,
    });
    
    toast({
      title: 'Esboço gerado!',
      description: 'Revise a estrutura e clique em "Gerar Artigo Completo".',
    });
  };

  const handleReset = () => {
    setConfig(defaultConfig);
    setAppState('form');
    setOutlineSections([]);
    setGenerationProgress(0);
    setGenerationSteps(defaultGenerationSteps);
    setArticleData(defaultArticleData);
    setArticleId(null);
    toast({
      title: 'Configurações reiniciadas',
      description: 'Todos os campos foram limpos.',
    });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.backgroundSecondary }}>
      {/* Header - Split Panel Style matching PDF */}
      <header 
        className="border-b flex"
        style={{ backgroundColor: colors.background, borderColor: colors.border }}
      >
        {/* Left Header - Generator Title */}
        <div 
          className={cn(
            "flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-r",
            isMobile ? "w-full" : "w-1/2"
          )}
          style={{ borderColor: colors.border }}
        >
          <div className="flex items-center gap-2 md:gap-3">
            <div 
              className="w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${colors.primary}15` }}
            >
              <Zap className="w-4 h-4 md:w-5 md:h-5" style={{ color: colors.primary }} />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-semibold" style={{ color: colors.textPrimary }}>
                Gerador de Artigos IA
              </h1>
              <p className="text-xs md:text-sm hidden sm:block" style={{ color: colors.textSecondary }}>
                Crie conteúdo de alta qualidade com inteligência artificial
              </p>
            </div>
          </div>
          <Badge 
            className="text-xs md:text-sm px-3 py-1.5 bg-primary text-primary-foreground"
          >
            Total: {totalCredits} {totalCredits === 1 ? 'Crédito' : 'Créditos'}
          </Badge>
        </div>
        
        {/* Right Header - Preview Status */}
        {!isMobile && (
          <div 
            className="w-1/2 flex items-center justify-between px-4 md:px-6 py-3 md:py-4"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <Eye className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <h2 className="font-semibold" style={{ color: colors.textPrimary }}>
                  Prévia em Tempo Real
                </h2>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                  Prévia do artigo em tempo real
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Pronto Para Gerar
            </div>
          </div>
        )}
        
        {/* Mobile Preview Button */}
        {isMobile && appState === 'form' && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1 ml-2 my-auto mr-4"
          >
            <Eye className="w-4 h-4" />
            <span className="hidden xs:inline">Prévia</span>
          </Button>
        )}
      </header>

      {/* Main Content */}
      <div className={cn(
        "flex",
        isMobile ? "flex-col" : "h-[calc(100vh-73px)]"
      )}>
        {/* Left Panel - Form */}
        <div className={cn(
          "border-r overflow-hidden",
          isMobile ? "w-full min-h-screen" : "w-1/2"
        )} style={{ borderColor: colors.border }}>
          <ScrollArea className={isMobile ? "h-auto" : "h-full"}>
            <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-32">
              {/* Tutorial Banner */}
              {showTutorial && (
                <div 
                  className="rounded-lg p-4 flex items-center gap-4"
                  style={{ backgroundColor: '#EFF6FF' }}
                >
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Play className="w-4 h-4 text-white ml-0.5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium" style={{ color: colors.textPrimary }}>
                      Tutorial: Como Criar Artigos
                    </p>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                      Aprenda a usar o gerador de artigos passo a passo
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowTutorial(false)}>
                    Fechar
                  </Button>
                </div>
              )}

              {/* Main Details Section */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: colors.textPrimary }}>
                  <FileText className="w-5 h-5" style={{ color: colors.primary }} />
                  Detalhes Principais
                </h2>

                {/* Keyword Field */}
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium">
                    Palavra-chave Principal <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="ex: inteligência artificial, marketing digital"
                    value={config.keyword}
                    onChange={(e) => updateConfig('keyword', e.target.value)}
                    maxLength={200}
                    className="h-11"
                  />
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    O tópico principal que seu artigo focará para otimização SEO
                  </p>
                </div>

                {/* Title Field */}
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium">
                    Título do Artigo <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        placeholder="Digite seu título ou gere um"
                        value={config.title}
                        onChange={(e) => updateConfig('title', e.target.value)}
                        maxLength={80}
                        className="h-11 pr-16"
                      />
                      <span 
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                        style={{ color: config.title.length > 60 ? colors.warning : colors.textSecondary }}
                      >
                        {config.title.length}/80
                      </span>
                    </div>
                    <Button 
                      onClick={handleGenerateTitle}
                      disabled={generatingTitle}
                      className="h-11 px-4"
                      style={{ backgroundColor: colors.primary }}
                    >
                      {generatingTitle ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      Gerar Título
                    </Button>
                  </div>
                  {config.title.length > 60 && (
                    <p className="text-xs" style={{ color: colors.warning }}>
                      ⚠️ Título muito longo. Recomendamos menos de 60 caracteres para melhor SEO.
                    </p>
                  )}
                </div>

                {/* 2x2 Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[13px] font-medium">Tom de Voz</Label>
                    <Select value={config.tone} onValueChange={(v) => updateConfig('tone', v)}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tones.map((tone) => (
                          <SelectItem key={tone} value={tone.toLowerCase()}>
                            {tone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[13px] font-medium">Ponto de Vista</Label>
                    <Select value={config.pointOfView} onValueChange={(v) => updateConfig('pointOfView', v)}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {pointsOfView.map((pov) => (
                          <SelectItem key={pov.value} value={pov.value}>
                            {pov.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[13px] font-medium">Tamanho do Artigo</Label>
                    <Select value={config.size} onValueChange={(v) => updateConfig('size', v)}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {articleSizes.map((size) => (
                          <SelectItem key={size.value} value={size.value}>
                            {size.label} ({size.words})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[13px] font-medium">Idioma</Label>
                    <Select value={config.language} onValueChange={(v) => updateConfig('language', v)}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt-BR">🇧🇷 Português (Brasil)</SelectItem>
                        <SelectItem value="en-US">🇺🇸 English (US)</SelectItem>
                        <SelectItem value="es">🇪🇸 Español</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Accordion Sections using Shared Components */}
              <Accordion type="multiple" defaultValue={['ai-model']}>
                {/* AI Model Section */}
                <AccordionItem value="ai-model" className="border rounded-lg px-4" style={{ borderColor: colors.border }}>
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <Bot className="w-5 h-5" style={{ color: colors.primary }} />
                      <span className="font-semibold">Modelo de IA</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <AIModelSelector
                      value={config.aiModel}
                      onChange={(v) => updateConfig('aiModel', v)}
                      variant="credit-tiers"
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Article Templates Section */}
                <AccordionItem value="templates" className="border rounded-lg px-4 mt-4" style={{ borderColor: colors.border }}>
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5" style={{ color: '#8B5CF6' }} />
                      <span className="font-semibold">Modelos de Artigo</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="p-4 bg-muted/50 rounded-lg border border-dashed border-border">
                      <p className="text-sm text-muted-foreground text-center">
                        Seus modelos salvos aparecerão aqui. Use modelos para reutilizar configurações de SEO, tamanho, tom de voz e muito mais.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* SEO Advanced Config Section */}
                <AccordionItem value="seo-config" className="border rounded-lg px-4 mt-4" style={{ borderColor: colors.border }}>
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5" style={{ color: colors.primary }} />
                      <span className="font-semibold">Configuração SEO Avançada</span>
                      <Badge variant="outline" className="ml-2 text-xs" style={{ borderColor: colors.success, color: colors.success }}>
                        E-E-A-T
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <SEOAdvancedConfig
                      segment={config.segment}
                      contentType={config.contentType}
                      goal={config.goal}
                      intentType={config.intentType}
                      onSegmentChange={(v) => updateConfig('segment', v)}
                      onContentTypeChange={(v) => updateConfig('contentType', v)}
                      onGoalChange={(v) => updateConfig('goal', v)}
                      onIntentTypeChange={(v) => updateConfig('intentType', v)}
                      accentColor={colors.primary}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Content Structure Section */}
                <AccordionItem value="structure" className="border rounded-lg px-4 mt-4" style={{ borderColor: colors.border }}>
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5" style={{ color: colors.primary }} />
                      <span className="font-semibold">Estrutura do Conteúdo</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <ContentStructureConfig
                      metaDescription={config.metaDescription}
                      lists={config.lists}
                      tables={config.tables}
                      conclusion={config.conclusion}
                      faq={config.faq}
                      internalLinking={config.internalLinking}
                      projectId={config.projectId}
                      onMetaDescriptionChange={(v) => updateConfig('metaDescription', v)}
                      onListsChange={(v) => updateConfig('lists', v)}
                      onTablesChange={(v) => updateConfig('tables', v)}
                      onConclusionChange={(v) => updateConfig('conclusion', v)}
                      onFaqChange={(v) => updateConfig('faq', v)}
                      onInternalLinkingChange={(v) => updateConfig('internalLinking', v)}
                      onProjectIdChange={(v) => updateConfig('projectId', v)}
                      connectedProjects={connectedProjects}
                      accentColor={colors.primary}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Internal Links Section */}
                {config.internalLinking && (
                  <AccordionItem value="internal-links" className="border rounded-lg px-4 mt-4" style={{ borderColor: colors.border }}>
                    <AccordionTrigger className="py-4">
                      <div className="flex items-center gap-2">
                        <Link2 className="w-5 h-5" style={{ color: colors.primary }} />
                        <span className="font-semibold">Links Internos</span>
                        {internalLinks.length > 0 && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {internalLinks.length} links
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <InternalLinksManager
                        links={internalLinks}
                        onLinksChange={setInternalLinks}
                        projectId={config.projectId}
                        keyword={config.keyword}
                        accentColor={colors.primary}
                      />
                    </AccordionContent>
                  </AccordionItem>
                )}

                {/* Advanced Settings Section */}
                <AccordionItem value="advanced" className="border rounded-lg px-4 mt-4" style={{ borderColor: colors.border }}>
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5" style={{ color: colors.primary }} />
                      <span className="font-semibold">Configurações Avançadas</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <AdvancedSettings
                      usePlatformCredits={config.usePlatformCredits}
                      seoOptimization={config.seoOptimization}
                      realtimeData={config.realtimeData}
                      humanizeContent={config.humanizeContent}
                      generateImages={config.generateImages}
                      imageCount={config.imageCount}
                      imageStyle={config.imageStyle}
                      onUsePlatformCreditsChange={(v) => updateConfig('usePlatformCredits', v)}
                      onSeoOptimizationChange={(v) => updateConfig('seoOptimization', v)}
                      onRealtimeDataChange={(v) => updateConfig('realtimeData', v)}
                      onHumanizeContentChange={(v) => updateConfig('humanizeContent', v)}
                      onGenerateImagesChange={(v) => updateConfig('generateImages', v)}
                      onImageCountChange={(v) => updateConfig('imageCount', v)}
                      onImageStyleChange={(v) => updateConfig('imageStyle', v)}
                      accentColor={colors.primary}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Publishing Options Section */}
                <AccordionItem value="publishing" className="border rounded-lg px-4 mt-4" style={{ borderColor: colors.border }}>
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <Rocket className="w-5 h-5" style={{ color: colors.primary }} />
                      <span className="font-semibold">Opções de Publicação</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <PublishingOptions
                      autoPublish={config.autoPublish}
                      projectId={config.projectId}
                      onAutoPublishChange={(v) => updateConfig('autoPublish', v)}
                      onProjectIdChange={(v) => updateConfig('projectId', v)}
                      connectedProjects={connectedProjects}
                      accentColor={colors.primary}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </ScrollArea>

          {/* Sticky Action Button */}
          <div 
            className={cn(
              "absolute bottom-0 left-0 p-4 border-t bg-white",
              isMobile ? "w-full" : "w-1/2"
            )}
            style={{ borderColor: colors.border }}
          >
            {appState === 'form' && (
              <>
                {validationErrors.length > 0 && (
                  <div className="mb-3 p-3 bg-red-50 rounded-lg space-y-1">
                    {validationErrors.map((error, idx) => (
                      <p key={idx} className="text-sm flex items-center gap-2 text-destructive">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                      </p>
                    ))}
                  </div>
                )}
                <Button
                  onClick={() => {
                    const errors = validateForm();
                    if (errors.length > 0) {
                      setValidationErrors(errors);
                      return;
                    }
                    handleGenerateOutline();
                  }}
                  disabled={isGenerating || !config.keyword.trim()}
                  className="w-full h-12 text-base transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Play className="w-5 h-5 mr-2" />
                  Gerar Esboço do Artigo
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  Custo total: {totalCredits} {totalCredits === 1 ? 'crédito' : 'créditos'} • Disponível: {userCredits}
                </p>
              </>
            )}
            
            {appState === 'editing-outline' && (
              <>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full h-12 text-base transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ backgroundColor: colors.primary }}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Gerando Artigo...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      Gerar Artigo Completo ({totalCredits} {totalCredits === 1 ? 'crédito' : 'créditos'})
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="w-full h-10 mt-2 transition-colors duration-200"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reiniciar & Começar de Novo
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Right Panel - Dynamic based on app state */}
        <div className={cn(
          "overflow-hidden transition-all duration-300",
          isMobile ? "fixed inset-0 z-50" : "w-1/2",
          isMobile && !showPreview && "hidden"
        )} style={{ backgroundColor: colors.background }}>
          {/* Mobile close button */}
          {isMobile && showPreview && (
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: colors.border }}>
              <span className="font-medium">Prévia</span>
              <Button variant="ghost" size="icon" onClick={() => setShowPreview(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          )}
          
          {/* Show Progress Screen during generation */}
          {appState === 'generating-article' && (
            <ProgressScreen
              currentStep={currentGenerationStep}
              progress={generationProgress}
              steps={generationSteps}
            />
          )}

          {/* Show Outline Editor after outline is generated */}
          {appState === 'editing-outline' && (
            <OutlineEditor
              sections={outlineSections}
              onSectionsChange={(newSections) => {
                setOutlineSections(newSections);
                debouncedSave(newSections, {
                  keyword: config.keyword,
                  title: config.title,
                  aiModel: config.aiModel,
                  size: config.size,
                  tone: config.tone,
                  pointOfView: config.pointOfView,
                  language: config.language,
                  projectId: config.projectId,
                });
              }}
              onGenerate={handleGenerate}
              onReset={handleReset}
              isGenerating={isGenerating}
              totalCredits={totalCredits}
            />
          )}

          {/* Show Article Editor when complete */}
          {appState === 'editing-article' && (
            <ArticleEditor
              title={articleData.title}
              intro={articleData.intro}
              sections={articleData.sections}
              featuredImage={articleData.featuredImage}
              onTitleChange={(title) => setArticleData(prev => ({ ...prev, title }))}
              onIntroChange={(intro) => setArticleData(prev => ({ ...prev, intro }))}
              onSectionChange={(id, field, value) => {
                setArticleData(prev => ({
                  ...prev,
                  sections: prev.sections.map(s =>
                    s.id === id ? { ...s, [field]: value } : s
                  ),
                }));
              }}
              onPublish={async (projectId) => {
                if (!articleId || !projectId) {
                  toast({
                    title: 'Erro',
                    description: 'Selecione um projeto WordPress para publicar.',
                    variant: 'destructive',
                  });
                  return;
                }
                
                await saveGeneratedArticle(generatedContent || '', articleData.title);
                
                const result = await publishArticle({
                  id: articleId,
                  title: articleData.title,
                  project_id: projectId,
                });
                
                if (result.success && result.postUrl) {
                  setPublishedUrl(result.postUrl);
                  setAppState('publishing');
                }
              }}
              onSave={() => saveGeneratedArticle(generatedContent || '', articleData.title)}
              isPublishing={isPublishing}
              isSaving={isSaving}
              lastSaved={lastSaved}
              projects={projects}
              selectedProjectId={config.projectId}
              publishedUrl={publishedUrl || undefined}
            />
          )}

          {/* Show Preview in form mode */}
          {appState === 'form' && (
            <ScrollArea className="h-full">
              <div className="p-6">
                {/* Preview Header */}
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-5 h-5" style={{ color: colors.primary }} />
                  <h2 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>
                    Prévia em Tempo Real
                  </h2>
                </div>
                <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
                  Prévia do artigo em tempo real
                </p>

                <div 
                  className="rounded-lg border p-6 min-h-[500px]"
                  style={{ borderColor: colors.border }}
                >
                  {config.title || config.keyword ? (
                    <article className="space-y-6">
                      {/* Article Title */}
                      <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>
                        {config.title || `[Título sobre: ${config.keyword}]`}
                      </h1>
                      
                      {/* Metadata Tags */}
                      <div className="flex flex-wrap gap-2">
                        <Badge 
                          variant="secondary" 
                          className="text-xs"
                          style={{ backgroundColor: colors.lightBlue }}
                        >
                          Tamanho: {articleSizes.find(s => s.value === config.size)?.words}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className="text-xs"
                          style={{ backgroundColor: colors.lightBlue }}
                        >
                          Idioma: {config.language === 'pt-BR' ? '🇧🇷 Português' : config.language === 'en-US' ? '🇺🇸 English' : '🇪🇸 Español'}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className="text-xs"
                          style={{ backgroundColor: colors.lightBlue }}
                        >
                          Tom: {config.tone.charAt(0).toUpperCase() + config.tone.slice(1)}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className="text-xs"
                          style={{ backgroundColor: colors.lightBlue }}
                        >
                          Ponto de Vista: {pointsOfView.find(p => p.value === config.pointOfView)?.label || config.pointOfView}
                        </Badge>
                      </div>

                      {/* Meta Description Preview */}
                      {config.metaDescription && (
                        <div 
                          className="p-4 rounded-lg text-sm"
                          style={{ backgroundColor: colors.lightBlue }}
                        >
                          <strong className="block mb-1" style={{ color: colors.textPrimary }}>Meta Descrição:</strong>
                          <p style={{ color: colors.textSecondary }}>
                            Descubra tudo sobre {config.keyword || '[palavra-chave]'}. 
                            Guia completo com dicas práticas e informações atualizadas para {new Date().getFullYear()}.
                          </p>
                        </div>
                      )}

                      {/* Content Placeholder */}
                      <div 
                        className="p-6 rounded-lg border-2 border-dashed text-center"
                        style={{ borderColor: colors.border }}
                      >
                        <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: colors.border }} />
                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                          O conteúdo do artigo aparecerá aqui quando gerado
                        </p>
                      </div>

                      {/* Included Elements */}
                      <div className="pt-4 border-t" style={{ borderColor: colors.border }}>
                        <p className="text-sm font-medium mb-3" style={{ color: colors.textPrimary }}>
                          Elementos incluídos:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {config.metaDescription && (
                            <Badge variant="secondary" style={{ backgroundColor: colors.lightBlue }}>
                              📝 Meta Descrição
                            </Badge>
                          )}
                          {config.lists && (
                            <Badge variant="secondary" style={{ backgroundColor: colors.lightBlue }}>
                              📋 Listas
                            </Badge>
                          )}
                          {config.tables && (
                            <Badge variant="secondary" style={{ backgroundColor: colors.lightBlue }}>
                              📊 Tabelas
                            </Badge>
                          )}
                          {config.conclusion && (
                            <Badge variant="secondary" style={{ backgroundColor: colors.lightBlue }}>
                              ✅ Conclusão
                            </Badge>
                          )}
                          {config.faq && (
                            <Badge variant="secondary" style={{ backgroundColor: colors.lightBlue }}>
                              ❓ FAQ
                            </Badge>
                          )}
                          {config.internalLinking && (
                            <Badge variant="secondary" style={{ backgroundColor: colors.secondary }}>
                              🔗 Linkagem Interna
                            </Badge>
                          )}
                          {config.seoOptimization && (
                            <Badge variant="secondary" style={{ backgroundColor: colors.lightBlue }}>
                              🔍 SEO Otimizado
                            </Badge>
                          )}
                          {config.realtimeData && (
                            <Badge variant="secondary" style={{ backgroundColor: colors.secondary }}>
                              🌐 Dados em Tempo Real
                            </Badge>
                          )}
                          {config.humanizeContent && (
                            <Badge variant="secondary" style={{ backgroundColor: colors.tertiary }}>
                              👤 Conteúdo Humanizado
                            </Badge>
                          )}
                          {config.generateImages && (
                            <Badge variant="secondary" style={{ backgroundColor: colors.pink }}>
                              🖼️ {config.imageCount} {config.imageCount === 1 ? 'Imagem' : 'Imagens'} IA
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Model Info */}
                      <div 
                        className="p-3 rounded-lg text-xs"
                        style={{ backgroundColor: colors.backgroundSecondary }}
                      >
                        <strong style={{ color: colors.textPrimary }}>Modelo:</strong>{' '}
                        <span style={{ color: colors.textSecondary }}>{selectedCreditTier.label} ({selectedCreditTier.credits} {selectedCreditTier.credits === 1 ? 'crédito' : 'créditos'})</span>
                      </div>
                    </article>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[400px] text-center">
                      <div 
                        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                        style={{ backgroundColor: colors.backgroundSecondary }}
                      >
                        <FileText className="w-8 h-8" style={{ color: colors.border }} />
                      </div>
                      <p className="text-lg font-medium mb-2" style={{ color: colors.textPrimary }}>
                        Gerador de Artigos IA
                      </p>
                      <p className="text-sm max-w-xs" style={{ color: colors.textSecondary }}>
                        Preencha os detalhes à esquerda para ver uma prévia da 
                        estrutura e conteúdo do seu artigo.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
