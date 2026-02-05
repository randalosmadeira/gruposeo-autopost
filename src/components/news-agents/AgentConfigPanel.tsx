import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  X, 
  Play, 
  Globe, 
  Link2, 
  Quote, 
  List, 
  Send,
  Settings2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { NewsAgent, useNewsAgents } from '@/hooks/useNewsAgents';
import { useProjects } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';

const configSchema = z.object({
  project_id: z.string().optional(),
  search_internal_links: z.boolean(),
  cite_sources_inline: z.boolean(),
  cite_sources_footer: z.boolean(),
  auto_publish: z.boolean(),
  post_type: z.string(),
});

type ConfigFormData = z.infer<typeof configSchema>;

interface AgentConfigPanelProps {
  agent: NewsAgent;
  onClose: () => void;
}

export function AgentConfigPanel({ agent, onClose }: AgentConfigPanelProps) {
  const { updateAgent, toggleAgent } = useNewsAgents();
  const { projects } = useProjects();

  const form = useForm<ConfigFormData>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      project_id: agent.project_id || '',
      search_internal_links: agent.search_internal_links,
      cite_sources_inline: agent.cite_sources_inline,
      cite_sources_footer: agent.cite_sources_footer,
      auto_publish: agent.auto_publish,
      post_type: agent.post_type,
    },
  });

  useEffect(() => {
    form.reset({
      project_id: agent.project_id || '',
      search_internal_links: agent.search_internal_links,
      cite_sources_inline: agent.cite_sources_inline,
      cite_sources_footer: agent.cite_sources_footer,
      auto_publish: agent.auto_publish,
      post_type: agent.post_type,
    });
  }, [agent, form]);

  const onSubmit = (data: ConfigFormData) => {
    updateAgent.mutate({
      id: agent.id,
      ...data,
      project_id: data.project_id || undefined,
    });
  };

  const handleStart = () => {
    if (!agent.is_active) {
      toggleAgent.mutate({ id: agent.id, is_active: true });
    }
    // TODO: Trigger immediate news fetch
  };

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-background border-l shadow-lg z-50 overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Configuração
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Start Button */}
        <Button 
          className="w-full gap-2" 
          onClick={handleStart}
          disabled={toggleAgent.isPending}
        >
          <Play className="w-4 h-4" />
          INICIAR
          <span className="ml-auto text-xs opacity-70">
            {agent.topics.length} itens
          </span>
        </Button>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Site de Destino */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Globe className="w-4 h-4" />
                SITE DE DESTINO
              </div>
              
              <FormField
                control={form.control}
                name="project_id"
                render={({ field }) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects?.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <div>
                <FormLabel className="text-xs text-muted-foreground">Categorias</FormLabel>
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione categorias..." />
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
            </div>

            <Separator />

            {/* Options */}
            <div className="space-y-3">
              <FormField
                control={form.control}
                name="search_internal_links"
                render={({ field }) => (
                  <div className="flex items-start gap-3 p-3 rounded-lg border">
                    <Link2 className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <div className="flex-1">
                      <FormLabel className="text-sm font-medium">
                        Buscar Links Internos
                      </FormLabel>
                      <FormDescription className="text-xs">
                        Encontra posts do seu site para linkar
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                )}
              />

              <FormField
                control={form.control}
                name="cite_sources_inline"
                render={({ field }) => (
                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-primary/5 border-primary/20">
                    <Quote className="w-4 h-4 mt-0.5 text-primary" />
                    <div className="flex-1">
                      <FormLabel className="text-sm font-medium">
                        Citar Fontes no Texto
                      </FormLabel>
                      <FormDescription className="text-xs">
                        Adiciona links das fontes dentro do artigo
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="border-primary data-[state=checked]:bg-primary"
                      />
                    </FormControl>
                  </div>
                )}
              />

              <FormField
                control={form.control}
                name="cite_sources_footer"
                render={({ field }) => (
                  <div className="flex items-start gap-3 p-3 rounded-lg border">
                    <List className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <div className="flex-1">
                      <FormLabel className="text-sm font-medium">
                        Lista de Fontes no Final
                      </FormLabel>
                      <FormDescription className="text-xs">
                        Adiciona seção "Fontes" ao final do artigo
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                )}
              />
            </div>

            <Separator />

            {/* Publicação WP */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Send className="w-4 h-4" />
                PUBLICAÇÃO WP
              </div>

              <FormField
                control={form.control}
                name="auto_publish"
                render={({ field }) => (
                  <div className="flex items-center gap-3">
                    <span className="text-sm">combinar após gerar</span>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                )}
              />
            </div>

            <Separator />

            {/* Tipo de Post */}
            <FormField
              control={form.control}
              name="post_type"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <span>📄 Tipo de</span>
                  </div>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="blog">Blog Post (SEO Completo)</SelectItem>
                      <SelectItem value="news">Notícia Rápida</SelectItem>
                      <SelectItem value="summary">Resumo de Notícias</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {/* Save Button */}
            <Button 
              type="submit" 
              className="w-full"
              disabled={updateAgent.isPending}
            >
              {updateAgent.isPending ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
