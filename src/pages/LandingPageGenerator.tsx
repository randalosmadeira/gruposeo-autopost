import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  Target,
  Play,
  Sparkles,
  FileText,
  List,
  CheckCircle2,
  Globe,
  Loader2,
  Users,
  Frown,
  Star,
  Building2,
  Phone,
  MapPin,
  Info,
  Eye,
  RefreshCw,
  Layers,
  ShoppingCart,
  Briefcase,
  GraduationCap,
  Users2,
  Code,
  Settings,
  X,
  Wand2,
  Building,
  Heart,
  DollarSign,
  BookOpen,
  Scale,
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLandingPageGeneration, type LandingPageConfig } from '@/hooks/useLandingPageGeneration';
import { useWordPressPublish } from '@/hooks/useWordPressPublish';
import { cn } from '@/lib/utils';
import { 
  AIModelSelector, 
  ContentStructureConfig, 
  AdvancedSettings, 
  PublishingOptions,
  PhoneInput,
  validatePhoneBR,
  getModelByValue,
  ToneVoiceConfig,
} from '@/components/shared';
import {
  LandingPageOutlineEditor,
  LandingPageEditor,
  LandingPageProgressScreen,
  defaultLandingPageSteps,
  generateLandingPageOutline,
  type LandingPageSection,
} from '@/components/landing-page';

// App states for the flow
type AppState = 
  | 'form'                  // Initial form filling
  | 'editing-outline'       // Editing structure
  | 'generating-content'    // Generating full landing page
  | 'editing-content'       // Editing final content
  | 'publishing';           // Publishing

// Niche templates configuration
const nicheTemplates = [
  {
    id: 'saas',
    name: 'SaaS / Software',
    icon: Code,
    description: 'Ideal para produtos de software, apps e plataformas',
    color: '#6366F1',
    defaults: {
      offerType: 'Software/App',
      targetAudience: 'Empresas e profissionais que buscam automatizar processos e aumentar produtividade',
      painPoint: 'Perda de tempo com tarefas manuais, falta de integração entre sistemas, dificuldade de escalar',
      differentials: 'Interface intuitiva, integrações nativas, suporte especializado, escalabilidade',
      ctaObjective: 'Iniciar trial gratuito de 14 dias sem cartão de crédito',
    }
  },
  {
    id: 'ecommerce',
    name: 'E-commerce / Produto',
    icon: ShoppingCart,
    description: 'Perfeito para lançamento de produtos físicos ou digitais',
    color: '#10B981',
    defaults: {
      offerType: 'Produto Digital',
      targetAudience: 'Consumidores que buscam soluções práticas para seus problemas do dia-a-dia',
      painPoint: 'Frustração com produtos que não entregam o prometido, falta de confiança em compras online',
      differentials: 'Garantia de satisfação, entrega rápida, suporte pós-venda, qualidade premium',
      ctaObjective: 'Adicionar ao carrinho com desconto exclusivo de lançamento',
    }
  },
  {
    id: 'services',
    name: 'Serviços / Agência',
    icon: Briefcase,
    description: 'Para prestadores de serviços e agências',
    color: '#F59E0B',
    defaults: {
      offerType: 'Serviço',
      targetAudience: 'Empresas que precisam de expertise especializada para resolver problemas complexos',
      painPoint: 'Falta de tempo, conhecimento ou recursos internos para executar projetos importantes',
      differentials: 'Equipe especializada, metodologia comprovada, resultados mensuráveis, atendimento personalizado',
      ctaObjective: 'Agendar diagnóstico gratuito de 30 minutos',
    }
  },
  {
    id: 'course',
    name: 'Curso / Infoproduto',
    icon: GraduationCap,
    description: 'Para cursos online, ebooks e treinamentos',
    color: '#EC4899',
    defaults: {
      offerType: 'Curso Online',
      targetAudience: 'Pessoas que buscam desenvolvimento pessoal ou profissional através de educação online',
      painPoint: 'Dificuldade em encontrar conteúdo de qualidade, falta de um método estruturado de aprendizado',
      differentials: 'Método passo a passo, suporte da comunidade, certificado reconhecido, acesso vitalício',
      ctaObjective: 'Garantir vaga com preço promocional de lançamento',
    }
  },
  {
    id: 'consultancy',
    name: 'Consultoria',
    icon: Users2,
    description: 'Para consultores e mentores',
    color: '#8B5CF6',
    defaults: {
      offerType: 'Consultoria',
      targetAudience: 'Empresários e executivos que buscam orientação estratégica para crescer seus negócios',
      painPoint: 'Estagnação nos resultados, falta de clareza estratégica, decisões baseadas em achismo',
      differentials: 'Experiência de mercado, abordagem personalizada, foco em resultados, rede de contatos',
      ctaObjective: 'Agendar sessão estratégica gratuita de 45 minutos',
    }
  },
];

