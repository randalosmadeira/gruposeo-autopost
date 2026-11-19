import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ProfileError, agentErrorMessage, callAgent, type AgentFact, type AgentHistory, type AgentMessage, type AgentTurn, type ProfilePayload,
} from '@/lib/profile-api';

const MAX_CHARS = 2000;

const show = (value: unknown): string => (Array.isArray(value) ? value.join(', ') : typeof value === 'number' ? value.toLocaleString('pt-BR') : String(value ?? ''));

// ------------------------------------------------------------------------------------------------------------ ditado por voz (navegador)
interface SpeechAlternative { transcript: string }
interface SpeechResult { isFinal: boolean; 0: SpeechAlternative; length: number }
interface SpeechEvent { resultIndex: number; results: ArrayLike<SpeechResult> }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null; onerror: ((e: { error?: string }) => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
}
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  const w = typeof window !== 'undefined' ? (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }) : null;
  return w?.SpeechRecognition || w?.webkitSpeechRecognition || null;
};
const VOICE_ERRORS: Record<string, string> = {
  'not-allowed': 'O navegador não liberou o microfone. Libere nas permissões do site e tente de novo.',
  'service-not-allowed': 'O navegador não liberou o reconhecimento de voz neste site.',
  'no-speech': 'Não ouvi nada. Fale mais perto do microfone e tente de novo.',
  'audio-capture': 'Não encontrei um microfone neste aparelho.',
  network: 'O serviço de voz do navegador está indisponível agora. Você pode digitar.',
};

interface Props {
  projectId: string;
  payload: ProfilePayload;
  /** o perfil foi alterado (fato aceito): a tela recarrega os dados com a resposta do servidor */
  onProfileUpdated: (next: ProfilePayload) => void;
  /** há alterações não salvas na tela: aceitar um fato grava no servidor e pode conflitar */
  hasUnsaved: boolean;
  /** perguntas prontas que a pessoa toca para preencher a caixa (ex.: vindas da Descoberta do negócio) */
  suggestions?: string[];
  /** quando `n` muda, a caixa recebe `text` (a tela de fora pede uma pergunta específica) */
  seed?: { text: string; n: number };
}

