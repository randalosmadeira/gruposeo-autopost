import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, MessageCircle, Pencil, RefreshCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileField } from '@/components/profile/ProfileField';
import type { Discovery } from '@/lib/discover-api';
import type { Check, Inference, InferenceGroup, Opportunity } from '../../../supabase/functions/_shared/profile-discover-synth';
import { FIELD_BY_KEY, type FieldValue } from '../../../supabase/functions/_shared/profile-registry';
import { validateValue } from '../../../supabase/functions/_shared/profile-model';
import { showValue } from '@/lib/discover-format';

const GROUPS: Array<[InferenceGroup, string, string]> = [
  ['identidade', 'Quem é o negócio', 'Nome, segmento, o que oferece.'],
  ['publico', 'Para quem fala', 'Tipo de cliente e tom de voz.'],
  ['regiao', 'Onde atende', 'Cidades, regiões, abrangência e idioma.'],
  ['presenca', 'Presença online', 'Site, subdomínios, redes sociais e contato.'],
  ['conteudo', 'Conteúdo', 'Blog e artigos.'],
  ['marca', 'Marca', 'Cores vistas no site (sugestão).'],
];
const CONF: Record<Inference['confidence'], { label: string; cls: string; hint: string }> = {
  alta: { label: 'Certeza alta', cls: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300', hint: 'Está escrito no próprio site.' },
  media: { label: 'Provável', cls: 'border-amber-500/50 bg-amber-500/10 text-amber-300', hint: 'Deduzido de vários sinais; vale conferir.' },
  baixa: { label: 'Sugestão', cls: 'border-slate-500/50 bg-slate-500/10 text-slate-300', hint: 'Palpite a partir do texto do site; confirme antes de usar.' },
};

const norm = (v: FieldValue | null | undefined) => showValue(v).trim().toLowerCase();

export interface Selection { accepted: Record<string, boolean>; edits: Record<string, FieldValue | null> }

interface Props {
  discovery: Discovery;
  /** valores que o perfil já tem hoje (para mostrar o que muda) */
  current: Record<string, FieldValue | undefined>;
  selection: Selection;
  onSelection: (s: Selection) => void;
  canWrite: boolean;
  busy: boolean;
  onReanalyze: () => void;
  onAskZica: (text?: string) => void;
}

const ICON = { ok: CheckCircle2, warn: AlertTriangle, fail: XCircle, info: Info } as const;
const ICON_CLS = { ok: 'text-emerald-400', warn: 'text-amber-400', fail: 'text-red-400', info: 'text-sky-400' } as const;
const SEV: Record<Opportunity['severity'], { label: string; cls: string }> = {
  alta: { label: 'Prioridade alta', cls: 'border-red-500/50 bg-red-500/10 text-red-300' },
  media: { label: 'Média', cls: 'border-amber-500/50 bg-amber-500/10 text-amber-300' },
  baixa: { label: 'Baixa', cls: 'border-slate-500/50 bg-slate-500/10 text-slate-300' },
  info: { label: 'Informativo', cls: 'border-sky-500/50 bg-sky-500/10 text-sky-300' },
};

function Section({ title, hint, children, id }: { title: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 className="text-lg font-semibold leading-tight">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ item, current, selected, edited, canWrite, onToggle, onEdit }: {
  item: Inference; current: FieldValue | undefined; selected: boolean; edited: FieldValue | null | undefined; canWrite: boolean;
  onToggle: (on: boolean) => void; onEdit: (v: FieldValue | null | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const def = FIELD_BY_KEY[item.key];
  const shown = edited !== undefined ? edited : item.value;
  const hasCurrent = current !== undefined && norm(current) !== '' && norm(current) !== 'unknown';
  const differs = hasCurrent && norm(current) !== norm(shown);
  const err = edited !== undefined && def ? (() => { const c = validateValue(def, edited); return c.ok ? '' : 'Valor inválido para este campo.'; })() : '';
  const conf = CONF[item.confidence];
  const id = `disc-${item.key}`;
  return (
    <li className={`rounded-lg border p-2.5 sm:p-4 ${selected ? 'border-primary/50 bg-primary/5' : ''}`}>
      <div className="flex items-start gap-3">
        <input id={id} type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" checked={selected} disabled={!canWrite || !!err}
          onChange={(e) => onToggle(e.target.checked)} aria-label={`Usar "${item.label}" no perfil`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <label htmlFor={id} className="text-sm font-semibold">{item.label}</label>
            <span title={conf.hint} className={`rounded-full border px-2 py-0.5 text-[11px] leading-4 ${conf.cls}`}>{conf.label}</span>
            {edited !== undefined && <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[11px] leading-4 text-primary">editado por você</span>}
          </div>
          <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed">{showValue(shown)}</p>
          {differs && <p className="mt-1 text-xs text-amber-300">Hoje no perfil: “{showValue(current).slice(0, 140)}”. Marcar substitui.</p>}
          {!differs && hasCurrent && <p className="mt-1 text-xs text-muted-foreground">Já confere com o que está no perfil.</p>}
          {err && <p role="alert" className="mt-1 text-xs text-red-400">{err}</p>}
          <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <details className="group min-w-0 flex-1 basis-40 text-xs text-muted-foreground">
              <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 hover:text-foreground">
                <ChevronDown className="h-3 w-3 transition group-open:rotate-180" aria-hidden /> De onde tirei isto
              </summary>
              <ul className="mt-1.5 space-y-1 pl-4">
                {item.evidence.map((e, i) => (
                  <li key={i} className="list-disc break-words">{e.note}{e.url && <> <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline">ver página</a></>}</li>
                ))}
              </ul>
            </details>
            {canWrite && def && <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={() => setEditing((v) => !v)} aria-expanded={editing}><Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />{editing ? 'Fechar' : 'Editar'}</Button>}
          </div>
        </div>
      </div>
      {editing && def && (
        <div className="mt-3 border-t pt-3">
          <ProfileField field={def} value={shown ?? undefined} error={err ? 'option_not_allowed' : undefined}
            onChange={(v) => { onEdit(v); if (v !== null && !selected) onToggle(true); }} />
        </div>
      )}
    </li>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <p className="text-2xl font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-2">
      {checks.map((c) => {
        const Icon = ICON[c.status];
        return (
          <li key={c.key} className="flex items-start gap-2.5 text-sm">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_CLS[c.status]}`} aria-label={{ ok: 'Ok', warn: 'Atenção', fail: 'Problema', info: 'Informação' }[c.status]} />
            <div className="min-w-0"><p className="font-medium leading-snug">{c.label}</p><p className="break-words text-xs text-muted-foreground">{c.detail}</p></div>
          </li>
        );
      })}
    </ul>
  );
}

export function DiscoverReview({ discovery: d, current, selection, onSelection, canWrite, busy, onReanalyze, onAskZica }: Props) {
  const ok = d.siteState === 'ok';
  const byGroup = useMemo(() => GROUPS.map(([g, title, hint]) => ({ g, title, hint, items: d.inferences.filter((i) => i.group === g) })).filter((x) => x.items.length), [d.inferences]);
  const passed = d.checks.filter((c) => c.status === 'ok').length;
  const maxSection = Math.max(1, ...d.structure.sections.map((s) => s.count));
  const contactsLines = [
    ...d.contacts.whatsapp.map((w) => `WhatsApp: ${w}`), ...d.contacts.phones.map((p) => `Telefone: ${p}`), ...d.contacts.emails.map((e) => `E-mail: ${e}`),
    ...(d.contacts.address ? [`Endereço: ${d.contacts.address}`] : []), ...d.contacts.openingHours.map((h) => `Horário: ${h}`),
  ];
  const set = (patch: Partial<Selection>) => onSelection({ accepted: { ...selection.accepted, ...(patch.accepted || {}) }, edits: { ...selection.edits, ...(patch.edits || {}) } });
  const when = new Date(d.generatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');

  return (
    <div className="space-y-4">
      <header className="rounded-xl border bg-card/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-primary">Raio-X do negócio</p>
            <h1 className="mt-1 break-words text-2xl font-bold leading-tight sm:text-3xl">{d.inferences.find((i) => i.key === 'businessName')?.value ? showValue(d.inferences.find((i) => i.key === 'businessName')?.value) : d.site.host}</h1>
            <p className="mt-1 text-sm text-muted-foreground"><a href={d.site.origin} target="_blank" rel="noopener noreferrer" className="break-all underline">{d.site.host}</a><span className="block sm:inline"><span className="hidden sm:inline"> · </span>lido em {when}</span></p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy || !canWrite} onClick={onReanalyze}><RefreshCcw className="mr-1.5 h-4 w-4" aria-hidden />Reanalisar</Button>
        </div>
        {ok ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat value={d.stats.sitemapUrls ? d.stats.sitemapUrls.toLocaleString('pt-BR') : '—'} label="páginas no sitemap" />
            <Stat value={String(d.stats.pagesRead)} label="páginas lidas a fundo" />
            <Stat value={String(d.structure.subdomains.length + 1)} label={d.structure.subdomains.length ? 'endereços do site' : 'endereço do site'} />
            <Stat value={`${passed}/${d.checks.length}`} label="verificações atendidas" />
          </div>
        ) : (
          <div role="status" className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
            <p className="font-semibold">{d.siteState === 'nao_publicado' ? 'Este endereço ainda não tem site publicado.' : 'Não consegui abrir este site.'}</p>
            <p className="mt-1">{d.siteStateNote}</p>
            {d.siteState === 'nao_publicado' && <p className="mt-2">Tudo bem: o conceito do negócio pode nascer agora. Conte para a Zica o que o negócio faz e para quem, e ela monta o perfil com você.</p>}
            <div className="mt-3 flex flex-wrap gap-2"><Button type="button" onClick={() => onAskZica()}><MessageCircle className="mr-1.5 h-4 w-4" aria-hidden />Montar o conceito com a Zica</Button></div>
          </div>
        )}
        {ok && d.stats.pagesFailed > 0 && <p className="mt-3 text-xs text-muted-foreground">{d.stats.pagesFailed} página(s) não puderam ser lidas e ficaram de fora.</p>}
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          {ok && (
            <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <strong>Como funciona:</strong> li o site e montei o perfil abaixo. Marque o que está certo, ajuste o que quiser em <em>Editar</em> e confirme no fim da página.
              Nada vai para o perfil sem o seu clique.
            </p>
          )}
          {byGroup.map(({ g, title, hint, items }) => (
            <Section key={g} title={title} hint={hint}>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <Row key={item.key} item={item} current={current[item.key]} canWrite={canWrite}
                    selected={!!selection.accepted[item.key]} edited={selection.edits[item.key]}
                    onToggle={(on) => set({ accepted: { [item.key]: on } })}
                    onEdit={(v) => set({ edits: { [item.key]: v } })} />
                ))}
              </ul>
            </Section>
          ))}
          {d.gaps.length > 0 && (
            <Section title="O que o site não conta" hint="Estas informações precisam de você ou da Zica. Pergunte, peça sugestões, complete.">
              <ul className="flex flex-wrap gap-2">
                {d.gaps.map((gp) => <li key={gp.key} title={gp.why} className="rounded-full border px-3 py-1 text-xs">{gp.label}</li>)}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {d.followUps.slice(0, 3).map((q) => <Button key={q} type="button" size="sm" variant="outline" className="h-auto whitespace-normal py-1.5 text-left" onClick={() => onAskZica(q)}>{q}</Button>)}
              </div>
            </Section>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          {ok && d.opportunities.length > 0 && (
            <Section title="Oportunidades" hint="O que melhorar para SEO, GEO e AEO, em ordem de prioridade.">
              <ul className="space-y-2">
                {d.opportunities.slice(0, 12).map((o) => (
                  <li key={o.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-[11px] leading-4 ${SEV[o.severity].cls}`}>{SEV[o.severity].label}</span><p className="text-sm font-medium leading-snug">{o.title}</p></div>
                    <p className="mt-1 text-xs text-muted-foreground">{o.detail}</p>
                    <p className="mt-1 text-xs"><strong>O que fazer:</strong> {o.action}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {ok && (
            <Section title="Estrutura do site" hint="Onde está o conteúdo, segundo o sitemap.">
              {d.structure.sections.length > 0 ? (
                <ul className="space-y-1.5">
                  {d.structure.sections.slice(0, 8).map((s) => (
                    <li key={s.section} className="text-sm">
                      <div className="flex items-baseline justify-between gap-2"><span className="min-w-0 truncate">{s.label}</span><span className="shrink-0 tabular-nums text-muted-foreground">{s.count.toLocaleString('pt-BR')}</span></div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-muted" aria-hidden><div className={`h-full ${s.kind === 'blog' ? 'bg-primary' : 'bg-sky-500/70'}`} style={{ width: `${Math.max(4, (s.count / maxSection) * 100)}%` }} /></div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Sem sitemap para mapear a estrutura.</p>}
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Blog</dt><dd className="text-right">{d.structure.blog.found ? `${d.structure.blog.articles.toLocaleString('pt-BR')} artigo(s)${d.structure.blog.daysSince !== null ? `, último há ${d.structure.blog.daysSince} dia(s)` : ''}` : 'não encontrado'}</dd></div>
                {d.structure.subdomains.length > 0 && <div><dt className="text-muted-foreground">Outros endereços</dt><dd className="mt-1 flex flex-wrap gap-1.5">{d.structure.subdomains.map((h) => <span key={h} className="break-all rounded border px-2 py-0.5 text-xs">{h}</span>)}</dd></div>}
                {d.stack.length > 0 && <div><dt className="text-muted-foreground">Tecnologias vistas</dt><dd className="mt-1 flex flex-wrap gap-1.5">{d.stack.map((t) => <span key={t} className="rounded border px-2 py-0.5 text-xs">{t}</span>)}</dd></div>}
              </dl>
            </Section>
          )}
          {ok && <Section title="Saúde técnica" hint="Verificações reais feitas agora no site."><CheckList checks={d.checks} /></Section>}
          {(contactsLines.length > 0 || Object.keys(d.social).length > 0) && (
            <Section title="Contatos e redes">
              {contactsLines.length > 0 && <ul className="space-y-1 break-words text-sm">{contactsLines.map((l) => <li key={l}>{l}</li>)}</ul>}
              {Object.keys(d.social).length > 0 && <ul className="mt-3 flex flex-wrap gap-1.5">{Object.entries(d.social).map(([k, u]) => <li key={k}><a href={u} target="_blank" rel="noopener noreferrer" className="inline-block rounded border px-2 py-1 text-xs capitalize underline">{k}</a></li>)}</ul>}
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}
