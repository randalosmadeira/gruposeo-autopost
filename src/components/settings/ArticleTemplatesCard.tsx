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
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tone: 'profissional',
    pointOfView: 'terceira',
    size: 'medium',
    language: 'pt-BR',
    aiModel: 'standard',
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
    });
    setIsDialogOpen(true);
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
            <Button onClick={handleCreateTemplate} className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Modelo
            </Button>
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Editar Modelo' : 'Novo Modelo de Artigo'}
            </DialogTitle>
            <DialogDescription>
              Configure as preferências padrão para este modelo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
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
          </div>

          <DialogFooter>
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
