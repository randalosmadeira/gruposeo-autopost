import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, Clock, Layers, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjects } from '@/hooks/useProjects';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type OutboxRow = {
  id?: number | string;
  event_id?: string;
  post_id?: number;
  status?: string;
  attempts?: number;
  next_attempt_at?: string | null;
  last_error?: string | null;
  created_at?: string;
  delivered_at?: string | null;
  content_hash?: string | null;
};

type BrainJob = {
  id: string;
  job_type: string;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  article_id?: string | null;
  last_error?: string | null;
  next_attempt_at?: string | null;
  created_at: string;
  updated_at: string;
};

function rowsFrom(payload: any): OutboxRow[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.events)) return payload.events;
  return [];
}

function fmt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function statusBadge(status = 'unknown') {
  const normalized = status.toLowerCase();
  if (['delivered', 'completed'].includes(normalized)) return <Badge className="bg-emerald-600">{status}</Badge>;
  if (['processing'].includes(normalized)) return <Badge className="bg-blue-600">{status}</Badge>;
  if (['pending', 'queued', 'retry'].includes(normalized)) return <Badge variant="secondary">{status}</Badge>;
  if (['failed', 'dead_letter', 'error'].includes(normalized)) return <Badge variant="destructive">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export default function QueueMonitor() {
  const { user } = useAuth();
  const { projects } = useProjects();
  const queryClient = useQueryClient();
  const connectedProjects = useMemo(() => projects?.filter((p) => p.is_connected && p.wordpress_url && p.wordpress_connector_mode === 'zica_posts') || [], [projects]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [retrying, setRetrying] = useState<string | number | null>(null);

  useEffect(() => {
    if (!selectedProject && connectedProjects[0]?.id) setSelectedProject(connectedProjects[0].id);
    if (selectedProject && !connectedProjects.some((p) => p.id === selectedProject)) setSelectedProject(connectedProjects[0]?.id || '');
  }, [connectedProjects, selectedProject]);

  const selected = connectedProjects.find((p) => p.id === selectedProject);

  const wordpress = useQuery({
    queryKey: ['zica-posts-outbox', selectedProject],
    enabled: Boolean(user && selectedProject),
    refetchInterval: autoRefresh ? 10_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('wordpress-operations', {
        body: { projectId: selectedProject, action: 'status' },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao consultar Zica Posts');
      return data;
    },
  });

  const brain = useQuery({
    queryKey: ['zica-brain-jobs', user?.id, selectedProject],
    enabled: Boolean(user?.id && selectedProject),
    refetchInterval: autoRefresh ? 10_000 : false,
    queryFn: async (): Promise<BrainJob[]> => {
      const { data, error } = await (supabase as any)
        .from('zica_brain_jobs')
        .select('id,job_type,status,priority,attempts,max_attempts,article_id,last_error,next_attempt_at,created_at,updated_at')
        .eq('user_id', user!.id)
        .eq('project_id', selectedProject)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`queue-monitor-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zica_brain_jobs', filter: `user_id=eq.${user.id}` }, () => queryClient.invalidateQueries({ queryKey: ['zica-brain-jobs'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wordpress_stats', filter: `user_id=eq.${user.id}` }, () => queryClient.invalidateQueries({ queryKey: ['zica-posts-outbox'] }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient, user?.id]);

  const outboxRows = useMemo(() => rowsFrom(wordpress.data?.outbox), [wordpress.data]);
  const outboxStats = useMemo(() => ({
    pending: outboxRows.filter((row) => ['pending', 'queued'].includes(String(row.status))).length,
    processing: outboxRows.filter((row) => row.status === 'processing').length,
    retry: outboxRows.filter((row) => row.status === 'retry').length,
    delivered: outboxRows.filter((row) => row.status === 'delivered').length,
    failed: outboxRows.filter((row) => ['failed', 'dead_letter'].includes(String(row.status))).length,
  }), [outboxRows]);

  const brainStats = useMemo(() => ({
    queued: (brain.data || []).filter((job) => job.status === 'queued').length,
    processing: (brain.data || []).filter((job) => job.status === 'processing').length,
    retry: (brain.data || []).filter((job) => job.status === 'retry').length,
    completed: (brain.data || []).filter((job) => job.status === 'completed').length,
    dead: (brain.data || []).filter((job) => job.status === 'dead_letter').length,
  }), [brain.data]);

  const refreshAll = async () => {
    await Promise.all([wordpress.refetch(), brain.refetch()]);
    toast.success('Filas reconciliadas');
  };

  const retryOutbox = async (row: OutboxRow) => {
    if (!selectedProject || !row.post_id) return;
    const key = row.event_id || row.id || row.post_id;
    setRetrying(key);
    try {
      const { data, error } = await supabase.functions.invoke('wordpress-operations', {
        body: { projectId: selectedProject, action: 'sync', postIds: [row.post_id] },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao reenfileirar');
      toast.success(`Post ${row.post_id} enviado para reprocessamento`);
      await wordpress.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao reprocessar');
    } finally {
      setRetrying(null);
    }
  };

  if (!connectedProjects.length) {
    return <div className="p-6"><Card className="border-dashed"><CardContent className="flex flex-col items-center py-12"><Activity className="mb-4 h-12 w-12 text-muted-foreground" /><h3 className="text-lg font-semibold">Nenhum Zica Posts conectado</h3><p className="mt-2 max-w-lg text-center text-sm text-muted-foreground">O monitor agora usa somente o contrato Zica Posts 3.10.2 e credenciais protegidas no backend/Vault.</p></CardContent></Card></div>;
  }

  const loading = wordpress.isLoading || brain.isLoading;
  const failures = outboxStats.failed + brainStats.dead;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Layers className="h-6 w-6 text-primary" /> Monitor de Filas</h1><p className="mt-1 text-sm text-muted-foreground">Outbox real do Zica Posts + fila persistente do Zica Brain. Nenhuma credencial WordPress é enviada ao navegador.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">{connectedProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <Button variant="outline" onClick={() => setAutoRefresh((v) => !v)}>{autoRefresh ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}{autoRefresh ? 'Tempo real' : 'Pausado'}</Button>
          <Button variant="outline" onClick={() => void refreshAll()}><RefreshCw className="mr-2 h-4 w-4" /> Atualizar</Button>
        </div>
      </div>

      {failures > 0 && <Card className="border-destructive/40 bg-destructive/5"><CardContent className="flex items-center gap-3 p-4"><AlertTriangle className="h-5 w-5 text-destructive" /><div><strong>{failures} falha(s) exigem atenção.</strong><div className="text-sm text-muted-foreground">Itens WordPress podem ser reenfileirados abaixo; dead letters do Brain permanecem visíveis para auditoria.</div></div></CardContent></Card>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[['WP pendentes', outboxStats.pending, Clock], ['WP processando', outboxStats.processing, RefreshCw], ['WP retry', outboxStats.retry, RotateCcw], ['WP entregues', outboxStats.delivered, CheckCircle2], ['WP falhas', outboxStats.failed, XCircle]].map(([label, value, Icon]: any) => <Card key={label}><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-muted-foreground" /><div>{loading ? <Skeleton className="h-6 w-8" /> : <div className="text-2xl font-bold">{value}</div>}<div className="text-xs text-muted-foreground">{label}</div></div></CardContent></Card>)}
      </div>

      <Tabs defaultValue="wordpress">
        <TabsList><TabsTrigger value="wordpress">Outbox WordPress</TabsTrigger><TabsTrigger value="brain">Zica Brain</TabsTrigger></TabsList>
        <TabsContent value="wordpress">
          <Card><CardHeader><CardTitle className="text-base">{selected?.name} · Zica Posts 3.10.2</CardTitle></CardHeader><CardContent className="space-y-2">
            {wordpress.isError && <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{wordpress.error instanceof Error ? wordpress.error.message : 'Falha no outbox'}</div>}
            {!wordpress.isLoading && !outboxRows.length && <div className="py-10 text-center text-sm text-muted-foreground">Outbox sem eventos pendentes.</div>}
            {outboxRows.map((row, index) => { const rowKey = row.event_id || row.id || `${row.post_id}-${index}`; const canRetry = Boolean(row.post_id && ['pending','retry','failed'].includes(String(row.status))); return <div key={String(rowKey)} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1.2fr_.7fr_.6fr_1fr_auto] md:items-center"><div className="min-w-0"><div className="font-medium">Post {row.post_id ?? '—'}</div><div className="truncate text-xs text-muted-foreground">{row.event_id || row.content_hash || 'evento Zica Posts'}</div></div><div>{statusBadge(row.status)}</div><div className="text-sm">{row.attempts ?? 0} tentativa(s)</div><div className="text-xs text-muted-foreground">Próxima: {fmt(row.next_attempt_at)}{row.last_error ? <div className="mt-1 line-clamp-2 text-destructive">{row.last_error}</div> : null}</div><Button size="sm" variant="outline" disabled={!canRetry || retrying === rowKey} onClick={() => void retryOutbox(row)}><RotateCcw className="mr-1 h-3 w-3" /> Retry</Button></div>; })}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="brain">
          <Card><CardHeader><CardTitle className="text-base">Fila persistente central</CardTitle></CardHeader><CardContent className="space-y-2">
            <div className="mb-3 flex flex-wrap gap-2"><Badge variant="outline">queued {brainStats.queued}</Badge><Badge variant="outline">processing {brainStats.processing}</Badge><Badge variant="outline">retry {brainStats.retry}</Badge><Badge variant="outline">completed {brainStats.completed}</Badge><Badge variant={brainStats.dead ? 'destructive' : 'outline'}>dead letter {brainStats.dead}</Badge></div>
            {!brain.isLoading && !(brain.data || []).length && <div className="py-10 text-center text-sm text-muted-foreground">Nenhum job recente para este ecossistema.</div>}
            {(brain.data || []).map((job) => <div key={job.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1.2fr_.8fr_.6fr_1fr]"><div><div className="font-medium">{job.job_type}</div><div className="text-xs text-muted-foreground">{job.article_id ? `Artigo ${job.article_id.slice(0, 8)}…` : job.id.slice(0, 8)}</div></div><div>{statusBadge(job.status)}</div><div className="text-sm">{job.attempts}/{job.max_attempts}</div><div className="text-xs text-muted-foreground">{fmt(job.updated_at)}{job.last_error ? <div className="mt-1 line-clamp-2 text-destructive">{job.last_error}</div> : null}</div></div>)}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
