import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  FileText,
  Settings,
  Rocket,
  Target,
  Link2,
  X,
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
  GeneratorHeader,
  GeneratorMainConfig,
  GeneratorPreviewPanel,
  GeneratorActionBar,
  GeneratorTutorialBanner,
  defaultArticleSizes,
  defaultPointsOfView,
  type OutlineSection,
  type ArticleData
} from '@/components/article-generator';
import {
  AIModelSelector,
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

interface ArticleConfig {
  keyword: string;
  title: string;
  tone: string;
  pointOfView: string;
  size: string;
  language: string;
  aiModel: string;
  segment: string;
  contentType: string;
  goal: string;
  intentType: string;
  metaDescription: boolean;
  lists: boolean;
  tables: boolean;
  conclusion: boolean;
  faq: boolean;
  internalLinking: boolean;
  projectId: string;
  usePlatformCredits: boolean;
  seoOptimization: boolean;
  realtimeData: boolean;
  humanizeContent: boolean;
  generateImages: boolean;
  imageCount: number;
  imageStyle: string;
  autoPublish: boolean;
}

const defaultConfig: ArticleConfig = {
  keyword: '',
  title: '',
  tone: 'profissional',
  pointOfView: 'segunda',
  size: 'medio',
  language: 'pt-BR',
  aiModel: 'standard',
  segment: 'general',
  contentType: 'how-to',
  goal: 'inform',
  intentType: 'informational',
  metaDescription: true,
  lists: true,
  tables: true,
  conclusion: true,
  faq: true,
  internalLinking: true,
  projectId: '',
  usePlatformCredits: true,
  seoOptimization: true,
  realtimeData: false,
  humanizeContent: true,
  generateImages: true,
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
  const { generateImage, generateMultipleImages } = useImageGeneration();
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
  const [showTutorial, setShowTutorial] = useState(true);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [appState, setAppState] = useState<AppState>('form');
  const [showPreview, setShowPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [templateApplied, setTemplateApplied] = useState(false);
  const [internalLinks, setInternalLinks] = useState<InternalLink[]>([]);
  const [outlineSections, setOutlineSections] = useState<OutlineSection[]>([]);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentGenerationStep, setCurrentGenerationStep] = useState('');
  const [generationSteps, setGenerationSteps] = useState(defaultGenerationSteps);
  const [articleData, setArticleData] = useState<ArticleData>(defaultArticleData);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [userCredits] = useState(10);

  const connectedProjects = projects.filter(p => p.is_connected);

  // Auto-select first connected project if none selected
  useEffect(() => {
    if (!config.projectId && connectedProjects.length > 0) {
      updateConfig('projectId', connectedProjects[0].id);
    }
  }, [connectedProjects, config.projectId]);

  // Load template from URL parameter
  useEffect(() => {
    if (templateApplied) return;
    const templateId = searchParams.get('template');
    if (templateId) {
      const stored = localStorage.getItem('article_templates');
      const defaultTemplates = [
        { id: 'default-blog', tone: 'profissional', pointOfView: 'terceira', size: 'medio', language: 'pt-BR', aiModel: 'standard', faq: true, lists: true, tables: false, conclusion: true, metaDescription: true, seoOptimization: true, humanizeContent: false, generateImages: true, imageCount: 1, imageStyle: 'fotorrealístico', segment: 'general', contentType: 'how-to', goal: 'inform', intentType: 'informational' },
        { id: 'default-pillar', tone: 'educativo', pointOfView: 'segunda', size: 'grande', language: 'pt-BR', aiModel: 'premium', faq: true, lists: true, tables: true, conclusion: true, metaDescription: true, seoOptimization: true, humanizeContent: true, generateImages: true, imageCount: 3, imageStyle: 'fotorrealístico', segment: 'general', contentType: 'pillar', goal: 'educate', intentType: 'informational' },
        { id: 'default-listicle', tone: 'casual', pointOfView: 'segunda', size: 'pequeno', language: 'pt-BR', aiModel: 'standard', faq: false, lists: true, tables: false, conclusion: true, metaDescription: true, seoOptimization: true, humanizeContent: false, generateImages: true, imageCount: 1, imageStyle: 'ilustração', segment: 'general', contentType: 'listicle', goal: 'engage', intentType: 'informational' },
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
          tone: template.tone || prev.tone,
          pointOfView: template.pointOfView || prev.pointOfView,
          size: template.size || prev.size,
          language: template.language || prev.language,
          aiModel: template.aiModel || prev.aiModel,
          segment: template.segment || prev.segment,
          contentType: template.contentType || prev.contentType,
          goal: template.goal || prev.goal,
          intentType: template.intentType || prev.intentType,
          faq: template.faq ?? prev.faq,
          lists: template.lists ?? prev.lists,
          tables: template.tables ?? prev.tables,
          conclusion: template.conclusion ?? prev.conclusion,
          metaDescription: template.metaDescription ?? prev.metaDescription,
          seoOptimization: template.seoOptimization ?? prev.seoOptimization,
          humanizeContent: template.humanizeContent ?? prev.humanizeContent,
          generateImages: template.generateImages ?? prev.generateImages,
          imageCount: template.imageCount || prev.imageCount,
          imageStyle: template.imageStyle || prev.imageStyle,
        }));
        setTemplateApplied(true);
        toast({
          title: 'Modelo aplicado!',
          description: `Configurações do modelo foram carregadas.`,
        });
      }
    }
  }, [searchParams, templateApplied, toast]);

  const updateConfig = <K extends keyof ArticleConfig>(key: K, value: ArticleConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
  };

  const selectedCreditTier = getCreditTierByValue(config.aiModel) || creditTierModels[0];
  const calculateTotalCredits = useCallback(() => {
    let total = selectedCreditTier.credits;
    if (config.realtimeData) total += 1;
    if (config.humanizeContent) total += 1;
    return total;
  }, [selectedCreditTier.credits, config.realtimeData, config.humanizeContent]);
  
  const totalCredits = calculateTotalCredits();

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
    try {
      const { data, error } = await supabase.functions.invoke('ai-api', {
        body: { action: 'generate-title', prompt: config.keyword },
      });
      if (error) throw error;
      const titles = data?.titles?.filter((t: string) => t.length > 10) || [];
      if (titles.length > 0) {
        // Pick the first title (best ranked by the AI)
        updateConfig('title', titles[0]);
        toast({
          title: 'Título gerado com IA!',
          description: `${titles.length} opções geradas. Título principal aplicado.`,
        });
      } else {
        throw new Error('Nenhum título gerado');
      }
    } catch (err) {
      console.error('Erro ao gerar título:', err);
      toast({
        title: 'Erro ao gerar título',
        description: 'Tente novamente em alguns segundos.',
        variant: 'destructive',
      });
    } finally {
      setGeneratingTitle(false);
    }
  };

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
    
    if (articleId) {
      await setGeneratingStatus();
    }
    
    // Build projectConfig from selected project - ALWAYS send when project is selected (not just for internal linking)
    const selectedProject = config.projectId ? projects.find(p => p.id === config.projectId) : 
      (connectedProjects.length > 0 ? connectedProjects[0] : null);
    const projectConfigData = selectedProject ? {
      nicho: (selectedProject as any).nicho || undefined,
      compliance_rules: (selectedProject as any).compliance_rules || undefined,
      empresa_nome: (selectedProject as any).empresa_nome || undefined,
      empresa_telefone: (selectedProject as any).empresa_telefone || undefined,
      empresa_endereco: (selectedProject as any).empresa_endereco || undefined,
      empresa_whatsapp: (selectedProject as any).empresa_whatsapp || undefined,
      social_instagram: (selectedProject as any).social_instagram || undefined,
      social_youtube: (selectedProject as any).social_youtube || undefined,
      social_linkedin: (selectedProject as any).social_linkedin || undefined,
      social_twitter: (selectedProject as any).social_twitter || undefined,
      social_tiktok: (selectedProject as any).social_tiktok || undefined,
      social_google_maps: (selectedProject as any).social_google_maps || undefined,
      social_linktree: (selectedProject as any).social_linktree || undefined,
      cta_comunidade: (selectedProject as any).cta_comunidade || undefined,
      cta_conclusao: (selectedProject as any).cta_conclusao || undefined,
      cta_leads: (selectedProject as any).cta_leads || undefined,
    } : undefined;

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
        contentType: config.contentType as 'how-to' | 'listicle' | 'pillar' | 'comparative' | 'review' | 'opinion' | 'news',
        segment: config.segment as 'legal' | 'health' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'education' | 'general',
        goal: config.goal as 'inform' | 'convert' | 'educate' | 'engage',
        intentType: config.intentType as 'informational' | 'navigational' | 'transactional' | 'commercial',
        includeFaq: config.faq,
        faqCount: 5,
        includeTable: config.tables,
        includeList: config.lists,
        includeConclusion: config.conclusion,
        includeMetaDescription: config.metaDescription,
        seoOptimization: config.seoOptimization,
        humanizeContent: config.humanizeContent,
        realtimeData: config.realtimeData,
        internalLinks: internalLinks.map(link => ({ anchor: link.anchor, url: link.url })),
        projectConfig: projectConfigData,
        targetFunction: 'article_generator',
      });
    })();

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

        const imageRequest = {
          title: config.title || config.keyword,
          keywords: config.keyword,
          segment: config.segment as 'legal' | 'health' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'education' | 'general',
          style: config.imageStyle === 'fotorrealístico' ? 'photorealistic' as const : 
                 config.imageStyle === 'ilustração' ? 'illustration' as const : 'abstract' as const,
          quality: 'standard' as const,
          provider: settings?.byok_enabled ? inferredProvider : 'auto' as const,
          model: imageModel,
        };

        if (config.imageCount > 1) {
          const multiResult = await generateMultipleImages(imageRequest, config.imageCount);
          if (multiResult.featuredImage) {
            imageResult = { image: multiResult.featuredImage.image };
          }
        } else {
          const singleResult = await generateImage(imageRequest);
          if (singleResult) {
            imageResult = { image: singleResult.image };
          }
        }
      } catch (error) {
        console.error('Error generating image(s):', error);
      } finally {
        setIsImageLoading(false);
      }
    }

    const result = await articlePromise;
    const finalImageUrl = imageResult?.image || featuredImageUrl || null;

    if (result) {
      const generatedTitle = config.title || `${config.keyword}: Guia Completo`;
      
      if (articleId) {
        await saveGeneratedArticle(result, generatedTitle, finalImageUrl);
      } else {
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
      
      const finalArticleId = articleId || (await (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data } = await supabase
            .from('articles')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('keyword', config.keyword)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          return data?.id || null;
        }
        return null;
      })());
      
      if (finalArticleId) {
        toast({
          title: 'Artigo gerado com sucesso!',
          description: 'Redirecionando para o editor completo...',
        });
        setTimeout(() => {
          navigate(`/articles/${finalArticleId}/edit`);
        }, 500);
      } else {
        setAppState('editing-article');
        toast({
          title: 'Artigo gerado!',
          description: config.generateImages && imageResult?.image 
            ? 'Artigo e imagem destacada gerados com sucesso.' 
            : 'Seu artigo está pronto para edição e publicação.',
        });
      }
    } else {
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

  const handleValidateAndGenerate = () => {
    const errors = validateForm();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    handleGenerateOutline();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <GeneratorHeader
        totalCredits={totalCredits}
        isMobile={isMobile}
        showPreview={showPreview}
        onShowPreview={() => setShowPreview(true)}
      />

      {/* Main Content */}
      <div className={cn(
        "flex",
        isMobile ? "flex-col" : "h-[calc(100vh-73px)]"
      )}>
        {/* Left Panel - Form */}
        <div className={cn(
          "border-r border-border overflow-hidden relative",
          isMobile ? "w-full min-h-screen" : "w-1/2"
        )}>
          <ScrollArea className={isMobile ? "h-auto" : "h-[calc(100vh-73px)]"}>
            <div className="p-4 md:p-5 space-y-3 md:space-y-4 pb-52 overflow-x-hidden max-w-full">
              {/* Tutorial Banner */}
              {showTutorial && (
                <GeneratorTutorialBanner onClose={() => setShowTutorial(false)} />
              )}

              {/* Main Config Section */}
              <GeneratorMainConfig
                keyword={config.keyword}
                title={config.title}
                tone={config.tone}
                pointOfView={config.pointOfView}
                size={config.size}
                language={config.language}
                onKeywordChange={(v) => updateConfig('keyword', v)}
                onTitleChange={(v) => updateConfig('title', v)}
                onToneChange={(v) => updateConfig('tone', v)}
                onPointOfViewChange={(v) => updateConfig('pointOfView', v)}
                onSizeChange={(v) => updateConfig('size', v)}
                onLanguageChange={(v) => updateConfig('language', v)}
                onGenerateTitle={handleGenerateTitle}
                isGeneratingTitle={generatingTitle}
              />

              {/* Accordion Sections */}
              <Accordion type="multiple" defaultValue={['ai-model']}>
                {/* AI Model Section */}
                <AccordionItem value="ai-model" className="border rounded-lg px-4 border-border">
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <Bot className="w-5 h-5 text-primary" />
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
                <AccordionItem value="templates" className="border rounded-lg px-4 mt-4 border-border">
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      <span className="font-semibold">Modelos de Artigo</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="p-4 bg-muted/50 rounded-lg border border-dashed border-border">
                      <p className="text-sm text-muted-foreground text-center">
                        Seus modelos salvos aparecerão aqui.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* SEO Advanced Config Section */}
                <AccordionItem value="seo-config" className="border rounded-lg px-4 mt-4 border-border">
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      <span className="font-semibold">Configuração SEO Avançada</span>
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
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Content Structure Section */}
                <AccordionItem value="content-structure" className="border rounded-lg px-4 mt-4 border-border">
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
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
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Internal Linking Section */}
                <AccordionItem value="internal-linking" className="border rounded-lg px-4 mt-4 border-border">
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <Link2 className="w-5 h-5 text-primary" />
                      <span className="font-semibold">Gerenciar Links Internos</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <InternalLinksManager
                      links={internalLinks}
                      onLinksChange={setInternalLinks}
                      projectId={config.projectId}
                      keyword={config.keyword}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Advanced Settings Section */}
                <AccordionItem value="advanced-settings" className="border rounded-lg px-4 mt-4 border-border">
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-primary" />
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
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Publishing Options Section */}
                <AccordionItem value="publishing" className="border rounded-lg px-4 mt-4 border-border">
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <Rocket className="w-5 h-5 text-primary" />
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
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </ScrollArea>

          {/* Sticky Action Button */}
          <GeneratorActionBar
            appState={appState}
            isGenerating={isGenerating}
            isDisabled={!config.keyword.trim()}
            validationErrors={validationErrors}
            totalCredits={totalCredits}
            userCredits={userCredits}
            onValidateAndGenerate={handleValidateAndGenerate}
            onGenerateArticle={handleGenerate}
            onReset={handleReset}
            isMobile={isMobile}
          />
        </div>

        {/* Right Panel - Dynamic based on app state */}
        <div className={cn(
          "overflow-hidden transition-all duration-300 bg-background",
          isMobile ? "fixed inset-0 z-50" : "w-1/2",
          isMobile && !showPreview && "hidden"
        )}>
          {/* Mobile close button */}
          {isMobile && showPreview && (
            <div className="flex items-center justify-between p-4 border-b border-border">
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
            <GeneratorPreviewPanel
              keyword={config.keyword}
              title={config.title}
              size={config.size}
              language={config.language}
              tone={config.tone}
              pointOfView={config.pointOfView}
              metaDescription={config.metaDescription}
              lists={config.lists}
              tables={config.tables}
              conclusion={config.conclusion}
              faq={config.faq}
              internalLinking={config.internalLinking}
              seoOptimization={config.seoOptimization}
              realtimeData={config.realtimeData}
              humanizeContent={config.humanizeContent}
              generateImages={config.generateImages}
              imageCount={config.imageCount}
              selectedCreditTier={selectedCreditTier}
              articleSizes={defaultArticleSizes}
              pointsOfView={defaultPointsOfView}
            />
          )}
        </div>
      </div>
    </div>
  );
}
