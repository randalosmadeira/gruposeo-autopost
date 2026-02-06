import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Zap,
  Play,
  Sparkles,
  Bot,
  FileText,
  List,
  Table,
  CheckCircle2,
  HelpCircle,
  Link2,
  Globe,
  Loader2,
  Settings,
  CreditCard,
  Search,
  User,
  Image,
  Rocket,
  Clock,
  RefreshCw,
  Eye,
  Menu,
  X,
  AlertCircle,
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useArticleGeneration } from '@/hooks/useArticleGeneration';
import { useArticleAutoSave } from '@/hooks/useArticleAutoSave';
import { useWordPressPublish } from '@/hooks/useWordPressPublish';
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

// AI Models configuration
const aiModels = [
  { 
    value: 'standard', 
    label: 'Padrão', 
    description: 'Qualidade boa para uso geral',
    credits: 1,
    technical: 'Mix de modelos escolhidos automaticamente'
  },
  { 
    value: 'premium', 
    label: 'Premium', 
    description: 'Máxima qualidade e precisão',
    credits: 2,
    technical: 'gpt-5 + gpt-5-nano'
  },
  { 
    value: 'advanced', 
    label: 'Avançado', 
    description: 'Qualidade superior com modelos avançados',
    credits: 3,
    technical: 'gemini-2.5-pro + gemini-2.5-flash'
  },
  { 
    value: 'professional', 
    label: 'Profissional', 
    description: 'Qualidade máxima com modelos de ponta',
    credits: 4,
    technical: 'gemini-3-pro-preview + gemini-3-flash-preview'
  },
];

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
  aiModel: 'standard',
  metaDescription: true,
  lists: true,
  tables: false,
  conclusion: true,
  faq: false,
  internalLinking: true,
  projectId: '',
  // Advanced settings
  usePlatformCredits: true,
  seoOptimization: false,
  realtimeData: false,
  humanizeContent: false,
  generateImages: false,
  imageCount: 1,
  imageStyle: 'fotorrealístico',
  // Publishing
  autoPublish: false,
};

const imageStyles = [
  'Fotorrealístico',
  'Ilustração Digital',
  'Estilo Cartoon',
  'Minimalista',
  'Arte Abstrata',
  'Aquarela',
  'Estilo Vintage',
  'Design Moderno',
];