const offerTypes = [
  'Serviço',
  'Produto Físico',
  'Produto Digital',
  'Curso Online',
  'Consultoria',
  'Software/App',
  'Evento',
  'Assinatura/Recorrente',
];

const articleSizes = [
  { value: 'muito_pequeno', label: 'Muito Pequeno', words: '600-1.200 palavras' },
  { value: 'pequeno', label: 'Pequeno', words: '1.200-2.400 palavras' },
  { value: 'medio', label: 'Médio', words: '2.400-3.600 palavras' },
  { value: 'grande', label: 'Grande', words: '2.600-5.200 palavras' },
];

// Audience type options
const audienceTypes = [
  { value: 'b2b', label: 'B2B (Empresas)', description: 'Foco em empresas e negócios' },
  { value: 'b2c', label: 'B2C (Consumidores)', description: 'Foco em consumidores finais' },
  { value: 'both', label: 'Ambos', description: 'B2B e B2C simultaneamente' },
];

// Segment options for compliance
const segmentOptions = [
  { value: 'general', label: 'Geral', icon: FileText, color: '#6B7280', description: 'Sem compliance específico' },
  { value: 'juridico', label: 'Jurídico', icon: Scale, color: '#7C3AED', description: 'Compliance OAB/Res. 02/2015' },
  { value: 'saude', label: 'Saúde', icon: Heart, color: '#EF4444', description: 'Credenciais médicas, disclaimers' },
  { value: 'fintech', label: 'Fintech/Finanças', icon: DollarSign, color: '#10B981', description: 'Dados de mercado, glossário' },
  { value: 'ecommerce', label: 'E-commerce', icon: ShoppingCart, color: '#F59E0B', description: 'Social proof, guias de compra' },
  { value: 'b2b-saas', label: 'B2B SaaS', icon: Code, color: '#3B82F6', description: 'ROI, cases de uso, demos' },
  { value: 'educacao', label: 'Educação', icon: BookOpen, color: '#EC4899', description: 'Didático, roadmaps, certificações' },
];

const defaultConfig: LandingPageConfig = {
  keyword: '',
  title: '',
  offerType: 'Serviço',
  location: '',
  size: 'medio',
  language: 'pt-BR',
  targetAudience: '',
  painPoint: '',
  differentials: '',
  ctaObjective: '',
  additionalInfo: '',
  companyName: '',
  companyPhone: '',
  companyAddress: '',
  metaDescription: true,
  lists: true,
  tables: false,
  conclusion: true,
  faq: false,
  internalLinking: true,
  projectId: '',
  template: '',
  aiModel: 'standard',
  // Tone & Voice
  tone: 'profissional',
  customTone: '',
  pointOfView: 'terceira-singular',
  // NEW fields
  audienceType: 'both',
  secondaryKeywords: '',
  segment: 'general',
  // Advanced
  usePlatformCredits: true,
  seoOptimization: false,
  realtimeData: false,
  humanizeContent: false,
  generateImages: false,
  imageCount: 1,
  imageStyle: 'fotorrealístico',
  autoPublish: false,
};

