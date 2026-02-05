import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNewsAgents } from '@/hooks/useNewsAgents';
import { useProjects } from '@/hooks/useProjects';

const formSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  project_id: z.string().optional(),
  language: z.string().default('pt-BR'),
  country: z.string().default('BR'),
});

type FormData = z.infer<typeof formSchema>;

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAgentDialog({ open, onOpenChange }: CreateAgentDialogProps) {
  const { createAgent } = useNewsAgents();
  const { projects } = useProjects();
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState('');

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      project_id: '',
      language: 'pt-BR',
      country: 'BR',
    },
  });

  const addTopic = () => {
    const trimmed = topicInput.trim();
    if (trimmed && !topics.includes(trimmed)) {
      setTopics([...topics, trimmed]);
      setTopicInput('');
    }
  };

  const removeTopic = (topic: string) => {
    setTopics(topics.filter(t => t !== topic));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTopic();
    }
  };

  const onSubmit = (data: FormData) => {
    if (topics.length === 0) {
      form.setError('name', { message: 'Adicione pelo menos um tópico' });
      return;
    }

    createAgent.mutate({
      name: data.name,
      project_id: data.project_id || undefined,
      topics,
      language: data.language,
      country: data.country,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        form.reset();
        setTopics([]);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar Novo Agente</DialogTitle>
          <DialogDescription>
            Configure um agente para monitorar notícias e gerar artigos automaticamente.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Agente</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Monitor de Tecnologia" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Tópicos para Monitorar *</FormLabel>
              <div className="flex gap-2">
                <Input 
                  placeholder="Digite um tópico e pressione Enter"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <Button type="button" variant="outline" size="icon" onClick={addTopic}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {topics.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {topics.map((topic) => (
                    <Badge key={topic} variant="secondary" className="gap-1">
                      {topic}
                      <button 
                        type="button"
                        onClick={() => removeTopic(topic)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <FormDescription>
                Adicione tópicos que o agente irá monitorar para gerar notícias.
              </FormDescription>
            </div>

            <FormField
              control={form.control}
              name="project_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site WordPress (Opcional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um projeto..." />
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
                  <FormDescription>
                    Vincule a um projeto para publicação automática.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Idioma</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pt-BR">Português (BR)</SelectItem>
                        <SelectItem value="en-US">English (US)</SelectItem>
                        <SelectItem value="es-ES">Español</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>País</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="BR">Brasil</SelectItem>
                        <SelectItem value="US">Estados Unidos</SelectItem>
                        <SelectItem value="PT">Portugal</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createAgent.isPending}>
                {createAgent.isPending ? 'Criando...' : 'Criar Agente'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
