import type { HealthState } from '@/lib/project-center-api';

/** Cor e texto de cada estado. O estado SEMPRE aparece também por extenso (o semáforo nunca depende só da cor). */
export const STATE_STYLE: Record<HealthState, { label: string; dot: string; badge: string; ring: string }> = {
  saudavel: { label: 'Saudável', dot: 'bg-emerald-500', badge: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300', ring: 'border-emerald-500/30' },
  atencao: { label: 'Atenção', dot: 'bg-amber-400', badge: 'border-amber-400/50 bg-amber-400/10 text-amber-300', ring: 'border-amber-400/30' },
  critico: { label: 'Crítico', dot: 'bg-red-500', badge: 'border-red-500/50 bg-red-500/10 text-red-300', ring: 'border-red-500/40' },
  inativo: { label: 'Inativo', dot: 'bg-slate-400', badge: 'border-slate-400/50 bg-slate-400/10 text-slate-300', ring: 'border-slate-400/30' },
  pausado: { label: 'Pausado', dot: 'bg-sky-400', badge: 'border-sky-400/50 bg-sky-400/10 text-sky-300', ring: 'border-sky-400/30' },
  arquivado: { label: 'Arquivado', dot: 'bg-zinc-500', badge: 'border-zinc-500/50 bg-zinc-500/10 text-zinc-300', ring: 'border-zinc-500/30' },
};
export const STATE_ORDER: HealthState[] = ['critico', 'atencao', 'inativo', 'pausado', 'saudavel', 'arquivado'];

export const ITEM_STYLE: Record<string, { label: string; cls: string }> = {
  ok: { label: 'Em ordem', cls: 'text-emerald-300' },
  atencao: { label: 'Atenção', cls: 'text-amber-300' },
  critico: { label: 'Crítico', cls: 'text-red-300' },
  sem_dados: { label: 'Sem dados', cls: 'text-muted-foreground' },
  info: { label: 'Informação', cls: 'text-sky-300' },
};

export const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return 'sem data';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'sem data';
};
