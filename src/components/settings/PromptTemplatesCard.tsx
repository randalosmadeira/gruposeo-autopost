import { useState } from 'react';
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
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  FileText,
  Plus,
  ChevronUp,
  ChevronDown,
  Info,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const VARIABLES = [
  { name: '${title}', required: true, description: 'Título do artigo' },
  { name: '${idioma}', required: true, description: 'Idioma do conteúdo (pt-BR, en, etc.)' },
  { name: '${articleLength}', required: false, description: 'Tamanho do artigo (curto, médio, longo)' },
  { name: '${tone}', required: false, description: 'Tom de voz (formal, casual, etc.)' },
  { name: '${pov}', required: false, description: 'Ponto de vista (primeira pessoa, terceira pessoa)' },
  { name: '${contextSection}', required: false, description: 'Seção de contexto adicional' },
  { name: '${sourcesContext}', required: false, description: 'Contexto das fontes de pesquisa' },
  { name: '${context}', required: false, description: 'Contexto geral' },
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

ESTRUTURA DE AUTORIDADE (EEAT):`,
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
  - Citação da fonte: O nome da fonte vem no início do contexto, cite ela ao final da Lead da noticia`,
    isDefault: true,
    type: 'news',
  },
];

const JSON_OUTPUT = `{
  "titulo": "...", "slug": "...", "palavra-chave de foco": "...",
  "meta_description": "...", "content_html": "<h2>...</h2>...",
  "tags": [...], "image": {"prompt": "...", "alt": "...", "title": "..."}
}`;

export function PromptTemplatesCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

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

  const createTemplate = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('prompt_templates')
        .insert({
          user_id: user.id,
          name,
          prompt: 'Escreva seu prompt aqui usando as variáveis disponíveis.',
          is_default: false,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setNewTemplateName('');
      setEditingTemplate(data);
      toast({
        title: 'Modelo criado!',
        description: 'O novo modelo de prompt foi criado.',
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
      toast({
        title: 'Modelo atualizado!',
        description: 'As alterações foram salvas.',
      });
    },
  });

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;
    setIsCreating(true);
    await createTemplate.mutateAsync(newTemplateName);
    setIsCreating(false);
  };

  const insertVariable = (variable: string) => {
    if (!editingTemplate) return;
    setEditingTemplate({
      ...editingTemplate,
      prompt: editingTemplate.prompt + ' ' + variable,
    });
  };

  const allTemplates = [
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
                      Variáveis: {VARIABLES.map(v => v.name).join(', ')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Templates List */}
              <div className="space-y-3">
                {allTemplates.map((template) => (
                  <div 
                    key={template.id}
                    className="p-4 border rounded-lg bg-background flex items-start justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{template.name}</h4>
                        {template.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            padrão
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {template.description}
                      </p>
                    </div>
                    <Button
                      variant="link"
                      className="text-primary"
                      onClick={() => setEditingTemplate(template)}
                    >
                      Personalizar
                    </Button>
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
      <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Editar: {editingTemplate?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={editingTemplate?.name || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                disabled={editingTemplate?.isDefault}
              />
            </div>

            {/* Variables */}
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <Label className="text-sm font-medium text-blue-900 dark:text-blue-100">
                📋 Variáveis Disponíveis (clique para inserir):
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {VARIABLES.map((variable) => (
                  <Button
                    key={variable.name}
                    variant="outline"
                    size="sm"
                    className={`text-xs ${variable.required ? 'border-primary text-primary' : ''}`}
                    onClick={() => insertVariable(variable.name)}
                    title={variable.description}
                  >
                    {variable.name}
                    {variable.required && ' *'}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                * = Obrigatório | Passe o mouse sobre cada variável para ver a descrição
              </p>
            </div>

            {/* JSON Output */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <Label className="text-sm font-medium text-amber-900 dark:text-amber-100">
                🔒 Saída JSON Obrigatória (inclusa automaticamente):
              </Label>
              <pre className="text-xs mt-2 p-2 bg-white dark:bg-black/20 rounded overflow-x-auto">
                {JSON_OUTPUT}
              </pre>
              <div className="flex items-center gap-1 mt-2 text-xs text-red-600">
                <AlertTriangle className="w-3 h-3" />
                Seu prompt DEVE incluir instrução para retornar JSON com content_html
              </div>
            </div>

            {/* Prompt Editor */}
            <div className="space-y-2">
              <Label>Incitar</Label>
              <Textarea
                value={editingTemplate?.prompt || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, prompt: e.target.value })}
                rows={15}
                className="font-mono text-sm"
                disabled={editingTemplate?.isDefault}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                Cancelar
              </Button>
              {!editingTemplate?.isDefault && (
                <Button 
                  onClick={() => updateTemplate.mutate({
                    id: editingTemplate.id,
                    name: editingTemplate.name,
                    prompt: editingTemplate.prompt,
                  })}
                  disabled={updateTemplate.isPending}
                >
                  {updateTemplate.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Salvar
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
