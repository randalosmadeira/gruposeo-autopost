import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
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
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Building2,
  Settings2,
  Sparkles,
  Loader2,
  CheckCircle2,
  Image,
  Link2,
  Globe,
  MessageSquare,
  LayoutList,
} from 'lucide-react';

type ArticleType = 'blog' | 'sales';

interface GeneratorConfig {
  keyword: string;
  secondaryKeywords: string;
  wordCount: 'short' | 'medium' | 'long' | 'very-long';
  tone: string;
  pointOfView: string;
  language: string;
  // Sales page specific
  companyName: string;
  companyPhone: string;
  companyAddress: string;
  targetAudience: string;
  painPoints: string;
  differentials: string;
  ctaObjective: string;
  // Structure
  includeFaq: boolean;
  faqCount: number;
  includeTable: boolean;
  includeList: boolean;
  includeConclusion: boolean;
  // Images
  imageCount: number;
  imageStyle: string;
  // SEO
  seoOptimization: boolean;
  internalLinking: boolean;
  // Research
  useWebResearch: boolean;
  researchDepth: 'basic' | 'moderate' | 'deep';
  // Advanced
  customInstructions: string;
  aiModel: string;
}

const defaultConfig: GeneratorConfig = {
  keyword: '',
  secondaryKeywords: '',
  wordCount: 'medium',
  tone: 'profissional',
  pointOfView: 'voce',
  language: 'pt-BR',
  companyName: '',
  companyPhone: '',
  companyAddress: '',
  targetAudience: '',
  painPoints: '',
  differentials: '',
  ctaObjective: '',
  includeFaq: true,
  faqCount: 5,
  includeTable: false,
  includeList: true,
  includeConclusion: true,
  imageCount: 2,
  imageStyle: 'profissional, moderno',
  seoOptimization: true,
  internalLinking: true,
  useWebResearch: true,
  researchDepth: 'moderate',
  customInstructions: '',
  aiModel: 'gpt-4o',
};

const wordCountLabels = {
  short: { label: 'Curto', range: '600-1000 palavras' },
  medium: { label: 'Médio', range: '1200-1800 palavras' },
  long: { label: 'Longo', range: '2200-2800 palavras' },
  'very-long': { label: 'Muito Longo', range: '3500-4500 palavras' },
};

const tones = [
  'Profissional',
  'Amigável',
  'Técnico',
  'Persuasivo',
  'Informal',
  'Autoritativo',
  'Empático',
  'Objetivo',
];

const pointsOfView = [
  { value: 'nos', label: '1ª pessoa (nós)' },
  { value: 'voce', label: '2ª pessoa (você)' },
  { value: 'ele', label: '3ª pessoa' },
];

