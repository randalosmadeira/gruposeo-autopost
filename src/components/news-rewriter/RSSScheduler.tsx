import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Calendar,
  Clock,
  Rss,
  Plus,
  Trash2,
  Play,
  Pause,
  Loader2,
  AlertCircle,
  Bot,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface EditorialDecisionSummary {
  niche?: string | null;
  angle?: string | null;
  length?: string | null;
  trigger?: string | null;
  risk?: string | null;
  review_required?: boolean | null;
}

interface ScheduledFeed {
  id: string;
  feed_url: string;
  feed_name: string;
  niche: string;
  article_length: string;
  frequency: string;
  auto_publish: boolean;
  editorial_autonomy?: boolean;
  project_id: string | null;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  articles_generated: number;
  last_decision?: EditorialDecisionSummary | null;
  last_error?: string | null;
}

interface NewFeedState {
  feed_url: string;
  feed_name: string;
  niche: string;
  article_length: string;
  frequency: string;
  auto_publish: boolean;
  editorial_autonomy: boolean;
}

const FREQUENCY_OPTIONS = [
  { value: 'hourly', label: 'A cada hora', description: 'Até 24 verificações por dia' },
  { value: 'twice_daily', label: '2x por dia', description: 'A cada 12 horas' },
  { value: 'daily', label: 'Diariamente', description: 'A cada 24 horas' },
  { value: 'weekly', label: 'Semanalmente', description: 'A cada 7 dias' },
];

const NICHE_OPTIONS = [
  { value: 'auto', label: 'Automático por IA' },
  { value: 'geral', label: 'Geral' },
  { value: 'advocacia', label: 'Advocacia / Jurídico' },
  { value: 'saude', label: 'Saúde / Medicina' },
  { value: 'beleza', label: 'Beleza / Estética' },
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'marketing', label: 'Marketing' },
];

const COMBINED_NICHE_PRESETS = [
  { value: 'saude_beleza', label: 'Saúde + Beleza', description: 'Bem-estar integral e estética' },
  { value: 'tecnologia_marketing', label: 'Tecnologia + Marketing', description: 'MarTech e estratégia digital' },
  { value: 'advocacia_tecnologia', label: 'Advocacia + Tech', description: 'Direito digital e regulamentação' },
  { value: 'advocacia_tecnologia_marketing', label: 'Advocacia + Tech + Marketing', description: 'Negócios digitais' },
  { value: 'tecnologia_crimes', label: 'Tech + Crimes Cibernéticos', description: 'Segurança digital' },
];

const LENGTH_LABELS: Record<string, string> = {
  auto: 'Automático por IA',
  short: 'Objetivo',
  medium: 'Padrão',
  long: 'Extenso',
  'very-long': 'Conteúdo pilar',
  'extra-long': 'Conteúdo pilar',
};

interface RSSSchedulerProps {
  projectId?: string;
}

