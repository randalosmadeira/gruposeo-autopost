import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, Clock3, Loader2, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import {
  getWordPressQueueStats,
  listWordPressOperations,
  retryWordPressOperation,
  cancelWordPressOperation,
  WordPressOperation,
  WordPressOperationStatus,
} from '@/services/wordpressOperations';
import { supabase } from '@/integrations/supabase/client';

const statusMeta: Record<WordPressOperationStatus, { label: string; className: string }> = {
  scheduled: { label: 'Agendado', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  pending: { label: 'Pendente', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  processing: { label: 'Processando', className: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20' },
  retry: { label: 'Retry', className: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  completed: { label: 'Concluído', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
  failed: { label: 'Falhou', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  cancelled: { label: 'Cancelado', className: 'bg-muted text-muted-foreground border-border' },
};

function formatDate(value?: string | null) {
  if (!value) return 'Agora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data inválida';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function operationTitle(operation: WordPressOperation) {
  return operation.articles?.title || operation.article_id || 'Operação WordPress';
}

export default function QueueMonitor() {
  const [selectedProject, setSelectedProject] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | WordPressOperationStatus>('all');
  const { projects } = useProjects();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const projectId = selectedProject === 'all' ? undefined : selectedProject;
  const statsQuery = useQuery({
    queryKey: ['wordpress-operations', 'stats', projectId],
    queryFn: () => getWordPressQueueStats(projectId),
    refetchInterval: false,
    retry: 2,
  });
  const operationsQuery = useQuery({
    queryKey: ['wordpress-operations', 'list', projectId],
    queryFn: () => listWordPressOperations(projectId, 100),
    refetchInterval: false,
    retry: 2,
  });

  useEffect(() => {
    const filter = projectId ? `project_id=eq.${projectId}` : undefined;
    const channel = supabase
      .channel(`wordpress-operations-monitor-${projectId || 'all'}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'wordpress_operations',
        ...(filter ? { filter } : {}),
      }, () => {
        void queryClient.invalidateQueries({ queryKey: ['wordpress-operations'] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [projectId, queryClient]);

  const refresh = async () => {
    await Promise.all([statsQuery.refetch(), operationsQuery.refetch()]);
  };

  const retryMutation = useMutation({
    mutationFn: (operationId: string) => retryWordPressOperation(operationId),
    onSuccess: async () => {
      toast({ title: 'Reprocessamento iniciado', description: 'A operação voltou para a fila canônica.' });
      await queryClient.invalidateQueries({ queryKey: ['wordpress-operations'] });
    },
    onError: (error) => toast({ title: 'Falha ao reprocessar', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' }),
  });

  const cancelMutation = useMutation({
    mutationFn: (operationId: string) => cancelWordPressOperation(operationId),
    onSuccess: async () => {
      toast({ title: 'Operação cancelada' });
      await queryClient.invalidateQueries({ queryKey: ['wordpress-operations'] });
    },
    onError: (error) => toast({ title: 'Falha ao cancelar', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' }),
  });

  const operations = useMemo(() => {
    const rows = operationsQuery.data || [];
    return statusFilter === 'all' ? rows : rows.filter((row) => row.status === statusFilter);
  }, [operationsQuery.data, statusFilter]);

  const stats = statsQuery.data;
  const isLoading = statsQuery.isLoading || operationsQuery.isLoading;
  const hasError = statsQuery.isError || operationsQuery.isError;

  const cards = [
    { label: 'Agendados', value: stats?.scheduled || 0, icon: CalendarClock },
    { label: 'Pendentes', value: (stats?.pending || 0) + (stats?.retry || 0), icon: Clock3 },
    { label: 'Processando', value: stats?.processing || 0, icon: Activity },
    { label: 'Concluídos', value: stats?.completed || 0, icon: CheckCircle2 },
    { label: 'Falhas', value: stats?.failed || 0, icon: AlertTriangle },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Monitor de Filas</h1>
            <p className="text-sm text-muted-foreground">Fonte única: wordpress-operations. Atualização em tempo real, sem consultas cíclicas.</p>
          </div>
          <Button variant="outline" onClick={() => void refresh()} disabled={statsQuery.isFetching || operationsQuery.isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${(statsQuery.isFetching || operationsQuery.isFetching) ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        <div className="flex flex-wrap gap-3">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Projeto WordPress" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os projetos</SelectItem>
              {(projects || []).map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | WordPressOperationStatus)}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(statusMeta).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {hasError && (
          <Card className="border-destructive/40">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3"><XCircle className="w-5 h-5 text-destructive" /><div><p className="font-medium">Não foi possível consultar a fila</p><p className="text-sm text-muted-foreground">A API antiga não é usada como fallback. Tente novamente para preservar uma única fonte de verdade.</p></div></div>
              <Button variant="outline" onClick={() => void refresh()}>Tentar novamente</Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {cards.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted"><Icon className="w-5 h-5" /></div>
                <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Operações WordPress</CardTitle>
            <div className="text-xs text-muted-foreground">
              {stats ? `${stats.completed_last_hour} concluídas na última hora, média ${stats.avg_attempts} tentativa(s)` : 'Carregando métricas...'}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-16 gap-3"><Loader2 className="w-6 h-6 animate-spin" /><span className="text-muted-foreground">Consultando fila...</span></div>
            ) : operations.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">Nenhuma operação encontrada para os filtros atuais.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conteúdo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Agendamento</TableHead>
                      <TableHead>Tentativas</TableHead>
                      <TableHead>Último erro</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operations.map((operation) => {
                      const meta = statusMeta[operation.status] || statusMeta.pending;
                      const canRetry = operation.status === 'failed' || operation.status === 'retry';
                      const canCancel = ['scheduled', 'pending', 'retry', 'failed'].includes(operation.status);
                      return (
                        <TableRow key={operation.id}>
                          <TableCell>
                            <div className="max-w-[320px]">
                              <p className="font-medium truncate">{operationTitle(operation)}</p>
                              <p className="text-xs text-muted-foreground">{operation.projects?.name || operation.project_id} · {operation.operation_type}</p>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className={meta.className}>{meta.label}</Badge></TableCell>
                          <TableCell className="text-sm">{formatDate(operation.scheduled_at)}</TableCell>
                          <TableCell className="text-sm">{operation.attempts}/{operation.max_attempts}</TableCell>
                          <TableCell><p className="max-w-[340px] truncate text-sm text-muted-foreground" title={operation.last_error || ''}>{operation.last_error || 'Sem erro'}</p></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {canRetry && (
                                <Button size="sm" variant="outline" onClick={() => retryMutation.mutate(operation.id)} disabled={retryMutation.isPending}>
                                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retry
                                </Button>
                              )}
                              {canCancel && (
                                <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(operation.id)} disabled={cancelMutation.isPending}>Cancelar</Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
