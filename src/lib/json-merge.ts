/**
 * Fusão de colunas JSON do projeto (commercial_info, social_links, editorial_identity).
 *
 * Por que existe: o card de /projects gravava essas colunas inteiras com só os campos que a tela conhece e apagava o resto
 * (schema_profile, nexus_visual_policy, social_links.kwai e social_links.tiktok). Aqui a regra é: o que não vier no
 * "patch" é preservado; o que vier substitui a chave correspondente (fusão rasa, por chave).
 * Sem dependências de React ou do Supabase, para poder ser testado e reutilizado pelo front e pelos novos fluxos do Perfil.
 */

export type JsonObject = Record<string, unknown>;

/** Objeto JSON simples; qualquer outra coisa (nulo, lista, texto, número) vira objeto vazio. */
export function asJsonObject(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

/** Une `existing` e `patch`: chaves do patch vencem; chaves que só existem em `existing` são mantidas. Não altera os argumentos. */
export function mergeJsonObject(existing: unknown, patch: unknown): JsonObject {
  return { ...asJsonObject(existing), ...asJsonObject(patch) };
}

/** Colunas de `projects` que recebem fusão em vez de substituição. */
export const PROJECT_JSON_MERGE_COLUMNS = ['commercial_info', 'social_links', 'editorial_identity'] as const;
export type ProjectJsonMergeColumn = (typeof PROJECT_JSON_MERGE_COLUMNS)[number];

/** Quais colunas de fusão aparecem na atualização (undefined não conta: significa "não mexer"). */
export function mergeColumnsPresent(updates: Record<string, unknown>): ProjectJsonMergeColumn[] {
  return PROJECT_JSON_MERGE_COLUMNS.filter((column) => updates[column] !== undefined);
}

/**
 * Aplica a fusão sobre uma atualização de projeto, usando a linha atual do banco como base.
 * `current` traz as colunas lidas agora (pode faltar alguma). Devolve uma nova atualização; não altera `updates`.
 */
export function applyProjectJsonMerge<T extends Record<string, unknown>>(updates: T, current: Record<string, unknown> | null | undefined): T {
  const result: Record<string, unknown> = { ...updates };
  for (const column of mergeColumnsPresent(updates)) {
    result[column] = mergeJsonObject(current?.[column], updates[column]);
  }
  return result as T;
}
