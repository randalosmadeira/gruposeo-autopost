/**
 * i18n simples da Indexação e da linha do tempo: pt-BR primeiro, estrutura pronta para en e es.
 * Chave ausente em en/es cai no pt-BR (nunca aparece a chave crua). Textos explicativos gerados pelo servidor (higiene, bloqueios) ainda chegam em pt-BR:
 * as chaves estáveis (`hy.<check_key>`, `pr.<problema>`, `ev.<tipo>`) já permitem trocar o rótulo no navegador.
 */
import { createContext, useContext } from 'react';
import { PT, EN, ES, type Key } from '@/lib/i18n/indexation-dict';

export type Locale = 'pt-BR' | 'en' | 'es';
export const LOCALES: Locale[] = ['pt-BR', 'en', 'es'];
export const LOCALE_LABEL: Record<Locale, string> = { 'pt-BR': 'Português (Brasil)', en: 'English', es: 'Español' };
const STORE = 'zica-locale';
const DICTS: Record<Locale, Partial<Record<Key, string>>> = { 'pt-BR': PT, en: EN, es: ES };

/** Idioma escolhido pela pessoa (lembrado no navegador). Sem escolha = pt-BR (o produto é pt-BR primeiro; não adivinhamos pelo navegador). */
export function storedLocale(): Locale {
  try { const s = localStorage.getItem(STORE); if (s && (LOCALES as string[]).includes(s)) return s as Locale; } catch { /* sem armazenamento: padrão */ }
  return 'pt-BR';
}
export function storeLocale(l: Locale): void { try { localStorage.setItem(STORE, l); } catch { /* ignora */ } }

export type TFn = (key: Key, vars?: Record<string, string | number>) => string;
export function makeT(locale: Locale): TFn {
  return (key, vars) => {
    const raw = DICTS[locale][key] ?? PT[key] ?? key;
    return vars ? raw.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : `{${k}}`)) : raw;
  };
}
export const numberFmt = (locale: Locale) => (n: number) => n.toLocaleString(locale);
export const dateFmt = (locale: Locale) => (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }); };

export interface Ctx { locale: Locale; t: TFn; n: (v: number) => string; date: (iso: string) => string; setLocale: (l: Locale) => void }
const DEFAULT: Ctx = { locale: 'pt-BR', t: makeT('pt-BR'), n: numberFmt('pt-BR'), date: dateFmt('pt-BR'), setLocale: () => undefined };
export const I18nContext = createContext<Ctx>(DEFAULT);
/** Sem provedor, cai em pt-BR (cartões reutilizáveis funcionam em qualquer tela). */
export const useT = (): Ctx => useContext(I18nContext);
