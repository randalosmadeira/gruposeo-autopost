import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Folder,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  FileText,
  Zap,
  Sparkles,
  CheckCircle2,
  Download,
  Upload,
  Eye,
  HelpCircle,
  Image,
  Wand2,
  List,
  Table,
  MessageSquare,
  X,
} from 'lucide-react';

export interface ArticleTemplate {
  id: string;
  name: string;
  description: string;
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
  seoOptimization: boolean;
  humanizeContent: boolean;
  generateImages: boolean;
  imageCount: number;
  imageStyle: string;
  createdAt: string;
  updatedAt: string;
  isDefault?: boolean;
}

const defaultTemplates: ArticleTemplate[] = [
  {
    id: 'default-blog',
    name: 'Blog Padrão',
    description: 'Template otimizado para artigos de blog com SEO completo',
    tone: 'profissional',
    pointOfView: 'terceira',
    size: 'medium',
    language: 'pt-BR',
    aiModel: 'standard',
    segment: 'general',
    contentType: 'how-to',
    goal: 'inform',
    intentType: 'informational',
    metaDescription: true,
    lists: true,
    tables: false,
    conclusion: true,
    faq: true,
    seoOptimization: true,
    humanizeContent: false,
    generateImages: true,
    imageCount: 1,
    imageStyle: 'fotorrealístico',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDefault: true,
  },
  {
    id: 'default-pillar',
    name: 'Artigo Pilar',
    description: 'Conteúdo longo e abrangente para autoridade topical',
    tone: 'educativo',
    pointOfView: 'segunda',
    size: 'very-long',
    language: 'pt-BR',
    aiModel: 'premium',
    segment: 'general',
    contentType: 'pillar',
    goal: 'educate',
    intentType: 'informational',
    metaDescription: true,
    lists: true,
    tables: true,
    conclusion: true,
    faq: true,
    seoOptimization: true,
    humanizeContent: true,
    generateImages: true,
    imageCount: 3,
    imageStyle: 'fotorrealístico',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDefault: true,
  },
  {
    id: 'default-listicle',
    name: 'Listicle',
    description: 'Artigos em formato de lista para engajamento',
    tone: 'casual',
    pointOfView: 'segunda',
    size: 'medium',
    language: 'pt-BR',
    aiModel: 'standard',
    segment: 'general',
    contentType: 'listicle',
    goal: 'engage',
    intentType: 'informational',
    metaDescription: true,
    lists: true,
    tables: false,
    conclusion: true,
    faq: false,
    seoOptimization: true,
    humanizeContent: false,
    generateImages: true,
    imageCount: 1,
    imageStyle: 'ilustração',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDefault: true,
  },
];

const STORAGE_KEY = 'article_templates';

