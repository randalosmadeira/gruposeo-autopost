/**
 * Painel "em tempo real" por varredura leve (pulso): a cada poucos segundos, SÓ com a aba visível, o navegador pergunta ao servidor o carimbo
 * da última mudança de cada área (eventos, projetos, artigos, gasto) e recarrega apenas as consultas da área que mudou.
 *
 * Por que não Realtime direto: `project_events` não tem permissão de leitura para o navegador (só a chave de serviço) e `projects` não está na
 * publicação supabase_realtime e só libera colunas escolhidas; o Realtime de `articles` já existe (useArticles) e continua valendo.
 * Latência real deste barramento: o intervalo (8 s) mais o tempo da chamada; NÃO é instantâneo. Instantâneo exigiria Realtime/broadcast.
 */
import type { QueryKey } from '@tanstack/react-query';
import { callLifecycle } from '@/lib/project-center-api';

export type PulseArea = 'events' | 'projects' | 'articles' | 'spend';
export type PulseStamps = Record<PulseArea, string | null>;
export interface PulseEvent { id: string; project_id: string; module: string; kind: string; created_at: string; text: string }
export interface PulseResponse { organization_id: string; server_time: string; stamps: PulseStamps; events: PulseEvent[] }

/** Intervalo entre checagens (a aba escondida não consulta: o react-query pausa o intervalo em segundo plano). */
export const PULSE_INTERVAL_MS = 8000;

/** Consultas recarregadas quando cada área muda. Só o necessário: nada de recarregar a tela inteira a cada pulso. */
export const PULSE_INVALIDATES: Record<PulseArea, QueryKey[]> = {
  events: [['project-center', 'overview'], ['project-center', 'detail'], ['project-events'], ['spend-status']],
  projects: [['projects'], ['project-center', 'overview'], ['project-center', 'detail']],
  articles: [['articles'], ['articles-list'], ['articles-counts'], ['project-center', 'overview']],
  spend: [['spend-status'], ['spend-history']],
};

/** Áreas cujo carimbo mudou desde a leitura anterior. Primeira leitura (sem anterior) só serve de base: nada muda. Carimbo null não conta como mudança. */
export function changedAreas(prev: PulseStamps | null, next: PulseStamps): PulseArea[] {
  if (!prev) return [];
  return (Object.keys(next) as PulseArea[]).filter((k) => next[k] !== null && next[k] !== prev[k]);
}

/** Consultas distintas a recarregar para as áreas que mudaram (sem repetir). */
export function queriesToRefresh(areas: PulseArea[]): QueryKey[] {
  const seen = new Set<string>();
  const out: QueryKey[] = [];
  for (const a of areas) for (const k of PULSE_INVALIDATES[a]) { const id = JSON.stringify(k); if (!seen.has(id)) { seen.add(id); out.push(k); } }
  return out;
}

/** "agora", "há 8 s", "há 2 min", "há 1 h": texto honesto de quanto tempo faz desde uma leitura. `null` = ainda não leu. */
export function ageText(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'ainda não lido';
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 2) return 'agora';
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  return `há ${Math.floor(s / 3600)} h`;
}

export const callPulse = (organizationId: string, since?: string | null) =>
  callLifecycle<PulseResponse>('pulse', { organizationId, ...(since ? { since } : {}) });
