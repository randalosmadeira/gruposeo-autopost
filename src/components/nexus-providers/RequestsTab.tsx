import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ToneBadge } from '@/components/nexus-providers/badges';
import { RequestForm } from '@/components/nexus-providers/RequestForm';
import { EmptyNote } from '@/components/nexus-providers/shared';
import { formatRelative, providerErrorMessage } from '@/lib/nexus-providers';
import {
  MANAGER_NOTE_MAX, REQUEST_STATUSES, requestKindLabel, requestStatusLabel, requestStatusTone, sortRequests, validateManagerNote,
} from '@/lib/nexus-requests';
import type { ClientRequest, RequestCreateInput, RequestStatus, RequestUpdateInput } from '@/types/nexus-requests';

function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <ToneBadge tone={requestStatusTone(status)}>{requestStatusLabel(status)}</ToneBadge>;
}

function ListState({ loading, error, onRetry }: { loading: boolean; error: unknown; onRetry: () => void }) {
  if (loading) return <div aria-busy="true" aria-label="Carregando solicitações" className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível carregar as solicitações</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">{providerErrorMessage(error)}<Button size="sm" variant="outline" onClick={onRetry}>Tentar de novo</Button></AlertDescription>
      </Alert>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Visão cliente (e admin de org interna): cria pedidos e acompanha as respostas.
// ---------------------------------------------------------------------------

export interface MemberRequestsViewProps {
  requests: ClientRequest[] | undefined;
  loading: boolean;
  error: unknown;
  now: number;
  onCreate: (input: RequestCreateInput) => Promise<void>;
  onRetry: () => void;
}

export function MemberRequestsView({ requests, loading, error, now, onCreate, onRetry }: MemberRequestsViewProps) {
  const list = sortRequests(requests ?? []);
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Precisa conectar uma fonte, vincular ou atualizar o plugin, ou pedir um relatório? Envie aqui. Esses ajustes técnicos são feitos só pela conta de gerenciamento,
        e você acompanha a resposta nesta mesma tela.
      </p>
      <Card>
        <CardHeader><CardTitle className="text-base">Nova solicitação</CardTitle></CardHeader>
        <CardContent><RequestForm idPrefix="req-tab" onSubmit={onCreate} /></CardContent>
      </Card>

      <section aria-labelledby="my-requests" className="space-y-3">
        <h3 id="my-requests" className="text-lg font-semibold">Minhas solicitações</h3>
        <ListState loading={loading} error={error} onRetry={onRetry} />
        {!loading && !error && list.length === 0 && <EmptyNote>Você ainda não enviou nenhuma solicitação.</EmptyNote>}
        {!loading && !error && list.length > 0 && (
          <ul className="space-y-3">
            {list.map((r) => (
              <li key={r.id}>
                <Card data-testid={`request-${r.id}`}>
                  <CardHeader className="space-y-2 pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <RequestStatusBadge status={r.status} />
                      <span className="text-xs text-muted-foreground">Enviada {formatRelative(r.created_at, now)}</span>
                    </div>
                    <CardTitle className="text-base leading-snug">{requestKindLabel(r.kind)}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="whitespace-pre-wrap break-words text-sm">{r.message}</p>
                    {r.manager_note && (
                      <div className="rounded-md border bg-muted/40 p-3 text-sm">
                        <p className="text-xs font-medium text-muted-foreground">Resposta do gestor</p>
                        <p className="whitespace-pre-wrap break-words">{r.manager_note}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visão gestor: caixa de entrada com filtro por status e resposta.
// ---------------------------------------------------------------------------

export interface ManagerInboxViewProps {
  requests: ClientRequest[] | undefined;
  loading: boolean;
  error: unknown;
  now: number;
  onUpdate: (input: RequestUpdateInput) => Promise<void>;
  onRetry: () => void;
}

function InboxItem({ request, now, onUpdate }: { request: ClientRequest; now: number; onUpdate: (input: RequestUpdateInput) => Promise<void> }) {
  const [note, setNote] = useState(request.manager_note ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noteHint = validateManagerNote(note);
  const noteId = `note-${request.id}`;

  async function apply(label: string, patch: Omit<RequestUpdateInput, 'id'>) {
    if (noteHint) { setError(noteHint); return; }
    setBusy(label); setError(null);
    try { await onUpdate({ id: request.id, ...patch }); } catch (e) { setError(providerErrorMessage(e)); } finally { setBusy(null); }
  }
  const noteChanged = note.trim() !== (request.manager_note ?? '');
  const withNote: { managerNote?: string } = noteChanged ? { managerNote: note } : {};
  const closed = request.status === 'done' || request.status === 'rejected';

  return (
    <Card data-testid={`inbox-${request.id}`}>
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <RequestStatusBadge status={request.status} />
          <span className="text-xs text-muted-foreground">Enviada {formatRelative(request.created_at, now)}</span>
        </div>
        <CardTitle className="text-base leading-snug">{requestKindLabel(request.kind)}</CardTitle>
        <CardDescription>
          {request.organization_name ? `Organização: ${request.organization_name}` : `Organização …${request.organization_id.slice(-6)}`}
          {request.project_name ? ` · Projeto: ${request.project_name}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-wrap break-words text-sm">{request.message}</p>
        <div className="space-y-1.5">
          <Label htmlFor={noteId}>Resposta ao cliente (opcional)</Label>
          <Textarea id={noteId} rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy !== null} aria-invalid={!!noteHint}
            aria-describedby={`${noteId}-count`} />
          <p id={`${noteId}-count`} className={`text-xs tabular-nums ${noteHint ? 'text-destructive' : 'text-muted-foreground'}`}>{note.trim().length}/{MANAGER_NOTE_MAX}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {request.status !== 'in_progress' && !closed && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { void apply('in_progress', { status: 'in_progress', ...withNote }); }} aria-label={`Marcar em andamento: ${requestKindLabel(request.kind)}`}>
              {busy === 'in_progress' && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}Em andamento
            </Button>
          )}
          {!closed && (
            <>
              <Button size="sm" disabled={busy !== null} onClick={() => { void apply('done', { status: 'done', ...withNote }); }} aria-label={`Concluir: ${requestKindLabel(request.kind)}`}>
                {busy === 'done' && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}Concluir
              </Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { void apply('rejected', { status: 'rejected', ...withNote }); }} aria-label={`Recusar: ${requestKindLabel(request.kind)}`}>
                {busy === 'rejected' && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}Recusar
              </Button>
            </>
          )}
          {closed && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { void apply('open', { status: 'open', ...withNote }); }} aria-label={`Reabrir: ${requestKindLabel(request.kind)}`}>Reabrir</Button>
          )}
          {noteChanged && (
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => { void apply('note', withNote); }} aria-label={`Salvar só a resposta: ${requestKindLabel(request.kind)}`}>Salvar só a resposta</Button>
          )}
        </div>
        <div aria-live="polite">{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
      </CardContent>
    </Card>
  );
}

export function ManagerInboxView({ requests, loading, error, now, onUpdate, onRetry }: ManagerInboxViewProps) {
  const [filter, setFilter] = useState<RequestStatus | 'all'>('open');
  const all = requests ?? [];
  const list = sortRequests(filter === 'all' ? all : all.filter((r) => r.status === filter));
  const count = (s: RequestStatus) => all.filter((r) => r.status === s).length;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Pedidos dos clientes das organizações que você gerencia. Responda, marque em andamento, conclua ou recuse; o cliente vê a resposta na própria tela.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="inbox-filter">Filtrar por situação</Label>
          <select id="inbox-filter" value={filter} onChange={(e) => setFilter(e.target.value as RequestStatus | 'all')}
            className="flex h-10 w-56 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <option value="all">Todas ({all.length})</option>
            {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{requestStatusLabel(s)} ({count(s)})</option>)}
          </select>
        </div>
      </div>
      <ListState loading={loading} error={error} onRetry={onRetry} />
      {!loading && !error && list.length === 0 && <EmptyNote>{filter === 'all' ? 'Nenhuma solicitação recebida ainda.' : `Nenhuma solicitação com a situação “${requestStatusLabel(filter)}”.`}</EmptyNote>}
      {!loading && !error && list.length > 0 && (
        <ul className="space-y-3" aria-label="Solicitações recebidas">{list.map((r) => <li key={r.id}><InboxItem request={r} now={now} onUpdate={onUpdate} /></li>)}</ul>
      )}
    </div>
  );
}
