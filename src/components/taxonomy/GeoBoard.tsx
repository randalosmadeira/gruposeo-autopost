import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GRANDES_REGIOES, SP_REGIOES, UF_LIST, UF_NOME, UF_REGIAO, ufsDaRegiao } from '../../../supabase/functions/_shared/taxonomy-geo';
import type { GeoOverview, ScopeRow, TaxonomyOverview } from '@/lib/taxonomy-api';
import { SOURCE_LABEL, StatusChip } from './AreaTree';

export const ROLE_LABEL: Record<string, string> = { sede: 'Sede', atende: 'Atende', plantao: 'Plantão', alvo: 'Alvo (há demanda)' };
const SELECT = 'mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';
type Status = ScopeRow['status'];

const countryName = (cc: string): string => { try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(cc.toUpperCase()) || cc.toUpperCase(); } catch { return cc.toUpperCase(); } };
const isForeign = (r: ScopeRow) => !!r.country && r.country !== 'br';
const placeLabel = (r: ScopeRow) => isForeign(r) ? `${r.municipio ? `${r.municipio}, ` : ''}${countryName(r.country as string)} (${r.country}:${r.language ?? 'pt-BR'})` : r.bairro ? `${r.bairro} (${r.municipio}${r.uf ? `-${r.uf}` : ''})` : r.municipio ? `${r.municipio}${r.uf ? ` (${r.uf})` : ''}` : r.regiao ? r.regiao : r.uf ? `Estado inteiro: ${UF_NOME[r.uf as keyof typeof UF_NOME] ?? r.uf}` : 'Lugar';
const evText = (r: ScopeRow) => { const e = (r.evidence || {}) as { count?: number; weight?: number }; return e.count ? `${e.count} página(s)/busca(s)${e.weight && e.weight > e.count ? ` · ${e.weight.toLocaleString('pt-BR')} impressões` : ''}` : ''; };

function EntryRow({ r, canEdit, busy, onDecide, onRemove }: { r: ScopeRow; canEdit: boolean; busy: boolean; onDecide: (ids: string[], s: Status) => void; onRemove: (ids: string[]) => void }) {
  const name = placeLabel(r);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-sm">
      <span className="break-words">{name}</span>
      <span className="text-xs text-muted-foreground">{ROLE_LABEL[r.role] ?? r.role}</span>
      <StatusChip s={r.status} />
      <span className="text-[11px] text-muted-foreground">{SOURCE_LABEL[r.source] ?? r.source}{evText(r) ? ` · ${evText(r)}` : ''}</span>
      {canEdit && (
        <span className="flex flex-wrap gap-1">
          {r.status !== 'aprovado' && <Button size="sm" variant="outline" disabled={busy} aria-label={`Aprovar lugar ${name} (${ROLE_LABEL[r.role] ?? r.role})`} onClick={() => onDecide([r.id], 'aprovado')}>Aprovar</Button>}
          {r.status !== 'rejeitado' && <Button size="sm" variant="outline" disabled={busy} aria-label={`Rejeitar lugar ${name} (${ROLE_LABEL[r.role] ?? r.role})`} onClick={() => onDecide([r.id], 'rejeitado')}>Rejeitar</Button>}
          <Button size="sm" variant="ghost" disabled={busy} aria-label={`Remover lugar ${name} (${ROLE_LABEL[r.role] ?? r.role})`} onClick={() => onRemove([r.id])}>Remover</Button>
        </span>
      )}
    </li>
  );
}

interface Props {
  geo: GeoOverview | undefined; scope: ScopeRow[]; ibge: TaxonomyOverview['ibge']; canEdit: boolean; busy: boolean; syncing: boolean;
  onSync: () => void; onDecide: (ids: string[], s: Status) => void; onRemove: (ids: string[]) => void; onDistricts: () => void; districting: boolean;
  onAdd: (e: { role: string; uf: string | null; municipio: string | null; bairro: string | null; regiao: string | null; country: string; language: string }) => Promise<boolean>;
}

