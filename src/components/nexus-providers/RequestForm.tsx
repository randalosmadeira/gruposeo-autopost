import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { providerErrorMessage } from '@/lib/nexus-providers';
import {
  REQUEST_KINDS, REQUEST_MESSAGE_MAX, requestKindHint, requestKindLabel, validateRequestMessage,
} from '@/lib/nexus-requests';
import type { RequestCreateInput, RequestKind } from '@/types/nexus-requests';

export interface RequestFormProps {
  defaultKind?: RequestKind;
  defaultMessage?: string;
  /** Envia ao servidor (`request_create`). Rejeita com o código do servidor (ex.: `too_many_open_requests`). */
  onSubmit: (input: RequestCreateInput) => Promise<void>;
  /** Chamado depois de enviar com sucesso (ex.: fechar o diálogo). */
  onSent?: () => void;
  /** Prefixo para ids únicos quando houver mais de um formulário na tela. */
  idPrefix?: string;
}

/** Formulário do cliente: tipo + mensagem. Linguagem simples; validação 3 a 1000 caracteres (o servidor revalida). */
export function RequestForm({ defaultKind = 'other', defaultMessage = '', onSubmit, onSent, idPrefix = 'req' }: RequestFormProps) {
  const [kind, setKind] = useState<RequestKind>(defaultKind);
  const [message, setMessage] = useState(defaultMessage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Quando o pai troca o pedido pré-preenchido (botão "Solicitar" de outro provedor), recomeça limpo.
  useEffect(() => { setKind(defaultKind); setMessage(defaultMessage); setError(null); setSent(false); }, [defaultKind, defaultMessage]);

  async function submit() {
    const hint = validateRequestMessage(message);
    if (hint) { setError(hint); setSent(false); return; }
    setBusy(true); setError(null); setSent(false);
    try {
      await onSubmit({ kind, message: message.trim() });
      setMessage(''); setSent(true);
      onSent?.();
    } catch (e) { setError(providerErrorMessage(e)); } finally { setBusy(false); }
  }

  const kindId = `${idPrefix}-kind`;
  const msgId = `${idPrefix}-message`;
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={kindId}>O que você precisa?</Label>
        <select id={kindId} value={kind} onChange={(e) => setKind(e.target.value as RequestKind)} disabled={busy} aria-describedby={`${kindId}-hint`}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
          {REQUEST_KINDS.map((k) => <option key={k} value={k}>{requestKindLabel(k)}</option>)}
        </select>
        <p id={`${kindId}-hint`} className="text-xs text-muted-foreground">{requestKindHint(kind)}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={msgId}>Mensagem para o gestor</Label>
        <Textarea id={msgId} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} disabled={busy} maxLength={REQUEST_MESSAGE_MAX + 200}
          aria-invalid={!!error} aria-describedby={`${msgId}-count`} placeholder="Conte em poucas palavras o que você precisa." />
        <p id={`${msgId}-count`} className="text-xs text-muted-foreground tabular-nums">{message.trim().length}/{REQUEST_MESSAGE_MAX}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="mr-1 h-4 w-4" aria-hidden="true" />}
          Enviar solicitação
        </Button>
        <div aria-live="polite" className="text-sm">
          {sent && <p role="status" className="text-emerald-800 dark:text-emerald-200">Solicitação enviada. O gestor responde por aqui.</p>}
          {error && <p role="alert" className="text-destructive">{error}</p>}
        </div>
      </div>
    </form>
  );
}
