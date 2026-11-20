import type { PageStatus } from '@/lib/studio-api';

/** Cores do estado da página (borda e fundo suaves; o estado também aparece em texto, nunca só em cor). */
export const STATUS_STYLE: Record<PageStatus, string> = {
  rascunho: 'border-slate-500/50 bg-slate-500/10', em_revisao: 'border-amber-500/50 bg-amber-500/10', aprovada: 'border-sky-500/50 bg-sky-500/10', publicada: 'border-emerald-500/50 bg-emerald-500/10', despublicada: 'border-red-500/40 bg-red-500/10',
};
