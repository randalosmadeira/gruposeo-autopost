import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { listProjectEvents, type ProjectEvent } from '@/lib/engine-api';
import { useT } from '@/lib/i18n/core';
import type { Key } from '@/lib/i18n/indexation-dict';

const MODULE_LABEL: Record<string, string> = { indexacao: 'Indexação', visao_geral: 'Estrutura', backlinks: 'Backlinks' };

/** Linha do tempo do projeto (fatos publicados pelos módulos em project_events). Cartão reutilizável: use em qualquer tela de projeto (sem provedor de idioma, fica em pt-BR). */
export function ProjectTimeline({ projectId, module, limit = 20, title }: { projectId: string; module?: string; limit?: number; title?: string }) {
  const { t, date } = useT();
  const q = useQuery<{ events: ProjectEvent[] }>({ queryKey: ['project-events', projectId, module ?? 'todos', limit], queryFn: () => listProjectEvents(projectId, { module, limit }), enabled: !!projectId, retry: false, refetchOnWindowFocus: false });
  // o rótulo vem do dicionário pelo tipo do fato; tipo desconhecido usa o texto que o servidor mandou
  const label = (e: ProjectEvent) => { const k = `ev.${e.kind}` as Key; const own = t(k); return own === k ? e.text : typeof e.payload?.count === 'number' ? `${own} (${e.payload.count})` : own; };
  return (
    <section aria-labelledby="pt-title" className="space-y-2 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="pt-title" className="text-lg font-semibold">{title ?? t('tl.title')}</h2>
      {q.isLoading && <div aria-busy="true"><Skeleton className="h-16 w-full" /></div>}
      {q.isError && <p role="alert" className="text-sm text-red-300">{t('tl.error')}</p>}
      {q.data && q.data.events.length === 0 && <p className="text-sm text-muted-foreground">{t('tl.empty')}</p>}
      {q.data && q.data.events.length > 0 && (
        <ol className="space-y-2">
          {q.data.events.map((e) => (
            <li key={e.id} className="rounded border bg-background/40 p-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="break-words font-medium">{label(e)}</span><time className="text-xs text-muted-foreground" dateTime={e.created_at}>{date(e.created_at)}</time></div>
              <p className="text-xs text-muted-foreground">{MODULE_LABEL[e.module] || e.module}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
