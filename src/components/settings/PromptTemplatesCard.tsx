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

const TARGET_FUNCTIONS = [
  { id: 'article_generator', label: 'Gerador de Artigos', icon: '📝' },
  { id: 'news_rewriter', label: 'Repostagem Jornalística', icon: '📰' },
  { id: 'landing_page', label: 'Landing Pages', icon: '🎯' },
  { id: 'authority_planner', label: 'Planejador de Autoridade', icon: '📊' },
  { id: 'bulk_generator', label: 'Geração em Massa', icon: '⚡' },
  { id: 'image_generator', label: 'Geração de Imagens', icon: '🎨' },
  { id: 'content_variations', label: 'Variações de Conteúdo', icon: '🔄' },
];

const DEFAULT_TEMPLATES = [
  {
    id: 'blog-seo',
    name: 'Postagem de blog (SEO completo)',
    description: 'Redator SEO sênior - Artigo otimizado para ranqueamento Google com E-E-A-T',
    prompt: `# 📝 SISTEMA AVANÇADO DE GERAÇÃO DE ARTIGOS SEO

## 🎭 PERSONA
Você é um redator SEO sênior especializado em criar conteúdo que:
- Ranqueia na primeira página do Google
- Mantém usuários engajados (baixo bounce rate)
- Converte leitores em leads/clientes
- Demonstra E-E-A-T (Experience, Expertise, Authoritativeness, Trust)

## 📊 DADOS DO PROJETO
**Artigo:**
- Título Principal (H1): "\${title}"
- Idioma: \${language}
- Ano Atual: \${currentYear}

**Especificações:**
- Tamanho Alvo: \${articleLength} palavras
- Tom de Voz: \${tone}
- Ponto de Vista: \${pov}

## 🎯 INTENÇÃO DE BUSCA E ESTRATÉGIA

### Estratégia de Abertura (primeiros 150 palavras):
1. **Hook Emocional/Curiosidade** (1 frase impactante)
2. **Resposta Direta** à dúvida principal (técnica BLUF - Bottom Line Up Front)
3. **Promessa de Valor** (o que o leitor vai aprender)
4. **Credibilidade Sutil** (dados, estatísticas, experiência)

## 🏗️ ARQUITETURA DE CONTEÚDO

### Estrutura de Títulos:
**H2 (Subtítulos Principais):**
- Use palavras-chave LSI (Latent Semantic Indexing)
- Máximo 5-7 H2s para artigos médios
- Primeira letra maiúscula apenas (exceto nomes próprios)

**H3 (Subtítulos Secundários):**
- Suporte aos H2s
- Use variações long-tail da keyword
- Máximo 2-3 H3s por H2

### Padrão de Parágrafos:
- **Mobile-first**: 2-4 linhas por parágrafo
- **Primeira frase**: Forte, declarativa
- **Última frase**: Transição ou gancho para próxima seção

## 🧠 E-E-A-T: DEMONSTRANDO AUTORIDADE

### Experience (Experiência):
- Use exemplos de primeira mão
- Inclua insights práticos que só quem trabalha na área teria

### Expertise (Perícia):
- Use terminologia técnica apropriada (mas sempre explique)
- Cite dados e estatísticas de fontes confiáveis

### Authoritativeness (Autoridade):
- Referencie fontes autoritativas e estudos
- Use linguagem assertiva

### Trust (Confiança):
- Seja transparente sobre limitações
- Forneça informações verificáveis e atualizadas

## 📋 ESTRUTURA HTML OBRIGATÓRIA
Tags permitidas: p, strong, em, ul, ol, li, blockquote, a, table, tr, td, th, thead, tbody, h2, h3, h4, h5, h6
Tags PROIBIDAS: div, span, b, i, inline styles
Todos os links devem ter target="_blank" rel="noopener noreferrer"

## 📤 RETORNE OBRIGATORIAMENTE um JSON válido:
{
  "titulo": "título otimizado para SEO (máx 60 caracteres)",
  "slug": "slug-url-amigavel-com-keyword",
  "palavra-chave de foco": "keyword principal",
  "meta_description": "descrição persuasiva de até 160 caracteres",
  "content_html": "<h2>...</h2><p>...</p>...",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "image": {
    "prompt": "descrição detalhada para gerar imagem destacada fotorrealista",
    "alt": "texto alternativo descritivo com keyword",
    "title": "título da imagem"
  }
}`,
    isDefault: true,
    type: 'blog',
    targetFunction: 'article_generator',
  },
  {
    id: 'news-article',
    name: 'Notícia (Jornalístico)',
    description: 'Jornalista profissional - Matéria factual com pirâmide invertida',
    prompt: `# 📰 SISTEMA DE REDAÇÃO JORNALÍSTICA

## 🎭 PERSONA
Você é um jornalista profissional experiente. Sua missão é redigir uma matéria factual, autoral e com alta densidade jornalística.

## 📊 DADOS DA MATÉRIA
- Título: "\${title}"
- Idioma: \${language}
- Tamanho: \${articleLength}
- Estilo: Pirâmide Invertida

## 🚨 REGRAS DE ESTILO - SIGA RIGOROSAMENTE

### 📝 REGRA 1 - ESTRUTURA PIRÂMIDE INVERTIDA:
- Comece pelo fato mais atual/decisivo primeiro
- REESCREVA 100% das frases: Evite espelhar a redação original
- O conteúdo DEVE começar com um <h2> (subtítulo) de ~150 caracteres
- Não use dois-pontos (:) em títulos ou subtítulos
- Parágrafos curtos, ritmo natural (alternando períodos curtos e médios)

### 📝 REGRA 2 - OBJETIVIDADE JORNALÍSTICA:
- Sem adjetivos desnecessários ou superlativos vazios
- Fatos primeiro, contexto depois
- Não comece frases com "De acordo com" ou "Segundo"
- Responda às 5 perguntas: O quê, Quem, Quando, Onde, Por quê

### 📝 REGRA 3 - CONFORMIDADE (Lei 9.610/98):
- Reescreva completamente, não copie frases das fontes
- Use citações diretas apenas para declarações importantes
- Cite a fonte ao final da Lead da notícia

### 📋 ESTRUTURA HTML:
- <h2> para subtítulos
- <p> para parágrafos
- <blockquote> para citações diretas
- <strong> para destaques importantes

## 📤 RETORNE OBRIGATORIAMENTE um JSON válido:
{
  "titulo": "título factual da notícia",
  "slug": "slug-url-amigavel",
  "palavra-chave de foco": "keyword principal",
  "meta_description": "descrição de até 160 caracteres",
  "content_html": "<h2>...</h2><p>...</p>...",
  "tags": ["tag1", "tag2"],
  "image": {
    "prompt": "descrição para gerar imagem jornalística fotorrealista do fato",
    "alt": "texto alternativo",
    "title": "título da imagem"
  }
}`,
    isDefault: true,
    type: 'news',
    targetFunction: 'news_rewriter',
  },
  {
    id: 'tutorial',
    name: 'Artigo de Tutorial',
    description: 'Instrutor técnico - Tutorial passo a passo didático e completo',
    prompt: `# 📚 SISTEMA DE CRIAÇÃO DE TUTORIAIS

## 🎭 PERSONA
Você é um instrutor técnico experiente. Sua tarefa é criar um tutorial completo, didático e prático.

## 📊 DADOS DO TUTORIAL
- Título: "\${title}"
- Idioma: \${language}
- Nível: Iniciante a Intermediário
- Tom: \${tone}
- Tamanho: \${articleLength}

## 🏗️ ESTRUTURA OBRIGATÓRIA DO TUTORIAL

### 1. INTRODUÇÃO
- O que o leitor vai aprender
- Pré-requisitos (se houver)
- Tempo estimado de leitura/execução
- Para quem é este tutorial

### 2. PASSO A PASSO DETALHADO
- Divida em etapas claras e NUMERADAS
- Cada etapa deve ter um objetivo específico
- Inclua exemplos práticos e visuais
- Adicione "💡 Dica:" para insights úteis
- Adicione "⚠️ Atenção:" para alertas importantes

### 3. TROUBLESHOOTING (Solução de Problemas)
- Problemas mais comuns e suas soluções
- Erros frequentes a evitar
- Quando buscar ajuda adicional

### 4. CONCLUSÃO
- Resumo do que foi aprendido
- Próximos passos sugeridos
- Recursos adicionais para aprofundamento

## 📋 FORMATAÇÃO HTML:
- <h2> para títulos de seção
- <h3> para subtítulos
- <ol>/<li> para passos numerados
- <ul>/<li> para listas
- <code> para código inline
- <pre><code> para blocos de código
- <strong> para conceitos importantes

## 📤 RETORNE OBRIGATORIAMENTE um JSON válido:
{
  "titulo": "Como [ação] - Tutorial Completo \${currentYear}",
  "slug": "como-fazer-slug-tutorial",
  "palavra-chave de foco": "keyword do tutorial",
  "meta_description": "Aprenda passo a passo... (até 160 chars)",
  "content_html": "<h2>...</h2><ol><li>...</li></ol>...",
  "tags": ["tutorial", "passo-a-passo", "como-fazer"],
  "image": {
    "prompt": "imagem ilustrativa do processo/resultado do tutorial",
    "alt": "tutorial de [assunto]",
    "title": "Tutorial: [assunto]"
  }
}`,
    isDefault: true,
    type: 'tutorial',
    targetFunction: 'article_generator',
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
      const updates: Record<string, any> = {};
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
    if (!editingTemplate || editingTemplate.isDefault) return;
    
    updateTemplate.mutate({
      id: editingTemplate.id,
      name: editingTemplate.name,
      prompt: editingTemplate.prompt,
      agentName: editingTemplate.agentName || null,
      targetFunction: editingTemplate.targetFunction || null,
      description: editingTemplate.description || null,
    });
  };

  const allTemplates: TemplateData[] = [
    ...DEFAULT_TEMPLATES,
    ...templates.map((t: any) => ({
      id: t.id,
      name: t.name,
      description: t.description || t.prompt?.slice(0, 80) + '...',
      prompt: t.prompt,
      isDefault: false,
      type: t.template_type,
      agentName: t.agent_name,
      targetFunction: t.target_function,
    })),
  ];

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
                  {editingTemplate?.isDefault ? 'Visualizar' : 'Editar'}: {editingTemplate?.name}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1">
                  {editingTemplate?.isDefault 
                    ? 'Este é um modelo padrão. Crie uma versão personalizada para editar.'
                    : 'Edite o nome, descrição, vinculação e o prompt do modelo.'}
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
            {/* Name and Agent Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Nome do Modelo</Label>
                <Input
                  id="template-name"
                  value={editingTemplate?.name || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate!, name: e.target.value })}
                  disabled={editingTemplate?.isDefault}
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
                  disabled={editingTemplate?.isDefault}
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
                disabled={editingTemplate?.isDefault}
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
                disabled={editingTemplate?.isDefault}
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
                rows={20}
                maxLength={16000}
                className="font-mono text-sm resize-y min-h-[300px]"
                disabled={editingTemplate?.isDefault}
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
