import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SP_REGIOES, UF_LIST, UF_NOME } from '../../../supabase/functions/_shared/taxonomy-geo';
import type { CompetitorsReply, NodeRow } from '@/lib/taxonomy-api';

const SELECT = 'mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';
export interface CompetitorQuery { filter: { area?: string; uf?: string; municipio?: string; bairro?: string; country?: string; regiao?: string; scope?: string }; kind: 'concorrente' | 'diretorio' | 'todos' }

type Loc = { brasil?: number; estados?: Record<string, number>; regioes?: Record<string, number>; municipios?: Record<string, number>; bairros?: Record<string, number>; paises?: Record<string, number> };
function topPlaces(l: Loc | undefined): string {
  if (!l) return 'sem dados';
  const parts: string[] = [];
  if (l.brasil) parts.push(`Brasil ${l.brasil}×`);
  const top = (o: Record<string, number> | undefined, n: number) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}×`);
  parts.push(...top(l.paises, 2), ...top(l.estados, 3), ...top(l.regioes, 2), ...top(l.municipios, 3), ...top(l.bairros, 2));
  return parts.length ? parts.join(' · ') : 'sem dados';
}

/** Concorrentes por área, estado, município, região e escopo. Domínios de diretório/portal aparecem marcados, não escondidos. */
export function CompetitorsBoard({ nodes, reply, loading, onFilter }: { nodes: NodeRow[]; reply: CompetitorsReply | null; loading: boolean; onFilter: (q: CompetitorQuery) => void }) {
  const [area, setArea] = useState('');
  const [uf, setUf] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [bairro, setBairro] = useState('');
  const [country, setCountry] = useState('');
  const [regiao, setRegiao] = useState('');
  const [scope, setScope] = useState('');
  const [kind, setKind] = useState<CompetitorQuery['kind']>('concorrente');
  const labelOf = new Map(nodes.map((n) => [n.slug, n.label]));
  const areas = nodes.filter((n) => n.status !== 'rejeitado' && n.kind !== 'nicho').sort((a, b) => a.slug.localeCompare(b.slug));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const filter: CompetitorQuery['filter'] = {};
    if (area) filter.area = area; if (uf) filter.uf = uf; if (municipio.trim()) filter.municipio = municipio.trim(); if (bairro.trim()) filter.bairro = bairro.trim(); if (country.trim()) filter.country = country.trim().toLowerCase(); if (regiao) filter.regiao = regiao; if (scope) filter.scope = scope;
    onFilter({ filter, kind });
  };
  const list = reply?.competitors ?? [];
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
        <div><label htmlFor="cp-area" className="block text-xs text-muted-foreground">Área</label>
          <select id="cp-area" className={`${SELECT} w-56`} value={area} onChange={(e) => setArea(e.target.value)}><option value="">Todas</option>{areas.map((n) => <option key={n.id} value={n.slug}>{n.kind === 'subarea' ? '— ' : ''}{n.label}</option>)}</select></div>
        <div><label htmlFor="cp-uf" className="block text-xs text-muted-foreground">Estado</label>
          <select id="cp-uf" className={SELECT} value={uf} onChange={(e) => setUf(e.target.value)}><option value="">Todos</option>{UF_LIST.map((u) => <option key={u} value={u}>{UF_NOME[u]} ({u})</option>)}</select></div>
        <div><label htmlFor="cp-mun" className="block text-xs text-muted-foreground">Município</label>
          <Input id="cp-mun" className="mt-1 h-10 w-44 max-w-full" value={municipio} onChange={(e) => setMunicipio(e.target.value)} /></div>
        <div><label htmlFor="cp-bairro" className="block text-xs text-muted-foreground">Bairro</label>
          <Input id="cp-bairro" className="mt-1 h-10 w-36 max-w-full" value={bairro} onChange={(e) => setBairro(e.target.value)} /></div>
        <div><label htmlFor="cp-country" className="block text-xs text-muted-foreground">País (sigla)</label>
          <Input id="cp-country" maxLength={2} className="mt-1 h-10 w-20 max-w-full" value={country} onChange={(e) => setCountry(e.target.value)} /></div>
        <div><label htmlFor="cp-reg" className="block text-xs text-muted-foreground">Região</label>
          <select id="cp-reg" className={SELECT} value={regiao} onChange={(e) => setRegiao(e.target.value)}><option value="">Todas</option>{SP_REGIOES.map((r) => <option key={r.slug} value={r.label}>{r.label}</option>)}</select></div>
        <div><label htmlFor="cp-scope" className="block text-xs text-muted-foreground">Alcance da busca</label>
          <select id="cp-scope" className={SELECT} value={scope} onChange={(e) => setScope(e.target.value)}><option value="">Todos</option><option value="brasil">Brasil</option><option value="estado">Estado</option><option value="regiao">Região</option><option value="municipio">Município</option><option value="bairro">Bairro</option><option value="pais">País</option></select></div>
        <div><label htmlFor="cp-kind" className="block text-xs text-muted-foreground">Mostrar</label>
          <select id="cp-kind" className={SELECT} value={kind} onChange={(e) => setKind(e.target.value as CompetitorQuery['kind'])}><option value="concorrente">Só concorrentes</option><option value="diretorio">Só diretórios e portais</option><option value="todos">Todos</option></select></div>
        <Button type="submit" variant="outline" disabled={loading}>Filtrar</Button>
      </form>
      {reply === null ? <p className="text-sm text-muted-foreground">Sem dados. Planeje uma campanha e traga os resultados das buscas.</p> : list.length === 0 ? <p role="status" className="text-sm text-muted-foreground">Sem dados para este filtro.</p> : (
        <div className="overflow-x-auto" role="region" aria-label="Lista de concorrentes" tabIndex={0}>
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead><tr className="text-xs text-muted-foreground"><th className="py-1 pr-3 font-medium">Domínio</th><th className="py-1 pr-3 font-medium">Tipo</th><th className="py-1 pr-3 font-medium">Aparições</th><th className="py-1 pr-3 font-medium">Posição média</th><th className="py-1 pr-3 font-medium">Pontos</th><th className="py-1 pr-3 font-medium">Áreas</th><th className="py-1 font-medium">Onde aparece</th></tr></thead>
            <tbody>{list.map((c) => (
              <tr key={c.host} className="border-t align-top">
                <td className="break-all py-1 pr-3 font-medium">{c.host}</td>
                <td className="py-1 pr-3">{c.kind === 'diretorio' ? <span className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">Diretório/portal</span> : 'Concorrente'}</td>
                <td className="py-1 pr-3 tabular-nums">{c.appearances}</td>
                <td className="py-1 pr-3 tabular-nums">{c.avg_position === null ? 'sem dados' : c.avg_position.toLocaleString('pt-BR')}</td>
                <td className="py-1 pr-3 tabular-nums">{c.score.toLocaleString('pt-BR')}</td>
                <td className="py-1 pr-3 text-xs">{c.areas.length ? c.areas.slice(0, 4).map((a) => labelOf.get(a) ?? a).join('; ') : 'sem dados'}</td>
                <td className="py-1 text-xs text-muted-foreground">{topPlaces(c.locations)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {reply && <p className="text-xs text-muted-foreground">{reply.filtered ? `${reply.total ?? list.length} domínio(s) neste filtro · ${reply.results_used ?? 0} resultado(s) usados${reply.own_appearances ? ` · o seu site apareceu ${reply.own_appearances}×` : ''}` : 'Resumo geral do projeto (todas as campanhas).'} Pontos: cada aparição vale 11 menos a posição (anúncio não pontua); é uma medida de presença, não de tráfego.{reply.truncated ? ' Havia resultados demais: a lista usa só os primeiros.' : ''}</p>}
    </div>
  );
}
