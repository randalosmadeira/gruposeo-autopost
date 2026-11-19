import { Button } from '@/components/ui/button';
import { ANCHOR_LABEL, ATTR_LABEL, ORIGINS, STATUS_LABEL, type AnchorKind, type LinkAttr, type LinkStatus } from '../../../supabase/functions/_shared/backlinks-labels';
import type { BacklinkRow, Summary } from '@/lib/backlinks-api';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca');
const STATUS_CLS: Record<LinkStatus, string> = {
  live: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300', lost: 'border-red-500/50 bg-red-500/10 text-red-300', dead: 'border-red-500/50 bg-red-500/10 text-red-300',
  blocked: 'border-amber-500/50 bg-amber-500/10 text-amber-300', unverified: 'border-dashed text-muted-foreground',
};
const ERROR_TEXT: Record<string, string> = {
  link_nao_encontrado_no_html: 'A página abriu, mas o link não está no HTML dela. Se o link é inserido por JavaScript, o robô não enxerga.', pagina_nao_existe: 'A página não existe mais (erro 404 ou 410).',
  acesso_negado_ao_robo: 'O site bloqueou o robô de verificação.', erro_do_servidor_da_pagina: 'O servidor da página deu erro. Tentaremos de novo.', conteudo_nao_html: 'O endereço não é uma página HTML (por exemplo, um PDF).',
  pagina_grande_demais: 'A página é grande demais para ler por inteiro.', tempo_esgotado: 'A página demorou demais para responder. Tentaremos de novo.', falha_de_rede: 'Não foi possível conectar. Tentaremos de novo.',
  endereco_privado_ou_nao_resolvido: 'O endereço não existe mais ou não resolve na internet.', resposta_inesperada: 'A página respondeu com um erro.',
};

