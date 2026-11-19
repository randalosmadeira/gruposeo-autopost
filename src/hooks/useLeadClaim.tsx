import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { HANDOFF_EVENT, clearHandoff, isHandoffToken, leadClaim, readHandoff } from '@/lib/lead-api';

/**
 * Depois que a pessoa que veio do atalho do site se cadastra e entra, liga o cadastro ao lead pelo token guardado.
 * Roda uma vez por sessão de login; o token é apagado de qualquer jeito (usado, vencido ou inválido) para nunca repetir.
 */
export function useLeadClaim(): void {
  const { user } = useAuth();
  const { toast } = useToast();
  const doneFor = useRef<string | null>(null);
  // sobe quando um token novo é guardado com a pessoa já logada (por exemplo, quem já tinha conta e preencheu o formulário)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    window.addEventListener(HANDOFF_EVENT, on);
    return () => window.removeEventListener(HANDOFF_EVENT, on);
  }, []);
  useEffect(() => {
    if (!user || doneFor.current === user.id) return;
    // o token vem do armazenamento local; se a pessoa confirmou o e-mail em OUTRO navegador (ex.: leitor de e-mail do celular), vem dos dados do cadastro
    const stored = readHandoff();
    const meta = (user as { user_metadata?: Record<string, unknown> }).user_metadata?.lead_handoff;
    const fromProfile = isHandoffToken(meta) ? meta : null;
    const token = stored || fromProfile;
    if (!token) return;
    doneFor.current = user.id;
    leadClaim(token)
      .then((r) => {
        if (r.space === 'created') toast({ title: 'Seu espaço de teste está pronto', description: 'Você já pode criar o seu primeiro projeto. A IA paga é liberada pela nossa equipe.' });
      })
      .catch(() => undefined)
      .finally(() => {
        clearHandoff();
        doneFor.current = null;
        // tira o token dos dados do usuário (uso único; o servidor já recusaria a repetição)
        if (fromProfile) void Promise.resolve(supabase.auth?.updateUser?.({ data: { lead_handoff: null } })).catch(() => undefined);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tick]);
}

/** Componente sem tela: monta o vínculo dentro do AuthProvider. */
export function LeadClaimer(): null {
  useLeadClaim();
  return null;
}
