import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  Globe,
  Clock,
  Settings2,
  Trash2,
  Edit,
  Rss,
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Target,
  FileText,
  Sparkles,
} from 'lucide-react';
import { useMonitoredPortals, type CreatePortalInput, type MonitoredPortal } from '@/hooks/useMonitoredPortals';
import { useProjects } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const FREQUENCY_OPTIONS = [
  { value: 'realtime', label: 'Tempo Real', description: 'Verificar a cada 15 minutos' },
  { value: 'hourly', label: 'Por Hora', description: 'Verificar a cada hora' },
  { value: 'daily', label: 'Diário', description: 'Verificar 1x ao dia' },
  { value: 'weekly', label: 'Semanal', description: 'Verificar 1x por semana' },
];

const ARTICLE_LENGTH_OPTIONS = [
  { value: 'short', label: 'Curto', description: '400-600 palavras' },
  { value: 'medium', label: 'Médio', description: '600-1000 palavras' },
  { value: 'long', label: 'Longo', description: '1000-1500 palavras' },
];

const DAYS_OPTIONS = [
  { value: 'seg', label: 'Seg' },
  { value: 'ter', label: 'Ter' },
  { value: 'qua', label: 'Qua' },
  { value: 'qui', label: 'Qui' },
  { value: 'sex', label: 'Sex' },
  { value: 'sab', label: 'Sáb' },
  { value: 'dom', label: 'Dom' },
];

interface AddPortalDialogProps {
  onAdd: (portal: CreatePortalInput) => Promise<MonitoredPortal>;
  isLoading: boolean;
  projects: Array<{ id: string; name: string; domain: string }>;
}

