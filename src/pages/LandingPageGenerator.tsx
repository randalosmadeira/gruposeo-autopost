import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
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
  Table,
  CheckCircle2,
  HelpCircle,
  Link2,
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
  Copy,
  Settings,
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLandingPageGeneration, type LandingPageConfig } from '@/hooks/useLandingPageGeneration';
import { cn } from '@/lib/utils';
import { 
  AIModelSelector, 
  ContentStructureConfig, 
  AdvancedSettings, 
  PublishingOptions,
  PhoneInput,
  validatePhoneBR,
  aiModels,
  getModelByValue,
} from '@/components/shared';

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
  { value: 'short', label: 'Curto', words: '~750 palavras' },
  { value: 'medium', label: 'Médio', words: '~1.500 palavras' },
  { value: 'long', label: 'Longo', words: '~2.500 palavras' },
  { value: 'very-long', label: 'Muito Longo', words: '~4.000 palavras' },
];

const defaultConfig: LandingPageConfig = {
  keyword: '',
  title: '',
  offerType: 'Serviço',
  location: '',
  size: 'medium',
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
  // AI Model
  aiModel: 'standard',
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

export default function LandingPageGenerator() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { projects } = useProjects();
  const isMobile = useIsMobile();
  
  const [config, setConfig] = useState<LandingPageConfig>(defaultConfig);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  
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

  const handleGenerate = async () => {
    if (!config.keyword.trim()) {
      toast({
        title: 'Palavra-chave necessária',
        description: 'Digite uma palavra-chave para gerar a landing page.',
        variant: 'destructive',
      });
      return;
    }
    
    if (!config.targetAudience.trim()) {
      toast({
        title: 'Público-alvo necessário',
        description: 'Defina o público-alvo da sua página de vendas.',
        variant: 'destructive',
      });
      return;
    }
    
    if (!config.painPoint.trim()) {
      toast({
        title: 'Dor do cliente necessária',
        description: 'Defina a dor principal do cliente.',
        variant: 'destructive',
      });
      return;
    }
    
    if (!config.ctaObjective.trim()) {
      toast({
        title: 'Objetivo do CTA necessário',
        description: 'Defina o objetivo do CTA da página.',
        variant: 'destructive',
      });
      return;
    }
    
    await generateLandingPage(config);
  };

  const handleReset = () => {
    setConfig(defaultConfig);
    setSelectedTemplate(null);
    resetGeneration();
    toast({
      title: 'Configurações reiniciadas',
      description: 'Todos os campos foram limpos.',
    });
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(content);
    toast({
      title: 'Copiado!',
      description: 'Conteúdo copiado para a área de transferência.',
    });
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
              Gerador de Página de Vendas
            </h1>
            <p className="text-xs md:text-sm hidden sm:block text-muted-foreground">
              Crie páginas de alta conversão
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isMobile && (
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
        {/* Left Panel - Form */}
        <ScrollArea className="flex-1 md:w-1/2">
          <div className="p-4 md:p-6 space-y-6">
            
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
                  O tópico principal que sua página de vendas focará
                </p>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  Título da Página
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
                  <Label>Localização</Label>
                  <Input
                    value={config.location}
                    onChange={(e) => updateConfig('location', e.target.value)}
                    placeholder="ex: Brasil, São Paulo, etc."
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
            <Accordion type="multiple" defaultValue={['sales-config']} className="space-y-4">
              
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
                  
                  {/* Info Banner */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-700">
                      Preencha os dados da empresa para personalizar a página de vendas 
                      com informações de contato.
                    </p>
                  </div>

                  {/* Company Name */}
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

                  {/* Phone */}
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

                  {/* Address */}
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

            {/* Action Buttons */}
            <div className="space-y-3 pt-4">
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full h-12 text-base font-semibold bg-orange-500 hover:bg-orange-600"
              >
                {isGenerating ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Play className="w-5 h-5 mr-2" />
                )}
                {isGenerating ? 'Gerando...' : 'Gerar Landing Page'}
              </Button>
              
              <Button
                onClick={handleReset}
                variant="outline"
                className="w-full"
                disabled={isGenerating}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reiniciar e Começar de Novo
              </Button>
            </div>
          </div>
        </ScrollArea>

        {/* Right Panel - Preview (Desktop) */}
        <div className={cn(
          'hidden md:flex flex-col w-1/2 border-l bg-background'
        )}>
          {/* Preview Header */}
          <div className="p-4 border-b flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-orange-600" />
                <h2 className="font-semibold">
                  {isGenerating ? 'Gerando Conteúdo...' : 'Prévia em Tempo Real'}
                </h2>
              </div>
              <p className="text-sm mt-1 text-muted-foreground">
                {isGenerating ? `${progress.toFixed(0)}% concluído` : 'Prévia da página de vendas'}
              </p>
            </div>
            {content && !isGenerating && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyContent}>
                  <Copy className="w-4 h-4 mr-1" />
                  Copiar
                </Button>
              </div>
            )}
          </div>

          {/* Progress bar during generation */}
          {isGenerating && (
            <div className="px-4 py-2 border-b bg-orange-50">
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Preview Content - Full height scroll, no footer */}
          <div className="flex-1 overflow-y-auto p-6">
            {!config.keyword && !content ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-orange-100">
                  <Target className="w-8 h-8 text-orange-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  Gerador de Página de Vendas
                </h3>
                <p className="text-sm max-w-sm text-muted-foreground">
                  Preencha os detalhes à esquerda para ver uma prévia da 
                  estrutura e conteúdo da sua página de vendas.
                </p>
              </div>
            ) : content ? (
              <div className="prose prose-sm max-w-none">
                <div 
                  className="whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ 
                    __html: content
                      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-4 text-orange-800">$1</h1>')
                      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-6 mb-3 text-gray-800">$1</h2>')
                      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-medium mt-4 mb-2 text-gray-700">$1</h3>')
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/^\- (.*$)/gim, '<li class="ml-4">$1</li>')
                      .replace(/\n/g, '<br />')
                  }} 
                />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Preview of filled fields */}
                <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
                  <h4 className="font-semibold text-orange-800 mb-2">
                    {config.title || config.keyword}
                  </h4>
                  {selectedTemplate && (
                    <Badge 
                      variant="outline" 
                      className="mb-2"
                      style={{ 
                        borderColor: nicheTemplates.find(t => t.id === selectedTemplate)?.color,
                        color: nicheTemplates.find(t => t.id === selectedTemplate)?.color
                      }}
                    >
                      Template: {nicheTemplates.find(t => t.id === selectedTemplate)?.name}
                    </Badge>
                  )}
                  {config.targetAudience && (
                    <p className="text-sm text-orange-700 mb-1">
                      <strong>Público:</strong> {config.targetAudience}
                    </p>
                  )}
                  {config.painPoint && (
                    <p className="text-sm text-orange-700 mb-1">
                      <strong>Dor:</strong> {config.painPoint}
                    </p>
                  )}
                  {config.ctaObjective && (
                    <p className="text-sm text-orange-700">
                      <strong>CTA:</strong> {config.ctaObjective}
                    </p>
                  )}
                </div>

                {/* Structure preview */}
                <div className="space-y-3">
                  <h5 className="text-sm font-medium text-muted-foreground">Estrutura Sugerida:</h5>
                  <div className="space-y-2">
                    {[
                      'Headline com proposta de valor',
                      'Seção de problema/dor',
                      'Apresentação da solução',
                      'Benefícios principais',
                      'Prova social / depoimentos',
                      'Detalhes da oferta',
                      config.faq && 'Perguntas frequentes (FAQ)',
                      config.conclusion && 'CTA final com urgência',
                    ].filter(Boolean).map((section, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center gap-2 p-2 rounded bg-muted/50 text-sm"
                      >
                        <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-medium">
                          {idx + 1}
                        </span>
                        {section}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
