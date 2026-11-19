import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToneBadge } from '@/components/nexus-providers/badges';
import {
  credentialStatusLabel, getCatalogEntry, providerErrorMessage, providerHealthMessage, validateSecretFormat,
} from '@/lib/nexus-providers';
import type { ProviderId, StoreCredentialResult } from '@/types/nexus-providers';

export interface ConnectDialogProps {
  /** `null` = fechado. */
  providerId: ProviderId | null;
  currentLastFour?: string | null;
  onClose: () => void;
  /** Grava a credencial no servidor. O segredo só passa por aqui e é limpo do estado logo após a resposta. */
  onSubmit: (provider: ProviderId, secret: string) => Promise<StoreCredentialResult>;
  /** Só para `gsc`/`bing_webmaster`: dispara a sincronização e devolve o resumo em texto. */
  onSyncNow?: () => Promise<string>;
  canSync?: boolean;
}

type Phase = 'form' | 'saving' | 'done';

// Esconde os caracteres do textarea (JSON da conta de serviço) sem usar type=password, que não existe em textarea.
const MASK_STYLE = { WebkitTextSecurity: 'disc' } as React.CSSProperties;

export function ConnectDialog({ providerId, currentLastFour, onClose, onSubmit, onSyncNow, canSync = false }: ConnectDialogProps) {
  const entry = providerId ? getCatalogEntry(providerId) : undefined;
  const [secret, setSecret] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StoreCredentialResult | null>(null);
  const [syncText, setSyncText] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Sempre começa limpo ao abrir/trocar de provedor, e descarta o segredo ao fechar.
  useEffect(() => {
    setSecret(''); setPhase('form'); setError(null); setResult(null); setSyncText(null); setSyncing(false);
  }, [providerId]);

  if (!providerId || !entry) return null;
  const isJson = entry.credentialKind === 'service_account_json';
  const fieldId = `connect-secret-${providerId}`;

  async function submit() {
    if (!providerId) return;
    const hint = validateSecretFormat(providerId, secret);
    if (hint) { setError(hint); return; }
    setError(null); setPhase('saving');
    try {
      const r = await onSubmit(providerId, secret);
      setSecret(''); // limpa o campo assim que o servidor responde
      setResult(r);
      setPhase('done');
    } catch (e) {
      setSecret('');
      setError(providerErrorMessage(e));
      setPhase('form');
    }
  }

  async function sync() {
    if (!onSyncNow) return;
    setSyncing(true); setSyncText(null);
    try { setSyncText(await onSyncNow()); } catch (e) { setSyncText(providerErrorMessage(e)); } finally { setSyncing(false); }
  }

  const health = result?.health ?? null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) { setSecret(''); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{currentLastFour ? 'Trocar chave' : 'Conectar'}: {entry.name}</DialogTitle>
          <DialogDescription>
            {currentLastFour ? `Chave atual: …${currentLastFour}. A chave guardada nunca é exibida de volta; cole uma nova para trocar.` : 'A credencial vai direto para o cofre do servidor e nunca é exibida de volta.'}
          </DialogDescription>
        </DialogHeader>

        {phase !== 'done' ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} autoComplete="off">
            {entry.costWarning && <Alert><AlertDescription>{entry.costWarning}</AlertDescription></Alert>}
            {isJson && (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {entry.doc.steps.slice(0, 4).map((s) => <li key={s}>{s}</li>)}
              </ol>
            )}
            <div className="space-y-1.5">
              <Label htmlFor={fieldId}>{entry.credentialLabel}</Label>
              {isJson ? (
                <Textarea id={fieldId} rows={6} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false}
                  className="font-mono text-xs" style={MASK_STYLE} placeholder='{ "type": "service_account", … }' aria-describedby={`${fieldId}-hint`} aria-invalid={!!error} />
              ) : (
                <Input id={fieldId} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" spellCheck={false}
                  placeholder={entry.credentialExample} aria-describedby={`${fieldId}-hint`} aria-invalid={!!error} />
              )}
              <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">{entry.formatHint}</p>
              <a className="inline-flex items-center gap-1 text-xs text-primary underline" href={entry.keyUrl} target="_blank" rel="noopener noreferrer">
                Onde encontro minha chave? <ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only">(abre em nova aba)</span>
              </a>
            </div>
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{phase === 'saving' ? 'Validando e guardando…' : ''}</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setSecret(''); onClose(); }}>Cancelar</Button>
              <Button type="submit" disabled={phase === 'saving' || !secret.trim()}>
                {phase === 'saving' && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                Guardar e testar
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4" aria-live="polite">
            <p className="text-sm">Credencial guardada{result?.last_four ? ` (termina em …${result.last_four})` : ''}.</p>
            {health ? (
              <div className="space-y-2">
                <ToneBadge tone={health.ok ? 'success' : 'danger'}>{health.ok ? 'Teste gratuito: ok' : 'Teste gratuito: falhou'}</ToneBadge>
                <p className="text-sm text-muted-foreground">{providerHealthMessage(health)}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {entry.testCost ? 'Este provedor só tem teste com custo. Use “Testar conexão” quando quiser (haverá confirmação).' : 'O teste ainda não rodou. Use “Testar conexão”.'}
              </p>
            )}
            {result?.status && <p className="text-xs text-muted-foreground">Situação da credencial: {credentialStatusLabel(result.status)}</p>}
            {onSyncNow && (
              <div className="space-y-2">
                <Button variant="outline" size="sm" onClick={() => { void sync(); }} disabled={!canSync || syncing}
                  title={canSync ? undefined : 'Só proprietário ou administrador pode sincronizar'}>
                  {syncing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />}
                  Sincronizar agora
                </Button>
                {syncText && <p role="status" className="text-sm text-muted-foreground">{syncText}</p>}
              </div>
            )}
            <DialogFooter><Button onClick={onClose}>Fechar</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