export default function LandingPageGenerator() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { projects } = useProjects();
  const isMobile = useIsMobile();
  const { publishArticle, isPublishing } = useWordPressPublish();
  
  const [config, setConfig] = useState<LandingPageConfig>(defaultConfig);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingKeywords, setGeneratingKeywords] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppState>('form');
  
  // Outline state
  const [outlineSections, setOutlineSections] = useState<LandingPageSection[]>([]);
  
  // Generation progress state
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentGenerationStep, setCurrentGenerationStep] = useState('');
  const [generationSteps, setGenerationSteps] = useState(defaultLandingPageSteps);
  
  // Editor state
  const [editorData, setEditorData] = useState({
    title: '',
    headline: '',
    sections: [] as Array<{ id: string; title: string; content: string; type: string }>,
    featuredImage: undefined as string | undefined,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  const { 
    content, 
    isGenerating, 
    progress, 
    generateLandingPage, 
    resetGeneration 
  } = useLandingPageGeneration();

  const updateConfig = <K extends keyof LandingPageConfig>(key: K, value: LandingPageConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSelectTemplate = (templateId: string) => {
    const template = nicheTemplates.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setConfig(prev => ({
        ...prev,
        template: templateId,
        offerType: template.defaults.offerType,
        targetAudience: template.defaults.targetAudience,
        painPoint: template.defaults.painPoint,
        differentials: template.defaults.differentials,
        ctaObjective: template.defaults.ctaObjective,
      }));
      toast({
        title: `Template "${template.name}" aplicado`,
        description: 'Os campos foram preenchidos com valores sugeridos para este nicho.',
      });
    }
  };

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
      const generatedTitle = `${config.keyword}: A Solução Definitiva Para ${config.offerType}`;
      updateConfig('title', generatedTitle);
      setGeneratingTitle(false);
      toast({
        title: 'Título gerado!',
        description: 'Você pode editar o título se desejar.',
      });
    }, 1500);
  };

  // Generate secondary keywords with AI (real integration)
  const handleGenerateSecondaryKeywords = async () => {
    if (!config.keyword.trim()) {
      toast({
        title: 'Palavra-chave necessária',
        description: 'Digite uma palavra-chave principal antes de gerar as secundárias.',
        variant: 'destructive',
      });
      return;
    }
    
    setGeneratingKeywords(true);
    
    try {
      // Get the user's session token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        toast({
          title: 'Sessão expirada',
          description: 'Por favor, faça login novamente.',
          variant: 'destructive',
        });
        setGeneratingKeywords(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-secondary-keywords`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            keyword: config.keyword,
            segment: config.segment,
            audienceType: config.audienceType,
            language: config.language,
            count: 8,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        
        if (response.status === 429) {
          toast({
            title: 'Limite excedido',
            description: 'Muitas requisições. Aguarde alguns segundos e tente novamente.',
            variant: 'destructive',
          });
        } else if (response.status === 402) {
          toast({
            title: 'Créditos insuficientes',
            description: 'Adicione créditos à sua conta para continuar.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Erro na geração',
            description: errorData.error || 'Falha ao gerar palavras-chave',
            variant: 'destructive',
          });
        }
        setGeneratingKeywords(false);
        return;
      }

      const data = await response.json();
      
      if (data.success && data.keywords) {
        updateConfig('secondaryKeywords', data.keywords);
        toast({
          title: 'Keywords secundárias geradas!',
          description: `${data.count || 8} palavras-chave de cauda longa geradas com IA.`,
        });
      } else {
        toast({
          title: 'Erro na geração',
          description: data.error || 'Falha ao gerar palavras-chave',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error generating keywords:', error);
      toast({
        title: 'Erro na geração',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setGeneratingKeywords(false);
    }
  };

  // Validate form before outline generation
  const validateForm = useCallback((): string[] => {
    const errors: string[] = [];
    
    if (!config.keyword.trim()) {
      errors.push('Palavra-chave principal é obrigatória');
    }
    if (!config.targetAudience.trim()) {
      errors.push('Público-alvo é obrigatório');
    }
    if (!config.painPoint.trim()) {
      errors.push('Dor principal do cliente é obrigatória');
    }
    if (!config.ctaObjective.trim()) {
      errors.push('Objetivo do CTA é obrigatório');
    }
    
    return errors;
  }, [config]);

  // Generate outline
  const handleGenerateOutline = async () => {
    const errors = validateForm();
    if (errors.length > 0) {
      errors.forEach(error => {
        toast({
          title: 'Campo obrigatório',
          description: error,
          variant: 'destructive',
        });
      });
      return;
    }
    
    const sections = generateLandingPageOutline({
      keyword: config.keyword,
      offerType: config.offerType,
      ctaObjective: config.ctaObjective,
      faq: config.faq,
    });
    setOutlineSections(sections);
    setAppState('editing-outline');
    
    toast({
      title: 'Esboço gerado!',
      description: 'Revise a estrutura e clique em "Gerar Landing Page Completa".',
    });
  };

  // Simulate generation progress
  const simulateGeneration = useCallback(async () => {
    const steps = [...defaultLandingPageSteps];
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

  // Generate full landing page
  const handleGenerateContent = async () => {
    setAppState('generating-content');
    
    // Start progress simulation
    await simulateGeneration();
    
    const result = await generateLandingPage(config);

    if (result) {
      // Convert outline to editor sections
      const editorSections = outlineSections.map((section) => ({
        id: section.id,
        title: section.title,
        content: `<p>Conteúdo da seção "${section.title}" será gerado aqui.</p>`,
        type: section.type,
      }));
      
      setEditorData({
        title: config.title || `${config.keyword}: Landing Page`,
        headline: config.keyword,
        sections: editorSections,
        featuredImage: undefined,
      });
      
      setAppState('editing-content');
      toast({
        title: 'Landing page gerada!',
        description: 'Sua página está pronta para edição e publicação.',
      });
    } else {
      setAppState('editing-outline');
      toast({
        title: 'Erro na geração',
        description: 'Ocorreu um erro. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const handleReset = () => {
    setConfig(defaultConfig);
    setSelectedTemplate(null);
    setAppState('form');
    setOutlineSections([]);
    setGenerationProgress(0);
    setGenerationSteps(defaultLandingPageSteps);
    setEditorData({
      title: '',
      headline: '',
      sections: [],
      featuredImage: undefined,
    });
    setPublishedUrl(null);
    resetGeneration();
    toast({
      title: 'Configurações reiniciadas',
      description: 'Todos os campos foram limpos.',
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate save
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLastSaved(new Date());
    setIsSaving(false);
    toast({
      title: 'Salvo!',
      description: 'Alterações salvas com sucesso.',
    });
  };

  const handlePublish = async (projectId: string) => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Erro',
          description: 'Você precisa estar logado para publicar.',
          variant: 'destructive',
        });
        return;
      }

      // First, save the landing page to the database
      const { data: savedArticle, error: saveError } = await supabase
        .from('articles')
        .insert({
          user_id: user.id,
          project_id: projectId,
          title: editorData.title,
          content: editorData.sections?.map(s => `<h2>${s.title}</h2>\n${s.content}`).join('\n\n') || '',
          excerpt: editorData.headline || '',
          keyword: config.keyword || editorData.title || 'landing-page',
          slug: (editorData.title || 'landing-page').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          featured_image_url: editorData.featuredImage || null,
          type: 'sales' as const,
          status: 'ready' as const,
          config: {
            template: config.template,
            seo_title: editorData.title,
            seo_description: editorData.headline,
            focus_keyword: config.keyword,
          },
        })
        .select()
        .single();

      if (saveError || !savedArticle) {
        console.error('Error saving landing page:', saveError);
        toast({
          title: 'Erro ao salvar',
          description: 'Não foi possível salvar a landing page antes de publicar.',
          variant: 'destructive',
        });
        return;
      }

      // Now publish with the saved article ID
      const result = await publishArticle({
        id: savedArticle.id,
        title: savedArticle.title,
        project_id: projectId,
      });
      
      if (result.success && result.postUrl) {
        setPublishedUrl(result.postUrl);
        toast({
          title: 'Publicado!',
          description: 'Landing page publicada com sucesso.',
        });
      }
    } catch (error) {
      console.error('Publish error:', error);
      toast({
        title: 'Erro ao publicar',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  const connectedProjects = projects.filter(p => p.is_connected);

  // Calculate total credits
  const selectedModel = getModelByValue(config.aiModel);
  const calculateTotalCredits = useCallback(() => {
    let total = selectedModel?.credits || 1;
    if (config.usePlatformCredits) total += 1;
    if (config.realtimeData) total += 1;
    if (config.humanizeContent) total += 1;
    return total;
  }, [selectedModel?.credits, config.usePlatformCredits, config.realtimeData, config.humanizeContent]);
  
  const totalCredits = calculateTotalCredits();

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b px-4 md:px-6 py-3 md:py-4 flex items-center justify-between bg-background">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center bg-orange-100">
            <Target className="w-4 h-4 md:w-5 md:h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-semibold">
              Gerador de Artigo de Vendas
            </h1>
            <p className="text-xs md:text-sm hidden sm:block text-muted-foreground">
              {appState === 'form' && 'Artigos persuasivos com SEO avançado para B2B/B2C'}
              {appState === 'editing-outline' && 'Edite a estrutura do artigo'}
              {appState === 'generating-content' && 'Gerando conteúdo otimizado...'}
              {appState === 'editing-content' && 'Edite e publique seu artigo'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isMobile && appState === 'form' && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1"
            >
              <Eye className="w-4 h-4" />
            </Button>
          )}
          <Badge 
            variant="outline" 
            className="text-xs md:text-sm px-2 md:px-3 py-1 md:py-1.5 border-orange-500 text-orange-600"
          >
            Total: {totalCredits} {totalCredits === 1 ? 'Crédito' : 'Créditos'}
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 h-[calc(100vh-65px)]">
        {/* Left Panel - Form (only show in form state) */}
        {appState === 'form' && (
          <ScrollArea className="flex-1 md:w-1/2">
            <div className="p-4 md:p-6 space-y-6 pb-32">
              
              {/* Template Selection */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="w-5 h-5 text-orange-600" />
                  <h2 className="text-lg font-semibold">
                    Escolha um Template por Nicho
                  </h2>
                  <Badge variant="outline" className="text-xs">Opcional</Badge>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {nicheTemplates.map((template) => {
                    const IconComponent = template.icon;
                    const isSelected = selectedTemplate === template.id;
                    return (
                      <div
                        key={template.id}
                        onClick={() => handleSelectTemplate(template.id)}
                        className={cn(
                          'p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md',
                          isSelected 
                            ? 'border-orange-500 bg-orange-50 shadow-md' 
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        )}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div 
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: `${template.color}20` }}
                          >
                            <IconComponent className="w-5 h-5" style={{ color: template.color }} />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{template.name}</p>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-orange-500" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{template.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detalhes Principais */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-orange-600" />
                  <h2 className="text-lg font-semibold">
                    Detalhes Principais
                  </h2>
                </div>

                {/* Keyword */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Palavra-chave Principal
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={config.keyword}
                    onChange={(e) => updateConfig('keyword', e.target.value)}
                    placeholder="ex: landing page de alta conversão"
                    maxLength={200}
                  />
                  <p className="text-xs text-muted-foreground">
                    Termo de busca que seu público usa no Google, Bing e IAs
                  </p>
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Título do Artigo
                    <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={config.title}
                        onChange={(e) => updateConfig('title', e.target.value)}
                        placeholder="Digite seu título ou gere um"
                        maxLength={80}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {config.title.length}/80
                      </span>
                    </div>
                    <Button
                      onClick={handleGenerateTitle}
                      disabled={generatingTitle}
                      className="bg-orange-500 hover:bg-orange-600"
                    >
                      {generatingTitle ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      <span className="ml-2">Gerar Título</span>
                    </Button>
                  </div>
                </div>

                {/* Grid 2x2 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de Oferta</Label>
                    <Select value={config.offerType} onValueChange={(v) => updateConfig('offerType', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {offerTypes.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Alcance Geográfico</Label>
                    <Input
                      value={config.location}
                      onChange={(e) => updateConfig('location', e.target.value)}
                      placeholder="ex: Nacional, Regional SP, Internacional"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tamanho do Conteúdo</Label>
                    <Select value={config.size} onValueChange={(v) => updateConfig('size', v as LandingPageConfig['size'])}>
                      <SelectTrigger>
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
                    <Label>Idioma</Label>
                    <Select value={config.language} onValueChange={(v) => updateConfig('language', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt-BR">
                          <span className="flex items-center gap-2">
                            🇧🇷 Português (Brasil)
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Accordion Sections */}
              <Accordion type="multiple" defaultValue={['seo-segmentation', 'sales-config']} className="space-y-4">
                
                {/* SEO e Segmentação - NEW */}
                <AccordionItem value="seo-segmentation" className="border rounded-lg overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline bg-green-50">
                    <div className="flex items-center gap-2">
                      <Globe className="w-5 h-5 text-green-600" />
                      <span className="font-semibold">
                        SEO e Segmentação
                      </span>
                      <Badge variant="outline" className="text-xs border-green-500 text-green-600">Novo</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-4 space-y-6 bg-white">
                    
                    {/* Tipo de Público (B2B/B2C) */}
                    <div className="space-y-3">
                      <Label className="flex items-center gap-2">
                        <Users2 className="w-4 h-4 text-green-500" />
                        Tipo de Público
                      </Label>
                      <div className="grid grid-cols-3 gap-3">
                        {audienceTypes.map((type) => {
                          const isSelected = config.audienceType === type.value;
                          return (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => updateConfig('audienceType', type.value as 'b2b' | 'b2c' | 'both')}
                              className={cn(
                                'p-3 rounded-lg border-2 transition-all text-left',
                                isSelected 
                                  ? 'border-green-500 bg-green-50 shadow-sm' 
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              )}
                            >
                              <p className="font-medium text-sm">{type.label}</p>
                              <p className="text-xs text-muted-foreground">{type.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Palavras-chave Secundárias */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Wand2 className="w-4 h-4 text-green-500" />
                        Palavras-chave Secundárias (Long-tail)
                      </Label>
                      <div className="flex gap-2">
                        <Textarea
                          value={config.secondaryKeywords}
                          onChange={(e) => updateConfig('secondaryKeywords', e.target.value)}
                          placeholder="ex: como criar landing page, melhor ferramenta de landing page, landing page grátis"
                          rows={2}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleGenerateSecondaryKeywords}
                          disabled={generatingKeywords}
                          className="h-auto min-h-[60px] border-green-300 hover:bg-green-50"
                        >
                          {generatingKeywords ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-green-600" />
                          )}
                          <span className="ml-2 text-xs">
                            {generatingKeywords ? 'Gerando...' : 'Gerar com IA'}
                          </span>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Termos relacionados de cauda longa para melhorar indexação no Google e IAs.
                      </p>
                    </div>

                    {/* Segmento para Compliance */}
                    <div className="space-y-3">
                      <Label className="flex items-center gap-2">
                        <Scale className="w-4 h-4 text-green-500" />
                        Segmento (Compliance Específico)
                      </Label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {segmentOptions.map((segment) => {
                          const IconComponent = segment.icon;
                          const isSelected = config.segment === segment.value;
                          return (
                            <button
                              key={segment.value}
                              type="button"
                              onClick={() => updateConfig('segment', segment.value as LandingPageConfig['segment'])}
                              className={cn(
                                'p-3 rounded-lg border-2 transition-all text-left',
                                isSelected 
                                  ? 'shadow-sm' 
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              )}
                              style={{
                                borderColor: isSelected ? segment.color : undefined,
                                backgroundColor: isSelected ? `${segment.color}10` : undefined,
                              }}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <IconComponent 
                                  className="w-4 h-4" 
                                  style={{ color: segment.color }} 
                                />
                                <span className="font-medium text-xs">{segment.label}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground leading-tight">
                                {segment.description}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                      {config.segment === 'juridico' && (
                        <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 flex items-start gap-2">
                          <Info className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-purple-700">
                            <strong>Compliance OAB:</strong> Artigos para advogados seguirão a Resolução 02/2015, 
                            evitando termos de mercantilização e incluindo disclaimers adequados.
                          </p>
                        </div>
                      )}
                      {config.segment === 'saude' && (
                        <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
                          <Info className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-700">
                            <strong>Área da Saúde:</strong> Conteúdo incluirá disclaimers médicos, 
                            menção a credenciais e recomendação de consulta com profissionais.
                          </p>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Configuração de Vendas */}
                <AccordionItem value="sales-config" className="border rounded-lg overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline bg-orange-50">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-orange-600" />
                      <span className="font-semibold">
                        Configuração de Vendas
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-4 space-y-4 bg-white">
                    
                    {/* Público-Alvo */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-orange-500" />
                        Público-Alvo
                        <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        value={config.targetAudience}
                        onChange={(e) => updateConfig('targetAudience', e.target.value)}
                        placeholder="ex: Empreendedores digitais, profissionais de marketing, donos de negócios locais"
                        rows={3}
                      />
                    </div>

                    {/* Dor Principal */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Frown className="w-4 h-4 text-orange-500" />
                        Dor Principal do Cliente
                        <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        value={config.painPoint}
                        onChange={(e) => updateConfig('painPoint', e.target.value)}
                        placeholder="ex: Empresas que investem em tráfego mas não conseguem converter visitantes em leads ou vendas"
                        rows={3}
                      />
                    </div>

                    {/* Diferenciais */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-orange-500" />
                        Diferenciais da Oferta
                      </Label>
                      <Textarea
                        value={config.differentials}
                        onChange={(e) => updateConfig('differentials', e.target.value)}
                        placeholder="ex: Foco em copywriting persuasivo, design centrado em conversão, velocidade de carregamento"
                        rows={3}
                      />
                    </div>

                    {/* CTA Objective */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-orange-500" />
                        Objetivo do CTA
                        <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        value={config.ctaObjective}
                        onChange={(e) => updateConfig('ctaObjective', e.target.value)}
                        placeholder="ex: Incentivar o usuário a solicitar um diagnóstico gratuito via WhatsApp"
                        rows={3}
                      />
                    </div>

                    {/* Additional Info */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-orange-500" />
                        Informações Adicionais (Opcional)
                      </Label>
                      <Textarea
                        value={config.additionalInfo}
                        onChange={(e) => updateConfig('additionalInfo', e.target.value)}
                        placeholder="ex: Fale sobre nossa garantia de 30 dias, mencione que temos suporte 24h, etc."
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        Orientações extras para a IA personalizar o conteúdo.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Tom de Voz e Estilo */}
                <AccordionItem value="tone-voice" className="border rounded-lg overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline bg-purple-50/50">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-purple-500" />
                      <span className="font-semibold">
                        Tom de Voz e Estilo
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-4 bg-white">
                    <ToneVoiceConfig
                      tone={config.tone}
                      onToneChange={(v) => updateConfig('tone', v)}
                      customTone={config.customTone}
                      onCustomToneChange={(v) => updateConfig('customTone', v)}
                      pointOfView={config.pointOfView}
                      onPointOfViewChange={(v) => updateConfig('pointOfView', v)}
                      language={config.language}
                      onLanguageChange={(v) => updateConfig('language', v)}
                      accentColor="#FF6B2B"
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Dados da Empresa */}
                <AccordionItem value="company-data" className="border rounded-lg overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline bg-blue-50/50">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-blue-500" />
                      <span className="font-semibold">
                        Dados da Empresa (Opcional)
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-4 space-y-4 bg-white">
                    
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-blue-700">
                        Preencha os dados da empresa para personalizar a página de vendas 
                        com informações de contato.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-blue-500" />
                        Nome da Empresa
                      </Label>
                      <Input
                        value={config.companyName}
                        onChange={(e) => updateConfig('companyName', e.target.value)}
                        placeholder="ex: Minha Agência Digital"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-blue-500" />
                        Telefone / WhatsApp
                      </Label>
                      <PhoneInput
                        value={config.companyPhone}
                        onChange={(value) => updateConfig('companyPhone', value)}
                        error={config.companyPhone ? !validatePhoneBR(config.companyPhone) : false}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-blue-500" />
                        Endereço
                      </Label>
                      <Input
                        value={config.companyAddress}
                        onChange={(e) => updateConfig('companyAddress', e.target.value)}
                        placeholder="ex: Av. Paulista, 1000 - SP"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Estrutura do Conteúdo */}
                <AccordionItem value="content-structure" className="border rounded-lg overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline bg-gray-50/50">
                    <div className="flex items-center gap-2">
                      <List className="w-5 h-5 text-gray-600" />
                      <span className="font-semibold">
                        Estrutura do Conteúdo
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-4 bg-white">
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
                      accentColor="#FF6B2B"
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Modelo de IA */}
                <AccordionItem value="ai-model" className="border rounded-lg overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline bg-purple-50/50">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-purple-500" />
                      <span className="font-semibold">
                        Modelo de IA
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {getModelByValue(config.aiModel)?.credits || 1} crédito(s)
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-4 bg-white">
                    <AIModelSelector 
                      value={config.aiModel}
                      onChange={(v) => updateConfig('aiModel', v)}
                      accentColor="#FF6B2B"
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Configurações Avançadas */}
                <AccordionItem value="advanced-settings" className="border rounded-lg overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline bg-gray-50/50">
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-gray-600" />
                      <span className="font-semibold">
                        Configurações Avançadas
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-4 bg-white">
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
                      accentColor="#FF6B2B"
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Opções de Publicação */}
                <AccordionItem value="publishing" className="border rounded-lg overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline bg-green-50/50">
                    <div className="flex items-center gap-2">
                      <Globe className="w-5 h-5 text-green-600" />
                      <span className="font-semibold">
                        Opções de Publicação
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-4 bg-white">
                    <PublishingOptions
                      autoPublish={config.autoPublish}
                      projectId={config.projectId}
                      onAutoPublishChange={(v) => updateConfig('autoPublish', v)}
                      onProjectIdChange={(v) => updateConfig('projectId', v)}
                      connectedProjects={connectedProjects}
                      accentColor="#FF6B2B"
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </ScrollArea>
        )}

        {/* Sticky Action Button (form state only) */}
        {appState === 'form' && (
          <div 
            className={cn(
              "fixed bottom-0 left-0 p-4 border-t bg-white",
              isMobile ? "w-full" : "w-1/2"
            )}
          >
            <Button
              onClick={handleGenerateOutline}
              disabled={isGenerating}
              className="w-full h-12 text-base font-semibold bg-orange-500 hover:bg-orange-600"
            >
              <Play className="w-5 h-5 mr-2" />
              Gerar Esboço da Landing Page
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-2">
              Custo total: {totalCredits} {totalCredits === 1 ? 'crédito' : 'créditos'}
            </p>
          </div>
        )}

        {/* Right Panel - Dynamic based on app state */}
        <div className={cn(
          "overflow-hidden transition-all duration-300 bg-background",
          isMobile && appState === 'form' ? "fixed inset-0 z-50" : "",
          isMobile && !showPreview && appState === 'form' && "hidden",
          appState === 'form' ? "hidden md:flex md:w-1/2 border-l" : "flex-1"
        )}>
          {/* Mobile close button */}
          {isMobile && showPreview && appState === 'form' && (
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-medium">Prévia</span>
              <Button variant="ghost" size="icon" onClick={() => setShowPreview(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          )}

          {/* Show Outline Editor */}
          {appState === 'editing-outline' && (
            <LandingPageOutlineEditor
              sections={outlineSections}
              onSectionsChange={setOutlineSections}
              onGenerate={handleGenerateContent}
              onReset={handleReset}
              isGenerating={isGenerating}
              totalCredits={totalCredits}
            />
          )}

          {/* Show Progress Screen during generation */}
          {appState === 'generating-content' && (
            <LandingPageProgressScreen
              currentStep={currentGenerationStep}
              progress={generationProgress}
              steps={generationSteps}
            />
          )}

          {/* Show Content Editor */}
          {appState === 'editing-content' && (
            <LandingPageEditor
              title={editorData.title}
              headline={editorData.headline}
              sections={editorData.sections}
              featuredImage={editorData.featuredImage}
              onTitleChange={(title) => setEditorData(prev => ({ ...prev, title }))}
              onHeadlineChange={(headline) => setEditorData(prev => ({ ...prev, headline }))}
              onSectionChange={(id, field, value) => {
                setEditorData(prev => ({
                  ...prev,
                  sections: prev.sections.map(s =>
                    s.id === id ? { ...s, [field]: value } : s
                  ),
                }));
              }}
              onFeaturedImageChange={(imageUrl) => setEditorData(prev => ({ ...prev, featuredImage: imageUrl }))}
              onPublish={handlePublish}
              onSave={handleSave}
              isPublishing={isPublishing}
              isSaving={isSaving}
              lastSaved={lastSaved}
              projects={projects}
              selectedProjectId={config.projectId}
              publishedUrl={publishedUrl || undefined}
              keyword={config.keyword}
              segment={config.segment}
            />
          )}

          {/* Show Preview in form mode */}
          {appState === 'form' && (
            <ScrollArea className="h-full">
              <div className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-5 h-5 text-orange-600" />
                  <h2 className="font-semibold">
                    Prévia em Tempo Real
                  </h2>
                </div>
                <p className="text-sm mb-6 text-muted-foreground">
                  Artigo persuasivo otimizado para SEO e IAs
                </p>

                <div className="rounded-lg border p-6 min-h-[500px]">
                  {config.keyword ? (
                    <div className="space-y-6">
                      <h1 className="text-2xl font-bold">
                        {config.title || `[Título sobre: ${config.keyword}]`}
                      </h1>
                      
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="text-xs bg-orange-100">
                          {config.offerType}
                        </Badge>
                        <Badge variant="secondary" className="text-xs bg-orange-100">
                          {articleSizes.find(s => s.value === config.size)?.words}
                        </Badge>
                      </div>

                      {config.targetAudience && (
                        <div className="p-4 rounded-lg bg-orange-50">
                          <p className="text-sm font-medium text-orange-800">Público-Alvo:</p>
                          <p className="text-sm text-orange-700">{config.targetAudience}</p>
                        </div>
                      )}

                      {config.painPoint && (
                        <div className="p-4 rounded-lg bg-red-50">
                          <p className="text-sm font-medium text-red-800">Dor do Cliente:</p>
                          <p className="text-sm text-red-700">{config.painPoint}</p>
                        </div>
                      )}

                      {config.ctaObjective && (
                        <div className="p-4 rounded-lg bg-green-50">
                          <p className="text-sm font-medium text-green-800">Objetivo do CTA:</p>
                          <p className="text-sm text-green-700">{config.ctaObjective}</p>
                        </div>
                      )}

                      <div className="p-6 rounded-lg border-2 border-dashed text-center">
                        <Target className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          O artigo de vendas otimizado para SEO aparecerá aqui
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-[400px] flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-orange-100">
                        <Target className="w-8 h-8 text-orange-600" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">
                        Gerador de Artigo de Vendas
                      </h3>
                      <p className="text-sm max-w-sm text-muted-foreground">
                        Crie artigos persuasivos com técnicas avançadas de SEO para 
                        ranquear no Google, Bing e ser reconhecido por IAs como ChatGPT e Claude.
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