export function RSSScheduler({ projectId }: RSSSchedulerProps) {
  const [feeds, setFeeds] = useState<ScheduledFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableExists, setTableExists] = useState(true);
  const { toast } = useToast();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newFeed, setNewFeed] = useState<NewFeedState>({
    feed_url: '',
    feed_name: '',
    niche: 'auto',
    article_length: 'auto',
    frequency: 'daily',
    auto_publish: false,
    editorial_autonomy: true,
  });

  const fetchFeeds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rss_schedules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.message?.includes('does not exist') || error.code === '42P01') {
          setTableExists(false);
          setFeeds([]);
        } else {
          console.error('Error fetching feeds:', error);
        }
      } else {
        setTableExists(true);
        setFeeds((data as unknown as ScheduledFeed[]) || []);
      }
    } catch (error) {
      console.error('Error fetching scheduled feeds:', error);
      setTableExists(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeeds();
  }, []);

  const handleAddFeed = async () => {
    if (!newFeed.feed_url || !newFeed.feed_name) {
      toast({
        title: 'Preencha todos os campos',
        description: 'URL e nome do feed são obrigatórios',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { error } = await supabase
        .from('rss_schedules')
        .insert({
          user_id: user.id,
          project_id: projectId || null,
          ...newFeed,
          editorial_autonomy: true,
          is_active: true,
          articles_generated: 0,
        } as never);

      if (error) throw error;

      toast({
        title: 'Feed agendado com autonomia de IA',
        description: `O rol de "${newFeed.feed_name}" será analisado artigo por artigo pelos agentes editoriais.`,
      });

      setShowAddForm(false);
      setNewFeed({
        feed_url: '',
        feed_name: '',
        niche: 'auto',
        article_length: 'auto',
        frequency: 'daily',
        auto_publish: false,
        editorial_autonomy: true,
      });
      fetchFeeds();
    } catch (error) {
      console.error('Error adding feed:', error);
      toast({
        title: 'Erro ao adicionar feed',
        description: error instanceof Error ? error.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleFeedActive = async (feedId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('rss_schedules')
        .update({ is_active: isActive })
        .eq('id', feedId);

      if (error) throw error;

      setFeeds((previous) => previous.map((feed) =>
        feed.id === feedId ? { ...feed, is_active: isActive } : feed
      ));

      toast({
        title: isActive ? 'Feed ativado' : 'Feed pausado',
        description: isActive ? 'O monitoramento foi retomado' : 'O monitoramento foi pausado',
      });
    } catch (error) {
      console.error('Error toggling feed:', error);
    }
  };

  const deleteFeed = async (feedId: string) => {
    try {
      const { error } = await supabase
        .from('rss_schedules')
        .delete()
        .eq('id', feedId);

      if (error) throw error;

      setFeeds((previous) => previous.filter((feed) => feed.id !== feedId));
      toast({
        title: 'Feed removido',
        description: 'O agendamento foi excluído',
      });
    } catch (error) {
      console.error('Error deleting feed:', error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!tableExists) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Agendamento de Feeds RSS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              O sistema de agendamento está sendo configurado. Aguarde alguns minutos e recarregue a página.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Agendamento de Feeds RSS
            </CardTitle>
            <CardDescription>
              Cada notícia do rol recebe decisão própria de nicho, ângulo, tamanho, palavra-chave, tom e gatilho emocional.
            </CardDescription>
          </div>
          <Button
            variant={showAddForm ? 'outline' : 'default'}
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? 'Cancelar' : (
              <>
                <Plus className="w-4 h-4 mr-1" />
                Novo Agendamento
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-primary/40 bg-primary/5">
          <Bot className="h-4 w-4 text-primary" />
          <AlertDescription className="space-y-1">
            <div className="flex items-center gap-2 font-medium text-foreground">
              Autonomia editorial dos agentes ativa
              <Badge variant="secondary" className="gap-1 text-xs">
                <Sparkles className="h-3 w-3" />
                Padrão obrigatório
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              As escolhas abaixo funcionam apenas como pistas. O agente pode corrigi-las conforme a fonte, o projeto, o risco e as decisões recentes do rol, evitando repetição mecânica.
            </p>
          </AlertDescription>
        </Alert>

        {showAddForm && (
          <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>URL do Feed RSS</Label>
                <Input
                  placeholder="https://site.com/feed.xml"
                  value={newFeed.feed_url}
                  onChange={(event) => setNewFeed((previous) => ({ ...previous, feed_url: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nome do Feed</Label>
                <Input
                  placeholder="Ex: STJ Notícias"
                  value={newFeed.feed_name}
                  onChange={(event) => setNewFeed((previous) => ({ ...previous, feed_name: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Pista de nicho</Label>
                <Select
                  value={newFeed.niche}
                  onValueChange={(value) => setNewFeed((previous) => ({ ...previous, niche: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                    {COMBINED_NICHE_PRESETS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">A IA pode selecionar outro nicho para cada item.</p>
              </div>

              <div className="space-y-2">
                <Label>Pista de tamanho</Label>
                <Select
                  value={newFeed.article_length}
                  onValueChange={(value) => setNewFeed((previous) => ({ ...previous, article_length: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático por IA</SelectItem>
                    <SelectItem value="short">Objetivo (1.200-1.800)</SelectItem>
                    <SelectItem value="medium">Padrão (2.400-3.600)</SelectItem>
                    <SelectItem value="long">Extenso (3.600-5.200)</SelectItem>
                    <SelectItem value="very-long">Conteúdo pilar (5.200-7.000)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">A extensão depende da complexidade e das evidências disponíveis.</p>
              </div>

              <div className="space-y-2">
                <Label>Frequência</Label>
                <Select
                  value={newFeed.frequency}
                  onValueChange={(value) => setNewFeed((previous) => ({ ...previous, frequency: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="auto-publish"
                  checked={newFeed.auto_publish}
                  onCheckedChange={(value) => setNewFeed((previous) => ({ ...previous, auto_publish: value }))}
                />
                <div>
                  <Label htmlFor="auto-publish" className="text-sm">
                    Auto-publicar no WordPress quando aprovado
                  </Label>
                  <p className="text-xs text-muted-foreground">A revisão, o risco e a confirmação editorial continuam obrigatórios.</p>
                </div>
              </div>
              <Button onClick={handleAddFeed} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
                Salvar Agendamento
              </Button>
            </div>
          </div>
        )}

        {feeds.length === 0 && !showAddForm ? (
          <div className="text-center py-8 text-muted-foreground">
            <Rss className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Nenhum feed agendado ainda</p>
            <p className="text-xs">Clique em Novo Agendamento para começar</p>
          </div>
        ) : (
          <ScrollArea className="h-[360px]">
            <div className="space-y-3">
              {feeds.map((feed) => {
                const decision = feed.last_decision;
                return (
                  <div
                    key={feed.id}
                    className={cn(
                      'p-3 border rounded-lg transition-colors',
                      feed.is_active ? 'bg-background' : 'bg-muted/50 opacity-75'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Rss className={cn('w-4 h-4', feed.is_active ? 'text-primary' : 'text-muted-foreground')} />
                          <span className="font-medium text-sm">{feed.feed_name}</span>
                          <Badge variant={feed.is_active ? 'default' : 'secondary'} className="text-xs">
                            {feed.is_active ? 'Ativo' : 'Pausado'}
                          </Badge>
                          <Badge variant="outline" className="text-xs gap-1 border-primary/40">
                            <Bot className="h-3 w-3" />
                            IA editorial
                          </Badge>
                          {feed.auto_publish && (
                            <Badge variant="outline" className="text-xs">
                              Auto-publicação
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {feed.feed_url}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {FREQUENCY_OPTIONS.find((option) => option.value === feed.frequency)?.label || feed.frequency}
                          </span>
                          <span>Pista: {NICHE_OPTIONS.find((option) => option.value === feed.niche)?.label || feed.niche}</span>
                          <span>Tamanho: {LENGTH_LABELS[feed.article_length] || feed.article_length}</span>
                          <span>{feed.articles_generated} artigos gerados</span>
                        </div>

                        {decision && (
                          <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2 text-xs">
                            <div className="flex items-center gap-1.5 font-medium text-primary">
                              <Sparkles className="h-3.5 w-3.5" />
                              Última decisão do agente
                            </div>
                            <p className="mt-1 text-muted-foreground">
                              {[decision.niche, decision.length, decision.trigger, decision.risk ? `risco ${decision.risk}` : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                            {decision.angle && <p className="mt-1 text-foreground line-clamp-2">{decision.angle}</p>}
                          </div>
                        )}

                        {feed.last_error && (
                          <p className="mt-2 text-xs text-destructive line-clamp-2">
                            Última execução: {feed.last_error}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => toggleFeedActive(feed.id, !feed.is_active)}
                        >
                          {feed.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteFeed(feed.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
