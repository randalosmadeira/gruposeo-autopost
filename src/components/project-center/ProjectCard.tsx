import type { ProjectHealth } from '@/lib/project-center-api';
import { STATE_STYLE } from './state-style';

/** Cartão de um projeto na Central: semáforo, nota e o motivo, em uma olhada. */
export function ProjectCard({ health, selected, onSelect }: { health: ProjectHealth; selected: boolean; onSelect: () => void }) {
  const st = STATE_STYLE[health.state];
  return (
    <li className="min-w-0">
      <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`${health.name}: ${st.label}${health.score !== null ? `, nota ${health.score}` : ', sem nota'}`}
        className={`flex h-full w-full min-w-0 flex-col gap-2 rounded-xl border bg-card/40 p-3 text-left transition-colors hover:bg-card/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:p-4 ${selected ? 'border-primary bg-primary/5' : st.ring}`}>
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block break-words font-semibold leading-snug">{health.name}</span>
            <span className="block break-all text-xs text-muted-foreground">{health.domain || 'sem domínio'}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-2xl font-bold tabular-nums leading-none">{health.score === null ? '–' : health.score}</span>
            <span className="block text-[11px] text-muted-foreground">{health.score === null ? 'sem nota' : 'de 100'}</span>
          </span>
        </span>
        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${st.badge}`}>
          <span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden />{st.label}
        </span>
        <span className="break-words text-sm text-muted-foreground">{health.reason}</span>
        {health.suggestions.length > 0 && health.lifecycle_status !== 'arquivado' && <span className="text-xs text-amber-300">{health.suggestions.length === 1 ? '1 sugestão' : `${health.suggestions.length} sugestões`}</span>}
      </button>
    </li>
  );
}
