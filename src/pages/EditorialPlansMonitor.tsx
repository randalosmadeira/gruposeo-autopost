import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Layers3, Loader2, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import {
  ITEM_STATUS_LABELS,
  PLAN_STATUS_LABELS,
  STEP_LABELS,
  canReprocessEditorialItem,
  isStepLabel,
  summarizeEditorialItems,
  type EditorialItemStatus,
  type EditorialPlanStatus,
} from '@/lib/editorial-planning';
import {
  getEditorialPlanDetail,
  listEditorialPlans,
  reprocessEditorialPlanItem,
  type EditorialPlanItemRow,
  type EditorialPlanRow,
} from '@/services/editorialPlanningQueue';

const PLAN_BADGE: Record<EditorialPlanStatus, string> = {
  review: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  queued: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  processing: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20',
  completed: 'bg-green-500/10 text-green-700 border-green-500/20',
  partial: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  failed: 'bg-destructive/10 text-destructive border-destructive/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

const ITEM_BADGE: Record<EditorialItemStatus, string> = {
  queued: PLAN_BADGE.queued,
  processing: PLAN_BADGE.processing,
  draft_ready: PLAN_BADGE.completed,
  failed: PLAN_BADGE.failed,
  duplicate: PLAN_BADGE.cancelled,
  cancelled: PLAN_BADGE.cancelled,
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function planLabel(status: string) {
  return status in PLAN_STATUS_LABELS ? PLAN_STATUS_LABELS[status as EditorialPlanStatus] : status;
}

function itemLabel(status: string) {
  return status in ITEM_STATUS_LABELS ? ITEM_STATUS_LABELS[status as EditorialItemStatus] : status;
}

function stepLabel(step: string) {
  return isStepLabel(step) ? STEP_LABELS[step] : step;
}

export default function EditorialPlansMonitor() {
  const { projects } = useProjects();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [projectFilter, setProjectFilter] = useState('all');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const projectId = projectFilter === 'all' ? undefined : projectFilter;
  const plansQuery = useQuery({
    queryKey: ['editorial-plans', 'list', projectId],
    queryFn: () => listEditorialPlans(projectId),
    retry: 1,
  });
  const detailQuery = useQuery({
    queryKey: ['editorial-plans', 'detail', selectedPlanId],
    queryFn: () => getEditorialPlanDetail(selectedPlanId as string),
    enabled: Boolean(selectedPlanId),
    retry: 1,
  });

  const reprocess = useMutation({
    mutationFn: (item: EditorialPlanItemRow) => reprocessEditorialPlanItem(item.id, item.current_step),
    onSuccess: async (result) => {
      toast({ title: 'Item reenfileirado', description: `Retomará da etapa "${stepLabel(result.resumeFromStep)}" (tentativa ${result.retryCount}).` });
      await queryClient.invalidateQueries({ queryKey: ['editorial-plans'] });
    },
    onError: (error: unknown) => {
      toast({ title: 'Não foi possível reprocessar', description: error instanceof Error ? error.message : 'Erro desconhecido.', variant: 'destructive' });
    },
  });

  const plans = plansQuery.data ?? [];
  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedPlanId) ?? null, [plans, selectedPlanId]);
  const summary = useMemo(() => summarizeEditorialItems(detailQuery.data?.items ?? []), [detailQuery.data]);
  const projectName = (id: string) => projects.find((project) => project.id === id)?.name ?? id;

  return (
    <div className="container max-w-6xl space-y-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fila de planejamento editorial</h1>
          <p className="text-muted-foreground">Estados, auditoria e reprocessamento por etapa. Nenhum item é gerado ou publicado a partir desta tela.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void plansQuery.refetch()} disabled={plansQuery.isFetching}>
            {plansQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar
          </Button>
          <Button asChild><Link to="/keywords/bulk"><Layers3 className="mr-2 h-4 w-4" />Novo planejamento</Link></Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Planos</CardTitle>
            <CardDescription>Somente planos da sua organização, mais recentes primeiro.</CardDescription>
          </div>
          <Select value={projectFilter} onValueChange={(value) => { setProjectFilter(value); setSelectedPlanId(null); }}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Projeto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os projetos</SelectItem>
              {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {plansQuery.error && <ErrorLine message={plansQuery.error instanceof Error ? plansQuery.error.message : 'Falha ao carregar planos.'} />}
          {plansQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando planos...</p> : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum plano salvo ainda. Importe palavras-chave em "Novo planejamento".</p>
          ) : (
            <div className="overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead><TableHead>Projeto</TableHead><TableHead>Portal</TableHead><TableHead>Qtd.</TableHead>
                    <TableHead>Frequência</TableHead><TableHead>Status</TableHead><TableHead>Criado</TableHead><TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((plan: EditorialPlanRow) => (
                    <TableRow key={plan.id} data-state={plan.id === selectedPlanId ? 'selected' : undefined}>
                      <TableCell className="font-medium">{plan.name}</TableCell>
                      <TableCell>{projectName(plan.project_id)}</TableCell>
                      <TableCell>{plan.portal}</TableCell>
                      <TableCell>{plan.requested_quantity}</TableCell>
                      <TableCell>{plan.frequency}</TableCell>
                      <TableCell><Badge variant="outline" className={PLAN_BADGE[plan.status as EditorialPlanStatus] ?? ''}>{planLabel(plan.status)}</Badge></TableCell>
                      <TableCell>{formatDate(plan.created_at)}</TableCell>
                      <TableCell><Button size="sm" variant={plan.id === selectedPlanId ? 'default' : 'outline'} onClick={() => setSelectedPlanId(plan.id)}>Detalhes</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPlan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {selectedPlan.name}
              <Badge variant="outline" className={PLAN_BADGE[selectedPlan.status as EditorialPlanStatus] ?? ''}>{planLabel(selectedPlan.status)}</Badge>
              {selectedPlan.publication_enabled === false && <Badge variant="secondary"><ShieldCheck className="mr-1 h-3 w-3" />Publicação bloqueada</Badge>}
            </CardTitle>
            <CardDescription>
              {selectedPlan.category} · {selectedPlan.audience} · {selectedPlan.city}
              {selectedPlan.source_file_name ? ` · arquivo ${selectedPlan.source_file_name}` : ''}
              {` · estimativa ${Number(selectedPlan.estimated_input_tokens) + Number(selectedPlan.estimated_output_tokens)} tokens / ${selectedPlan.estimated_credits} créditos`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {detailQuery.error && <ErrorLine message={detailQuery.error instanceof Error ? detailQuery.error.message : 'Falha ao carregar detalhes.'} />}
            <div className="flex flex-wrap gap-2">
              <Badge>Itens: {summary.total}</Badge>
              <Badge variant="outline" className={ITEM_BADGE.queued}>Na fila: {summary.queued}</Badge>
              <Badge variant="outline" className={ITEM_BADGE.processing}>Processando: {summary.processing}</Badge>
              <Badge variant="outline" className={ITEM_BADGE.draft_ready}>Rascunhos: {summary.draft_ready}</Badge>
              <Badge variant="outline" className={ITEM_BADGE.failed}>Falhas: {summary.failed}</Badge>
              <Badge variant="outline" className={ITEM_BADGE.duplicate}>Duplicadas: {summary.duplicate}</Badge>
              <Badge variant="outline">RSS: {detailQuery.data?.rssSources.length ?? 0}</Badge>
              <Badge variant="outline">Imagens: {detailQuery.data?.assets.length ?? 0}</Badge>
            </div>

            <div className="max-h-[480px] overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead><TableHead>Palavra-chave</TableHead><TableHead>Status</TableHead><TableHead>Etapa</TableHead>
                    <TableHead>Tentativas</TableHead><TableHead>Último erro</TableHead><TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(detailQuery.data?.items ?? []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.sequence_no}</TableCell>
                      <TableCell>
                        <div className="font-medium">{item.keyword}</div>
                        {item.duplicate && <div className="text-xs text-muted-foreground">Duplicada: {item.duplicate_reason}</div>}
                      </TableCell>
                      <TableCell><Badge variant="outline" className={ITEM_BADGE[item.status as EditorialItemStatus] ?? ''}>{itemLabel(item.status)}</Badge></TableCell>
                      <TableCell>{stepLabel(item.current_step)}</TableCell>
                      <TableCell>{item.retry_count}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={item.last_error_message ?? ''}>
                        {item.last_error_code ? `${item.last_error_code}: ` : ''}{item.last_error_message ?? '—'}
                      </TableCell>
                      <TableCell>
                        {canReprocessEditorialItem(item) && (
                          <Button size="sm" variant="outline" disabled={reprocess.isPending} onClick={() => reprocess.mutate(item)}>
                            <RotateCcw className="mr-1 h-3 w-3" />Reprocessar etapa
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Auditoria</h3>
              {detailQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
                <ul className="space-y-1 text-sm">
                  {(detailQuery.data?.audit ?? []).map((event) => (
                    <li key={event.id} className="flex flex-wrap gap-2 rounded border px-3 py-2">
                      <span className="font-mono text-xs text-muted-foreground">{formatDate(event.occurred_at)}</span>
                      <span className="font-medium">{event.event_type}</span>
                      {event.from_status || event.to_status ? <span className="text-muted-foreground">{event.from_status ?? '∅'} → {event.to_status ?? '∅'}</span> : null}
                      <span className="truncate font-mono text-xs text-muted-foreground">{JSON.stringify(event.details)}</span>
                    </li>
                  ))}
                  {(detailQuery.data?.audit ?? []).length === 0 && !detailQuery.isLoading && <li className="text-muted-foreground">Sem eventos registrados.</li>}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-5 text-sm"><strong>Trava de segurança:</strong> reprocessar apenas devolve um item falho para a fila, na etapa em que parou. Esta tela não gera conteúdo nem envia nada a WordPress ou portais.</CardContent>
      </Card>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return <p role="alert" className="flex items-center gap-2 rounded border border-destructive/30 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{message}</p>;
}
