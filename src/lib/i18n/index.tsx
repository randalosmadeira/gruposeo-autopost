import { useMemo, useState, type ReactNode } from 'react';
import { I18nContext, dateFmt, makeT, numberFmt, storeLocale, storedLocale, type Ctx, type Locale } from '@/lib/i18n/core';

/** Provedor de idioma da tela (pt-BR primeiro; a escolha fica lembrada no navegador). */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setL] = useState<Locale>(storedLocale);
  const value = useMemo<Ctx>(() => ({ locale, t: makeT(locale), n: numberFmt(locale), date: dateFmt(locale), setLocale: (l) => { storeLocale(l); setL(l); } }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