function AddPortalDialog({ onAdd, isLoading, projects }: AddPortalDialogProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<CreatePortalInput>({
    portal_name: '',
    portal_url: '',
    project_id: '',
    rss_feed_url: '',
    niches: [],
    preferred_keywords: [],
    article_length: 'medium',
    monitoring_frequency: 'hourly',
    active_days: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'],
    max_articles_per_day: 5,
    auto_publish: false,
    preserve_original_seo: true,
    seo_preservation_percent: 95,
    update_sitemap: true,
  });

  const [keywordsInput, setKeywordsInput] = useState('');
  const [nichesInput, setNichesInput] = useState('');

  const handleSubmit = async () => {
    if (!formData.portal_name || !formData.portal_url) return;

    await onAdd({
      ...formData,
      preferred_keywords: keywordsInput.split(',').map(k => k.trim()).filter(Boolean),
      niches: nichesInput.split(',').map(n => n.trim()).filter(Boolean),
    });

    setOpen(false);
    setFormData({
      portal_name: '',
      portal_url: '',
      project_id: '',
      rss_feed_url: '',
      niches: [],
      preferred_keywords: [],
      article_length: 'medium',
      monitoring_frequency: 'hourly',
      active_days: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'],
      max_articles_per_day: 5,
      auto_publish: false,
      preserve_original_seo: true,
      seo_preservation_percent: 95,
      update_sitemap: true,
    });
    setKeywordsInput('');
    setNichesInput('');
  };

  const toggleDay = (day: string) => {
    const days = formData.active_days || [];
    if (days.includes(day)) {
      setFormData({ ...formData, active_days: days.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, active_days: [...days, day] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Adicionar Portal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar Portal Monitorado</DialogTitle>
          <DialogDescription>
            Configure um portal para monitoramento automático 24/7
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="mt-4">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="basic">Básico</TabsTrigger>
            <TabsTrigger value="content">Conteúdo</TabsTrigger>
            <TabsTrigger value="schedule">Agenda</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="portal_name">Nome do Portal *</Label>
                <Input
                  id="portal_name"
                  placeholder="Ex: Migalhas, G1, Folha..."
                  value={formData.portal_name}
                  onChange={(e) => setFormData({ ...formData, portal_name: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="portal_url">URL do Portal *</Label>
                <Input
                  id="portal_url"
                  placeholder="https://www.migalhas.com.br"
                  value={formData.portal_url}
                  onChange={(e) => setFormData({ ...formData, portal_url: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="rss_feed_url">URL do Feed RSS (opcional)</Label>
                <Input
                  id="rss_feed_url"
                  placeholder="https://www.migalhas.com.br/rss"
                  value={formData.rss_feed_url || ''}
                  onChange={(e) => setFormData({ ...formData, rss_feed_url: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="project_id">Projeto WordPress de Destino</Label>
                <Select
                  value={formData.project_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, project_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (manual)</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name} ({project.domain})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="content" className="space-y-4 mt-4">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="niches">Nichos de Conteúdo</Label>
                <Input
                  id="niches"
                  placeholder="advocacia, tecnologia, marketing (separados por vírgula)"
                  value={nichesInput}
                  onChange={(e) => setNichesInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Defina os nichos para filtrar e adaptar o conteúdo
                </p>
              </div>

              <div>
                <Label htmlFor="keywords">Palavras-chave Preferidas</Label>
                <Input
                  id="keywords"
                  placeholder="direito digital, LGPD, cibersegurança (separados por vírgula)"
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                />
              </div>

              <div>
                <Label>Tamanho do Artigo</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {ARTICLE_LENGTH_OPTIONS.map((option) => (
                    <div
                      key={option.value}
                      className={cn(
                        "p-3 rounded-lg border-2 cursor-pointer transition-all text-center",
                        formData.article_length === option.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      )}
                      onClick={() => setFormData({ ...formData, article_length: option.value as any })}
                    >
                      <p className="font-medium text-sm">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="default_angle">Ângulo de Análise Padrão</Label>
                <Input
                  id="default_angle"
                  placeholder="Ex: Impacto para consumidores brasileiros"
                  value={formData.default_angle || ''}
                  onChange={(e) => setFormData({ ...formData, default_angle: e.target.value })}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4 mt-4">
            <div className="grid gap-4">
              <div>
                <Label>Frequência de Monitoramento</Label>
                <Select
                  value={formData.monitoring_frequency}
                  onValueChange={(value: any) => setFormData({ ...formData, monitoring_frequency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label} - {option.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Dias Ativos</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {DAYS_OPTIONS.map((day) => (
                    <Badge
                      key={day.value}
                      variant={formData.active_days?.includes(day.value) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleDay(day.value)}
                    >
                      {day.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="max_articles">Máximo de Artigos por Dia</Label>
                <Input
                  id="max_articles"
                  type="number"
                  min={1}
                  max={50}
                  value={formData.max_articles_per_day}
                  onChange={(e) => setFormData({ ...formData, max_articles_per_day: parseInt(e.target.value) || 5 })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Publicar Automaticamente</Label>
                  <p className="text-xs text-muted-foreground">
                    Publicar no WordPress sem revisão manual
                  </p>
                </div>
                <Switch
                  checked={formData.auto_publish}
                  onCheckedChange={(checked) => setFormData({ ...formData, auto_publish: checked })}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="seo" className="space-y-4 mt-4">
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Preservar SEO Original (95%)</Label>
                  <p className="text-xs text-muted-foreground">
                    Manter título e keywords para indexação
                  </p>
                </div>
                <Switch
                  checked={formData.preserve_original_seo}
                  onCheckedChange={(checked) => setFormData({ ...formData, preserve_original_seo: checked })}
                />
              </div>

              {formData.preserve_original_seo && (
                <div>
                  <Label>Percentual de Preservação SEO</Label>
                  <Input
                    type="number"
                    min={50}
                    max={100}
                    value={formData.seo_preservation_percent}
                    onChange={(e) => setFormData({ ...formData, seo_preservation_percent: parseInt(e.target.value) || 95 })}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="custom_slug_prefix">Prefixo de URL Customizado</Label>
                <Input
                  id="custom_slug_prefix"
                  placeholder="Ex: noticias, blog, artigos"
                  value={formData.custom_slug_prefix || ''}
                  onChange={(e) => setFormData({ ...formData, custom_slug_prefix: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Será adicionado antes do slug: /prefixo/slug-do-artigo
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Atualizar Sitemap Automaticamente</Label>
                  <p className="text-xs text-muted-foreground">
                    Notificar motores de busca após publicação
                  </p>
                </div>
                <Switch
                  checked={formData.update_sitemap}
                  onCheckedChange={(checked) => setFormData({ ...formData, update_sitemap: checked })}
                />
              </div>

              {formData.update_sitemap && (
                <div>
                  <Label>Prioridade no Sitemap</Label>
                  <Select
                    value={String(formData.sitemap_priority)}
                    onValueChange={(value) => setFormData({ ...formData, sitemap_priority: parseFloat(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1.0">1.0 (Máxima)</SelectItem>
                      <SelectItem value="0.8">0.8 (Alta)</SelectItem>
                      <SelectItem value="0.6">0.6 (Média)</SelectItem>
                      <SelectItem value="0.4">0.4 (Baixa)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isLoading || !formData.portal_name || !formData.portal_url}
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Adicionar Portal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PortalCardProps {
  portal: MonitoredPortal;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (portal: MonitoredPortal) => void;
}

function PortalCard({ portal, onToggle, onDelete, onEdit }: PortalCardProps) {
  return (
    <Card className={cn("transition-all", !portal.is_active && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              portal.is_active ? "bg-primary/10" : "bg-muted"
            )}>
              <Globe className={cn("w-5 h-5", portal.is_active ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {portal.portal_name}
                {portal.is_active ? (
                  <Badge variant="default" className="text-xs">Ativo</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Pausado</Badge>
                )}
              </CardTitle>
              <CardDescription className="flex items-center gap-1">
                <a 
                  href={portal.portal_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:underline flex items-center gap-1"
                >
                  {portal.portal_domain}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={portal.is_active}
              onCheckedChange={(checked) => onToggle(portal.id, checked)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="capitalize">{portal.monitoring_frequency}</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span>{portal.articles_generated} artigos</span>
          </div>
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-muted-foreground" />
            <span className="capitalize">{portal.article_length}</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <span>{portal.seo_preservation_percent}% SEO</span>
          </div>
        </div>

        {portal.niches?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {portal.niches.map((niche, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {niche}
              </Badge>
            ))}
          </div>
        )}

        {portal.last_check_at && (
          <p className="text-xs text-muted-foreground">
            Última verificação: {formatDistanceToNow(new Date(portal.last_check_at), { addSuffix: true, locale: ptBR })}
          </p>
        )}

        {portal.last_error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            {portal.last_error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(portal)}>
            <Edit className="w-4 h-4 mr-1" />
            Editar
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(portal.id)}>
            <Trash2 className="w-4 h-4 mr-1" />
            Remover
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function MonitoredPortalsManager() {
  const { portals, isLoading, createPortal, deletePortal, toggleActive, isCreating } = useMonitoredPortals();
  const { projects } = useProjects();

  const activePortals = portals.filter(p => p.is_active);
  
  // Fetch real article counts from articles table
  const [realArticleCounts, setRealArticleCounts] = useState<Record<string, number>>({});
  
  useEffect(() => {
    const fetchCounts = async () => {
      if (!portals.length) return;
      const portalNames = portals.map(p => p.portal_name);
      
      const { data } = await supabase
        .from('articles')
        .select('config')
        .eq('config->>type', 'rewrite');
      
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((article: any) => {
          const sourceName = article.config?.source_name;
          if (sourceName && portalNames.includes(sourceName)) {
            counts[sourceName] = (counts[sourceName] || 0) + 1;
          }
        });
        setRealArticleCounts(counts);
      }
    };
    fetchCounts();

    // Realtime updates
    const channel = supabase
      .channel('portal-articles-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'articles' }, () => {
        fetchCounts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [portals]);

  const totalArticles = Object.values(realArticleCounts).reduce((sum, c) => sum + c, 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{portals.length}</p>
                <p className="text-xs text-muted-foreground">Portais</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activePortals.length}</p>
                <p className="text-xs text-muted-foreground">Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalArticles}</p>
                <p className="text-xs text-muted-foreground">Artigos Gerados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Rss className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">24/7</p>
                <p className="text-xs text-muted-foreground">Monitoramento</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Portais Monitorados</h3>
          <p className="text-sm text-muted-foreground">
            Configure fontes de conteúdo para repostagem automática
          </p>
        </div>
        <AddPortalDialog 
          onAdd={createPortal} 
          isLoading={isCreating}
          projects={projects || []}
        />
      </div>

      {/* Portal List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : portals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum portal configurado</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Adicione portais para monitorar e gerar conteúdo automaticamente
            </p>
            <AddPortalDialog 
              onAdd={createPortal} 
              isLoading={isCreating}
              projects={projects || []}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {portals.map((portal) => (
            <PortalCard
              key={portal.id}
              portal={portal}
              onToggle={toggleActive}
              onDelete={deletePortal}
              onEdit={() => {/* TODO: Edit modal */}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