/** Brasil > grande região > estado > município: onde o negócio atua e onde há demanda, com a cobertura de municípios do IBGE. */
export function GeoBoard({ geo, scope, ibge, canEdit, busy, syncing, onSync, onDecide, onRemove, onAdd, onDistricts, districting }: Props) {
  const [role, setRole] = useState('atende');
  const [uf, setUf] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [regiao, setRegiao] = useState('');
  const [bairro, setBairro] = useState('');
  const [country, setCountry] = useState('br');
  const [language, setLanguage] = useState('pt-BR');
  const live = useMemo(() => scope.filter((s) => s.status !== 'rejeitado'), [scope]);
  const byUf = useMemo(() => {
    const m = new Map<string, ScopeRow[]>();
    for (const s of scope) if (s.uf && !isForeign(s)) m.set(s.uf, [...(m.get(s.uf) ?? []), s]);
    return m;
  }, [scope]);
  const regionOnly = scope.filter((s) => !s.uf && s.regiao && !isForeign(s));
  const abroad = scope.filter(isForeign);
  const covered = (u: string) => new Set((byUf.get(u) ?? []).filter((s) => s.status !== 'rejeitado' && s.municipio).map((s) => s.municipio)).size;
  const total = geo?.loaded ? geo.total : null;
  const coveredTotal = new Set(live.filter((s) => s.municipio && s.uf).map((s) => `${s.uf}:${s.municipio}`)).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm"><strong>Brasil</strong>: {live.length} lugar(es) no escopo{total !== null ? ` · ${coveredTotal} de ${total.toLocaleString('pt-BR')} municípios do IBGE (${total ? Math.round((coveredTotal / total) * 1000) / 10 : 0}%)` : ' · municípios do IBGE ainda não carregados (sem dados de cobertura)'}</p>
        {canEdit && <Button variant="outline" disabled={districting || busy} onClick={onDistricts}>{districting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Buscando bairros…</> : 'Sugerir bairros (distritos do IBGE)'}</Button>}
        {canEdit && <Button variant="outline" disabled={syncing} onClick={onSync}>{syncing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Carregando do IBGE…</> : ibge.loaded ? 'Atualizar municípios do IBGE' : 'Carregar municípios do IBGE'}</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Os municípios vêm da base pública do IBGE (sem chave e sem custo){ibge.fetched_at ? `, carregados em ${new Date(ibge.fetched_at).toLocaleDateString('pt-BR')}` : ''}. {ibge.loaded && !ibge.with_population ? 'A população não veio: o plano de "maiores cidades" fica sem dados até recarregar.' : ''} Nomes que também são termos jurídicos (custódia, liberdade, saúde, posse, penha) só contam como cidade com contexto claro.</p>

      {GRANDES_REGIOES.map((g) => {
        const ufs = ufsDaRegiao(g);
        const n = ufs.reduce((acc, u) => acc + (byUf.get(u)?.filter((s) => s.status !== 'rejeitado').length ?? 0), 0);
        return (
          <details key={g} className="rounded-lg border bg-background/40 p-3" open={n > 0}>
            <summary className="cursor-pointer text-sm font-semibold">{g} <span className="font-normal text-muted-foreground">· {n} lugar(es) no escopo</span></summary>
            <ul className="mt-2 space-y-2">
              {regionOnly.filter((s) => s.regiao === g).map((s) => <EntryRow key={s.id} r={s} canEdit={canEdit} busy={busy} onDecide={onDecide} onRemove={onRemove} />)}
              {ufs.map((u) => {
                const rows = byUf.get(u) ?? [];
                const info = geo?.by_uf?.[u];
                return (
                  <li key={u}>
                    <details open={rows.some((s) => s.status !== 'rejeitado')}>
                      <summary className="cursor-pointer text-sm">{UF_NOME[u]} ({u}) <span className="text-xs text-muted-foreground">· {info ? `${covered(u)} de ${info.municipios} municípios` : 'sem dados de municípios'} · {rows.length} lugar(es)</span></summary>
                      {rows.length === 0 ? <p className="mt-1 pl-3 text-xs text-muted-foreground">Sem dados.</p> : <ul className="mt-1 divide-y pl-3">{rows.map((s) => <EntryRow key={s.id} r={s} canEdit={canEdit} busy={busy} onDecide={onDecide} onRemove={onRemove} />)}</ul>}
                    </details>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}

      <details className="rounded-lg border bg-background/40 p-3" open={abroad.length > 0}>
        <summary className="cursor-pointer text-sm font-semibold">Outros países e mercados <span className="font-normal text-muted-foreground">· {abroad.filter((s) => s.status !== 'rejeitado').length} lugar(es)</span></summary>
        {abroad.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">Sem dados. Mercados como pt:Lisboa, fr:Paris ou us:Miami (o mesmo formato dos conjuntos de prompts do NEXUS) entram aqui.</p> : <ul className="mt-1 divide-y">{abroad.map((s) => <EntryRow key={s.id} r={s} canEdit={canEdit} busy={busy} onDecide={onDecide} onRemove={onRemove} />)}</ul>}
      </details>

      {canEdit && (
        <form className="flex flex-wrap items-end gap-3 border-t pt-3" onSubmit={async (e) => { e.preventDefault(); const abroadNow = country.trim().toLowerCase() !== 'br'; if (await onAdd({ role, uf: abroadNow ? null : uf || null, municipio: municipio.trim() || null, bairro: abroadNow ? null : bairro.trim() || null, regiao: abroadNow ? null : regiao || null, country: country.trim().toLowerCase() || 'br', language: language.trim() || 'pt-BR' })) { setMunicipio(''); setBairro(''); } }}>
          <div><label htmlFor="geo-role" className="block text-xs text-muted-foreground">Função do lugar</label>
            <select id="geo-role" className={SELECT} value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label htmlFor="geo-country" className="block text-xs text-muted-foreground">País (sigla)</label>
            <Input id="geo-country" maxLength={2} className="mt-1 h-10 w-20 max-w-full" value={country} onChange={(e) => setCountry(e.target.value)} /></div>
          {country.trim().toLowerCase() !== 'br' && <div><label htmlFor="geo-lang" className="block text-xs text-muted-foreground">Língua da busca</label>
            <Input id="geo-lang" className="mt-1 h-10 w-24 max-w-full" value={language} onChange={(e) => setLanguage(e.target.value)} /></div>}
          {country.trim().toLowerCase() === 'br' && <div><label htmlFor="geo-uf" className="block text-xs text-muted-foreground">Estado</label>
            <select id="geo-uf" className={SELECT} value={uf} onChange={(e) => setUf(e.target.value)}><option value="">(nenhum)</option>{UF_LIST.map((u) => <option key={u} value={u}>{UF_NOME[u]} ({u}) · {UF_REGIAO[u]}</option>)}</select></div>}
          <div><label htmlFor="geo-mun" className="block text-xs text-muted-foreground">{country.trim().toLowerCase() === 'br' ? 'Município (opcional)' : 'Cidade (opcional)'}</label>
            <Input id="geo-mun" className="mt-1 h-10 w-52 max-w-full" value={municipio} onChange={(e) => setMunicipio(e.target.value)} /></div>
          {country.trim().toLowerCase() === 'br' && <div><label htmlFor="geo-bairro" className="block text-xs text-muted-foreground">Bairro (opcional)</label>
            <Input id="geo-bairro" className="mt-1 h-10 w-44 max-w-full" value={bairro} onChange={(e) => setBairro(e.target.value)} /></div>}
          {country.trim().toLowerCase() === 'br' && <div><label htmlFor="geo-reg" className="block text-xs text-muted-foreground">Região (opcional)</label>
            <select id="geo-reg" className={SELECT} value={regiao} onChange={(e) => setRegiao(e.target.value)}><option value="">(nenhuma)</option>{SP_REGIOES.map((r) => <option key={r.slug} value={r.label}>{r.label}</option>)}{GRANDES_REGIOES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>}
          <Button type="submit" variant="outline" disabled={busy || (country.trim().toLowerCase() === 'br' ? (!uf && !regiao) || (!!municipio.trim() && !!regiao) || (!!bairro.trim() && !municipio.trim()) : country.trim().length !== 2)}>Adicionar lugar</Button>
        </form>
      )}
    </div>
  );
}