export function StatusChip({ s }: { s: LinkStatus }) {
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] leading-4 ${STATUS_CLS[s]}`}>{STATUS_LABEL[s]}</span>;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <li className="rounded-lg border bg-background/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </li>
  );
}

function Bars<K extends string>({ title, data, labels }: { title: string; data: Record<K, number>; labels: Record<K, string> }) {
  const entries = (Object.keys(data) as K[]).filter((k) => data[k] > 0);
  const total = entries.reduce((n, k) => n + data[k], 0);
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      {total === 0 ? <p className="mt-1 text-xs text-muted-foreground">Sem links no ar para mostrar ainda.</p> : (
        <ul className="mt-2 space-y-1.5">
          {entries.sort((a, b) => data[b] - data[a]).map((k) => (
            <li key={k} className="text-xs">
              <div className="flex justify-between gap-2"><span>{labels[k]}</span><span className="tabular-nums text-muted-foreground">{data[k]} ({Math.round((data[k] / total) * 100)}%)</span></div>
              <div className="mt-0.5 h-1.5 rounded bg-muted" aria-hidden><div className="h-1.5 rounded bg-emerald-400" style={{ width: `${(data[k] / total) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Painel de resumo: números reais da lista e da última verificação de cada link. */
export function SummaryPanel({ summary }: { summary: Summary }) {
  const s = summary;
  const knownAttr = s.attr.follow + s.attr.nofollow + s.attr.sponsored + s.attr.ugc;
  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Resumo dos backlinks">
        <Tile label="Links na lista" value={String(s.total)} hint={s.verified_pct === null ? undefined : `${s.verified_pct}% verificados`} />
        <Tile label="No ar" value={String(s.by_status.live)} />
        <Tile label="Link não encontrado" value={String(s.by_status.lost)} hint="no HTML da página" />
        <Tile label="Página fora do ar" value={String(s.by_status.dead)} />
        <Tile label="Sites diferentes (no ar)" value={String(s.referring_domains.live)} hint={`${s.referring_domains.all} na lista`} />
        <Tile label="Passam autoridade" value={knownAttr ? `${Math.round((s.attr.follow / knownAttr) * 100)}%` : 'sem dados'} hint="links sem nofollow/sponsored/ugc" />
      </ul>
      {s.flags.length > 0 && (
        <ul className="space-y-1.5" aria-label="Sinais de atenção">
          {s.flags.map((f) => <li key={f.key} className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-100">{f.text}</li>)}
        </ul>
      )}
      <div className="grid gap-2 lg:grid-cols-3">
        <Bars<AnchorKind | 'sem_dado'> title="Âncoras dos links no ar" data={s.anchors} labels={ANCHOR_LABEL} />
        <Bars<LinkAttr | 'sem_dado'> title="Tipo de link (no ar)" data={s.attr} labels={ATTR_LABEL} />
        <div className="rounded-lg border bg-background/40 p-3">
          <h4 className="text-sm font-semibold">Sites que mais linkam</h4>
          {s.top_domains.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">Ainda não há links.</p> : (
            <ul className="mt-2 space-y-1 text-xs">
              {s.top_domains.slice(0, 8).map((d) => <li key={d.domain} className="flex justify-between gap-2"><span className="break-all">{d.domain}</span><span className="tabular-nums text-muted-foreground">{d.live} no ar / {d.total}</span></li>)}
            </ul>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Origem das listas: {Object.entries(s.by_origin).map(([k, n]) => `${ORIGINS[k] || k} (${n})`).join(', ') || 'nenhuma ainda'}. Cada número vem da lista importada e da verificação ao vivo; nada é estimado.</p>
    </div>
  );
}

/** Tabela de links com a prova de cada um (situação, âncora, tipo, origem e quando foi verificado). */
export function LinksTable({ links, canEdit, busyId, onVerify, onRemove }: { links: BacklinkRow[]; canEdit: boolean; busyId: string | null; onVerify: (id: string) => void; onRemove: (id: string) => void }) {
  if (!links.length) return <p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum link nesta visão.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border" tabIndex={0} role="region" aria-label="Lista de backlinks (role para o lado se precisar)">
      <table className="w-full min-w-[48rem] border-collapse text-sm">
        <thead><tr className="border-b bg-muted/30 text-left text-xs">
          <th scope="col" className="px-3 py-2 font-medium">Página que contém o link</th><th scope="col" className="px-3 py-2 font-medium">Âncora</th><th scope="col" className="px-3 py-2 font-medium">Tipo</th>
          <th scope="col" className="px-3 py-2 font-medium">Situação</th><th scope="col" className="px-3 py-2 font-medium">Origem</th><th scope="col" className="px-3 py-2 font-medium">Verificado</th>{canEdit && <th scope="col" className="px-3 py-2 text-right font-medium">Ações</th>}
        </tr></thead>
        <tbody>
          {links.map((l) => (
            <tr key={l.id} className="border-b align-top last:border-0">
              <td className="px-3 py-2"><a href={l.source_url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary underline-offset-2 hover:underline">{l.source_url.replace(/^https?:\/\//, '')}</a>{l.source_noindex ? <span className="ml-2 rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground" title="A página pede aos buscadores para não ser indexada">noindex</span> : null}</td>
              <td className="max-w-[14rem] px-3 py-2 break-words">{l.anchor ?? <span className="text-muted-foreground">sem informação</span>}</td>
              <td className="px-3 py-2">{l.link_attr ? ATTR_LABEL[l.link_attr] : <span className="text-muted-foreground">sem informação</span>}</td>
              <td className="px-3 py-2"><StatusChip s={l.status} />{l.check_error && ERROR_TEXT[l.check_error] ? <p className="mt-1 max-w-[16rem] text-[11px] text-muted-foreground">{ERROR_TEXT[l.check_error]}</p> : null}</td>
              <td className="px-3 py-2 text-xs">{ORIGINS[l.origin] || l.origin}</td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{when(l.last_checked_at)}</td>
              {canEdit && <td className="whitespace-nowrap px-3 py-2 text-right">
                <Button size="sm" variant="outline" disabled={busyId === l.id} onClick={() => onVerify(l.id)} aria-label={`Verificar ${l.source_url}`}>Verificar</Button>{' '}
                <Button size="sm" variant="ghost" disabled={busyId === l.id} onClick={() => onRemove(l.id)} aria-label={`Remover ${l.source_url} da lista`}>Remover</Button>
              </td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
