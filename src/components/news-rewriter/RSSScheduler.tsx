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
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ScheduledFeed {
  id: string;
  feed_url: string;
  feed_name: string;
  niche: string;
  article_length: string;
  frequency: string;
  auto_publish: boolean;
  project_id: string | null;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  articles_generated: number;
}

interface NewFeedState {
  feed_url: string;
  feed_name: string;
  niche: string;
  article_length: string;
  frequency: string;
  auto_publish: boolean;
}

const FREQUENCY_OPTIONS = [
  { value: 'hourly', label: 'A cada hora', description: '24x por dia' },
  { value: 'twice_daily', label: '2x por dia', description: '08:00 e 18:00' },
  { value: 'daily', label: 'Diariamente', description: '09:00' },
  { value: 'weekly', label: 'Semanalmente', description: 'Segundas 09:00' },
];

const NICHE_OPTIONS = [
  { value: 'geral', label: 'Geral' },
  { value: 'advocacia', label: 'Advocacia / Jurídico' },
  { value: 'saude', label: 'Saúde / Medicina' },
  { value: 'beleza', label: 'Beleza / Estética' },
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'marketing', label: 'Marketing' },
];

interface RSSSchedulerProps {
  projectId?: string;
}

export function RSSScheduler({ projectId }: RSSSchedulerProps) {
  const [feeds, setFeeds] = useState<ScheduledFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableExists, setTableExists] = useState(true);
  const { toast } = useToast();

  // New feed form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFeed, setNewFeed] = useState<NewFeedState>({
    feed_url: '',
    feed_name: '',
    niche: 'geral',
    article_length: 'medium',
    frequency: 'daily',
    auto_publish: false,
  });

  const fetchFeeds = async () => {
    setLoading(true);
    try {
      // Use raw query to check if table exists
      const { data, error } = await (supabase as any)
        .from('rss_schedules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Table doesn't exist yet
        if (error.message?.includes('does not exist') || error.code === '42P01') {
          setTableExists(false);
          setFeeds([]);
        } else {
          console.error('Error fetching feeds:', error);
        }
      } else {
        setTableExists(true);
        setFeeds((data as ScheduledFeed[]) || []);
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

      const { error } = await (supabase as any)
        .from('rss_schedules')
        .insert({
          user_id: user.id,
          project_id: projectId || null,
          ...newFeed,
          is_active: true,
          articles_generated: 0,
        });

      if (error) throw error;

      toast({
        title: 'Feed agendado!',
        description: `O feed "${newFeed.feed_name}" será monitorado automaticamente`,
      });

      setShowAddForm(false);
      setNewFeed({
        feed_url: '',
        feed_name: '',
        niche: 'geral',
        article_length: 'medium',
        frequency: 'daily',
        auto_publish: false,
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
      const { error } = await (supabase as any)
        .from('rss_schedules')
        .update({ is_active: isActive })
        .eq('id', feedId);

      if (error) throw error;

      setFeeds(prev => prev.map(f => 
        f.id === feedId ? { ...f, is_active: isActive } : f
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
      const { error } = await (supabase as any)
        .from('rss_schedules')
        .delete()
        .eq('id', feedId);

      if (error) throw error;

      setFeeds(prev => prev.filter(f => f.id !== feedId));
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
              O sistema de agendamento está sendo configurado. 
              Por favor, aguarde alguns minutos e recarregue a página.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Agendamento de Feeds RSS
            </CardTitle>
            <CardDescription>
              Monitore feeds automaticamente e gere artigos conforme cronograma
            </CardDescription>
          </div>
          <Button
            variant={showAddForm ? "outline" : "default"}
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
        {/* Add Form */}
        {showAddForm && (
          <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>URL do Feed RSS</Label>
                <Input
                  placeholder="https://site.com/feed.xml"
                  value={newFeed.feed_url}
                  onChange={(e) => setNewFeed(prev => ({ ...prev, feed_url: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nome do Feed</Label>
                <Input
                  placeholder="Ex: G1 - Tecnologia"
                  value={newFeed.feed_name}
                  onChange={(e) => setNewFeed(prev => ({ ...prev, feed_name: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Nicho</Label>
                <Select
                  value={newFeed.niche}
                  onValueChange={(v) => setNewFeed(prev => ({ ...prev, niche: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tamanho do Artigo</Label>
                <Select
                  value={newFeed.article_length}
                  onValueChange={(v) => setNewFeed(prev => ({ ...prev, article_length: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Curto (400-600)</SelectItem>
                    <SelectItem value="medium">Médio (600-1000)</SelectItem>
                    <SelectItem value="long">Longo (1000-1500)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Frequência</Label>
                <Select
                  value={newFeed.frequency}
                  onValueChange={(v) => setNewFeed(prev => ({ ...prev, frequency: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="auto-publish"
                  checked={newFeed.auto_publish}
                  onCheckedChange={(v) => setNewFeed(prev => ({ ...prev, auto_publish: v }))}
                />
                <Label htmlFor="auto-publish" className="text-sm">
                  Auto-publicar no WordPress (quando aprovado)
                </Label>
              </div>
              <Button onClick={handleAddFeed} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Salvar Agendamento
              </Button>
            </div>
          </div>
        )}

        {/* Feeds List */}
        {feeds.length === 0 && !showAddForm ? (
          <div className="text-center py-8 text-muted-foreground">
            <Rss className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Nenhum feed agendado ainda</p>
            <p className="text-xs">Clique em "Novo Agendamento" para começar</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {feeds.map((feed) => (
                <div
                  key={feed.id}
                  className={cn(
                    "p-3 border rounded-lg transition-colors",
                    feed.is_active ? "bg-background" : "bg-muted/50 opacity-75"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Rss className={cn("w-4 h-4", feed.is_active ? "text-primary" : "text-muted-foreground")} />
                        <span className="font-medium text-sm">{feed.feed_name}</span>
                        <Badge variant={feed.is_active ? "default" : "secondary"} className="text-xs">
                          {feed.is_active ? 'Ativo' : 'Pausado'}
                        </Badge>
                        {feed.auto_publish && (
                          <Badge variant="outline" className="text-xs">
                            Auto-publish
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {feed.feed_url}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {FREQUENCY_OPTIONS.find(f => f.value === feed.frequency)?.label || feed.frequency}
                        </span>
                        <span>
                          {NICHE_OPTIONS.find(n => n.value === feed.niche)?.label || feed.niche}
                        </span>
                        <span>
                          {feed.articles_generated} artigos gerados
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleFeedActive(feed.id, !feed.is_active)}
                      >
                        {feed.is_active ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
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
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
