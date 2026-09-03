import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Globe, Clock, Trash2, Rss, CheckCircle2, XCircle, Loader2,
  ExternalLink, Sparkles, Play, Bot, ShieldCheck, FileText, Target,
} from 'lucide-react';
import { useMonitoredPortals, type CreatePortalInput, type MonitoredPortal } from '@/hooks/useMonitoredPortals';
import { useProjects } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const FREQUENCY_OPTIONS = [
  { value: 'realtime', label: 'A cada 15 minutos' },
  { value: 'hourly', label: 'A cada hora' },
  { value: 'daily', label: 'Uma vez ao dia' },
  { value: 'weekly', label: 'Uma vez por semana' },
] as const;

type ProjectOption = { id: string; name: string; domain: string };

function safeHost(value?: string | null) {
  try { return new URL(value || '').hostname.replace(/^www\./, ''); } catch { return ''; }
}

function AddPortalDialog({
  onAdd,
  isLoading,
  projects,
}: {
  onAdd: (portal: CreatePortalInput) => Promise<MonitoredPortal>;
  isLoading: boolean;
  projects: ProjectOption[];
}) {
  const [open, setOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const { toast } = useToast();
  const [formData, setFormData] = useState<CreatePortalInput>({
    portal_name: '', portal_url: '', project_id: '', rss_feed_url: '', automation_mode: 'ai_95',
    monitoring_frequency: 'hourly', max_articles_per_day: 5, auto_publish: true,
  });

  const reset = () => setFormData({
    portal_name: '', portal_url: '', project_id: '', rss_feed_url: '', automation_mode: 'ai_95',
    monitoring_frequency: 'hourly', max_articles_per_day: 5, auto_publish: true,
  });

  const handleSubmit = async () => {
    if (!formData.portal_name?.trim() || !formData.portal_url?.trim() || !formData.project_id) return;
    const portal = await onAdd(formData);
    setDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke('monitor-portals', {
        body: { force: true, portalId: portal.id, itemLimit: 1 },
      });
      if (error || data?.success === false) {
        toast({ title: 'Portal salvo; RSS ainda pendente', description: error?.message || data?.error || 'A validação será repetida automaticamente.', variant: 'destructive' });
      } else {
        toast({ title: 'Automação ativada', description: 'RSS validado e portal conectado ao pipeline de Repostagem IA 95%.' });
      }
    } finally {
      setDiscovering(false);
      setOpen(false);
      reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" />Adicionar portal</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo portal de Repostagem</DialogTitle>
          <DialogDescription>Informe somente a fonte e a operação. O agente decide os filtros editoriais.</DialogDescription>
        </DialogHeader>

        <Alert>
          <Bot className="h-4 w-4" />
          <AlertTitle>Modo IA 95%</AlertTitle>
          <AlertDescription>
            A IA analisa cada matéria e determina relevância, nicho, ângulo, extensão, palavra-chave, categoria, tags, risco e elegibilidade para publicação. Conteúdo de baixa confiança ou com fonte primária pendente fica em rascunho.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="portal-name">Nome do portal</Label>
            <Input id="portal-name" placeholder="Ex.: STJ Notícias, Agência Brasil, Migalhas" value={formData.portal_name} onChange={(e) => setFormData({ ...formData, portal_name: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="portal-url">URL principal do portal</Label>
            <Input id="portal-url" placeholder="https://portal.exemplo.com.br" value={formData.portal_url} onChange={(e) => setFormData({ ...formData, portal_url: e.target.value })} />
            <p className="text-xs text-muted-foreground">O sistema procura primeiro rel=&quot;alternate&quot; RSS/Atom e depois testa os fallbacks suportados.</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="rss-url">Feed RSS/Atom conhecido (opcional)</Label>
            <Input id="rss-url" placeholder="Deixe vazio para descoberta automática" value={formData.rss_feed_url || ''} onChange={(e) => setFormData({ ...formData, rss_feed_url: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Destino WordPress</Label>
            <Select value={formData.project_id || ''} onValueChange={(value) => setFormData({ ...formData, project_id: value })}>
              <SelectTrigger><SelectValue placeholder="Selecione o destino" /></SelectTrigger>
              <SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name} · {project.domain}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Frequência</Label>
            <Select value={formData.monitoring_frequency} onValueChange={(value: any) => setFormData({ ...formData, monitoring_frequency: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FREQUENCY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-articles">Limite diário por portal</Label>
            <Input id="max-articles" type="number" min={1} max={50} value={formData.max_articles_per_day || 5} onChange={(e) => setFormData({ ...formData, max_articles_per_day: Math.max(1, Math.min(50, Number(e.target.value) || 5)) })} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div><Label>Publicação automática</Label><p className="text-xs text-muted-foreground">Somente após todos os gates.</p></div>
            <Switch checked={formData.auto_publish !== false} onCheckedChange={(checked) => setFormData({ ...formData, auto_publish: checked })} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isLoading || discovering || !formData.portal_name?.trim() || !formData.portal_url?.trim() || !formData.project_id}>
            {(isLoading || discovering) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar e validar RSS
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PortalCard({ portal, project, onToggle, onDelete, onProcess }: {
  portal: MonitoredPortal;
  project?: ProjectOption;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onProcess: (portal: MonitoredPortal) => void;
}) {
  const validation = (portal.rss_feed_validation || {}) as Record<string, any>;
  const profile = (portal.last_ai_profile || {}) as Record<string, any>;
  const validated = Boolean(portal.rss_feed_url && portal.rss_feed_validated_at && validation.structure_valid !== false);
  return (
    <Card className={cn('h-full transition-all', !portal.is_active && 'opacity-60')}>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2"><Globe className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{portal.portal_name}</CardTitle>
              <CardDescription className="truncate">{portal.portal_domain || safeHost(portal.portal_url)}</CardDescription>
            </div>
          </div>
          <Switch checked={portal.is_active} onCheckedChange={(checked) => onToggle(portal.id, checked)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />IA 95%</Badge>
          <Badge variant={validated ? 'default' : 'outline'} className="gap-1">{validated ? <CheckCircle2 className="h-3 w-3" /> : <Rss className="h-3 w-3" />}{validated ? 'RSS validado' : 'RSS pendente'}</Badge>
          {portal.last_ai_confidence != null && <Badge variant="outline">Confiança {Math.round(portal.last_ai_confidence)}%</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <p className="font-medium">Destino</p>
          <p className="truncate text-muted-foreground">{project ? `${project.name} · ${project.domain}` : 'Projeto não localizado'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border p-2"><Clock className="mb-1 h-4 w-4 text-muted-foreground" /><strong>{FREQUENCY_OPTIONS.find((x) => x.value === portal.monitoring_frequency)?.label || portal.monitoring_frequency}</strong></div>
          <div className="rounded-md border p-2"><FileText className="mb-1 h-4 w-4 text-muted-foreground" /><strong>{portal.articles_generated || 0} gerados</strong><div className="text-muted-foreground">{portal.last_articles_found || 0} vistos na última leitura</div></div>
        </div>
        {profile.niche && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs font-medium"><Target className="h-4 w-4" />Última decisão da IA</div>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">{String(profile.niche)}</Badge>
              {profile.wordpress_category && <Badge variant="outline">{String(profile.wordpress_category)}</Badge>}
              {profile.risk_level && <Badge variant="outline">Risco {String(profile.risk_level)}</Badge>}
            </div>
            {profile.analysis_angle && <p className="line-clamp-2 text-xs text-muted-foreground">{String(profile.analysis_angle)}</p>}
          </div>
        )}
        {portal.rss_feed_url && <a href={portal.rss_feed_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">RSS: {portal.rss_feed_url}</a>}
        {portal.last_success_at && <p className="text-xs text-muted-foreground">Último sucesso {formatDistanceToNow(new Date(portal.last_success_at), { addSuffix: true, locale: ptBR })}</p>}
        {portal.last_error && <p className="flex items-start gap-1 text-xs text-destructive"><XCircle className="mt-0.5 h-3 w-3 shrink-0" />{portal.last_error}</p>}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button size="sm" onClick={() => onProcess(portal)} disabled={!portal.is_active}><Play className="mr-1 h-4 w-4" />Processar agora</Button>
          <Button size="sm" variant="outline" asChild><a href={portal.portal_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-4 w-4" />Portal</a></Button>
          <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => onDelete(portal.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function MonitoredPortalsManager() {
  const { portals, isLoading, createPortal, deletePortal, toggleActive, isCreating } = useMonitoredPortals();
  const { projects } = useProjects();
  const { toast } = useToast();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const projectOptions = (projects || []).map((project: any) => ({ id: project.id, name: project.name, domain: project.domain })) as ProjectOption[];
  const projectById = useMemo(() => new Map(projectOptions.map((project) => [project.id, project])), [projectOptions]);
  const active = portals.filter((portal) => portal.is_active).length;
  const validated = portals.filter((portal) => portal.rss_feed_url && portal.rss_feed_validated_at).length;
  const generated = portals.reduce((sum, portal) => sum + Number(portal.articles_generated || 0), 0);

  const processNow = async (portal: MonitoredPortal) => {
    setProcessingId(portal.id);
    try {
      const { data, error } = await supabase.functions.invoke('monitor-portals', { body: { force: true, portalId: portal.id } });
      if (error || data?.success === false) throw new Error(error?.message || data?.error || 'Falha no processamento');
      toast({ title: 'Portal processado', description: `${data?.articles_created || 0} artigo(s) criado(s); ${data?.wordpress_operations || 0} operação(ões) WordPress encaminhada(s).` });
    } catch (error) {
      toast({ title: 'Falha ao processar portal', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setProcessingId(null); }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Repostagem 95% automatizada</AlertTitle>
        <AlertDescription>RSS é descoberto e validado automaticamente. A IA classifica cada matéria antes de redigir; a publicação automática só ocorre quando revisão, originalidade, segurança editorial e confiança passam pelos gates.</AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{portals.length}</div><div className="text-xs text-muted-foreground">Portais cadastrados</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{active}</div><div className="text-xs text-muted-foreground">Monitorando</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{validated}</div><div className="text-xs text-muted-foreground">RSS validado</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{generated}</div><div className="text-xs text-muted-foreground">Artigos gerados</div></CardContent></Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="text-lg font-semibold">Portais e fontes</h3><p className="text-sm text-muted-foreground">Molduras operacionais com acesso direto, RSS, destino e última decisão do agente.</p></div>
        <AddPortalDialog onAdd={createPortal} isLoading={isCreating} projects={projectOptions} />
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : portals.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Rss className="mx-auto mb-4 h-10 w-10 text-muted-foreground" /><h4 className="font-medium">Nenhum portal configurado</h4><p className="mt-1 text-sm text-muted-foreground">Cadastre a URL principal; o RSS será descoberto automaticamente.</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {portals.map((portal) => <div key={portal.id} className={processingId === portal.id ? 'pointer-events-none opacity-70' : ''}><PortalCard portal={portal} project={portal.project_id ? projectById.get(portal.project_id) : undefined} onToggle={toggleActive} onDelete={deletePortal} onProcess={processNow} /></div>)}
        </div>
      )}
    </div>
  );
}
