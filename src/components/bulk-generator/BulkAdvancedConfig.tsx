import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Building2,
  MapPin,
  Users,
  Target,
  Sparkles,
  Settings2,
  FileText,
  List,
  Table,
  CheckCircle2,
  HelpCircle,
  Link2,
  Search,
  Clock,
  User,
  Image,
  ChevronDown,
  ChevronUp,
  Globe,
  Wand2,
  Ruler,
  Brain,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AIModelSelector } from '@/components/shared/AIModelSelector';
import { toneOptions, pointOfViewOptions, languageOptions } from '@/components/shared/ToneVoiceConfig';
import { BulkGenerationConfig, defaultBulkConfig } from '@/types/bulk-generation';

export { defaultBulkConfig };
export type { BulkGenerationConfig };

const contentLengthOptions = [
  { value: 'muito_pequeno', label: 'Muito Pequeno', words: '600-1.200', description: 'Posts rápidos' },
  { value: 'pequeno', label: 'Pequeno', words: '1.200-2.400', description: 'Artigos padrão' },
  { value: 'medio', label: 'Médio', words: '2.400-3.600', description: 'Conteúdo completo' },
  { value: 'grande', label: 'Grande', words: '2.600-5.200', description: 'Pillar pages' },
];

const segmentOptions = [
  { value: 'general', label: 'Geral' },
  { value: 'legal', label: 'Jurídico' },
  { value: 'health', label: 'Saúde' },
  { value: 'fintech', label: 'Fintech/Finanças' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'b2b-saas', label: 'B2B SaaS' },
  { value: 'education', label: 'Educação' },
];

const contentTypeOptions = [
  { value: 'how-to', label: 'Tutorial/How-To' },
  { value: 'listicle', label: 'Listicle' },
  { value: 'pillar', label: 'Pillar Page' },
  { value: 'guide', label: 'Guia Completo' },
  { value: 'comparative', label: 'Comparativo' },
  { value: 'opinion', label: 'Opinião/Análise' },
  { value: 'news', label: 'Notícia' },
];

const goalOptions = [
  { value: 'inform', label: 'Informar' },
  { value: 'convert', label: 'Converter' },
  { value: 'educate', label: 'Educar' },
  { value: 'engage', label: 'Engajar' },
  { value: 'establish-authority', label: 'Estabelecer Autoridade' },
];

const intentTypeOptions = [
  { value: 'informational', label: 'Informacional' },
  { value: 'navigational', label: 'Navegacional' },
  { value: 'transactional', label: 'Transacional' },
  { value: 'commercial', label: 'Comercial' },
];

const audienceTypeOptions = [
  { value: 'geral', label: 'Público Geral' },
  { value: 'b2b', label: 'B2B (Empresas)' },
  { value: 'b2c', label: 'B2C (Consumidor)' },
  { value: 'profissionais', label: 'Profissionais do Setor' },
  { value: 'iniciantes', label: 'Iniciantes/Leigos' },
  { value: 'especialistas', label: 'Especialistas/Técnicos' },
];

const imageStyles = [
  'Fotorrealístico',
  'Ilustração Digital',
  'Estilo Cartoon',
  'Minimalista',
  'Arte Abstrata',
  'Design Moderno',
];

interface BulkAdvancedConfigProps {
  config: BulkGenerationConfig;
  onChange: (config: BulkGenerationConfig) => void;
  connectedProjects?: Array<{ id: string; name: string; is_connected: boolean }>;
}

interface ToggleCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  creditCost?: string;
  color?: string;
}

