import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  ArrowLeft,
  Clock,
  Rss,
  Link2,
  Plus,
  X,
  Loader2,
  Newspaper,
  Globe,
  MapPin,
  Image as ImageIcon,
  FileText,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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
  FormMessage,
} from '@/components/ui/form';
import { useNewsAgents } from '@/hooks/useNewsAgents';
import { useProjects } from '@/hooks/useProjects';
import { RSSFeedManager } from '@/components/news-agents/RSSFeedManager';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  agent_type: z.enum(['news', 'rss']),
  project_id: z.string().optional(),
  category: z.string().optional(),
  search_internal_links: z.boolean(),
  publish_status: z.string(),
  news_per_day: z.number().min(1).max(10),
  language: z.string(),
  country: z.string(),
  is_active: z.boolean(),
  image_generation: z.string(),
  prompt_template: z.string(),
  search_window: z.string(),
});

type FormData = z.infer<typeof formSchema>;

const DAYS = [
  { id: 'dom', label: 'Dom' },
  { id: 'seg', label: 'Seg' },
  { id: 'ter', label: 'Ter' },
  { id: 'qua', label: 'Qua' },
  { id: 'qui', label: 'Qui' },
  { id: 'sex', label: 'Sex' },
  { id: 'sab', label: 'Sáb' },
];

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? '00' : '30';
  return `${hour.toString().padStart(2, '0')}:${minute}`;
});

