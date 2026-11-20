import type { TablesUpdate } from '@/integrations/supabase/types';
import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  Plus,
  ChevronUp,
  ChevronDown,
  Info,
  AlertTriangle,
  Loader2,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  RotateCcw,
  Sparkles,
  Save,
  Bot,
  Zap,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { PROMPT_LIBRARY } from '../../../supabase/functions/_shared/prompt-library';

// Texto dos padrões: fonte única em supabase/functions/_shared/prompt-library.ts (a mesma que gera a migração dos modelos do banco).
const libraryPrompt = (id: string) => {
  const found = PROMPT_LIBRARY.find((p) => p.id === id);
  if (!found) throw new Error(`prompt-padrão ausente na biblioteca: ${id}`);
  return found;
};

const VARIABLES = [
  { name: '${title}', required: true, description: 'Título do artigo' },
  { name: '${idioma}', required: true, description: 'Idioma do conteúdo (pt-BR, en, etc.)' },
  { name: '${articleLength}', required: false, description: 'Tamanho do artigo (curto, médio, longo)' },
  { name: '${tone}', required: false, description: 'Tom de voz (formal, casual, etc.)' },
  { name: '${pov}', required: false, description: 'Ponto de vista (primeira pessoa, terceira pessoa)' },
  { name: '${contextSection}', required: false, description: 'Seção de contexto adicional' },
  { name: '${sourcesContext}', required: false, description: 'Contexto das fontes de pesquisa' },
  { name: '${context}', required: false, description: 'Contexto geral' },
  { name: '${currentYear}', required: false, description: 'Ano atual' },
  { name: '${language}', required: false, description: 'Alias para idioma' },
];

// Canonical variable names (without ${...}), derived from VARIABLES above -
// this is the single source of truth used to flag unknown tokens at save time.
const KNOWN_VARIABLE_NAMES = VARIABLES.map(v => v.name.replace(/[${}]/g, ''));

const TARGET_FUNCTIONS = [
  { id: 'article_generator', label: 'Gerador de Artigos', icon: '📝' },
  { id: 'news_rewriter', label: 'Repostagem Jornalística', icon: '📰' },
  { id: 'landing_page', label: 'Landing Page', icon: '🌐' },
  { id: 'authority_planner', label: 'Planejador de Autoridade', icon: '📊' },
  { id: 'bulk_generator', label: 'Geração em Massa', icon: '⚡' },
  { id: 'image_generator', label: 'Geração de Imagens', icon: '🎨' },
  { id: 'content_variations', label: 'Variações de Conteúdo', icon: '🔄' },
  { id: 'blog_architecture', label: 'Arquitetura de Blog', icon: '🏗️' },
  { id: 'seo_audit', label: 'Auditoria SEO', icon: '🔍' },
  { id: 'metadata_schema', label: 'Metadados & Schema', icon: '🏷️' },
];

const DEFAULT_TEMPLATES = [
  {
    id: 'blog-seo',
    name: '🎭 Redator SEO Sênior V4',
    description: libraryPrompt('blog-seo').description,
    prompt: libraryPrompt('blog-seo').prompt,
    isDefault: true,
    type: 'blog',
    targetFunction: 'article_generator',
  },
  {
    id: 'news-article',
    name: '📰 Redação Jornalística V4',
    description: libraryPrompt('news-article').description,
    prompt: libraryPrompt('news-article').prompt,
    isDefault: true,
    type: 'news',
    targetFunction: 'news_rewriter',
  },
  {
    id: 'tutorial',
    name: '📚 Criador de Tutoriais V4',
    description: libraryPrompt('tutorial').description,
    prompt: libraryPrompt('tutorial').prompt,
    isDefault: true,
    type: 'tutorial',
    targetFunction: 'article_generator',
  },
  {
    id: 'rdm-specialist',
    name: '⚖️ Agente Redator RDM V4',
    description: libraryPrompt('rdm-agent').description,
    prompt: libraryPrompt('rdm-agent').prompt,
    isDefault: true,
    type: 'rdm',
    targetFunction: 'article_generator',
  },
  {
    id: 'blog-architect',
    name: '🏗️ Construtor de Blogs & Clusters',
    description: libraryPrompt('blog-architecture').description,
    prompt: libraryPrompt('blog-architecture').prompt,
    isDefault: true,
    type: 'blog_architecture',
    targetFunction: 'blog_architecture',
  },
  {
    id: 'seo-auditor',
    name: '🔍 Auditor SEO & Indexação',
    description: libraryPrompt('seo-audit').description,
    prompt: libraryPrompt('seo-audit').prompt,
    isDefault: true,
    type: 'seo_audit',
    targetFunction: 'seo_audit',
  },
  {
    id: 'metadata-schema',
    name: '🏷️ Metadados & Schema Markup',
    description: libraryPrompt('metadata-schema').description,
    prompt: libraryPrompt('metadata-schema').prompt,
    isDefault: true,
    type: 'metadata_schema',
    targetFunction: 'metadata_schema',
  },
];

