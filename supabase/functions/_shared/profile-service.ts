/**
 * Decisões do servidor para o Perfil do Projeto (marco P2), SEM acesso a banco: recebem o estado atual e devolvem um plano.
 * A função de borda nexus-business só executa o plano. Assim a regra (papel, versão, validação, o que gravar) é testável sem rede.
 */
import { cleanStrategy } from './nexus-business.ts';
import { PROFILE_FIELDS_V2, isPrivateStore, type FieldStore, type FieldValue } from './profile-registry.ts';

const FIELD_STORE: Record<string, FieldStore> = Object.fromEntries(PROFILE_FIELDS_V2.map((d) => [d.key, d.store]));
import {
  applyPatch, asObject, buildPatch, effectiveChanges, overallCompleteness, readValues,
  type Patch, type SectionMap, type Stores,
} from './profile-model.ts';

export const WRITE_ROLES = ['owner', 'admin', 'editor'];
export const PRIVATE_ROLES = ['owner', 'admin'];
export const MODULE_ROLES = ['owner', 'admin'];

export interface CurrentState {
  strategy: Record<string, unknown>;
  strategyVersion: number;
  extendedExists: boolean;
  extendedVersion: number; // 0 quando a linha ainda não existe
  sections: SectionMap;
  privateExists: boolean;
  privateVersion: number; // 0 quando a linha ainda não existe
  finance: Record<string, unknown>;
  goals: Record<string, unknown>;
}
export interface Expected { strategy: number; extended: number; private: number }

export type SavePlan =
  | { ok: false; status: number; error: string; fields?: Record<string, string>; stores?: string[] }
  | { ok: true; noop: true; changed: [] }
  | {
    ok: true;
    noop: false;
    changed: string[];
    ignored: string[];
    extended: { insert: boolean; expectedVersion: number; nextVersion: number; sections: SectionMap; completeness: number };
    strategy: { expectedVersion: number; data: Record<string, string> } | null;
    private: { insert: boolean; expectedVersion: number; nextVersion: number; finance: Record<string, unknown>; goals: Record<string, unknown> } | null;
    snapshot: { version: number; snapshot: Record<string, unknown>; reason: string | null };
  };

// Predicados de tipo: funcionam com ou sem `strict` (a tela e os testes compilam sem strict; o Deno compila com strict).
export const isFailure = (p: SavePlan): p is Extract<SavePlan, { ok: false }> => p.ok === false;
export const isNoop = (p: SavePlan): p is Extract<SavePlan, { ok: true; noop: true }> => p.ok === true && p.noop === true;
export const isModuleFailure = (p: ModulePlan): p is Extract<ModulePlan, { ok: false }> => p.ok === false;

const toExpected = (value: unknown): Expected => {
  const o = asObject(value);
  const n = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : -1);
  return { strategy: n(o.strategy), extended: n(o.extended), private: n(o.private) };
};

export function storesOf(current: CurrentState): Stores {
  return { strategy: cleanStrategy(current.strategy), sections: asObject(current.sections) as SectionMap, finance: asObject(current.finance), goals: asObject(current.goals) };
}