export default function CreateNewsAgent() {
  const navigate = useNavigate();
  const { createAgent } = useNewsAgents();
  const { projects } = useProjects();
  
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState('');
  const [rssFeeds, setRssFeeds] = useState<string[]>([]);
  const [rssFeedInput, setRssFeedInput] = useState('');
  const [activeDays, setActiveDays] = useState<string[]>(['seg', 'ter', 'qua', 'qui', 'sex']);
  const [executionTimes, setExecutionTimes] = useState<string[]>([]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      agent_type: 'news',
      project_id: '',
      category: '',
      search_internal_links: false,
      publish_status: 'draft',
      news_per_day: 1,
      language: 'pt-BR',
      country: 'BR',
      is_active: true,
      image_generation: 'ai',
      prompt_template: 'news_article',
      search_window: '24h',
    },
  });

  const agentType = form.watch('agent_type');

  const addTopic = () => {
    const trimmed = topicInput.trim();
    if (trimmed && !topics.includes(trimmed) && topics.length < 3) {
      setTopics([...topics, trimmed]);
      setTopicInput('');
    }
  };

  const addRssFeed = () => {
    const trimmed = rssFeedInput.trim();
    if (trimmed && !rssFeeds.includes(trimmed) && rssFeeds.length < 3) {
      setRssFeeds([...rssFeeds, trimmed]);
      setRssFeedInput('');
    }
  };

  const toggleDay = (day: string) => {
    setActiveDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const toggleTime = (time: string) => {
    setExecutionTimes(prev =>
      prev.includes(time)
        ? prev.filter(t => t !== time)
        : [...prev, time]
    );
  };

  const onSubmit = (data: FormData) => {
    // For news type, require topics; for rss type, require feeds
    if (agentType === 'news' && topics.length === 0) {
      return;
    }
    if (agentType === 'rss' && rssFeeds.length === 0) {
      return;
    }

    createAgent.mutate({
      name: data.name,
      project_id: data.project_id || undefined,
      topics,
      keywords: [],
      rss_feeds: rssFeeds,
      search_internal_links: data.search_internal_links,
      cite_sources_inline: true,
      auto_publish: data.publish_status === 'publish',
      post_type: data.prompt_template,
      language: data.language,
      country: data.country,
    }, {
      onSuccess: () => {
        navigate('/news-agents');
      }
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/news-agents')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Novo Agente de Notícias</h1>
        </div>

        {/* Agent Type Selection */}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-muted-foreground mb-3">Tipo de Agente</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => form.setValue('agent_type', 'news')}
                className={cn(
                  "p-4 rounded-lg border-2 text-left transition-all",
                  agentType === 'news' 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-primary">Agente de notícias</p>
                    <p className="text-sm text-muted-foreground">
                      Encontra a melhor notícia para publicar automaticamente para você
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => form.setValue('agent_type', 'rss')}
                className={cn(
                  "p-4 rounded-lg border-2 text-left transition-all",
                  agentType === 'rss' 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <Rss className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Alimentação automática</p>
                    <p className="text-sm text-muted-foreground">
                      Buscar as últimas notícias no feed cadastrado
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Informações Básicas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Agente *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Agente de Tecnologia" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="project_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Site WordPress *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {projects?.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name} ({project.domain})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categorias de Publicação (Opcional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione categorias..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="tecnologia">Tecnologia</SelectItem>
                            <SelectItem value="negocios">Negócios</SelectItem>
                            <SelectItem value="marketing">Marketing</SelectItem>
                            <SelectItem value="saude">Saúde</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                            Encontra posts do seu site para linkar no artigo (automático)
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

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="publish_status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Publicar como</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="draft">Rascunho</SelectItem>
                              <SelectItem value="pending">Pendente</SelectItem>
                              <SelectItem value="publish">Publicar</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="news_per_day"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notícias por dia (máx.: 10)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min={1} 
                              max={10}
                              {...field}
                              onChange={e => field.onChange(parseInt(e.target.value) || 1)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Globe className="w-4 h-4" />
                            Idioma
                          </FormLabel>
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
                          <FormLabel className="flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            País
                          </FormLabel>
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

                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          id="is_active"
                        />
                        <label htmlFor="is_active" className="text-sm">
                          Agente ativo (execução automática)
                        </label>
                      </div>
                    )}
                  />

                  {/* Active Days */}
                  <div className="space-y-2">
                    <FormLabel className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Dias ativos
                    </FormLabel>
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map((day) => (
                        <Button
                          key={day.id}
                          type="button"
                          variant={activeDays.includes(day.id) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleDay(day.id)}
                        >
                          {day.label}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O agente só será executado nos dias selecionados
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Right Column - Topics, RSS, Generation */}
              <div className="space-y-6">
                {/* Topics */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-destructive">Tópicos a Monitorar *</CardTitle>
                      <span className="text-sm text-muted-foreground">{topics.length}/3</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Busca notícias no Google News (um por linha, até 3)
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Ex: inteligência artificial, bitcoin..."
                        value={topicInput}
                        onChange={(e) => setTopicInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTopic())}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={addTopic} className="gap-1">
                      <Plus className="w-4 h-4" />
                      tópico
                    </Button>
                    {topics.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {topics.map((topic) => (
                          <Badge key={topic} variant="secondary" className="gap-1">
                            {topic}
                            <button type="button" onClick={() => setTopics(topics.filter(t => t !== topic))}>
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* RSS Feeds - Enhanced with new manager */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Rss className="w-5 h-5 text-primary" />
                      <CardTitle className="text-base">Feeds RSS</CardTitle>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Monitore portais e blogs automaticamente via RSS
                    </p>
                  </CardHeader>
                  <CardContent>
                    <RSSFeedManager
                      feeds={rssFeeds}
                      onFeedsChange={setRssFeeds}
                      maxFeeds={5}
                    />
                  </CardContent>
                </Card>

                {/* Generation Config */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Configurações de Geração
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="image_generation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" />
                            Imagem de destaque
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="ai">Gerar com IA</SelectItem>
                              <SelectItem value="stock">Buscar em banco de imagens</SelectItem>
                              <SelectItem value="none">Sem imagem</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">
                            Gerar imagens automaticamente para cada artigo
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="prompt_template"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prompt de</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="news_article">News Article (Jornalístico)</SelectItem>
                              <SelectItem value="blog_post">Blog Post (SEO Completo)</SelectItem>
                              <SelectItem value="summary">Resumo de Notícias</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">
                            Para editar prompts, acesse Configurações → Meus Prompts
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Execution Times */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Horários de Execução
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Selecione os horários de publicação * ({executionTimes.length}/1 selecionados)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Cada local = 1 notícia publicada. Primeira definição quantas notícias do dia acima.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-6 gap-2 max-h-60 overflow-y-auto">
                      {TIME_SLOTS.map((time) => (
                        <Button
                          key={time}
                          type="button"
                          variant={executionTimes.includes(time) ? "default" : "outline"}
                          size="sm"
                          className="text-xs"
                          onClick={() => toggleTime(time)}
                        >
                          {time}
                        </Button>
                      ))}
                    </div>

                    <FormField
                      control={form.control}
                      name="search_window"
                      render={({ field }) => (
                        <FormItem className="mt-4">
                          <FormLabel>Janela de busca</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1h">Última 1 hora</SelectItem>
                              <SelectItem value="6h">Últimas 6 horas</SelectItem>
                              <SelectItem value="12h">Últimas 12 horas</SelectItem>
                              <SelectItem value="24h">Últimas 24 horas</SelectItem>
                              <SelectItem value="48h">Últimas 48 horas</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
              <Button type="button" variant="outline" onClick={() => navigate('/news-agents')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createAgent.isPending} className="gap-2">
                {createAgent.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Newspaper className="w-4 h-4" />
                    Criar Agente
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