const JSON_OUTPUT = `{
  "titulo": "...", "slug": "...", "palavra_chave_foco": "...",
  "meta_description": "...", "content_html": "<h2>...</h2>...",
  "tags": [...], "image": {"prompt": "...", "alt": "...", "title": "..."}
}`;

interface TemplateData {
  id: string;
  name: string;
  description: string;
  prompt: string;
  isDefault: boolean;
  type?: string;
  is_default?: boolean;
  template_type?: string;
  agentName?: string;
  targetFunction?: string;
}

export function PromptTemplatesCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [isOpen, setIsOpen] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<TemplateData | null>(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalTemplate, setOriginalTemplate] = useState<TemplateData | null>(null);

  const { data: templates = [], isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['prompt-templates', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('prompt_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Auto-seed default templates into DB if user has none for a given target_function
  const [hasSeeded, setHasSeeded] = useState(false);
  useEffect(() => {
    if (!user || isLoadingTemplates || hasSeeded) return;
    
    const seedDefaults = async () => {
      // Get all target_functions the user already has templates for
      const existingFunctions = new Set(
        templates.map((t: any) => t.target_function).filter(Boolean)
      );
      
      // Find default templates whose target_function is missing from user's DB
      const missingDefaults = DEFAULT_TEMPLATES.filter(
        dt => dt.targetFunction && !existingFunctions.has(dt.targetFunction)
      );
      
      if (missingDefaults.length === 0) {
        setHasSeeded(true);
        return;
      }
      
      // Insert missing defaults
      const inserts = missingDefaults.map(dt => ({
        user_id: user.id,
        name: dt.name,
        prompt: dt.prompt,
        is_default: true,
        template_type: dt.type || 'custom',
        target_function: dt.targetFunction || null,
        description: dt.description || null,
      }));
      
      const { error } = await supabase.from('prompt_templates').insert(inserts);
      if (!error) {
        queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      }
      setHasSeeded(true);
    };
    
    seedDefaults();
  }, [user, templates, isLoadingTemplates, hasSeeded, queryClient]);

  // Track unsaved changes
  useEffect(() => {
    if (editingTemplate && originalTemplate) {
      const hasChanges = 
        editingTemplate.name !== originalTemplate.name ||
        editingTemplate.prompt !== originalTemplate.prompt ||
        editingTemplate.agentName !== originalTemplate.agentName ||
        editingTemplate.targetFunction !== originalTemplate.targetFunction ||
        editingTemplate.description !== originalTemplate.description;
      setHasUnsavedChanges(hasChanges);
    }
  }, [editingTemplate, originalTemplate]);

  const createTemplate = useMutation({
    mutationFn: async ({ 
      name, 
      prompt, 
      templateType,
      agentName,
      targetFunction,
      description,
    }: { 
      name: string; 
      prompt: string; 
      templateType?: string;
      agentName?: string;
      targetFunction?: string;
      description?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('prompt_templates')
        .insert({
          user_id: user.id,
          name,
          prompt,
          is_default: false,
          template_type: templateType || 'custom',
          agent_name: agentName || null,
          target_function: targetFunction || null,
          description: description || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setNewTemplateName('');
      toast({
        title: 'Modelo criado!',
        description: 'O novo modelo de prompt foi criado.',
      });
      // Open editor for new template
      handleEditTemplate({
        id: data.id,
        name: data.name,
        description: data.description || data.prompt?.slice(0, 80) + '...',
        prompt: data.prompt,
        isDefault: false,
        type: data.template_type,
        agentName: data.agent_name,
        targetFunction: data.target_function,
      });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ 
      id, 
      name,
      prompt,
      agentName,
      targetFunction,
      description,
    }: { 
      id: string; 
      name?: string; 
      prompt?: string;
      agentName?: string | null;
      targetFunction?: string | null;
      description?: string | null;
    }) => {
      const updates: TablesUpdate<'prompt_templates'> = {};
      if (name !== undefined) updates.name = name;
      if (prompt !== undefined) updates.prompt = prompt;
      if (agentName !== undefined) updates.agent_name = agentName;
      if (targetFunction !== undefined) updates.target_function = targetFunction;
      if (description !== undefined) updates.description = description;

      const { data, error } = await supabase
        .from('prompt_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setEditingTemplate(null);
      setOriginalTemplate(null);
      setHasUnsavedChanges(false);
      toast({
        title: 'Modelo atualizado!',
        description: 'As alterações foram salvas.',
      });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('prompt_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setDeleteConfirm(null);
      toast({
        title: 'Modelo excluído',
        description: 'O modelo de prompt foi removido.',
      });
    },
  });

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;
    setIsCreating(true);
    await createTemplate.mutateAsync({
      name: newTemplateName,
      prompt: 'Escreva seu prompt aqui usando as variáveis disponíveis.\n\n${title}\n${language}\n${articleLength}\n${tone}\n${pov}\n\nSAÍDA: siga o formato pedido pelo executor (HTML do corpo ou JSON). Campos de referência quando o pedido for em JSON:\n' + JSON_OUTPUT,
    });
    setIsCreating(false);
  };

  const handleEditTemplate = (template: TemplateData) => {
    setEditingTemplate({ ...template });
    setOriginalTemplate({ ...template });
    setHasUnsavedChanges(false);
  };

  const handleDuplicateTemplate = async (template: TemplateData) => {
    await createTemplate.mutateAsync({
      name: `${template.name} (cópia)`,
      prompt: template.prompt,
      templateType: template.type || 'custom',
      agentName: template.agentName,
      targetFunction: template.targetFunction,
      description: template.description,
    });
  };

  const handleCustomizeDefault = async (template: TemplateData) => {
    // Create a personalized copy of a default template
    await createTemplate.mutateAsync({
      name: `${template.name} (personalizado)`,
      prompt: template.prompt,
      templateType: template.type || 'custom',
      targetFunction: template.targetFunction,
      description: template.description,
    });
  };

  const handleResetToDefault = (template: TemplateData) => {
    const defaultTemplate = DEFAULT_TEMPLATES.find(t => t.type === template.type);
    if (defaultTemplate) {
      setEditingTemplate({
        ...editingTemplate!,
        prompt: defaultTemplate.prompt,
      });
      toast({
        title: 'Prompt restaurado',
        description: 'O conteúdo foi restaurado para o padrão original.',
      });
    }
  };

  const insertVariable = (variable: string) => {
    if (!editingTemplate || !textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = editingTemplate.prompt;
    
    const newText = text.substring(0, start) + variable + text.substring(end);
    
    setEditingTemplate({
      ...editingTemplate,
      prompt: newText,
    });
    
    // Restore cursor position after the inserted variable
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  const handleCloseEditor = () => {
    if (hasUnsavedChanges) {
      if (confirm('Você tem alterações não salvas. Deseja realmente fechar?')) {
        setEditingTemplate(null);
        setOriginalTemplate(null);
        setHasUnsavedChanges(false);
      }
    } else {
      setEditingTemplate(null);
      setOriginalTemplate(null);
    }
  };

  const handleSave = () => {
    if (!editingTemplate) return;

    // Advisory-only check: warn about `${xyz}` tokens in the prompt that
    // aren't in the known variable list, but never block the save on it -
    // the prompt may intentionally reference something new, and the user
    // should just be able to confirm it will actually be substituted at
    // generation time.
    const usedVariables = new Set(
      Array.from(editingTemplate.prompt.matchAll(/\$\{([a-zA-Z0-9_]+)\}/g)).map(m => m[1])
    );
    const unknownVariables = Array.from(usedVariables).filter(
      name => !KNOWN_VARIABLE_NAMES.includes(name)
    );
    if (unknownVariables.length > 0) {
      toast({
        title: unknownVariables.length > 1 ? 'Variáveis desconhecidas' : 'Variável desconhecida',
        description: unknownVariables
          .map(name => `Variável desconhecida: \`\${${name}}\` — confirme se será substituída na geração.`)
          .join('\n'),
      });
    }

    updateTemplate.mutate({
      id: editingTemplate.id,
      name: editingTemplate.name,
      prompt: editingTemplate.prompt,
      agentName: editingTemplate.agentName || null,
      targetFunction: editingTemplate.targetFunction || null,
      description: editingTemplate.description || null,
    });
  };

  // All templates come from DB only — no more decorative defaults
  const allTemplates: TemplateData[] = templates.map((t: any) => ({
    id: t.id,
    name: t.name,
    description: t.description || t.prompt?.slice(0, 80) + '...',
    prompt: t.prompt,
    isDefault: t.is_default || false,
    type: t.template_type,
    is_default: t.is_default,
    agentName: t.agent_name,
    targetFunction: t.target_function,
  }));

  // Check if a user template is based on a default one
  const getRelatedDefaultTemplate = (type?: string) => {
    return DEFAULT_TEMPLATES.find(t => t.type === type);
  };

  const getTargetFunctionLabel = (functionId?: string) => {
    const func = TARGET_FUNCTIONS.find(f => f.id === functionId);
    return func ? `${func.icon} ${func.label}` : null;
  };

  return (
    <>
      <Card>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CardHeader>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Modelos de Prompt (Tipos de Artigo)
                </CardTitle>
                {isOpen ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Info Banner */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    <p>Esses prompts aparecem como "Tipo de Artigo" na geração</p>
                    <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">
                      Variáveis: {VARIABLES.slice(0, 8).map(v => v.name).join(', ')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Templates List */}
              <div className="space-y-3">
                {allTemplates.map((template) => (
                  <div 
                    key={template.id}
                    className={cn(
                      "p-4 border rounded-lg bg-background transition-all hover:border-primary/50",
                      "flex items-start justify-between gap-4"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-foreground">{template.name}</h4>
                        {template.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            padrão
                          </Badge>
                        )}
                        {template.agentName && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Bot className="w-3 h-3" />
                            {template.agentName}
                          </Badge>
                        )}
                        {template.targetFunction && (
                          <Badge variant="outline" className="text-xs gap-1 bg-primary/5">
                            <Zap className="w-3 h-3" />
                            {getTargetFunctionLabel(template.targetFunction)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="link"
                        className="text-primary px-2"
                        onClick={() => handleEditTemplate(template)}
                      >
                        Editar
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                         <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditTemplate(template)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicateTemplate(template)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicar
                          </DropdownMenuItem>
                          {!template.isDefault && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => setDeleteConfirm(template.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>

              {/* Create New Template */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Criar Novo Modelo</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nome do modelo (ex: Tutorial)"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTemplateName.trim()) {
                        handleCreateTemplate();
                      }
                    }}
                  />
                  <Button 
                    onClick={handleCreateTemplate}
                    disabled={isCreating || !newTemplateName.trim()}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {isCreating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Edit Template Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={() => handleCloseEditor()}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg">
                  Editar: {editingTemplate?.name}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1">
                  Edite o nome, descrição, vinculação e o prompt do modelo.
                </DialogDescription>
              </div>
              {hasUnsavedChanges && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Alterações não salvas
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Name and Agent Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Nome do Modelo</Label>
                <Input
                  id="template-name"
                  value={editingTemplate?.name || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate!, name: e.target.value })}
                  placeholder="Nome do modelo de prompt"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-name" className="flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  Nome do Agente (opcional)
                </Label>
                <Input
                  id="agent-name"
                  value={editingTemplate?.agentName || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate!, agentName: e.target.value })}
                  placeholder="Ex: Redator SEO, Jornalista, Analista..."
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="template-description">Descrição curta</Label>
              <Input
                id="template-description"
                value={editingTemplate?.description || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate!, description: e.target.value })}
                placeholder="Breve descrição do que este prompt faz..."
              />
            </div>

            {/* Target Function */}
            <div className="space-y-2">
              <Label htmlFor="target-function" className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Função Vinculada
              </Label>
              <Select
                value={editingTemplate?.targetFunction || 'none'}
                onValueChange={(value) => setEditingTemplate({ 
                  ...editingTemplate!, 
                  targetFunction: value === 'none' ? undefined : value 
                })}
              >
                <SelectTrigger id="target-function">
                  <SelectValue placeholder="Selecione onde este prompt será usado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (usar em qualquer lugar)</SelectItem>
                  {TARGET_FUNCTIONS.map((func) => (
                    <SelectItem key={func.id} value={func.id}>
                      {func.icon} {func.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Vincule este prompt a uma função específica para que apareça automaticamente lá.
              </p>
            </div>

            {/* Variables */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <Label className="text-sm font-medium text-blue-900 dark:text-blue-100 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Variáveis Disponíveis (clique para inserir):
              </Label>
              <div className="flex flex-wrap gap-2 mt-3">
                <TooltipProvider>
                  {VARIABLES.map((variable) => (
                    <Tooltip key={variable.name}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "text-xs font-mono h-8",
                            variable.required 
                              ? "border-primary text-primary hover:bg-primary/10" 
                              : "hover:border-primary/50"
                          )}
                          onClick={() => insertVariable(variable.name)}
                        >
                          {variable.name}
                          {variable.required && <span className="ml-1 text-red-500">*</span>}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>{variable.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-3">
                * = Obrigatório | Passe o mouse sobre cada variável para ver a descrição
              </p>
            </div>

            {/* JSON Output */}
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <Label className="text-sm font-medium text-amber-900 dark:text-amber-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Formato de saída (referência; o executor define se pede HTML ou JSON):
              </Label>
              <pre className="text-xs mt-3 p-3 bg-white dark:bg-black/20 rounded-md overflow-x-auto font-mono border">
                {JSON_OUTPUT}
              </pre>
              <div className="flex items-center gap-1.5 mt-3 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                Dica: diga no prompt como entregar a saída (HTML do corpo, sem H1, ou JSON com content_html). Os campos acima são só referência
              </div>
            </div>

            {/* Prompt Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="template-prompt">Prompt</Label>
                {getRelatedDefaultTemplate(editingTemplate?.type) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => handleResetToDefault(editingTemplate!)}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Restaurar padrão
                  </Button>
                )}
              </div>
              <Textarea
                ref={textareaRef}
                id="template-prompt"
                value={editingTemplate?.prompt || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate!, prompt: e.target.value })}
                rows={20}
                maxLength={16000}
                className="font-mono text-sm resize-y min-h-[300px]"
                placeholder="Escreva seu prompt aqui..."
              />
              <p className={`text-xs ${(editingTemplate?.prompt?.length || 0) > 15000 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {editingTemplate?.prompt?.length || 0} / 16.000 caracteres
              </p>
            </div>
          </div>

          {/* Actions */}
          <DialogFooter className="px-6 py-4 border-t flex-shrink-0">
            <div className="flex items-center justify-between w-full">
              <div />
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCloseEditor}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={updateTemplate.isPending || !hasUnsavedChanges}
                  className="min-w-[100px]"
                >
                  {updateTemplate.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo de prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O modelo será permanentemente excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteTemplate.mutate(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTemplate.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