export function planProfileSave(input: { role: string | null; current: CurrentState; changes: unknown; expected: unknown; reason?: unknown }): SavePlan {
  const { role, current } = input;
  if (!role || !WRITE_ROLES.includes(role)) return { ok: false, status: 403, error: 'role_not_allowed' };
  const canPrivate = PRIVATE_ROLES.includes(role);
  const expected = toExpected(input.expected);
  const stores = storesOf(current);
  const { patch, errors, ignored } = buildPatch(input.changes, canPrivate, stores);
  if (Object.keys(errors).length) return { ok: false, status: 422, error: 'validation_failed', fields: errors };
  const changed = effectiveChanges(stores, patch);
  if (!changed.length) return { ok: true, noop: true, changed: [] };

  // só o que mudou de verdade é gravado; o resto do perfil não é tocado
  const effective: Patch = { strategy: {}, sections: {}, finance: {}, goals: {}, changed };
  for (const key of changed) {
    const field = PROFILE_FIELDS_V2.find((d) => d.key === key)!;
    if (field.store === 'strategy') effective.strategy[key] = patch.strategy[key];
    else if (field.store === 'section') (effective.sections[field.step] ||= {})[key] = patch.sections[field.step][key];
    else effective[field.store][key] = patch[field.store][key];
  }
  // `model` derivado do tipo de cliente acompanha a mudança
  if ('model' in patch.strategy && patch.strategy.model !== stores.strategy.model) effective.strategy.model = patch.strategy.model;

  const merged = applyPatch(stores, effective);
  const strategyChanged = JSON.stringify(merged.strategy) !== JSON.stringify(stores.strategy);
  const privateChanged = Object.keys(effective.finance).length > 0 || Object.keys(effective.goals).length > 0;

  const conflicts: string[] = [];
  if (expected.extended !== current.extendedVersion) conflicts.push('extended');
  if (strategyChanged && expected.strategy !== current.strategyVersion) conflicts.push('strategy');
  if (privateChanged && expected.private !== current.privateVersion) conflicts.push('private');
  if (conflicts.length) return { ok: false, status: 409, error: 'profile_changed_reload', stores: conflicts };

  const nextVersion = current.extendedVersion + 1;
  const values = readValues(merged, false);
  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 300) : null;
  return {
    ok: true,
    noop: false,
    changed,
    ignored,
    extended: { insert: !current.extendedExists, expectedVersion: current.extendedVersion, nextVersion: current.extendedExists ? nextVersion : 1, sections: merged.sections, completeness: overallCompleteness(values, false) },
    strategy: strategyChanged ? { expectedVersion: current.strategyVersion, data: merged.strategy } : null,
    private: privateChanged ? { insert: !current.privateExists, expectedVersion: current.privateVersion, nextVersion: current.privateExists ? current.privateVersion + 1 : 1, finance: merged.finance, goals: merged.goals } : null,
    // o financeiro NUNCA entra na versão guardada
    snapshot: { version: current.extendedExists ? nextVersion : 1, snapshot: { strategy: merged.strategy, strategy_version: current.strategyVersion + (strategyChanged ? 1 : 0), sections: merged.sections, changed: changed.filter((k) => !isPrivateStore(FIELD_STORE[k])) }, reason },
  };
}

/** Restaurar uma versão = gravar, como nova versão, os valores não privados que a versão guardou. */
export function planProfileRestore(input: { role: string | null; current: CurrentState; snapshot: unknown; version: number; expected: unknown }): SavePlan {
  const snap = asObject(input.snapshot);
  const old = readValues({ strategy: cleanStrategy(snap.strategy), sections: asObject(snap.sections) as SectionMap }, false);
  const changes: Record<string, FieldValue | null> = {};
  for (const field of PROFILE_FIELDS_V2) {
    if (isPrivateStore(field.store)) continue;
    changes[field.key] = old[field.key] ?? null;
  }
  return planProfileSave({ role: input.role, current: input.current, changes, expected: input.expected, reason: `Restaurado da versão ${input.version}` });
}

export function canReadPrivate(role: string | null): boolean {
  return !!role && PRIVATE_ROLES.includes(role);
}

export type ModulePlan = { ok: false; status: number; error: string } | { ok: true; row: { module_code: string; enabled: boolean; reason: string | null } };

export function planModuleDecision(input: { role: string | null; catalog: Array<{ code: string; core: boolean }>; moduleCode: unknown; enabled: unknown; reason: unknown }): ModulePlan {
  if (!input.role || !MODULE_ROLES.includes(input.role)) return { ok: false, status: 403, error: 'role_not_allowed' };
  const mod = input.catalog.find((m) => m.code === input.moduleCode);
  if (!mod) return { ok: false, status: 422, error: 'module_unknown' };
  if (typeof input.enabled !== 'boolean') return { ok: false, status: 422, error: 'enabled_required' };
  if (mod.core && input.enabled === false) return { ok: false, status: 422, error: 'core_module_cannot_be_disabled' };
  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 500) : null;
  return { ok: true, row: { module_code: mod.code, enabled: input.enabled, reason } };
}
