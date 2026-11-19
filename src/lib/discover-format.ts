import type { FieldValue } from '../../supabase/functions/_shared/profile-registry';

/** Texto de um valor do perfil para mostrar na tela. */
export const showValue = (v: FieldValue | null | undefined): string => (Array.isArray(v) ? v.join(', ') : typeof v === 'number' ? v.toLocaleString('pt-BR') : String(v ?? ''));
