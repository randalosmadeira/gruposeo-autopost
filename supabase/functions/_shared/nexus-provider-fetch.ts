/**
 * `fetch` original do runtime, capturado ANTES de `installSpendLock()` trocar `globalThis.fetch`.
 * O primeiro import de `nexus-intelligence/index.ts` deve ser este arquivo (antes de `nexus-runtime-bootstrap.ts`).
 * Uso exclusivo para chamadas a provedores com URL montada pelo servidor (allowlist em `nexus-providers.ts`
 * e nos coletores). Nunca passar URL vinda do cliente.
 */
export const providerFetch: typeof fetch = globalThis.fetch.bind(globalThis);
