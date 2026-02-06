import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  FileText,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowRight,
  Info,
  Wand2,
  Target,
  Building2,
  Phone,
  MapPin,
  Users,
  Frown,
  Star,
  Settings,
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  ToneVoiceConfig,
  AIModelSelector,
  ContentStructureConfig,
  AdvancedSettings,
  PhoneInput,
  validatePhoneBR,
} from '@/components/shared';
import { InternalLinkingCard } from '@/components/internal-linking';

// Types
interface SalesPageRow {
  id: string;
  keyword: string;
  headline: string;
  size: string;
  location: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  articleId?: string;
  error?: string;
}

const pageSizes = [
  { value: 'very-short', label: 'Muito Pequeno (600-1200 palavras)' },
  { value: 'short', label: 'Pequeno (1200-2400 palavras)' },
  { value: 'medium', label: 'Médio (2400-3600 palavras)' },
  { value: 'long', label: 'Grande (2600-5200 palavras)' },
];

const offerTypes = [
  { value: 'servico', label: 'Serviço' },
  { value: 'produto-fisico', label: 'Produto Físico' },
  { value: 'produto-digital', label: 'Produto Digital' },
  { value: 'software', label: 'Software/SaaS' },
  { value: 'evento', label: 'Evento' },
  { value: 'consultoria', label: 'Consultoria' },
];

