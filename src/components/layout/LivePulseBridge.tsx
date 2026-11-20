import { useLivePulseBridge } from '@/hooks/useLivePulse';

/** Sem tela: mantém as listas (artigos, projetos, Central, teto de gasto) em dia com o pulso da organização. Sem `organizationId` = a do usuário. */
export function LivePulseBridge({ organizationId }: { organizationId?: string | null }) {
  useLivePulseBridge(organizationId);
  return null;
}