/** Conversa em texto com a Zica. O que ela entende vira "a confirmar": nada entra no perfil sem o clique de quem conversa. */
export function ProfileChat({ projectId, payload, onProfileUpdated, hasUnsaved, suggestions, seed }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [facts, setFacts] = useState<AgentFact[]>([]);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // voz
  const [consent, setConsent] = useState(false);
  const [askConsent, setAskConsent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [dictated, setDictated] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const supported = recognitionCtor() !== null;
  useEffect(() => { if (seed && seed.text) setText(seed.text.slice(0, MAX_CHARS)); }, [seed?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try {
      const h = await callAgent<AgentHistory>('history', { projectId });
      setConversationId(h.conversation_id);
      setMessages(h.messages || []);
      setFacts(h.facts || []);
      setTurnsLeft(h.turns_left);
      setConsent(h.consent_audio === true);
    } catch (e) {
      setNotice(agentErrorMessage(e));
    } finally {
      setLoaded(true);
    }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [messages.length]);
  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* já parou */ } }, []);

  const expected = () => ({ strategy: payload.strategy.version, extended: payload.extended.version, private: payload.private?.version ?? 0 });

  // ---------------------------------------------------------------------------------------------------- ditado
  function stopListening() {
    try { recRef.current?.stop(); } catch { /* já parou */ }
    setListening(false);
    setInterim('');
  }

  function startListening() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setVoiceNotice('');
    const rec = new Ctor();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0]?.transcript ?? '';
        if (e.results[i].isFinal) finalText += piece; else interimText += piece;
      }
      setInterim(interimText.trim());
      if (finalText.trim()) {
        setText((t) => `${t}${t && !/\s$/.test(t) ? ' ' : ''}${finalText.trim()}`.slice(0, MAX_CHARS));
        setDictated(true);
      }
    };
    rec.onerror = (e) => { setVoiceNotice(VOICE_ERRORS[e.error || ''] || 'O ditado parou por um erro do navegador. Você pode digitar.'); };
    rec.onend = () => { setListening(false); setInterim(''); };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setVoiceNotice('Não foi possível iniciar o ditado agora. Tente de novo.');
    }
  }

  function toggleDictation() {
    if (listening) { stopListening(); return; }
    if (!consent) { setAskConsent(true); return; }
    startListening();
  }

  async function grantConsent() {
    if (!agreed || busy) return;
    setBusy(true);
    setVoiceNotice('');
    try {
      const r = await callAgent<{ conversation_id: string | null; consent_audio: boolean }>('voice_consent', { projectId, granted: true });
      if (r.conversation_id) setConversationId(r.conversation_id);
      setConsent(true);
      setAskConsent(false);
      setAgreed(false);
      startListening();
    } catch (e) {
      setVoiceNotice(agentErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function revokeConsent() {
    if (busy) return;
    stopListening();
    setBusy(true);
    try {
      await callAgent('voice_consent', { projectId, granted: false });
      setConsent(false);
      setDictated(false);
      setVoiceNotice('Consentimento de voz revogado. O ditado fica desligado até você concordar de novo.');
    } catch (e) {
      setVoiceNotice(agentErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------------------------------------------- conversa
  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    if (listening) stopListening();
    setBusy(true);
    setNotice('');
    try {
      const r = await callAgent<AgentTurn>('turn', { projectId, conversationId: conversationId || undefined, message, ...(dictated ? { viaVoice: true } : {}) });
      setConversationId(r.conversation_id);
      setMessages((m) => [...m, { role: 'user', content: message }, { role: 'agent', content: r.reply }]);
      setFacts((f) => [...r.items.filter((i) => i.fact_id), ...f]);
      setTurnsLeft(r.turns_left);
      setText('');
      setDictated(false);
    } catch (e) {
      if (e instanceof ProfileError && e.code === 'consent_required') setConsent(false);
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
    stopListening();
    setBusy(true);
    try {
      await callAgent('delete_conversation', { projectId, conversationId });
      setConversationId(null);
      setMessages([]);
      setTurnsLeft(null);
      setConfirmDelete(false);
      setConsent(false); // o consentimento é da conversa: apagou a conversa, apagou o registro
      setDictated(false);
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
          {!!suggestions?.length && (
            <div className="flex flex-wrap gap-2" aria-label="Perguntas sugeridas">
              {suggestions.map((q) => <Button key={q} type="button" size="sm" variant="outline" disabled={busy} className="h-auto whitespace-normal py-1.5 text-left" onClick={() => setText(q.slice(0, MAX_CHARS))}>{q}</Button>)}
            </div>
          )}
          <label htmlFor="chat-input" className="sr-only">Mensagem para a Zica</label>
          <Textarea id="chat-input" value={text} maxLength={MAX_CHARS} disabled={busy} placeholder="Ex.: Tenho uma loja de roupas há dois anos e vendo mais pelo Instagram…" className="min-h-24"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} />
          {listening && <p role="status" className="text-xs text-muted-foreground">Ouvindo… {interim ? `“${interim}”` : 'fale à vontade'}. O texto aparece na caixa para você revisar antes de enviar.</p>}
          {voiceNotice && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{voiceNotice}</p>}

          {askConsent && !consent && (
            <div role="alertdialog" aria-labelledby="voice-consent-title" className="space-y-2 rounded border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
              <p id="voice-consent-title" className="font-medium">Antes de ditar: como a voz é tratada</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>O ditado usa o <strong>reconhecimento de voz do seu navegador</strong>. No Chrome e no Edge, o áudio pode ser enviado ao serviço de voz do Google ou da Microsoft para virar texto.</li>
                <li><strong>A Zica não recebe nem guarda o áudio.</strong> Só recebe o texto que aparecer na caixa, depois de você revisar e enviar.</li>
                <li>Seu aceite fica registrado nesta conversa (quem e quando). Você pode revogar quando quiser; apagar a conversa apaga as mensagens e desliga o consentimento (fica só a data, sem conteúdo).</li>
                <li>Não dite senhas, dados de terceiros nem números de documentos.</li>
              </ul>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>Entendi e concordo em ditar por voz nesta conversa.</span>
              </label>
              <div className="flex gap-2">
                <Button size="sm" disabled={!agreed || busy} onClick={grantConsent}>Concordar e começar a ditar</Button>
                <Button size="sm" variant="outline" onClick={() => { setAskConsent(false); setAgreed(false); }}>Agora não</Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{text.length}/{MAX_CHARS}{turnsLeft !== null ? ` · ${turnsLeft} mensagens restantes nesta conversa` : ''} · Ctrl+Enter envia</span>
            <div className="flex flex-wrap gap-2">
              {supported && (
                <Button size="sm" variant={listening ? 'default' : 'outline'} disabled={busy} aria-pressed={listening} onClick={toggleDictation}>{listening ? 'Parar de ditar' : 'Ditar por voz'}</Button>
              )}
              {supported && consent && <Button size="sm" variant="ghost" disabled={busy} onClick={revokeConsent}>Revogar consentimento de voz</Button>}
              {conversationId && (confirmDelete ? (
                <>
                  <Button size="sm" variant="destructive" disabled={busy} onClick={removeConversation}>Apagar de vez</Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                </>
              ) : <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>Apagar conversa</Button>)}
              <Button disabled={busy || !text.trim()} onClick={send}>{busy ? 'Aguarde…' : 'Enviar para a Zica'}</Button>
            </div>
          </div>
          {!supported && <p className="text-xs text-muted-foreground">Seu navegador não oferece ditado por voz. Você pode digitar normalmente.</p>}
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