export default function ArticleGeneratorV2() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { projects } = useProjects();
  const { isGenerating, generateArticle, content: generatedContent } = useArticleGeneration();
  const { publishArticle, isPublishing } = useWordPressPublish();
  const { 
    articleId, 
    isSaving, 
    lastSaved, 
    debouncedSave, 
    saveGeneratedArticle,
    setArticleId 
  } = useArticleAutoSave();
  const isMobile = useIsMobile();
  
  const [config, setConfig] = useState<ArticleConfig>(defaultConfig);
  const [showTutorial, setShowTutorial] = useState(true);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [appState, setAppState] = useState<AppState>('form');
  const [showPreview, setShowPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  // Outline state
  const [outlineSections, setOutlineSections] = useState<OutlineSection[]>([]);
  
  // Generation progress state
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentGenerationStep, setCurrentGenerationStep] = useState('');
  const [generationSteps, setGenerationSteps] = useState(defaultGenerationSteps);
  
  // Article editor state
  const [articleData, setArticleData] = useState<ArticleData>(defaultArticleData);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  
  // User credits (mock - in real implementation this would come from API)
  const [userCredits] = useState(10);

  const updateConfig = <K extends keyof ArticleConfig>(key: K, value: ArticleConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    // Clear validation errors when user starts typing
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
  };

  // Calculate total credits based on selected options (as per spec)
  const selectedModel = aiModels.find(m => m.value === config.aiModel) || aiModels[0];
  const calculateTotalCredits = useCallback(() => {
    let total = selectedModel.credits;
    if (config.usePlatformCredits) total += 1;
    if (config.realtimeData) total += 1;
    if (config.humanizeContent) total += 1;
    // Images don't cost extra as per spec (addons.images: 0)
    return total;
  }, [selectedModel.credits, config.usePlatformCredits, config.realtimeData, config.humanizeContent]);
  
  const totalCredits = calculateTotalCredits();
  
  // Validate form before generation
  const validateForm = useCallback((): string[] => {
    const errors: string[] = [];
    
    // Keyword is required
    if (!config.keyword.trim()) {
      errors.push('Palavra-chave principal é obrigatória');
    }
    
    // Title max 80 chars, warning if > 60
    if (config.title.length > 80) {
      errors.push('Título deve ter no máximo 80 caracteres');
    }
    
    // Check credits
    if (totalCredits > userCredits) {
      errors.push(`Créditos insuficientes. Necessário: ${totalCredits}, Disponível: ${userCredits}`);
    }
    
    // Internal linking requires project with 5+ articles
    if (config.internalLinking && config.projectId) {
      const selectedProject = projects.find(p => p.id === config.projectId);
      // Mock check - in real implementation, check article count from project stats
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
    // Simulate title generation
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
    const stepDuration = 1500; // ms per step
    
    for (let i = 0; i < steps.length; i++) {
      // Mark current step as in-progress
      steps[i].status = 'in-progress';
      if (i > 0) steps[i - 1].status = 'completed';
      setGenerationSteps([...steps]);
      setCurrentGenerationStep(steps[i].title);
      setGenerationProgress(((i + 0.5) / steps.length) * 100);
      
      await new Promise(resolve => setTimeout(resolve, stepDuration));
      
      // Mark last step as completed
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
    
    // Start progress simulation
    await simulateGeneration();

    const result = await generateArticle({
      keyword: config.keyword,
      secondaryKeywords: '',
      wordCount: config.size as 'short' | 'medium' | 'long' | 'very-long',
      tone: config.tone,
      pointOfView: config.pointOfView,
      language: config.language,
      type: 'blog',
      includeFaq: config.faq,
      faqCount: 5,
      includeTable: config.tables,
      includeList: config.lists,
      includeConclusion: config.conclusion,
      seoOptimization: config.seoOptimization,
    });

    if (result) {
      // Convert outline to article sections
      const articleSections = outlineSections.map((section, idx) => ({
        id: section.id,
        title: section.title,
        content: `<p>Conteúdo da seção "${section.title}" será gerado aqui.</p>`,
        level: section.level,
      }));
      
      setArticleData({
        title: config.title || `${config.keyword}: Guia Completo`,
        intro: result.substring(0, 500) || '<p>Introdução do artigo...</p>',
        sections: articleSections,
        featuredImage: undefined,
      });
      
      setAppState('editing-article');
      toast({
        title: 'Artigo gerado!',
        description: 'Seu artigo está pronto para edição e publicação.',
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

  const handleGenerateOutline = async () => {
    if (!config.keyword.trim()) {
      toast({
        title: 'Palavra-chave necessária',
        description: 'Digite uma palavra-chave para gerar o esboço.',
        variant: 'destructive',
      });
      return;
    }
    
    // Generate outline sections based on keyword
    const sections = generateDefaultOutline(config.keyword);
    setOutlineSections(sections);
    setAppState('editing-outline');
    
    // Auto-save the outline
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
      {/* Header */}
      <header 
        className="border-b px-4 md:px-6 py-3 md:py-4 flex items-center justify-between"
        style={{ backgroundColor: colors.background, borderColor: colors.border }}
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
        <div className="flex items-center gap-2">
          {/* Mobile Preview Toggle */}
          {isMobile && appState === 'form' && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1"
            >
              <Eye className="w-4 h-4" />
              <span className="hidden xs:inline">Prévia</span>
            </Button>
          )}
          <Badge 
            variant="outline" 
            className="text-xs md:text-sm px-2 md:px-3 py-1 md:py-1.5"
            style={{ borderColor: colors.primary, color: colors.primary }}
          >
            {userCredits} {userCredits === 1 ? 'Crédito' : 'Créditos'}
          </Badge>
        </div>
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

              {/* AI Model Section */}
              <Accordion type="single" collapsible defaultValue="ai-model">
                <AccordionItem value="ai-model" className="border rounded-lg px-4" style={{ borderColor: colors.border }}>
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <Bot className="w-5 h-5" style={{ color: colors.primary }} />
                      <span className="font-semibold">Modelo de IA</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="grid grid-cols-2 gap-3">
                      {aiModels.map((model) => (
                        <button
                          key={model.value}
                          onClick={() => updateConfig('aiModel', model.value)}
                          className={cn(
                            'p-4 rounded-lg border text-left transition-all',
                            config.aiModel === model.value
                              ? 'ring-2'
                              : 'hover:border-blue-300'
                          )}
                          style={{
                            borderColor: config.aiModel === model.value ? colors.primary : colors.border,
                            backgroundColor: config.aiModel === model.value ? `${colors.primary}08` : 'transparent',
                            ...(config.aiModel === model.value && { '--tw-ring-color': `${colors.primary}40` } as React.CSSProperties)
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium" style={{ color: colors.textPrimary }}>
                              {model.label}
                            </span>
                            <Badge 
                              variant="secondary" 
                              className="text-xs"
                              style={{ 
                                backgroundColor: `${colors.primary}15`,
                                color: colors.primary
                              }}
                            >
                              {model.credits} {model.credits === 1 ? 'crédito' : 'créditos'}
                            </Badge>
                          </div>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>
                            {model.description}
                          </p>
                        </button>
                      ))}
                    </div>
                    <div 
                      className="mt-4 p-3 rounded-lg text-xs"
                      style={{ backgroundColor: colors.lightBlue, color: colors.textSecondary }}
                    >
                      <strong style={{ color: colors.textPrimary }}>Detalhes técnicos:</strong>{' '}
                      {selectedModel.technical}
                    </div>
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
                  <AccordionContent className="pb-4 space-y-4">
                    <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                      Elementos do Conteúdo
                    </p>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <ToggleCard
                        icon={<FileText className="w-4 h-4" />}
                        title="Meta Descrição"
                        description="Meta descrição SEO"
                        enabled={config.metaDescription}
                        onChange={(v) => updateConfig('metaDescription', v)}
                      />
                      <ToggleCard
                        icon={<List className="w-4 h-4" />}
                        title="Listas"
                        description="Incluir listas organizadas"
                        enabled={config.lists}
                        onChange={(v) => updateConfig('lists', v)}
                      />
                      <ToggleCard
                        icon={<Table className="w-4 h-4" />}
                        title="Tabelas"
                        description="Tabelas de comparação"
                        enabled={config.tables}
                        onChange={(v) => updateConfig('tables', v)}
                      />
                      <ToggleCard
                        icon={<CheckCircle2 className="w-4 h-4" />}
                        title="Conclusão"
                        description="Resumo do artigo"
                        enabled={config.conclusion}
                        onChange={(v) => updateConfig('conclusion', v)}
                      />
                      <ToggleCard
                        icon={<HelpCircle className="w-4 h-4" />}
                        title="Seção FAQ"
                        description="Perguntas frequentes"
                        enabled={config.faq}
                        onChange={(v) => updateConfig('faq', v)}
                        className="col-span-2"
                      />
                    </div>

                    <div className="border-t pt-4" style={{ borderColor: colors.border }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: colors.secondary }}
                          >
                            <Link2 className="w-4 h-4" style={{ color: colors.success }} />
                          </div>
                          <div>
                            <p className="font-medium text-sm" style={{ color: colors.textPrimary }}>
                              Linkagem Interna
                            </p>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                              Adicionar links para conteúdo relacionado
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={config.internalLinking}
                          onCheckedChange={(v) => updateConfig('internalLinking', v)}
                        />
                      </div>

                      {config.internalLinking && projects.length > 0 && (
                        <div className="ml-11 space-y-2">
                          <Label className="text-xs">Selecionar Projeto Conectado</Label>
                          <Select 
                            value={config.projectId || 'none'} 
                            onValueChange={(v) => updateConfig('projectId', v === 'none' ? '' : v)}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Escolha um projeto" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhum projeto</SelectItem>
                              {projects.map((project) => (
                                <SelectItem key={project.id} value={project.id}>
                                  <div className="flex items-center gap-2">
                                    <Globe className="w-3 h-3" />
                                    {project.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>
                            O site precisa ter pelo menos 5 artigos publicados para linkagem automática.
                          </p>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Advanced Settings Section */}
                <AccordionItem value="advanced" className="border rounded-lg px-4 mt-4" style={{ borderColor: colors.border }}>
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5" style={{ color: colors.primary }} />
                      <span className="font-semibold">Configurações Avançadas</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-3">
                    {/* Platform Credits */}
                    <AdvancedToggleCard
                      icon={<CreditCard className="w-4 h-4" />}
                      title="Usar Créditos da Plataforma"
                      description="Use créditos da plataforma em vez da sua chave de API"
                      badge="Custo: 1 Crédito"
                      enabled={config.usePlatformCredits}
                      onChange={(v) => updateConfig('usePlatformCredits', v)}
                      highlight
                    />

                    {/* SEO Optimization */}
                    <AdvancedToggleCard
                      icon={<Search className="w-4 h-4" />}
                      title="Otimização SEO"
                      description="Analisar concorrentes e otimizar conteúdo para mecanismos de busca"
                      enabled={config.seoOptimization}
                      onChange={(v) => updateConfig('seoOptimization', v)}
                      bgColor={colors.lightBlue}
                    />

                    {/* Realtime Data */}
                    <AdvancedToggleCard
                      icon={<Globe className="w-4 h-4" />}
                      title="Dados da Internet em Tempo Real"
                      description="Usar informações atuais da web"
                      badge="Custo: +1 Crédito"
                      enabled={config.realtimeData}
                      onChange={(v) => updateConfig('realtimeData', v)}
                      bgColor={colors.secondary}
                    />

                    {/* Humanize Content */}
                    <AdvancedToggleCard
                      icon={<User className="w-4 h-4" />}
                      title="Humanizar Conteúdo"
                      description="Tornar o texto mais natural e envolvente"
                      badge="Custo: +1 Crédito"
                      enabled={config.humanizeContent}
                      onChange={(v) => updateConfig('humanizeContent', v)}
                      bgColor={colors.tertiary}
                    />

                    {/* Generate Images */}
                    <div>
                      <AdvancedToggleCard
                        icon={<Image className="w-4 h-4" />}
                        title="Gerar Imagens IA"
                        description="Criar conteúdo visual relevante"
                        enabled={config.generateImages}
                        onChange={(v) => updateConfig('generateImages', v)}
                        bgColor={colors.pink}
                      />
                      
                      {config.generateImages && (
                        <div className="mt-3 ml-11 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Número de Imagens</Label>
                              <Select 
                                value={String(config.imageCount)} 
                                onValueChange={(v) => updateConfig('imageCount', parseInt(v))}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 3, 4, 5].map((num) => (
                                    <SelectItem key={num} value={String(num)}>
                                      {num} {num === 1 ? 'imagem' : 'imagens'}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Estilo da Imagem</Label>
                              <Select 
                                value={config.imageStyle} 
                                onValueChange={(v) => updateConfig('imageStyle', v)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {imageStyles.map((style) => (
                                    <SelectItem key={style} value={style.toLowerCase()}>
                                      {style}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <button 
                            className="text-xs flex items-center gap-1 hover:underline"
                            style={{ color: colors.primary }}
                          >
                            <Image className="w-3 h-3" />
                            Ver exemplos de estilos
                          </button>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Publication Options Section */}
                <AccordionItem value="publishing" className="border rounded-lg px-4 mt-4" style={{ borderColor: colors.border }}>
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-2">
                      <Rocket className="w-5 h-5" style={{ color: colors.primary }} />
                      <span className="font-semibold">Opções de Publicação</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: colors.border }}>
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: colors.lightBlue }}
                        >
                          <Clock className="w-4 h-4" style={{ color: colors.primary }} />
                        </div>
                        <div>
                          <p className="font-medium text-sm" style={{ color: colors.textPrimary }}>
                            Configurar publicação automática
                          </p>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>
                            Publique artigos diretamente no WordPress ou no Wix
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={config.autoPublish}
                        onCheckedChange={(v) => updateConfig('autoPublish', v)}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </ScrollArea>
          
          {/* Sticky Action Bar */}
          <div 
            className="sticky bottom-0 border-t p-4 space-y-2"
            style={{ backgroundColor: colors.background, borderColor: colors.border }}
          >
            {appState === 'form' && (
              <>
                {validationErrors.length > 0 && (
                  <div className="p-3 rounded-lg mb-2 space-y-1 bg-destructive/10 border border-destructive/20 animate-scale-in">
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
                >
                  <Play className="w-5 h-5 mr-2" />
                  Gerar Esboço do Artigo
                </Button>
                <p className="text-xs text-center text-muted-foreground">
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
                  className="w-full h-10 transition-colors duration-200"
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
                // Auto-save on outline changes
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
                
                // First save the article
                await saveGeneratedArticle(generatedContent || '', articleData.title);
                
                // Then publish to WordPress
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
                        <span style={{ color: colors.textSecondary }}>{selectedModel.label} - {selectedModel.technical}</span>
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

// Toggle Card Component for Content Structure
function ToggleCard({
  icon,
  title,
  description,
  enabled,
  onChange,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all',
        enabled ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 hover:border-gray-300',
        className
      )}
      onClick={() => onChange(!enabled)}
    >
      <div className="flex items-center gap-3">
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ 
            backgroundColor: enabled ? '#E3F2FD' : '#F5F5F5',
            color: enabled ? '#4169E1' : '#666666'
          }}
        >
          {icon}
        </div>
        <div>
          <p className="font-medium text-sm" style={{ color: '#1A1A1A' }}>
            {title}
          </p>
          <p className="text-xs" style={{ color: '#666666' }}>
            {description}
          </p>
        </div>
      </div>
      <Switch checked={enabled} onCheckedChange={onChange} />
    </div>
  );
}

// Advanced Toggle Card Component
function AdvancedToggleCard({
  icon,
  title,
  description,
  badge,
  enabled,
  onChange,
  bgColor,
  highlight,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
  bgColor?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all',
        highlight && enabled ? 'ring-2 ring-blue-200' : '',
        enabled ? 'border-blue-200' : 'border-gray-200 hover:border-gray-300'
      )}
      style={{ backgroundColor: enabled ? bgColor || '#F8FAFC' : 'transparent' }}
      onClick={() => onChange(!enabled)}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ 
            backgroundColor: enabled ? (bgColor ? `${bgColor}` : '#E3F2FD') : '#F5F5F5',
            color: enabled ? '#4169E1' : '#666666'
          }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm" style={{ color: '#1A1A1A' }}>
              {title}
            </p>
            {badge && (
              <Badge 
                variant="secondary" 
                className="text-[10px] px-1.5 py-0"
                style={{ backgroundColor: '#E3F2FD', color: '#4169E1' }}
              >
                {badge}
              </Badge>
            )}
          </div>
          <p className="text-xs truncate" style={{ color: '#666666' }}>
            {description}
          </p>
        </div>
      </div>
      <Switch checked={enabled} onCheckedChange={onChange} className="flex-shrink-0 ml-2" />
    </div>
  );
}
