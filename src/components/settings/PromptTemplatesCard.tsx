import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  Check,
  X,
  Save,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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

const DEFAULT_TEMPLATES = [
  {
    id: 'blog-seo',
    name: 'Postagem de blog (SEO completo)',
    description: 'Função: Você é um redator SEO sênior e sua tarefa é escrever um artigo de alta qualidade e humanizado ...',
    prompt: `Escreva um artigo completo pronto para publicação com linguagem clara, acessível, de fácil entendimento e escrito de forma fluída, como um humano escrevendo um artigo para um blog.

Dados do Projeto: Título Principal (H1): "\${title}" Idioma: \${language} Ano Atual: \${currentYear} Tamanho Alvo: \${articleLength} Tom de Voz: \${tone} (Deve transmitir autoridade e confiança) Ponto de Vista: \${pov}

🎯 DIRETRIZES AVANÇADAS DE SEO (GOOGLE RANKING FACTORS) 🎯
INTENÇÃO DE BUSCA & RETENÇÃO:

Responda à dúvida principal do usuário logo nos primeiros 2 parágrafos (Técnica BLUF: Bottom Line Up Front).

Use "ganchos" de curiosidade para manter o leitor no texto.

Otimize para Mobile: Parágrafos curtos (máximo 3-4 linhas), frases diretas.

SEMÂNTICA E NLP:

Não faça "keyword stuffing". Use sinônimos e termos semanticamente relacionados ao tópico principal.

ESTRUTURA DE AUTORIDADE (EEAT):

Demonstre Expertise: Inclua dados, estatísticas e referências.
Experiência: Escreva como alguém que já vivenciou o tema.
Autoridade: Cite fontes confiáveis quando aplicável.
Confiabilidade: Seja preciso e evite informações vagas.

ESTRUTURA HTML OBRIGATÓRIA:
- Use <h2> para subtítulos principais
- Use <h3> para sub-subtítulos
- Use <p> para parágrafos
- Use <ul>/<li> para listas quando apropriado
- Use <strong> para destaques importantes

RETORNE OBRIGATORIAMENTE um JSON válido com a seguinte estrutura:
{
  "titulo": "título otimizado para SEO",
  "slug": "slug-url-amigavel",
  "palavra-chave de foco": "keyword principal",
  "meta_description": "descrição de até 160 caracteres",
  "content_html": "<h2>...</h2><p>...</p>...",
  "tags": ["tag1", "tag2", "tag3"],
  "image": {
    "prompt": "descrição para gerar imagem destacada",
    "alt": "texto alternativo da imagem",
    "title": "título da imagem"
  }
}`,
    isDefault: true,
    type: 'blog',
  },
  {
    id: 'news-article',
    name: 'Notícia (Jornalístico)',
    description: 'Você é um jornalista profissional. Sua missão é redigir uma matéria no idioma ${linguagem} baseada ex ...',
    prompt: `Você é um jornalista profissional. Sua missão é redigir uma matéria no idioma \${language} baseada exclusivamente nas fontes fornecidas

OBJETIVO: Produzir um texto autoral, fluido, factual e com alta densidade jornalística.
TÍTULO: \${title}
TAMANHO DO ARTIGO: \${articleLength}
ESTILO: Pirâmide Invertida, Texto Autoral, Sem tom narrativo

🚨 REGRAS DE ESTILO - SIGA RIGOROSAMENTE 🚨

📝 REGRA 1 - ESTRUTURA E REESCRITA AUTORAL:
  - Comece pela pirâmide invertida: fato mais atual/decisivo primeiro.
  - REESCREVA 100% das frases: Evite espelhar a redação original. Use construção própria mantendo os fatos.
  - O conteúdo DEVE começar obrigatoriamente com um \`<h2>\` (subtítulo) de aproximadamente 150 caracteres, dando continuidade ao título principal.
  - Não use dois-pontos (:) em títulos ou subtítulos.
  - Parágrafos curtos e ritmo natural (alternando períodos curtos e médios).
  - Citação da fonte: O nome da fonte vem no início do contexto, cite ela ao final da Lead da noticia

📝 REGRA 2 - OBJETIVIDADE:
  - Sem adjetivos desnecessários ou superlativos vazios
  - Fatos primeiro, contexto depois
  - Não comece frases com "De acordo com" ou "Segundo"

📝 REGRA 3 - ESTRUTURA HTML:
  - Use <h2> para subtítulos
  - Use <p> para parágrafos
  - Use <blockquote> para citações diretas

RETORNE OBRIGATORIAMENTE um JSON válido com a seguinte estrutura:
{
  "titulo": "título da notícia",
  "slug": "slug-url-amigavel",
  "palavra-chave de foco": "keyword principal",
  "meta_description": "descrição de até 160 caracteres",
  "content_html": "<h2>...</h2><p>...</p>...",
  "tags": ["tag1", "tag2"],
  "image": {
    "prompt": "descrição para gerar imagem",
    "alt": "texto alternativo",
    "title": "título da imagem"
  }
}`,
    isDefault: true,
    type: 'news',
  },
  {
    id: 'tutorial',
    name: 'Artigo de Tutorial',
    description: 'Escreva seu prompt aqui usando as variáveis disponíveis....',
    prompt: `Você é um instrutor técnico experiente. Sua tarefa é criar um tutorial completo e didático sobre: \${title}

IDIOMA: \${language}
NÍVEL: Iniciante a Intermediário
TOM: \${tone}
TAMANHO: \${articleLength}

ESTRUTURA DO TUTORIAL:

1. INTRODUÇÃO
   - O que o leitor vai aprender
   - Pré-requisitos (se houver)
   - Tempo estimado

2. PASSO A PASSO
   - Divida em etapas claras e numeradas
   - Cada etapa deve ter um objetivo específico
   - Inclua exemplos práticos
   - Adicione dicas e alertas quando necessário

3. TROUBLESHOOTING
   - Problemas comuns e soluções
   - Erros frequentes a evitar

4. CONCLUSÃO
   - Resumo do que foi aprendido
   - Próximos passos sugeridos

FORMATAÇÃO HTML:
- <h2> para títulos de seção
- <h3> para subtítulos
- <ol>/<li> para passos numerados
- <ul>/<li> para listas
- <code> para código inline
- <pre><code> para blocos de código
- <div class="tip"> para dicas
- <div class="warning"> para alertas

RETORNE OBRIGATORIAMENTE um JSON válido:
{
  "titulo": "título do tutorial",
  "slug": "slug-url",
  "palavra-chave de foco": "keyword",
  "meta_description": "descrição até 160 chars",
  "content_html": "...",
  "tags": ["tutorial", "..."],
  "image": {
    "prompt": "...",
    "alt": "...",
    "title": "..."
  }
}`,
    isDefault: true,
    type: 'tutorial',
  },
];

