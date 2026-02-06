import { useState } from 'react';
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
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useArticleGeneration } from '@/hooks/useArticleGeneration';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
};

export default function ArticleGeneratorV2() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { projects } = useProjects();
  const { isGenerating, generateArticle } = useArticleGeneration();
  
  const [config, setConfig] = useState<ArticleConfig>(defaultConfig);
  const [showTutorial, setShowTutorial] = useState(true);
  const [generatingTitle, setGeneratingTitle] = useState(false);

  const updateConfig = <K extends keyof ArticleConfig>(key: K, value: ArticleConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const selectedModel = aiModels.find(m => m.value === config.aiModel) || aiModels[0];
  const totalCredits = selectedModel.credits;

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

  const handleGenerate = async () => {
    if (!config.keyword.trim()) {
      toast({
        title: 'Palavra-chave necessária',
        description: 'Digite uma palavra-chave para gerar o artigo.',
        variant: 'destructive',
      });
      return;
    }

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
      seoOptimization: true,
    });

    if (result) {
      navigate('/articles');
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.backgroundSecondary }}>
      {/* Header */}
      <header 
        className="border-b px-6 py-4 flex items-center justify-between"
        style={{ backgroundColor: colors.background, borderColor: colors.border }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${colors.primary}15` }}
          >
            <Zap className="w-5 h-5" style={{ color: colors.primary }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: colors.textPrimary }}>
              Gerador de Artigos IA
            </h1>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Crie conteúdo de alta qualidade com inteligência artificial
            </p>
          </div>
        </div>
        <Badge 
          variant="outline" 
          className="text-sm px-3 py-1.5"
          style={{ borderColor: colors.primary, color: colors.primary }}
        >
          Total: {totalCredits} {totalCredits === 1 ? 'Crédito' : 'Créditos'}
        </Badge>
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Panel - Form */}
        <div className="w-1/2 border-r overflow-hidden" style={{ borderColor: colors.border }}>
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
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
              </Accordion>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !config.keyword.trim()}
                className="w-full h-12 text-base"
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
                    Gerar Artigo ({totalCredits} {totalCredits === 1 ? 'crédito' : 'créditos'})
                  </>
                )}
              </Button>
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel - Preview */}
        <div className="w-1/2 overflow-hidden" style={{ backgroundColor: colors.background }}>
          <ScrollArea className="h-full">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-6">
                <FileText className="w-5 h-5" style={{ color: colors.primary }} />
                <h2 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>
                  Prévia do Artigo
                </h2>
              </div>

              <div 
                className="rounded-lg border p-6 min-h-[500px]"
                style={{ borderColor: colors.border }}
              >
                {config.title || config.keyword ? (
                  <article className="prose prose-sm max-w-none">
                    <h1 className="text-2xl font-bold mb-4" style={{ color: colors.textPrimary }}>
                      {config.title || `[Título sobre: ${config.keyword}]`}
                    </h1>
                    
                    {config.metaDescription && (
                      <div 
                        className="p-3 rounded-lg mb-4 text-sm"
                        style={{ backgroundColor: colors.lightBlue }}
                      >
                        <strong>Meta Descrição:</strong> Descubra tudo sobre {config.keyword}. 
                        Guia completo com dicas práticas e informações atualizadas.
                      </div>
                    )}

                    <div className="space-y-4" style={{ color: colors.textSecondary }}>
                      <p>
                        <strong style={{ color: colors.textPrimary }}>Palavra-chave:</strong>{' '}
                        {config.keyword || '[Não definida]'}
                      </p>
                      <p>
                        <strong style={{ color: colors.textPrimary }}>Tom:</strong>{' '}
                        {config.tone.charAt(0).toUpperCase() + config.tone.slice(1)}
                      </p>
                      <p>
                        <strong style={{ color: colors.textPrimary }}>Tamanho:</strong>{' '}
                        {articleSizes.find(s => s.value === config.size)?.label} (
                        {articleSizes.find(s => s.value === config.size)?.words})
                      </p>
                      <p>
                        <strong style={{ color: colors.textPrimary }}>Modelo:</strong>{' '}
                        {selectedModel.label}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t" style={{ borderColor: colors.border }}>
                      <p className="text-sm font-medium mb-2" style={{ color: colors.textPrimary }}>
                        Elementos incluídos:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {config.metaDescription && (
                          <Badge variant="secondary" style={{ backgroundColor: colors.lightBlue }}>
                            Meta Descrição
                          </Badge>
                        )}
                        {config.lists && (
                          <Badge variant="secondary" style={{ backgroundColor: colors.lightBlue }}>
                            Listas
                          </Badge>
                        )}
                        {config.tables && (
                          <Badge variant="secondary" style={{ backgroundColor: colors.lightBlue }}>
                            Tabelas
                          </Badge>
                        )}
                        {config.conclusion && (
                          <Badge variant="secondary" style={{ backgroundColor: colors.lightBlue }}>
                            Conclusão
                          </Badge>
                        )}
                        {config.faq && (
                          <Badge variant="secondary" style={{ backgroundColor: colors.lightBlue }}>
                            FAQ
                          </Badge>
                        )}
                        {config.internalLinking && (
                          <Badge variant="secondary" style={{ backgroundColor: colors.secondary }}>
                            Linkagem Interna
                          </Badge>
                        )}
                      </div>
                    </div>
                  </article>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[400px] text-center">
                    <FileText className="w-12 h-12 mb-4" style={{ color: colors.border }} />
                    <p className="text-lg font-medium mb-2" style={{ color: colors.textPrimary }}>
                      Configure seu artigo
                    </p>
                    <p className="text-sm max-w-xs" style={{ color: colors.textSecondary }}>
                      Preencha os campos à esquerda para ver uma prévia do seu artigo aqui.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// Toggle Card Component
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
