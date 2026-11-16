import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ProfileError, agentErrorMessage, callAgent, type AgentFact, type AgentHistory, type AgentMessage, type AgentTurn, type ProfilePayload,
} from '@/lib/profile-api';

const MAX_CHARS = 2000;

const show = (value: unknown): string => (Array.isArray(value) ? value.join(', ') : typeof value === 'number' ? value.toLocaleString('pt-BR') : String(value ?? ''));

interface Props {
  projectId: string;
  payload: ProfilePayload;
  /** o perfil foi alterado (fato aceito): a tela recarrega os dados com a resposta do servidor */
  onProfileUpdated: (next: ProfilePayload) => void;
  /** há alterações não salvas na tela: aceitar um fato grava no servidor e pode conflitar */
  hasUnsaved: boolean;
}

/** Conversa em texto com a Zica. O que ela entende vira "a confirmar": nada entra no perfil sem o clique de quem conversa. */
export function ProfileChat({ projectId, payload, onProfileUpdated, hasUnsaved }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [facts, setFacts] = useState<AgentFact[]>([]);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const h = await callAgent<AgentHistory>('history', { projectId });
      setConversationId(h.conversation_id);
      setMessages(h.messages || []);
      setFacts(h.facts || []);
      setTurnsLeft(h.turns_left);
    } catch (e) {
      setNotice(agentErrorMessage(e));
    } finally {
      setLoaded(true);
    }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [messages.length]);

  const expected = () => ({ strategy: payload.strategy.version, extended: payload.extended.version, private: payload.private?.version ?? 0 });

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const r = await callAgent<AgentTurn>('turn', { projectId, conversationId: conversationId || undefined, message });
      setConversationId(r.conversation_id);
      setMessages((m) => [...m, { role: 'user', content: message }, { role: 'agent', content: r.reply }]);
      setFacts((f) => [...r.items.filter((i) => i.fact_id), ...f]);
      setTurnsLeft(r.turns_left);
      setText('');
    } catch (e) {
      setNotice(agentErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function decide(fact: AgentFact, decision: 'accept' | 'reject') {
    if (!fact.fact_id || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const r = await callAgent<ProfilePayload & { fact_id: string }>('decide', { projectId, factId: fact.fact_id, decision, expected: expected() });
      setFacts((f) => f.filter((x) => x.fact_id !== fact.fact_id));
      if (decision === 'accept') {
        onProfileUpdated(r);
        setNotice(`"${fact.label}" foi para o perfil. Uma nova versão ficou guardada.`);
      } else {
        setNotice(`Ignorei "${fact.label}".`);
      }
    } catch (e) {
      const code = e instanceof ProfileError ? e.code : '';
      setNotice(code === 'profile_changed_reload' ? 'O perfil mudou em outra tela. Recarregue a página e tente de novo.'
        : code === 'validation_failed' ? 'Esse valor não passou na validação do campo. Ignore o item e preencha pela etapa certa.'
        : agentErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeConversation() {
    if (!conversationId) return;
    setBusy(true);
    try {
      await callAgent('delete_conversation', { projectId, conversationId });
      setConversationId(null);
      setMessages([]);
      setTurnsLeft(null);
      setConfirmDelete(false);
      setNotice('Conversa apagada. Os fatos que você ainda não decidiu continuam abaixo.');
    } catch (e) {
      setNotice(agentErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const canWrite = payload.can_write;
  return (
    <section aria-labelledby="chat-title" className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 id="chat-title" className="text-lg font-semibold">Conversa com a Zica</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Conte do seu jeito como o negócio funciona. A Zica pergunta, anota o que você disser e traduz o que for difícil. <strong>Nada vai para o perfil sem o seu clique em "Usar no perfil".</strong>{' '}
          O que você escreve aqui é enviado ao provedor de IA do projeto para a Zica responder: não escreva senhas nem dados de terceiros.
        </p>
      </div>

      <div className="max-h-80 space-y-2 overflow-y-auto rounded border bg-muted/20 p-3" role="log" aria-live="polite" aria-label="Conversa">
        {!loaded && <p className="text-sm text-muted-foreground" aria-busy="true">Carregando a conversa…</p>}
        {loaded && !messages.length && <p className="text-sm text-muted-foreground">Ainda não conversamos. Comece contando o que a empresa faz e para quem.</p>}
        {messages.map((m, i) => (
          <div key={m.id ?? i} className={m.role === 'user' ? 'text-right' : ''}>
            <span className="mb-0.5 block text-[11px] text-muted-foreground">{m.role === 'user' ? 'Você' : 'Zica'}</span>
            <p className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-background'}`}>{m.content}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {canWrite ? (
        <div className="space-y-2">
          <label htmlFor="chat-input" className="sr-only">Mensagem para a Zica</label>
          <Textarea id="chat-input" value={text} maxLength={MAX_CHARS} disabled={busy} placeholder="Ex.: Tenho uma loja de roupas há dois anos e vendo mais pelo Instagram…" className="min-h-24"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{text.length}/{MAX_CHARS}{turnsLeft !== null ? ` · ${turnsLeft} mensagens restantes nesta conversa` : ''} · Ctrl+Enter envia</span>
            <div className="flex gap-2">
              {conversationId && (confirmDelete ? (
                <>
                  <Button size="sm" variant="destructive" disabled={busy} onClick={removeConversation}>Apagar de vez</Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                </>
              ) : <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>Apagar conversa</Button>)}
              <Button disabled={busy || !text.trim()} onClick={send}>{busy ? 'Aguarde…' : 'Enviar para a Zica'}</Button>
            </div>
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground">Seu papel permite ler, mas não conversar com a Zica.</p>}

      {notice && <p role="status" className="rounded border border-primary/40 p-3 text-sm">{notice}</p>}

      <div className="space-y-2">
        <h4 className="font-medium">O que a Zica entendeu (a confirmar)</h4>
        {!facts.length && <p className="text-sm text-muted-foreground">Nada pendente. Quando você contar algo, aparece aqui para você usar ou ignorar.</p>}
        {hasUnsaved && !!facts.length && <p className="text-xs text-amber-600 dark:text-amber-400">Há alterações não salvas nas etapas. Salve antes de usar um fato, para a versão do perfil não conflitar.</p>}
        <ul className="space-y-2">
          {facts.map((f) => (
            <li key={f.fact_id} className="rounded border p-3">
              <p className="text-sm"><strong>{f.label}:</strong> {show(f.value)}{f.private ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px]">privado</span> : null}</p>
              {f.quote && <p className="mt-1 text-xs text-muted-foreground">Você disse: “{f.quote}”</p>}
              {canWrite && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={busy || hasUnsaved} onClick={() => decide(f, 'accept')}>Usar no perfil</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(f, 'reject')}>Ignorar</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