const JSON_OUTPUT = `{
  "titulo": "...", "slug": "...", "palavra-chave de foco": "...",
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

  const { data: templates = [] } = useQuery({
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

  // Track unsaved changes
  useEffect(() => {
    if (editingTemplate && originalTemplate) {
      const hasChanges = 
        editingTemplate.name !== originalTemplate.name ||
        editingTemplate.prompt !== originalTemplate.prompt;
      setHasUnsavedChanges(hasChanges);
    }
  }, [editingTemplate, originalTemplate]);

  const createTemplate = useMutation({
    mutationFn: async ({ name, prompt, templateType }: { name: string; prompt: string; templateType?: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('prompt_templates')
        .insert({
          user_id: user.id,
          name,
          prompt,
          is_default: false,
          template_type: templateType || 'custom',
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
        description: data.prompt?.slice(0, 80) + '...',
        prompt: data.prompt,
        isDefault: false,
        type: data.template_type,
      });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; prompt?: string }) => {
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
      prompt: 'Escreva seu prompt aqui usando as variáveis disponíveis.\n\n${title}\n${language}\n${articleLength}\n${tone}\n${pov}\n\nRETORNE OBRIGATORIAMENTE um JSON válido:\n' + JSON_OUTPUT,
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
    });
  };

  const handleCustomizeDefault = async (template: TemplateData) => {
    // Create a personalized copy of a default template
    await createTemplate.mutateAsync({
      name: `${template.name} (personalizado)`,
      prompt: template.prompt,
      templateType: template.type || 'custom',
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
    if (!editingTemplate || editingTemplate.isDefault) return;
    
    updateTemplate.mutate({
      id: editingTemplate.id,
      name: editingTemplate.name,
      prompt: editingTemplate.prompt,
    });
  };

  const allTemplates: TemplateData[] = [
    ...DEFAULT_TEMPLATES,
    ...templates.map((t: any) => ({
      id: t.id,
      name: t.name,
      description: t.prompt?.slice(0, 80) + '...',
      prompt: t.prompt,
      isDefault: false,
      type: t.template_type,
    })),
  ];

  // Check if a user template is based on a default one
  const getRelatedDefaultTemplate = (type?: string) => {
    return DEFAULT_TEMPLATES.find(t => t.type === type);
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
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="link"
                        className="text-primary px-2"
                        onClick={() => template.isDefault 
                          ? handleCustomizeDefault(template) 
                          : handleEditTemplate(template)
                        }
                      >
                        {template.isDefault ? 'Personalizar' : 'Editar'}
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {template.isDefault ? (
                            <>
                              <DropdownMenuItem onClick={() => handleCustomizeDefault(template)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Criar versão personalizada
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicateTemplate(template)}>
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicar
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={() => handleEditTemplate(template)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicateTemplate(template)}>
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicar
                              </DropdownMenuItem>
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
                    className="bg-orange-500 hover:bg-orange-600"
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
                  {editingTemplate?.isDefault ? 'Visualizar' : 'Editar'}: {editingTemplate?.name}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1">
                  {editingTemplate?.isDefault 
                    ? 'Este é um modelo padrão. Crie uma versão personalizada para editar.'
                    : 'Edite o nome e o prompt do modelo. Clique nas variáveis para inseri-las.'}
                </DialogDescription>
              </div>
              {hasUnsavedChanges && !editingTemplate?.isDefault && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Alterações não salvas
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="template-name">Nome</Label>
              <Input
                id="template-name"
                value={editingTemplate?.name || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate!, name: e.target.value })}
                disabled={editingTemplate?.isDefault}
                placeholder="Nome do modelo de prompt"
              />
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
                          disabled={editingTemplate?.isDefault}
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
                Saída JSON Obrigatória (inclusa automaticamente):
              </Label>
              <pre className="text-xs mt-3 p-3 bg-white dark:bg-black/20 rounded-md overflow-x-auto font-mono border">
                {JSON_OUTPUT}
              </pre>
              <div className="flex items-center gap-1.5 mt-3 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                Seu prompt DEVE incluir instrução para retornar JSON com content_html
              </div>
            </div>

            {/* Prompt Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="template-prompt">Prompt</Label>
                {!editingTemplate?.isDefault && getRelatedDefaultTemplate(editingTemplate?.type) && (
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
                rows={18}
                className="font-mono text-sm resize-none"
                disabled={editingTemplate?.isDefault}
                placeholder="Escreva seu prompt aqui..."
              />
              <p className="text-xs text-muted-foreground">
                {editingTemplate?.prompt?.length || 0} caracteres
              </p>
            </div>
          </div>

          {/* Actions */}
          <DialogFooter className="px-6 py-4 border-t flex-shrink-0">
            <div className="flex items-center justify-between w-full">
              <div>
                {editingTemplate?.isDefault && (
                  <Button
                    variant="outline"
                    onClick={() => handleCustomizeDefault(editingTemplate)}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Criar versão personalizada
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCloseEditor}>
                  Cancelar
                </Button>
                {!editingTemplate?.isDefault && (
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
                )}
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
              Esta ação não pode ser desfeita. O modelo será permanentemente removido da sua conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteTemplate.mutate(deleteConfirm)}
              className="bg-destructive hover:bg-destructive/90"
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