function ToggleCard({ 
  icon: Icon, 
  title, 
  description, 
  checked, 
  onCheckedChange,
  creditCost,
  color = '#4169E1'
}: ToggleCardProps) {
  return (
    <div 
      className={cn(
        'flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer',
        checked ? 'border-2' : 'border-border bg-background hover:border-muted-foreground/30'
      )}
      style={{ 
        borderColor: checked ? color : undefined,
        backgroundColor: checked ? `${color}08` : undefined
      }}
      onClick={() => onCheckedChange(!checked)}
    >
      <div className="flex items-center gap-3">
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: checked ? `${color}15` : 'hsl(var(--muted))' }}
        >
          <Icon 
            className="w-4 h-4" 
            style={{ color: checked ? color : 'hsl(var(--muted-foreground))' }} 
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{title}</p>
            {creditCost && (
              <Badge variant="secondary" className="text-xs">{creditCost}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch 
        checked={checked} 
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export function BulkAdvancedConfig({ 
  config, 
  onChange,
  connectedProjects = []
}: BulkAdvancedConfigProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    audience: true,
    company: false,
    structure: true,
    ai: true,
    advanced: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const updateConfig = (updates: Partial<BulkGenerationConfig>) => {
    onChange({ ...config, ...updates });
  };

  return (
    <div className="space-y-4">
      {/* Content Length */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Ruler className="w-4 h-4 text-primary" />
            Tamanho do Conteúdo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {contentLengthOptions.map((option) => {
              const isSelected = config.contentLength === option.value;
              return (
                <div
                  key={option.value}
                  onClick={() => updateConfig({ contentLength: option.value as BulkGenerationConfig['contentLength'] })}
                  className={cn(
                    'p-3 rounded-lg border-2 cursor-pointer transition-all text-center',
                    isSelected 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <p className="font-medium text-sm">{option.label}</p>
                  <p className="text-xs text-primary font-semibold">{option.words}</p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* SEO Strategy Section - NEW */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            Estratégia SEO
          </CardTitle>
          <CardDescription className="text-xs">
            Configurações avançadas para otimização de conteúdo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Segmento</Label>
              <Select value={config.segment} onValueChange={(v) => updateConfig({ segment: v as BulkGenerationConfig['segment'] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {segmentOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Tipo de Conteúdo</Label>
              <Select value={config.contentType} onValueChange={(v) => updateConfig({ contentType: v as BulkGenerationConfig['contentType'] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contentTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Objetivo</Label>
              <Select value={config.goal} onValueChange={(v) => updateConfig({ goal: v as BulkGenerationConfig['goal'] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {goalOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Intenção de Busca</Label>
              <Select value={config.intentType} onValueChange={(v) => updateConfig({ intentType: v as BulkGenerationConfig['intentType'] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intentTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <strong>Limites SEO automáticos:</strong> Título máx 60 caracteres, Meta Description máx 160 caracteres
          </div>
        </CardContent>
      </Card>

      {/* Audience & Geographic Section */}
      <Collapsible open={expandedSections.audience} onOpenChange={() => toggleSection('audience')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Público e Alcance
                </CardTitle>
                {expandedSections.audience ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Alcance Geográfico
                  </Label>
                  <Input 
                    placeholder="Ex: Brasil, São Paulo, Nacional..."
                    value={config.geographicReach}
                    onChange={(e) => updateConfig({ geographicReach: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Tipo de Público
                  </Label>
                  <Select value={config.audienceType} onValueChange={(v) => updateConfig({ audienceType: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {audienceTypeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Público-Alvo (descrição detalhada)
                </Label>
                <Textarea 
                  placeholder="Ex: Empresários do setor jurídico buscando aumentar a visibilidade online..."
                  value={config.targetAudience}
                  onChange={(e) => updateConfig({ targetAudience: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Dor Principal do Cliente</Label>
                <Textarea 
                  placeholder="Ex: Dificuldade em atrair novos clientes pela internet..."
                  value={config.painPoints}
                  onChange={(e) => updateConfig({ painPoints: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Objetivo do CTA</Label>
                <Input 
                  placeholder="Ex: Solicitar orçamento, Agendar consulta, Baixar material..."
                  value={config.ctaObjective}
                  onChange={(e) => updateConfig({ ctaObjective: e.target.value })}
                />
              </div>

              {/* Tone & Voice */}
              <div className="border-t pt-4 mt-4">
                <Label className="flex items-center gap-2 mb-3">
                  <Wand2 className="w-4 h-4" />
                  Tom de Voz
                </Label>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Tom</Label>
                    <Select value={config.tone} onValueChange={(v) => updateConfig({ tone: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {toneOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Ponto de Vista</Label>
                    <Select value={config.pointOfView} onValueChange={(v) => updateConfig({ pointOfView: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {pointOfViewOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Idioma</Label>
                    <Select value={config.language} onValueChange={(v) => updateConfig({ language: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {languageOptions.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>
                            <span className="flex items-center gap-2">
                              {lang.flag} {lang.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Company Data Section */}
      <Collapsible open={expandedSections.company} onOpenChange={() => toggleSection('company')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    Dados da Empresa
                    <Badge variant="outline" className="text-xs">Opcional</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Citado estrategicamente em todos os conteúdos
                  </CardDescription>
                </div>
                {expandedSections.company ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input 
                    placeholder="Ex: Advocacia Silva & Associados"
                    value={config.companyName}
                    onChange={(e) => updateConfig({ companyName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input 
                    placeholder="(11) 99999-9999"
                    value={config.companyPhone}
                    onChange={(e) => updateConfig({ companyPhone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input 
                  placeholder="Av. Paulista, 1000 - São Paulo/SP"
                  value={config.companyAddress}
                  onChange={(e) => updateConfig({ companyAddress: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Informações Adicionais</Label>
                <Textarea 
                  placeholder="Diferenciais, especialidades, prêmios, certificações..."
                  value={config.additionalInfo}
                  onChange={(e) => updateConfig({ additionalInfo: e.target.value })}
                  rows={2}
                />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Content Structure Section */}
      <Collapsible open={expandedSections.structure} onOpenChange={() => toggleSection('structure')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  Estrutura do Conteúdo
                </CardTitle>
                {expandedSections.structure ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Elementos do Conteúdo</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ToggleCard
                  icon={FileText}
                  title="Meta Descrição"
                  description="Meta descrição SEO otimizada"
                  checked={config.metaDescription}
                  onCheckedChange={(v) => updateConfig({ metaDescription: v })}
                  color="#3B82F6"
                />
                <ToggleCard
                  icon={List}
                  title="Listas"
                  description="Incluir listas organizadas"
                  checked={config.lists}
                  onCheckedChange={(v) => updateConfig({ lists: v })}
                  color="#10B981"
                />
                <ToggleCard
                  icon={Table}
                  title="Tabelas"
                  description="Tabelas de comparação"
                  checked={config.tables}
                  onCheckedChange={(v) => updateConfig({ tables: v })}
                  color="#F59E0B"
                />
                <ToggleCard
                  icon={CheckCircle2}
                  title="Conclusão"
                  description="Resumo com CTA final"
                  checked={config.conclusion}
                  onCheckedChange={(v) => updateConfig({ conclusion: v })}
                  color="#8B5CF6"
                />
              </div>

              {/* FAQ Section */}
              <div 
                className={cn(
                  'p-4 rounded-lg border transition-all',
                  config.faq ? 'border-2 border-primary/50 bg-primary/5' : 'border-border'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      config.faq ? 'bg-primary/15' : 'bg-muted'
                    )}>
                      <HelpCircle className={cn('w-4 h-4', config.faq ? 'text-primary' : 'text-muted-foreground')} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Seção FAQ</p>
                      <p className="text-xs text-muted-foreground">Perguntas frequentes otimizadas para SEO</p>
                    </div>
                  </div>
                  <Switch 
                    checked={config.faq}
                    onCheckedChange={(v) => updateConfig({ faq: v })}
                  />
                </div>
                {config.faq && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Quantidade de perguntas</Label>
                      <span className="text-sm font-medium text-primary">{config.faqCount}</span>
                    </div>
                    <Slider
                      value={[config.faqCount]}
                      onValueChange={(v) => updateConfig({ faqCount: v[0] })}
                      min={3}
                      max={10}
                      step={1}
                    />
                  </div>
                )}
              </div>

              {/* Internal Linking */}
              <div 
                className={cn(
                  'p-4 rounded-lg border transition-all',
                  config.internalLinking ? 'border-2 border-success/50 bg-success/5' : 'border-border'
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      config.internalLinking ? 'bg-success/20' : 'bg-muted'
                    )}>
                      <Link2 className={cn('w-4 h-4', config.internalLinking ? 'text-success' : 'text-muted-foreground')} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Linkagem Interna</p>
                      <p className="text-xs text-muted-foreground">
                        Adicionar automaticamente links internos
                      </p>
                    </div>
                  </div>
                  <Switch 
                    checked={config.internalLinking}
                    onCheckedChange={(v) => updateConfig({ internalLinking: v })}
                  />
                </div>

                {config.internalLinking && (
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Selecione o projeto WordPress</Label>
                    <Select value={config.projectId} onValueChange={(v) => updateConfig({ projectId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um projeto..." />
                      </SelectTrigger>
                      <SelectContent>
                        {connectedProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            <span className="flex items-center gap-2">
                              <Globe className="w-4 h-4" />
                              {project.name}
                            </span>
                          </SelectItem>
                        ))}
                        {connectedProjects.length === 0 && (
                          <SelectItem value="none" disabled>
                            Nenhum projeto conectado
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* AI Model Section */}
      <Collapsible open={expandedSections.ai} onOpenChange={() => toggleSection('ai')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Modelo de IA
                </CardTitle>
                {expandedSections.ai ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <AIModelSelector 
                value={config.aiModel}
                onChange={(v) => updateConfig({ aiModel: v })}
                variant="credit-tiers"
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Advanced Settings Section */}
      <Collapsible open={expandedSections.advanced} onOpenChange={() => toggleSection('advanced')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  Configurações Avançadas
                </CardTitle>
                {expandedSections.advanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              {/* AI Auto Optimization - Highlighted First */}
              <div 
                className={cn(
                  'p-4 rounded-lg border-2 transition-all',
                  config.aiAutoOptimization 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border bg-background'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        config.aiAutoOptimization ? 'bg-primary/20' : 'bg-muted'
                      )}
                    >
                      <Brain 
                        className={cn('w-5 h-5', config.aiAutoOptimization ? 'text-primary' : 'text-muted-foreground')}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">Otimização IA Automática</p>
                        <Badge variant="secondary" className="text-xs bg-primary/20 text-primary border-0">
                          RECOMENDADO
                        </Badge>
                        <Sparkles className={cn('w-4 h-4', config.aiAutoOptimization ? 'text-primary' : 'text-muted-foreground')} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A IA analisa keywords e aprimora automaticamente o conteúdo
                      </p>
                    </div>
                  </div>
                  <Switch 
                    checked={config.aiAutoOptimization} 
                    onCheckedChange={(v) => updateConfig({ aiAutoOptimization: v })}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
                
                {config.aiAutoOptimization && (
                  <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Info className="w-3.5 h-3.5 text-primary" />
                      <span className="font-medium">A IA irá automaticamente:</span>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1.5 ml-5">
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        Gerar <strong>TITLE SEO</strong> otimizado (até 60 caracteres)
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        Criar <strong>Meta Descrição</strong> persuasiva (até 160 caracteres)
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        Analisar todas as keywords e intenções de busca
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        Otimizar estrutura para featured snippets
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        Aplicar E-E-A-T automaticamente por segmento
                      </li>
                    </ul>
                  </div>
                )}
              </div>
              
              <ToggleCard
                icon={Search}
                title="Otimização SEO Avançada"
                description="Análise e otimização automática para mecanismos de busca"
                checked={config.seoOptimization}
                onCheckedChange={(v) => updateConfig({ seoOptimization: v })}
                color="#3B82F6"
              />
              <ToggleCard
                icon={Clock}
                title="Dados em Tempo Real"
                description="Inclui informações e estatísticas atualizadas"
                checked={config.realtimeData}
                onCheckedChange={(v) => updateConfig({ realtimeData: v })}
                creditCost="+1 crédito"
                color="#8B5CF6"
              />
              <ToggleCard
                icon={User}
                title="Humanizar Conteúdo"
                description="Deixa o texto mais natural e humano"
                checked={config.humanizeContent}
                onCheckedChange={(v) => updateConfig({ humanizeContent: v })}
                creditCost="+1 crédito"
                color="#F97316"
              />

              {/* Generate Images */}
              <div 
                className={cn(
                  'p-4 rounded-lg border transition-all',
                  config.generateImages ? 'border-2 border-accent bg-accent/5' : 'border-border'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      config.generateImages ? 'bg-accent/20' : 'bg-muted'
                    )}>
                      <Image className={cn('w-4 h-4', config.generateImages ? 'text-accent' : 'text-muted-foreground')} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">Gerar Imagens</p>
                        <Badge variant="secondary" className="text-xs">+1 crédito/img</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cria imagens personalizadas para o artigo
                      </p>
                    </div>
                  </div>
                  <Switch 
                    checked={config.generateImages}
                    onCheckedChange={(v) => updateConfig({ generateImages: v })}
                  />
                </div>
                
                {config.generateImages && (
                  <div className="mt-4 pt-4 border-t space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Quantidade de imagens</Label>
                        <span className="text-sm font-medium text-accent">{config.imageCount}</span>
                      </div>
                      <Slider
                        value={[config.imageCount]}
                        onValueChange={(v) => updateConfig({ imageCount: v[0] })}
                        min={1}
                        max={5}
                        step={1}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm">Estilo das imagens</Label>
                      <Select value={config.imageStyle} onValueChange={(v) => updateConfig({ imageStyle: v })}>
                        <SelectTrigger>
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
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
