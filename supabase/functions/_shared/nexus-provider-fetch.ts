/**
 * `fetch` original do runtime, capturado ANTES de `installSpendLock()` trocar `globalThis.fetch`.
 * O primeiro import de `nexus-intelligence/index.ts` deve ser este arquivo (antes de `nexus-runtime-bootstrap.ts`).
 * Uso exclusivo para chamadas a provedores com URL montada pelo servidor (allowlist em `nexus-providers.ts`
 * e nos coletores). Nunca passar URL vinda do cliente.
 */
import { makeProviderFetch } from './nexus-spend-lock.ts';
/**
 * Com PAID_SERVICES_BLOCKED = true (hoje) isto é exatamente o fetch original, como sempre foi. Com false, é o fetch guardado pelo
 * Teto Diário de Gasto: chamada paga só sai com reserva (spend-gate.ts); o que não é pago passa direto.
 */
export const providerFetch: typeof fetch = makeProviderFetch(globalThis.fetch.bind(globalThis));