export function ArticleTemplatesCard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ArticleTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<ArticleTemplate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<ArticleTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tone: 'profissional',
    pointOfView: 'terceira',
    size: 'medium',
    language: 'pt-BR',
    aiModel: 'standard',
    // Advanced options
    faq: true,
    lists: true,
    tables: false,
    conclusion: true,
    metaDescription: true,
    seoOptimization: true,
    humanizeContent: false,
    generateImages: true,
    imageCount: 1,
    imageStyle: 'fotorrealístico',
  });

  // Load templates from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setTemplates([...defaultTemplates, ...parsed]);
      } catch {
        setTemplates(defaultTemplates);
      }
    } else {
      setTemplates(defaultTemplates);
    }
  }, []);

  // Save custom templates to localStorage
  const saveTemplates = (newTemplates: ArticleTemplate[]) => {
    const customTemplates = newTemplates.filter(t => !t.isDefault);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customTemplates));
    setTemplates([...defaultTemplates, ...customTemplates]);
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      description: '',
      tone: 'profissional',
      pointOfView: 'terceira',
      size: 'medium',
      language: 'pt-BR',
      aiModel: 'standard',
      faq: true,
      lists: true,
      tables: false,
      conclusion: true,
      metaDescription: true,
      seoOptimization: true,
      humanizeContent: false,
      generateImages: true,
      imageCount: 1,
      imageStyle: 'fotorrealístico',
    });
    setIsDialogOpen(true);
  };

  const handlePreviewTemplate = (template: ArticleTemplate) => {
    setPreviewTemplate(template);
    setIsPreviewOpen(true);
  };

  const handleEditTemplate = (template: ArticleTemplate) => {
    if (template.isDefault) {
      // Clone default template
      setEditingTemplate(null);
      setFormData({
        name: `${template.name} (Cópia)`,
        description: template.description,
        tone: template.tone,
        pointOfView: template.pointOfView,
        size: template.size,
        language: template.language,
        aiModel: template.aiModel,
        faq: template.faq,
        lists: template.lists,
        tables: template.tables,
        conclusion: template.conclusion,
        metaDescription: template.metaDescription,
        seoOptimization: template.seoOptimization,
        humanizeContent: template.humanizeContent,
        generateImages: template.generateImages,
        imageCount: template.imageCount,
        imageStyle: template.imageStyle,
      });
    } else {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        description: template.description,
        tone: template.tone,
        pointOfView: template.pointOfView,
        size: template.size,
        language: template.language,
        aiModel: template.aiModel,
        faq: template.faq,
        lists: template.lists,
        tables: template.tables,
        conclusion: template.conclusion,
        metaDescription: template.metaDescription,
        seoOptimization: template.seoOptimization,
        humanizeContent: template.humanizeContent,
        generateImages: template.generateImages,
        imageCount: template.imageCount,
        imageStyle: template.imageStyle,
      });
    }
    setIsDialogOpen(true);
  };

  const handleSaveTemplate = () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Digite um nome para o template.',
        variant: 'destructive',
      });
      return;
    }

    const newTemplate: ArticleTemplate = {
      id: editingTemplate?.id || `custom-${Date.now()}`,
      name: formData.name,
      description: formData.description,
      tone: formData.tone,
      pointOfView: formData.pointOfView,
      size: formData.size,
      language: formData.language,
      aiModel: formData.aiModel,
      segment: 'general',
      contentType: 'how-to',
      goal: 'inform',
      intentType: 'informational',
      metaDescription: formData.metaDescription,
      lists: formData.lists,
      tables: formData.tables,
      conclusion: formData.conclusion,
      faq: formData.faq,
      seoOptimization: formData.seoOptimization,
      humanizeContent: formData.humanizeContent,
      generateImages: formData.generateImages,
      imageCount: formData.imageCount,
      imageStyle: formData.imageStyle,
      createdAt: editingTemplate?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDefault: false,
    };

    if (editingTemplate) {
      // Update existing
      const updated = templates.map(t => t.id === editingTemplate.id ? newTemplate : t);
      saveTemplates(updated);
      toast({ title: 'Template atualizado!', description: `"${formData.name}" foi salvo.` });
    } else {
      // Create new
      saveTemplates([...templates, newTemplate]);
      toast({ title: 'Template criado!', description: `"${formData.name}" está disponível.` });
    }

    setIsDialogOpen(false);
  };

  const handleDeleteTemplate = (template: ArticleTemplate) => {
    if (template.isDefault) return;
    const filtered = templates.filter(t => t.id !== template.id);
    saveTemplates(filtered);
    toast({ title: 'Template excluído', description: `"${template.name}" foi removido.` });
  };

  const handleUseTemplate = (template: ArticleTemplate) => {
    navigate(`/articles/new?template=${template.id}`);
  };

  const toneLabels: Record<string, string> = {
    profissional: 'Profissional',
    casual: 'Casual',
    acadêmico: 'Acadêmico',
    persuasivo: 'Persuasivo',
    educativo: 'Educativo',
  };

  const sizeLabels: Record<string, string> = {
    short: 'Curto (~750)',
    medium: 'Médio (~1.500)',
    long: 'Longo (~2.500)',
    'very-long': 'Muito Longo (~4.000)',
  };

  const tierLabels: Record<string, { label: string; credits: number }> = {
    standard: { label: 'Padrão', credits: 1 },
    premium: { label: 'Premium', credits: 2 },
    advanced: { label: 'Avançado', credits: 3 },
    professional: { label: 'Profissional', credits: 4 },
  };

  // Export templates to JSON
  const handleExportTemplates = () => {
    const customTemplates = templates.filter(t => !t.isDefault);
    if (customTemplates.length === 0) {
      toast({
        title: 'Nenhum modelo para exportar',
        description: 'Crie modelos personalizados antes de exportar.',
        variant: 'destructive',
      });
      return;
    }

    const dataStr = JSON.stringify(customTemplates, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `article-templates-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: 'Templates exportados!',
      description: `${customTemplates.length} modelo(s) exportado(s) com sucesso.`,
    });
  };

  // Import templates from JSON
  const handleImportTemplates = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const imported = JSON.parse(text) as ArticleTemplate[];
        
        if (!Array.isArray(imported)) {
          throw new Error('Formato inválido');
        }

        // Validate and clean imported templates
        const validTemplates = imported.map(t => ({
          ...t,
          id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          isDefault: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

        const customTemplates = templates.filter(t => !t.isDefault);
        saveTemplates([...templates, ...validTemplates]);

        toast({
          title: 'Templates importados!',
          description: `${validTemplates.length} modelo(s) importado(s) com sucesso.`,
        });
      } catch (error) {
        toast({
          title: 'Erro ao importar',
          description: 'O arquivo não é um JSON válido de templates.',
          variant: 'destructive',
        });
      }
    };
    input.click();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Folder className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Modelos de Artigo</CardTitle>
                <CardDescription>
                  Salve e reutilize configurações de artigo
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleImportTemplates} className="gap-2">
                <Upload className="w-4 h-4" />
                Importar
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportTemplates} className="gap-2">
                <Download className="w-4 h-4" />
                Exportar
              </Button>
              <Button onClick={handleCreateTemplate} className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Modelo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-foreground">{template.name}</h4>
                      {template.isDefault && (
                        <Badge variant="secondary" className="text-[10px]">Padrão</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px]">
                        {toneLabels[template.tone] || template.tone}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {sizeLabels[template.size] || template.size}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {tierLabels[template.aiModel]?.label || template.aiModel} ({tierLabels[template.aiModel]?.credits || 1} cr)
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleUseTemplate(template)}
                    className="gap-1"
                  >
                    <Zap className="w-3 h-3" />
                    Usar
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handlePreviewTemplate(template)}>
                        <Eye className="w-4 h-4 mr-2" />
                        Visualizar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEditTemplate(template)}>
                        {template.isDefault ? (
                          <>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicar
                          </>
                        ) : (
                          <>
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </>
                        )}
                      </DropdownMenuItem>
                      {!template.isDefault && (
                        <DropdownMenuItem 
                          onClick={() => handleDeleteTemplate(template)}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>

          {/* Tip */}
          <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-100 dark:border-purple-800">
            <p className="text-xs text-purple-700 dark:text-purple-300 flex items-start gap-2">
              <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Dica:</strong> Use modelos para manter consistência na criação de conteúdo. 
                Você pode criar modelos para diferentes nichos ou tipos de artigo.
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Editar Modelo' : 'Novo Modelo de Artigo'}
            </DialogTitle>
            <DialogDescription>
              Configure as preferências padrão para este modelo
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Básico</TabsTrigger>
              <TabsTrigger value="content">Conteúdo</TabsTrigger>
              <TabsTrigger value="advanced">Avançado</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 pr-4">
              {/* Basic Tab */}
              <TabsContent value="basic" className="space-y-4 py-4 mt-0">
                <div className="space-y-2">
                  <Label>Nome do Modelo *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="ex: Artigos para E-commerce"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="ex: Otimizado para lojas virtuais"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tom de Voz</Label>
                    <Select 
                      value={formData.tone} 
                      onValueChange={(v) => setFormData(prev => ({ ...prev, tone: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="profissional">Profissional</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="acadêmico">Acadêmico</SelectItem>
                        <SelectItem value="persuasivo">Persuasivo</SelectItem>
                        <SelectItem value="educativo">Educativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Tamanho</Label>
                    <Select 
                      value={formData.size} 
                      onValueChange={(v) => setFormData(prev => ({ ...prev, size: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Curto (~750)</SelectItem>
                        <SelectItem value="medium">Médio (~1.500)</SelectItem>
                        <SelectItem value="long">Longo (~2.500)</SelectItem>
                        <SelectItem value="very-long">Muito Longo (~4.000)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Modelo de IA</Label>
                    <Select 
                      value={formData.aiModel} 
                      onValueChange={(v) => setFormData(prev => ({ ...prev, aiModel: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Padrão (1 cr)</SelectItem>
                        <SelectItem value="premium">Premium (2 cr)</SelectItem>
                        <SelectItem value="advanced">Avançado (3 cr)</SelectItem>
                        <SelectItem value="professional">Profissional (4 cr)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Idioma</Label>
                    <Select 
                      value={formData.language} 
                      onValueChange={(v) => setFormData(prev => ({ ...prev, language: v }))}
                    >
                      <SelectTrigger>
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
              </TabsContent>

              {/* Content Tab */}
              <TabsContent value="content" className="space-y-4 py-4 mt-0">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm text-muted-foreground">Elementos do Artigo</h4>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <HelpCircle className="w-4 h-4 text-primary" />
                        <div>
                          <Label className="text-sm font-medium">Seção FAQ</Label>
                          <p className="text-xs text-muted-foreground">Perguntas frequentes ao final</p>
                        </div>
                      </div>
                      <Switch
                        checked={formData.faq}
                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, faq: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <List className="w-4 h-4 text-chart-2" />
                        <div>
                          <Label className="text-sm font-medium">Listas</Label>
                          <p className="text-xs text-muted-foreground">Incluir listas e bullet points</p>
                        </div>
                      </div>
                      <Switch
                        checked={formData.lists}
                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, lists: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Table className="w-4 h-4 text-chart-3" />
                        <div>
                          <Label className="text-sm font-medium">Tabelas</Label>
                          <p className="text-xs text-muted-foreground">Incluir tabelas comparativas</p>
                        </div>
                      </div>
                      <Switch
                        checked={formData.tables}
                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, tables: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="w-4 h-4 text-chart-4" />
                        <div>
                          <Label className="text-sm font-medium">Conclusão</Label>
                          <p className="text-xs text-muted-foreground">Seção de conclusão no final</p>
                        </div>
                      </div>
                      <Switch
                        checked={formData.conclusion}
                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, conclusion: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-chart-5" />
                        <div>
                          <Label className="text-sm font-medium">Meta Descrição</Label>
                          <p className="text-xs text-muted-foreground">Gerar meta description SEO</p>
                        </div>
                      </div>
                      <Switch
                        checked={formData.metaDescription}
                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, metaDescription: v }))}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Advanced Tab */}
              <TabsContent value="advanced" className="space-y-4 py-4 mt-0">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm text-muted-foreground">Otimizações</h4>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <div>
                          <Label className="text-sm font-medium">Otimização SEO</Label>
                          <p className="text-xs text-muted-foreground">Aplicar técnicas avançadas de SEO</p>
                        </div>
                      </div>
                      <Switch
                        checked={formData.seoOptimization}
                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, seoOptimization: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Wand2 className="w-4 h-4 text-purple-500" />
                        <div>
                          <Label className="text-sm font-medium">Humanização</Label>
                          <p className="text-xs text-muted-foreground">Tornar texto mais natural e humano</p>
                        </div>
                      </div>
                      <Switch
                        checked={formData.humanizeContent}
                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, humanizeContent: v }))}
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-medium text-sm text-muted-foreground mb-3">Imagens</h4>
                    
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 mb-3">
                      <div className="flex items-center gap-3">
                        <Image className="w-4 h-4 text-chart-2" />
                        <div>
                          <Label className="text-sm font-medium">Gerar Imagens</Label>
                          <p className="text-xs text-muted-foreground">Criar imagens com IA</p>
                        </div>
                      </div>
                      <Switch
                        checked={formData.generateImages}
                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, generateImages: v }))}
                      />
                    </div>

                    {formData.generateImages && (
                      <div className="grid grid-cols-2 gap-4 pl-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Quantidade</Label>
                          <Select 
                            value={String(formData.imageCount)} 
                            onValueChange={(v) => setFormData(prev => ({ ...prev, imageCount: parseInt(v) }))}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1 imagem</SelectItem>
                              <SelectItem value="2">2 imagens</SelectItem>
                              <SelectItem value="3">3 imagens</SelectItem>
                              <SelectItem value="5">5 imagens</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Estilo</Label>
                          <Select 
                            value={formData.imageStyle} 
                            onValueChange={(v) => setFormData(prev => ({ ...prev, imageStyle: v }))}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fotorrealístico">Fotorrealístico</SelectItem>
                              <SelectItem value="ilustração">Ilustração</SelectItem>
                              <SelectItem value="minimalista">Minimalista</SelectItem>
                              <SelectItem value="artístico">Artístico</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveTemplate}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {editingTemplate ? 'Salvar' : 'Criar Modelo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Preview: {previewTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              Visualização das configurações deste modelo
            </DialogDescription>
          </DialogHeader>

          {previewTemplate && (
            <div className="space-y-6 py-4">
              {/* Header Info */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{previewTemplate.name}</h3>
                  <p className="text-sm text-muted-foreground">{previewTemplate.description}</p>
                </div>
                {previewTemplate.isDefault && (
                  <Badge variant="secondary">Padrão</Badge>
                )}
              </div>

              {/* Settings Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground mb-1">Tom de Voz</p>
                  <p className="font-medium">{toneLabels[previewTemplate.tone] || previewTemplate.tone}</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground mb-1">Tamanho</p>
                  <p className="font-medium">{sizeLabels[previewTemplate.size] || previewTemplate.size}</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground mb-1">Modelo IA</p>
                  <p className="font-medium">{tierLabels[previewTemplate.aiModel]?.label} ({tierLabels[previewTemplate.aiModel]?.credits} cr)</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground mb-1">Idioma</p>
                  <p className="font-medium">{previewTemplate.language === 'pt-BR' ? '🇧🇷 Português' : previewTemplate.language === 'en-US' ? '🇺🇸 English' : '🇪🇸 Español'}</p>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Recursos Incluídos</h4>
                <div className="flex flex-wrap gap-2">
                  {previewTemplate.faq && (
                    <Badge variant="outline" className="gap-1">
                      <HelpCircle className="w-3 h-3" /> FAQ
                    </Badge>
                  )}
                  {previewTemplate.lists && (
                    <Badge variant="outline" className="gap-1">
                      <List className="w-3 h-3" /> Listas
                    </Badge>
                  )}
                  {previewTemplate.tables && (
                    <Badge variant="outline" className="gap-1">
                      <Table className="w-3 h-3" /> Tabelas
                    </Badge>
                  )}
                  {previewTemplate.conclusion && (
                    <Badge variant="outline" className="gap-1">
                      <MessageSquare className="w-3 h-3" /> Conclusão
                    </Badge>
                  )}
                  {previewTemplate.metaDescription && (
                    <Badge variant="outline" className="gap-1">
                      <FileText className="w-3 h-3" /> Meta Desc.
                    </Badge>
                  )}
                  {previewTemplate.seoOptimization && (
                    <Badge variant="outline" className="gap-1 bg-primary/10 text-primary border-primary/30">
                      <Sparkles className="w-3 h-3" /> SEO
                    </Badge>
                  )}
                  {previewTemplate.humanizeContent && (
                    <Badge variant="outline" className="gap-1 bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300">
                      <Wand2 className="w-3 h-3" /> Humanização
                    </Badge>
                  )}
                  {previewTemplate.generateImages && (
                    <Badge variant="outline" className="gap-1 bg-chart-2/10 text-chart-2 border-chart-2/30">
                      <Image className="w-3 h-3" /> {previewTemplate.imageCount}x Imagem ({previewTemplate.imageStyle})
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              Fechar
            </Button>
            <Button onClick={() => {
              if (previewTemplate) {
                handleUseTemplate(previewTemplate);
              }
            }}>
              <Zap className="w-4 h-4 mr-2" />
              Usar Modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Helper hook to get templates
export function useArticleTemplates() {
  const [templates, setTemplates] = useState<ArticleTemplate[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setTemplates([...defaultTemplates, ...parsed]);
      } catch {
        setTemplates(defaultTemplates);
      }
    } else {
      setTemplates(defaultTemplates);
    }
  }, []);

  const getTemplateById = (id: string) => templates.find(t => t.id === id);

  return { templates, getTemplateById };
}