export default function ArticleGenerator() {
  const { type } = useParams<{ type: ArticleType }>();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<GeneratorConfig>(defaultConfig);
  const [generating, setGenerating] = useState(false);

  const articleType = type || 'blog';
  const isSalesPage = articleType === 'sales';

  const updateConfig = <K extends keyof GeneratorConfig>(key: K, value: GeneratorConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const canProceed = () => {
    if (step === 1) {
      return config.keyword.trim().length > 0;
    }
    return true;
  };

  const handleGenerate = async () => {
    setGenerating(true);
    // Simulate generation
    await new Promise((resolve) => setTimeout(resolve, 3000));
    setGenerating(false);
    navigate('/articles');
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/articles/new')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>

        <div className="flex items-center gap-4 mb-4">
          <div className={cn(
            'flex items-center justify-center w-14 h-14 rounded-xl',
            isSalesPage ? 'bg-accent/10' : 'bg-primary/10'
          )}>
            {isSalesPage ? (
              <Building2 className={cn('w-7 h-7', 'text-accent')} />
            ) : (
              <FileText className={cn('w-7 h-7', 'text-primary')} />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isSalesPage ? 'Criar Página de Vendas' : 'Criar Artigo de Blog'}
            </h1>
            <p className="text-muted-foreground">
              Configure seu conteúdo e deixe a IA fazer o resto
            </p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors',
                  step >= s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div
                  className={cn(
                    'w-12 lg:w-24 h-1 mx-2 rounded-full transition-colors',
                    step > s ? 'bg-primary' : 'bg-muted'
                  )}
                />
              )}
            </div>
          ))}
          <span className="ml-4 text-sm text-muted-foreground">
            {step === 1 && 'Configuração Principal'}
            {step === 2 && (isSalesPage ? 'Informações do Negócio' : 'Configurações Avançadas')}
            {step === 3 && 'Revisão e Geração'}
          </span>
        </div>
      </div>

      {/* Step 1: Main Configuration */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-card rounded-2xl p-6 shadow-card space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="keyword" className="text-base font-semibold">
                  Palavra-chave Principal *
                </Label>
                <p className="text-sm text-muted-foreground mb-2">
                  A keyword principal que você quer ranquear no Google
                </p>
                <Input
                  id="keyword"
                  placeholder="Ex: como calcular rescisão trabalhista"
                  value={config.keyword}
                  onChange={(e) => updateConfig('keyword', e.target.value)}
                  className="text-lg"
                />
              </div>

              <div>
                <Label htmlFor="secondary" className="text-base font-semibold">
                  Keywords Secundárias
                </Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Uma por linha - serão incorporadas naturalmente no texto
                </p>
                <Textarea
                  id="secondary"
                  placeholder="rescisão trabalhista cálculo&#10;verbas rescisórias&#10;direitos demissão"
                  value={config.secondaryKeywords}
                  onChange={(e) => updateConfig('secondaryKeywords', e.target.value)}
                  rows={4}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-base font-semibold">Tamanho do Artigo</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Quantidade aproximada de palavras
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(wordCountLabels) as Array<keyof typeof wordCountLabels>).map((size) => (
                    <button
                      key={size}
                      onClick={() => updateConfig('wordCount', size)}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-all',
                        config.wordCount === size
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <p className="font-medium">{wordCountLabels[size].label}</p>
                      <p className="text-xs text-muted-foreground">
                        {wordCountLabels[size].range}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">Tom de Voz</Label>
                  <Select
                    value={config.tone}
                    onValueChange={(v) => updateConfig('tone', v)}
                  >
                    <SelectTrigger className="mt-2">
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

                <div>
                  <Label className="text-base font-semibold">Ponto de Vista</Label>
                  <Select
                    value={config.pointOfView}
                    onValueChange={(v) => updateConfig('pointOfView', v)}
                  >
                    <SelectTrigger className="mt-2">
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
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!canProceed()}>
              Próxima Etapa
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Business Info (Sales) or Advanced Config (Blog) */}
      {step === 2 && (
        <div className="space-y-6">
          {isSalesPage && (
            <div className="bg-card rounded-2xl p-6 shadow-card space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-accent" />
                <h3 className="font-semibold text-lg">Sobre a Empresa</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome da Empresa</Label>
                  <Input
                    placeholder="Ex: RDM Advogados"
                    value={config.companyName}
                    onChange={(e) => updateConfig('companyName', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Telefone de Contato</Label>
                  <Input
                    placeholder="Ex: (11) 99999-9999"
                    value={config.companyPhone}
                    onChange={(e) => updateConfig('companyPhone', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Endereço (Opcional)</Label>
                <Input
                  placeholder="Ex: Rua Exemplo, 123 - São Paulo, SP"
                  value={config.companyAddress}
                  onChange={(e) => updateConfig('companyAddress', e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 mb-2 pt-4 border-t">
                <Settings2 className="w-5 h-5 text-accent" />
                <h3 className="font-semibold text-lg">Estratégia de Vendas</h3>
              </div>

              <div>
                <Label>Público-Alvo</Label>
                <Input
                  placeholder="Ex: Trabalhadores demitidos, pequenos empresários..."
                  value={config.targetAudience}
                  onChange={(e) => updateConfig('targetAudience', e.target.value)}
                />
              </div>

              <div>
                <Label>Principal Dor do Cliente</Label>
                <Textarea
                  placeholder="Ex: Não saber se recebeu todos os direitos na demissão, medo de processar a empresa..."
                  value={config.painPoints}
                  onChange={(e) => updateConfig('painPoints', e.target.value)}
                  rows={3}
                />
              </div>

              <div>
                <Label>Diferenciais Competitivos</Label>
                <Textarea
                  placeholder="Ex: Atendimento 24h, primeira consulta gratuita, 15 anos de experiência..."
                  value={config.differentials}
                  onChange={(e) => updateConfig('differentials', e.target.value)}
                  rows={3}
                />
              </div>

              <div>
                <Label>Objetivo do CTA</Label>
                <Input
                  placeholder="Ex: Agendar consultoria gratuita"
                  value={config.ctaObjective}
                  onChange={(e) => updateConfig('ctaObjective', e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl p-6 shadow-card">
            <Accordion type="multiple" className="space-y-4">
              {/* Structure */}
              <AccordionItem value="structure" className="border rounded-xl px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <LayoutList className="w-5 h-5 text-primary" />
                    <span className="font-semibold">Estrutura do Artigo</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Perguntas Frequentes (FAQ)</Label>
                      <p className="text-sm text-muted-foreground">
                        Adiciona seção de FAQ ao final do artigo
                      </p>
                    </div>
                    <Switch
                      checked={config.includeFaq}
                      onCheckedChange={(v) => updateConfig('includeFaq', v)}
                    />
                  </div>

                  {config.includeFaq && (
                    <div>
                      <Label>Quantidade de FAQs: {config.faqCount}</Label>
                      <Slider
                        value={[config.faqCount]}
                        onValueChange={(v) => updateConfig('faqCount', v[0])}
                        min={3}
                        max={10}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Tabelas</Label>
                      <p className="text-sm text-muted-foreground">
                        Inclui tabelas comparativas quando relevante
                      </p>
                    </div>
                    <Switch
                      checked={config.includeTable}
                      onCheckedChange={(v) => updateConfig('includeTable', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Listas</Label>
                      <p className="text-sm text-muted-foreground">
                        Formata pontos importantes em listas
                      </p>
                    </div>
                    <Switch
                      checked={config.includeList}
                      onCheckedChange={(v) => updateConfig('includeList', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Conclusão</Label>
                      <p className="text-sm text-muted-foreground">
                        Adiciona seção de conclusão ao final
                      </p>
                    </div>
                    <Switch
                      checked={config.includeConclusion}
                      onCheckedChange={(v) => updateConfig('includeConclusion', v)}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Images */}
              <AccordionItem value="images" className="border rounded-xl px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Image className="w-5 h-5 text-primary" />
                    <span className="font-semibold">Imagens</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-4">
                  <div>
                    <Label>Quantidade de Imagens: {config.imageCount}</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      0 = nenhuma, 1 = apenas destaque, 2+ = destaque + corpo
                    </p>
                    <Slider
                      value={[config.imageCount]}
                      onValueChange={(v) => updateConfig('imageCount', v[0])}
                      min={0}
                      max={4}
                      step={1}
                    />
                  </div>

                  {config.imageCount > 0 && (
                    <div>
                      <Label>Estilo das Imagens</Label>
                      <Input
                        placeholder="Ex: profissional, moderno, minimalista"
                        value={config.imageStyle}
                        onChange={(e) => updateConfig('imageStyle', e.target.value)}
                      />
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* SEO & Links */}
              <AccordionItem value="seo" className="border rounded-xl px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-primary" />
                    <span className="font-semibold">SEO e Linkagem</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Otimização SEO</Label>
                      <p className="text-sm text-muted-foreground">
                        Analisa concorrentes e otimiza para buscadores
                      </p>
                    </div>
                    <Switch
                      checked={config.seoOptimization}
                      onCheckedChange={(v) => updateConfig('seoOptimization', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Linkagem Interna</Label>
                      <p className="text-sm text-muted-foreground">
                        Adiciona links para artigos existentes
                      </p>
                    </div>
                    <Switch
                      checked={config.internalLinking}
                      onCheckedChange={(v) => updateConfig('internalLinking', v)}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Web Research */}
              <AccordionItem value="research" className="border rounded-xl px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    <span className="font-semibold">Pesquisa na Internet</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Usar Dados da Internet</Label>
                      <p className="text-sm text-muted-foreground">
                        Busca informações atualizadas na web
                      </p>
                    </div>
                    <Switch
                      checked={config.useWebResearch}
                      onCheckedChange={(v) => updateConfig('useWebResearch', v)}
                    />
                  </div>

                  {config.useWebResearch && (
                    <div>
                      <Label>Profundidade da Pesquisa</Label>
                      <Select
                        value={config.researchDepth}
                        onValueChange={(v: 'basic' | 'moderate' | 'deep') =>
                          updateConfig('researchDepth', v)
                        }
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basic">Básica (3-5 fontes)</SelectItem>
                          <SelectItem value="moderate">Moderada (5-10 fontes)</SelectItem>
                          <SelectItem value="deep">Profunda (10-15 fontes)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Advanced */}
              <AccordionItem value="advanced" className="border rounded-xl px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    <span className="font-semibold">Instruções Avançadas</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-4">
                  <div>
                    <Label>Instruções Customizadas</Label>
                    <Textarea
                      placeholder="Ex: Mencionar a lei 13.467/2017, incluir exemplo prático de cálculo..."
                      value={config.customInstructions}
                      onChange={(e) => updateConfig('customInstructions', e.target.value)}
                      rows={4}
                    />
                  </div>

                  <div>
                    <Label>Modelo de IA</Label>
                    <Select
                      value={config.aiModel}
                      onValueChange={(v) => updateConfig('aiModel', v)}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o">GPT-4o (Recomendado)</SelectItem>
                        <SelectItem value="gpt-4o-mini">GPT-4o Mini (Rápido)</SelectItem>
                        <SelectItem value="claude-sonnet">Claude Sonnet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <Button onClick={() => setStep(3)}>
              Próxima Etapa
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Generate */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-card rounded-2xl p-6 shadow-card">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              Revisão da Configuração
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Keyword Principal</p>
                  <p className="font-medium">{config.keyword}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tamanho</p>
                  <p className="font-medium">
                    {wordCountLabels[config.wordCount].label} ({wordCountLabels[config.wordCount].range})
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tom de Voz</p>
                  <p className="font-medium capitalize">{config.tone}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Estrutura</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {config.includeFaq && <Badge variant="secondary">FAQ ({config.faqCount})</Badge>}
                    {config.includeTable && <Badge variant="secondary">Tabelas</Badge>}
                    {config.includeList && <Badge variant="secondary">Listas</Badge>}
                    {config.includeConclusion && <Badge variant="secondary">Conclusão</Badge>}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Recursos</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {config.imageCount > 0 && (
                      <Badge variant="secondary">
                        {config.imageCount} Imagens
                      </Badge>
                    )}
                    {config.seoOptimization && <Badge variant="secondary">SEO</Badge>}
                    {config.internalLinking && <Badge variant="secondary">Links Internos</Badge>}
                    {config.useWebResearch && (
                      <Badge variant="secondary">Pesquisa Web</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Modelo de IA</p>
                  <p className="font-medium">{config.aiModel}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-hero rounded-2xl p-8 text-center">
            <Sparkles className="w-12 h-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-bold text-primary-foreground mb-2">
              Pronto para Gerar!
            </h3>
            <p className="text-primary-foreground/70 mb-6 max-w-md mx-auto">
              A IA irá criar seu artigo com base nas configurações selecionadas.
              O processo leva aproximadamente 2-5 minutos.
            </p>
            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-gradient-accent hover:opacity-90 text-accent-foreground shadow-glow-accent/30"
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Gerando Artigo...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Gerar Artigo
                </>
              )}
            </Button>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}