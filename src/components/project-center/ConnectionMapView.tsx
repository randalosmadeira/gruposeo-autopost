import type { ConnectionMap } from '@/lib/project-center-api';

const MODULE_STATE: Record<string, { label: string; cls: string }> = {
  com_dados: { label: 'com dados', cls: 'border-emerald-500/50 text-emerald-300' },
  sem_dados: { label: 'sem dados', cls: 'border-border text-muted-foreground' },
  nao_instalado: { label: 'não instalado', cls: 'border-border text-muted-foreground' },
  planejado: { label: 'planejado', cls: 'border-dashed border-border text-muted-foreground' },
};
const LINK_STATE: Record<string, { label: string; cls: string }> = {
  ok: { label: 'ligado', cls: 'text-emerald-300' },
  sem_origem: { label: 'quebrado', cls: 'text-red-300' },
  sem_consumo: { label: 'dado parado', cls: 'text-amber-300' },
  vazio: { label: 'vazio', cls: 'text-muted-foreground' },
  prevista: { label: 'prevista', cls: 'text-sky-300' },
};

/** Mapa de conexões: quais módulos têm dado, a cadeia combinada e onde falta ligação. Tudo em texto (sem depender de cor). */
export function ConnectionMapView({ map }: { map: ConnectionMap }) {
  const label = (k: string) => map.modules.find((m) => m.key === k)?.label || k;
  const notable = map.links.filter((l) => l.state !== 'vazio' && !(l.from === 'projeto' && l.state === 'ok'));
  return (
    <div className="space-y-4">
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Módulos">
        {map.modules.map((m) => {
          const s = MODULE_STATE[m.state];
          return (
            <li key={m.key} className={`min-w-0 rounded-lg border p-2.5 text-sm ${s.cls}`}>
              <span className="flex flex-wrap items-baseline justify-between gap-x-2"><span className="font-medium text-foreground">{m.label}</span><span className="text-xs">{s.label}</span></span>
              <span className="block break-words text-xs text-muted-foreground">{m.detail}</span>
            </li>
          );
        })}
      </ul>
      <div>
        <h4 className="text-sm font-semibold">Cadeia combinada</h4>
        <p className="text-xs text-muted-foreground">Perfil → taxonomia → estúdio de páginas → funil e conversões → monitor → alertas → árvore da marca.</p>
        <ol className="mt-2 space-y-1 text-sm">
          {map.chain.map((c) => (
            <li key={`${c.from}-${c.to}`} className="flex flex-wrap gap-x-2"><span className="break-words">{label(c.from)} → {label(c.to)}</span><span className={c.connected ? 'text-emerald-300' : 'text-sky-300'}>{c.connected ? 'ligado no código' : 'ligação prevista, ainda não construída'}</span></li>
          ))}
        </ol>
      </div>
      {notable.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Ligações</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {notable.map((l) => <li key={`${l.from}-${l.to}-${l.state}`} className="break-words"><span className={`mr-2 text-xs ${LINK_STATE[l.state].cls}`}>[{LINK_STATE[l.state].label}]</span>{l.text}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