export default function BulkSalesPagesGenerator() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { projects } = useProjects();
  
  // Pages list state
  const [pages, setPages] = useState<SalesPageRow[]>(() => {
    return Array.from({ length: 10 }, (_, i) => ({
      id: crypto.randomUUID(),
      keyword: '',
      headline: '',
      size: 'medium',
      location: 'Brasil',
      status: 'pending' as const,
    }));
  });
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [defaultSize, setDefaultSize] = useState('medium');
  const [showHeadlinesDialog, setShowHeadlinesDialog] = useState(false);
  const [generatingHeadlines, setGeneratingHeadlines] = useState(false);

  // Global config state
  const [globalConfig, setGlobalConfig] = useState({
    // Company info
    companyName: '',
    companyPhone: '',
    companyAddress: '',
    // Offer details
    offerType: 'servico',
    targetAudience: '',
    ctaObjective: '',
    painPoint: '',
    differentials: '',
    additionalInfo: '',
    // Tone & Voice
    tone: 'profissional',
    customTone: '',
    pointOfView: 'terceira-singular',
    language: 'pt-BR',
    // SEO
    seoOptimization: true,
    // Content structure
    metaDescription: true,
    lists: true,
    tables: false,
    conclusion: true,
    faq: true,
    // Advanced
    usePlatformCredits: true,
    humanizeContent: false,
    generateImages: false,
    imageCount: 1,
    imageStyle: 'fotorrealístico',
    // Internal linking
    internalLinking: false,
    projectId: '',
    // AI Model
    aiModel: 'standard',
  });

  // Stats
  const filledPages = pages.filter(p => p.keyword.trim());
  const totalCount = filledPages.length;
  const completedCount = pages.filter(p => p.status === 'completed').length;
  const errorCount = pages.filter(p => p.status === 'error').length;
  
  const estimatedCredits = totalCount;
  const estimatedTime = totalCount > 0 ? `${Math.ceil(totalCount * 2)} min` : '0';

  // Update a single page row
  const updatePage = useCallback((id: string, field: keyof SalesPageRow, value: string) => {
    setPages(prev => prev.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  }, []);

  // Add more rows
  const addRows = useCallback((count: number = 5) => {
    setPages(prev => [
      ...prev,
      ...Array.from({ length: count }, () => ({
        id: crypto.randomUUID(),
        keyword: '',
        headline: '',
        size: defaultSize,
        location: 'Brasil',
        status: 'pending' as const,
      })),
    ]);
  }, [defaultSize]);

  // Remove row
  const removeRow = useCallback((id: string) => {
    setPages(prev => prev.filter(p => p.id !== id));
  }, []);

  // Apply size to all
  const applyDefaultSize = useCallback((size: string) => {
    setDefaultSize(size);
    setPages(prev => prev.map(p => ({ ...p, size })));
  }, []);

  // Generate headlines for all keywords
  const handleGenerateHeadlines = useCallback(async () => {
    const pagesWithKeywords = pages.filter(p => p.keyword.trim() && !p.headline.trim());
    
    if (pagesWithKeywords.length === 0) {
      toast({
        title: 'Nenhum headline para gerar',
        description: 'Adicione palavras-chave primeiro ou todos já possuem headline.',
      });
      return;
    }

    setGeneratingHeadlines(true);
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setPages(prev => prev.map(p => {
      if (p.keyword.trim() && !p.headline.trim()) {
        return { 
          ...p, 
          headline: `${p.keyword}: A Solução Definitiva para ${globalConfig.offerType === 'servico' ? 'Seu Negócio' : 'Você'} em ${p.location || 'Todo Brasil'}` 
        };
      }
      return p;
    }));
    
    setGeneratingHeadlines(false);
    setShowHeadlinesDialog(false);
    
    toast({
      title: 'Headlines gerados!',
      description: `${pagesWithKeywords.length} headlines foram gerados com sucesso.`,
    });
  }, [pages, globalConfig.offerType, toast]);

  // Handle paste for bulk input
  const handlePaste = useCallback((e: React.ClipboardEvent, startIndex: number) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    
    if (lines.length > 1) {
      e.preventDefault();
      
      setPages(prev => {
        const newPages = [...prev];
        lines.forEach((line, i) => {
          const targetIndex = startIndex + i;
          if (targetIndex < newPages.length) {
            const parts = line.split(/[\t,]/).map(p => p.trim());
            newPages[targetIndex] = {
              ...newPages[targetIndex],
              keyword: parts[0] || '',
              headline: parts[1] || '',
              location: parts[2] || 'Brasil',
            };
          } else {
            const parts = line.split(/[\t,]/).map(p => p.trim());
            newPages.push({
              id: crypto.randomUUID(),
              keyword: parts[0] || '',
              headline: parts[1] || '',
              size: defaultSize,
              location: parts[2] || 'Brasil',
              status: 'pending',
            });
          }
        });
        return newPages;
      });
      
      toast({
        title: `${lines.length} linhas coladas`,
        description: 'As palavras-chave foram distribuídas nas linhas.',
      });
    }
  }, [defaultSize, toast]);

  // Start generation
  const handleStartGeneration = useCallback(async () => {
    const toGenerate = filledPages.filter(p => p.status === 'pending');
    
    if (toGenerate.length === 0) {
      toast({
        title: 'Nenhuma página para gerar',
        description: 'Adicione palavras-chave primeiro.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    
    for (const page of toGenerate) {
      setPages(prev => prev.map(p => 
        p.id === page.id ? { ...p, status: 'generating' } : p
      ));

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        const { data: createdArticle, error: createError } = await supabase
          .from('articles')
          .insert({
            user_id: session.user.id,
            keyword: page.keyword,
            title: page.headline || `${page.keyword}: Página de Vendas`,
            status: 'generating',
            type: 'sales',
            config: { 
              size: page.size, 
              location: page.location,
              bulkGenerated: true,
              ...globalConfig,
            },
          })
          .select('id')
          .single();

        if (createError) throw createError;

        const { error } = await supabase.functions.invoke('generate-landing-page', {
          body: {
            articleId: createdArticle.id,
            config: {
              keyword: page.keyword,
              title: page.headline,
              location: page.location,
              size: page.size,
              ...globalConfig,
            },
          },
        });

        if (error) throw error;

        setPages(prev => prev.map(p => 
          p.id === page.id 
            ? { ...p, status: 'completed', articleId: createdArticle.id }
            : p
        ));
      } catch (error) {
        setPages(prev => prev.map(p => 
          p.id === page.id 
            ? { ...p, status: 'error', error: error instanceof Error ? error.message : 'Erro' }
            : p
        ));
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setIsGenerating(false);
    toast({
      title: 'Geração concluída!',
      description: `${toGenerate.length} páginas foram processadas.`,
    });
  }, [filledPages, globalConfig, toast]);

  const getStatusBadge = (status: SalesPageRow['status']) => {
    switch (status) {
      case 'generating':
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Gerando...
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="gap-1 bg-green-100 text-green-700 hover:bg-green-100">
            <CheckCircle2 className="w-3 h-3" />
            Pronto
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="w-3 h-3" />
            Erro
          </Badge>
        );
      default:
        return null;
    }
  };

  const connectedProjects = projects.filter(p => p.is_connected);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header Card */}
      <div className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                <Target className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Criar Páginas de Vendas
                </h1>
                <p className="text-sm text-muted-foreground">
                  Configure múltiplas páginas de vendas com copy persuasiva, elementos de conversão e design focado.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Card className="border shadow-sm">
                <CardContent className="px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Total de artigos</p>
                  <p className="text-2xl font-bold text-foreground">{totalCount}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Créditos estimados</p>
                  <p className="text-2xl font-bold text-foreground">{estimatedCredits}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Tempo estimado</p>
                  <p className="text-2xl font-bold text-foreground">{estimatedTime}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Global Configuration Section */}
        <Accordion type="single" collapsible defaultValue="global-config" className="space-y-4">
          <AccordionItem value="global-config" className="border rounded-lg bg-background">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-orange-600" />
                <div className="text-left">
                  <h3 className="font-semibold">Configurações Globais da Página de Vendas</h3>
                  <p className="text-sm text-muted-foreground">
                    Defina as informações do seu negócio e da oferta para todos os {totalCount} artigos
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6 space-y-8">
              {/* Sobre a Empresa */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-orange-600" />
                  <h4 className="font-semibold">Sobre a Empresa</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Nome da Empresa</Label>
                    <Input
                      placeholder="Ex: Minha Empresa Ltda"
                      value={globalConfig.companyName}
                      onChange={(e) => setGlobalConfig(prev => ({ ...prev, companyName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone de Contato</Label>
                    <PhoneInput
                      value={globalConfig.companyPhone}
                      onChange={(v) => setGlobalConfig(prev => ({ ...prev, companyPhone: v }))}
                      placeholder="Ex: (11) 99999-9999"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Endereço (Opcional)</Label>
                    <Input
                      placeholder="Ex: Rua Exemplo, 123"
                      value={globalConfig.companyAddress}
                      onChange={(e) => setGlobalConfig(prev => ({ ...prev, companyAddress: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Detalhes da Oferta & Estratégia */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-orange-600" />
                  <h4 className="font-semibold">Detalhes da Oferta & Estratégia</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de Oferta</Label>
                    <Select 
                      value={globalConfig.offerType} 
                      onValueChange={(v) => setGlobalConfig(prev => ({ ...prev, offerType: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {offerTypes.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      Público-Alvo
                    </Label>
                    <Input
                      placeholder="Ex: Pequenos empresários, Mães de primeira viagem..."
                      value={globalConfig.targetAudience}
                      onChange={(e) => setGlobalConfig(prev => ({ ...prev, targetAudience: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Objetivo do CTA (Call to Action)</Label>
                    <Input
                      placeholder="Ex: Agendar consultoria, Comprar agora..."
                      value={globalConfig.ctaObjective}
                      onChange={(e) => setGlobalConfig(prev => ({ ...prev, ctaObjective: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Frown className="w-4 h-4 text-muted-foreground" />
                      Principal Dor do Cliente
                    </Label>
                    <Textarea
                      placeholder="Ex: Falta de tempo, Baixo faturamento..."
                      value={globalConfig.painPoint}
                      onChange={(e) => setGlobalConfig(prev => ({ ...prev, painPoint: e.target.value }))}
                      className="h-20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-muted-foreground" />
                      Diferenciais Competitivos
                    </Label>
                    <Textarea
                      placeholder="Ex: Atendimento 24h, Garantia estendida..."
                      value={globalConfig.differentials}
                      onChange={(e) => setGlobalConfig(prev => ({ ...prev, differentials: e.target.value }))}
                      className="h-20"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Informações Adicionais (Opcional)</Label>
                  <Textarea
                    placeholder="Qualquer outra informação relevante para a IA..."
                    value={globalConfig.additionalInfo}
                    onChange={(e) => setGlobalConfig(prev => ({ ...prev, additionalInfo: e.target.value }))}
                    className="h-16 bg-primary/5"
                  />
                </div>
              </div>

              {/* Tom de Voz e Estilo */}
              <ToneVoiceConfig
                tone={globalConfig.tone}
                onToneChange={(v) => setGlobalConfig(prev => ({ ...prev, tone: v }))}
                customTone={globalConfig.customTone}
                onCustomToneChange={(v) => setGlobalConfig(prev => ({ ...prev, customTone: v }))}
                pointOfView={globalConfig.pointOfView}
                onPointOfViewChange={(v) => setGlobalConfig(prev => ({ ...prev, pointOfView: v }))}
                language={globalConfig.language}
                onLanguageChange={(v) => setGlobalConfig(prev => ({ ...prev, language: v }))}
                accentColor="#EA580C"
              />

              {/* Advanced Settings */}
              <div className="space-y-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <Settings className="w-5 h-5 text-orange-600" />
                  Configurações Avançadas
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium text-sm">Usar Créditos da Plataforma</p>
                      <p className="text-xs text-muted-foreground">Custo: 1 crédito por artigo</p>
                    </div>
                    <Switch
                      checked={globalConfig.usePlatformCredits}
                      onCheckedChange={(v) => setGlobalConfig(prev => ({ ...prev, usePlatformCredits: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium text-sm">Humanizar</p>
                      <p className="text-xs text-muted-foreground">Custo: 1 crédito por artigo</p>
                    </div>
                    <Switch
                      checked={globalConfig.humanizeContent}
                      onCheckedChange={(v) => setGlobalConfig(prev => ({ ...prev, humanizeContent: v }))}
                    />
                  </div>
                </div>

                {/* AI Model */}
                <AIModelSelector
                  value={globalConfig.aiModel}
                  onChange={(v) => setGlobalConfig(prev => ({ ...prev, aiModel: v }))}
                  accentColor="#EA580C"
                />

                {/* Content Structure */}
                <ContentStructureConfig
                  metaDescription={globalConfig.metaDescription}
                  onMetaDescriptionChange={(v) => setGlobalConfig(prev => ({ ...prev, metaDescription: v }))}
                  lists={globalConfig.lists}
                  onListsChange={(v) => setGlobalConfig(prev => ({ ...prev, lists: v }))}
                  tables={globalConfig.tables}
                  onTablesChange={(v) => setGlobalConfig(prev => ({ ...prev, tables: v }))}
                  conclusion={globalConfig.conclusion}
                  onConclusionChange={(v) => setGlobalConfig(prev => ({ ...prev, conclusion: v }))}
                  faq={globalConfig.faq}
                  onFaqChange={(v) => setGlobalConfig(prev => ({ ...prev, faq: v }))}
                  internalLinking={globalConfig.internalLinking}
                  onInternalLinkingChange={(v) => setGlobalConfig(prev => ({ ...prev, internalLinking: v }))}
                  projectId={globalConfig.projectId}
                  onProjectIdChange={(v) => setGlobalConfig(prev => ({ ...prev, projectId: v }))}
                  connectedProjects={connectedProjects}
                  accentColor="#EA580C"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Pages List Table */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Lista de Páginas</h2>
                <p className="text-sm text-muted-foreground">
                  Configure palavra-chave, headline e tamanho para cada página
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={() => addRows(5)} 
                  variant="outline" 
                  className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar
                </Button>
                <Button 
                  onClick={() => setShowHeadlinesDialog(true)}
                  variant="outline" 
                  className="gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  Gerar Headlines
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-14 text-center">#</TableHead>
                  <TableHead className="w-[25%]">Palavra-chave</TableHead>
                  <TableHead className="w-[30%]">Headline</TableHead>
                  <TableHead className="w-[15%]">Tamanho</TableHead>
                  <TableHead className="w-[15%]">Localização</TableHead>
                  <TableHead className="w-[10%] text-center">Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((page, index) => (
                  <TableRow key={page.id}>
                    <TableCell className="text-center font-medium text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Advogado urgente SOOP itaim pau"
                        value={page.keyword}
                        onChange={(e) => updatePage(page.id, 'keyword', e.target.value)}
                        onPaste={(e) => handlePaste(e, index)}
                        disabled={page.status === 'generating' || page.status === 'completed'}
                        className="h-9"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Ex: Guia Completo de Marketing Dig"
                          value={page.headline}
                          onChange={(e) => updatePage(page.id, 'headline', e.target.value)}
                          disabled={page.status === 'generating' || page.status === 'completed'}
                          className="h-9"
                        />
                        {!page.headline && page.keyword && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => updatePage(page.id, 'headline', `${page.keyword}: A Solução Completa`)}
                          >
                            <Wand2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={page.size}
                        onValueChange={(v) => updatePage(page.id, 'size', v)}
                        disabled={page.status === 'generating' || page.status === 'completed'}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {pageSizes.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Brasil"
                        value={page.location}
                        onChange={(e) => updatePage(page.id, 'location', e.target.value)}
                        disabled={page.status === 'generating' || page.status === 'completed'}
                        className="h-9"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(page.status)}
                    </TableCell>
                    <TableCell>
                      {page.status === 'pending' && !page.keyword && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(page.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>

        {/* Apply size to all */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Aplicar tamanho a todos:</span>
              <Select value={defaultSize} onValueChange={applyDefaultSize}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Selecionar tamanho padrão" />
                </SelectTrigger>
                <SelectContent>
                  {pageSizes.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tip */}
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4 flex items-center gap-3">
            <Info className="w-5 h-5 text-orange-600 shrink-0" />
            <p className="text-sm text-muted-foreground">
              <strong>Dica:</strong> Cole múltiplas linhas usando Ctrl+V para adicionar várias páginas de uma vez. 
              Use formato: Palavra-chave, Headline, Localização (separados por tab ou vírgula).
            </p>
          </CardContent>
        </Card>

        {/* Footer Action */}
        <div className="flex justify-center">
          <Button 
            size="lg"
            className="gap-2 px-8 bg-orange-600 hover:bg-orange-700"
            onClick={handleStartGeneration}
            disabled={totalCount === 0 || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                Próxima etapa
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Generate Headlines Dialog */}
      <Dialog open={showHeadlinesDialog} onOpenChange={setShowHeadlinesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar Headlines com IA</DialogTitle>
            <DialogDescription>
              Gerar headlines automaticamente para todas as palavras-chave que ainda não possuem headline.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm">
              <strong>{pages.filter(p => p.keyword.trim() && !p.headline.trim()).length}</strong> páginas 
              receberão headlines gerados automaticamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHeadlinesDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleGenerateHeadlines} 
              disabled={generatingHeadlines} 
              className="gap-2 bg-orange-600 hover:bg-orange-700"
            >
              {generatingHeadlines ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Gerar Headlines
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
