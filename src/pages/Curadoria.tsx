import { useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProjects } from '@/hooks/useProjects';
import { usePreferredProject } from '@/hooks/usePreferredProject';
import {
  curadoria, curadoriaErrorMessage, ITEM_LABEL, STATE_LABEL, STATUS_BLOCKS, type ArtStatus, type CurState, type Detalhe, type Resumo, type StatusCounts,
} from '@/lib/curadoria-api';

const SELECT = 'h-10 max-w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';
const SECTION = 'space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5';
const STATES: CurState[] = ['sem_curadoria', 'desatualizada', 'aprovado', 'precisa_correcao', 'bloqueado'];
const TONE: Record<string, string> = {
  muted: 'border-border text-muted-foreground', ok: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300', warn: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  bad: 'border-red-500/50 bg-red-500/10 text-red-300', info: 'border-sky-500/50 bg-sky-500/10 text-sky-300',
};
const STATE_TONE: Record<string, string> = { sem_curadoria: 'muted', desatualizada: 'warn', aprovado: 'ok', precisa_correcao: 'warn', bloqueado: 'bad' };
const ITEM_TONE: Record<string, string> = { ok: 'ok', aviso: 'warn', pendencia: 'bad', sem_dados: 'muted' };
const ITEM_TEXT: Record<string, string> = { ok: 'Ok', aviso: 'Aviso', pendencia: 'Pendência', sem_dados: 'Sem dados' };
const nf = (v: number) => v.toLocaleString('pt-BR');

function Chip({ tone = 'muted', children }: { tone?: string; children: ReactNode }) {
  return <span className={`inline-flex max-w-full items-center break-words rounded border px-2 py-0.5 text-xs ${TONE[tone] || TONE.muted}`}>{children}</span>;
}
function Notice({ kind, children }: { kind: 'error' | 'ok' | 'warn'; children: ReactNode }) {
  const c = kind === 'error' ? 'border-red-500/50 bg-red-500/10' : kind === 'warn' ? 'border-amber-500/50 bg-amber-500/10' : 'border-emerald-500/50 bg-emerald-500/10';
  return <p role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-3 text-sm ${c}`}>{children}</p>;
}

/** Curadoria de conteúdo: nenhum artigo sai sem passar pelos módulos do sistema; imagem repetida ou ausente bloqueia. Tudo sem IA e sem custo. */
export default function Curadoria() {
  const { projects, isLoading: loadingProjects } = useProjects();
  const { selected, select } = usePreferredProject(projects || []);
  const cache = useQueryClient();
  const [tab, setTab] = useState('artigos');
  const [filter, setFilter] = useState<{ status: string; estado: string }>({ status: 'todos', estado: '' });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; restantes: number; estados: Record<string, number> } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runNote, setRunNote] = useState<string | null>(null);
  const stop = useRef(false);

  const resumo = useQuery<Resumo>({ queryKey: ['curadoria', 'resumo', selected], queryFn: () => curadoria.resumo(selected), enabled: !!selected, retry: false, refetchOnWindowFocus: false });
  const refresh = async () => { await cache.invalidateQueries({ queryKey: ['curadoria'] }); };

  const run = async () => {
    if (!selected || running) return;
    setRunning(true); setRunError(null); setRunNote(null); stop.current = false;
    const desde = new Date().toISOString();
    let done = 0; const estados: Record<string, number> = { aprovado: 0, precisa_correcao: 0, bloqueado: 0 };
    setProgress({ done: 0, restantes: 0, estados: { ...estados } });
    try {
      for (let guard = 0; guard < 500; guard++) {
        if (stop.current) { setRunNote('Rodada interrompida por você. O que já foi avaliado ficou gravado.'); break; }
        const r = await curadoria.rodar(selected, { limit: 20, desde });
        done += r.processados;
        for (const k of Object.keys(r.estados)) estados[k] = (estados[k] || 0) + r.estados[k];
        setProgress({ done, restantes: r.restantes, estados: { ...estados } });
        if (r.concluido) { setRunNote(`Curadoria concluída: ${nf(done)} artigo(s) avaliado(s), sem IA e sem custo.`); break; }
        if (r.processados === 0) { setRunNote('A rodada parou sem avançar. Tente de novo.'); break; }
      }
    } catch (e) { setRunError(curadoriaErrorMessage(e)); } finally { setRunning(false); await refresh(); }
  };

  const shell = 'mx-auto w-full max-w-7xl space-y-4 px-4 py-5 pb-32 sm:px-6 md:pb-10 lg:px-8';
  if (loadingProjects && !projects) return <div className={shell} aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!projects?.length) return <div className={shell}><h1 className="text-2xl font-bold">Curadoria de conteúdo</h1><p className="text-muted-foreground">Crie um projeto para começar.</p></div>;
  const data = resumo.data;
  const pct = progress && progress.done + progress.restantes > 0 ? Math.round((progress.done / (progress.done + progress.restantes)) * 100) : 0;

  return (
    <div className={shell}>
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-primary">Curadoria</p>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Curadoria de conteúdo</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Nenhum conteúdo passa ou sai sem curadoria. Cada artigo é conferido pelos módulos do sistema (Perfil, funil, taxonomia, domínio, mercado, Radar, Estúdio, Piloto, Observatório e imagens). Imagem repetida ou ausente bloqueia a publicação.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="cu-project" className="block text-xs text-muted-foreground">Projeto</label>
            <select id="cu-project" className={`${SELECT} mt-1`} value={selected} onChange={(e) => select(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
          <Button onClick={() => void run()} disabled={!selected || running}>{running ? 'Rodando a curadoria…' : 'Rodar curadoria (sem custo de IA)'}</Button>
          {running && <Button variant="outline" onClick={() => { stop.current = true; }}>Parar</Button>}
        </div>
        {progress && (
          <div aria-live="polite" className={SECTION}>
            <p className="text-sm">{running ? 'Avaliando artigos…' : 'Última rodada'}: <strong>{nf(progress.done)}</strong> avaliado(s){progress.restantes > 0 ? `, faltam ${nf(progress.restantes)}` : ''}.</p>
            <div className="h-2 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
            <div className="flex flex-wrap gap-2"><Chip tone="ok">Aprovados: {nf(progress.estados.aprovado || 0)}</Chip><Chip tone="warn">Precisam de correção: {nf(progress.estados.precisa_correcao || 0)}</Chip><Chip tone="bad">Bloqueados: {nf(progress.estados.bloqueado || 0)}</Chip></div>
          </div>
        )}
        {runNote && <Notice kind="ok">{runNote}</Notice>}
        {runError && <Notice kind="error">{runError}</Notice>}
      </header>

      {resumo.isError && <Notice kind="error">{curadoriaErrorMessage(resumo.error)}</Notice>}
      {resumo.isLoading && <div aria-busy="true"><Skeleton className="h-40 w-full" /></div>}

      {data && (
        <>
          <section aria-label="Contagem por etapa" className="grid gap-3 md:grid-cols-3">
            {STATUS_BLOCKS.map((b) => <StatusBlock key={b.status} title={b.title} hint={b.hint} counts={data.por_status[b.status]} onPick={(estado) => { setFilter({ status: b.status, estado }); setTab('artigos'); }} />)}
          </section>
          <p className="text-xs text-muted-foreground">{nf(data.publicados.total)} artigo(s) já publicado(s). {data.publicados.observacao} Regras da curadoria na versão {data.versao_das_regras}.</p>
          {data.bloqueados_por_imagem > 0 && <Notice kind="warn">{nf(data.bloqueados_por_imagem)} artigo(s) bloqueado(s) por imagem repetida ou ausente. Veja a aba Imagens.</Notice>}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto flex-wrap justify-start gap-1">
              <TabsTrigger value="artigos">Artigos</TabsTrigger>
              <TabsTrigger value="imagens">Imagens</TabsTrigger>
              <TabsTrigger value="prompts">Prompts abertos sem conteúdo</TabsTrigger>
            </TabsList>
            <TabsContent value="artigos" className="mt-3"><ArticlesPanel projectId={selected} filter={filter} setFilter={setFilter} /></TabsContent>
            <TabsContent value="imagens" className="mt-3"><ImagesPanel projectId={selected} /></TabsContent>
            <TabsContent value="prompts" className="mt-3"><PromptsPanel projectId={selected} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function StatusBlock({ title, hint, counts, onPick }: { title: string; hint: string; counts: StatusCounts; onPick: (estado: string) => void }) {
  return (
    <div className={SECTION} data-testid={`bloco-${title}`}>
      <div><h2 className="text-lg font-semibold">{title}</h2><p className="text-xs text-muted-foreground">{hint}</p></div>
      <p className="text-3xl font-bold">{nf(counts.total)} <span className="text-sm font-normal text-muted-foreground">artigo(s)</span></p>
      <ul className="space-y-1">
        {STATES.map((s) => (
          <li key={s}>
            <button type="button" className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-muted/50" onClick={() => onPick(s)} aria-label={`${title}: ${STATE_LABEL[s]}: ${counts[s]}`}>
              <span>{STATE_LABEL[s]}</span><Chip tone={counts[s] > 0 ? STATE_TONE[s] : 'muted'}>{nf(counts[s])}</Chip>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArticlesPanel({ projectId, filter, setFilter }: { projectId: string; filter: { status: string; estado: string }; setFilter: (f: { status: string; estado: string }) => void }) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['curadoria', 'lista', projectId, filter, page], queryFn: () => curadoria.listar(projectId, { status: filter.status, estado: filter.estado || undefined, page, pageSize: 25 }), retry: false, refetchOnWindowFocus: false });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  return (
    <div className={SECTION}>
      <div className="flex flex-wrap items-end gap-3">
        <div><label htmlFor="cu-fs" className="block text-xs text-muted-foreground">Etapa</label>
          <select id="cu-fs" className={`${SELECT} mt-1`} value={filter.status} onChange={(e) => { setPage(1); setFilter({ ...filter, status: e.target.value }); }}>
            <option value="todos">Todas as etapas</option>{STATUS_BLOCKS.map((b) => <option key={b.status} value={b.status}>{b.title}</option>)}<option value="error">Com erro</option>
          </select></div>
        <div><label htmlFor="cu-fe" className="block text-xs text-muted-foreground">Estado da curadoria</label>
          <select id="cu-fe" className={`${SELECT} mt-1`} value={filter.estado} onChange={(e) => { setPage(1); setFilter({ ...filter, estado: e.target.value }); }}>
            <option value="">Todos os estados</option>{STATES.map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
          </select></div>
      </div>
      {q.isError && <Notice kind="error">{curadoriaErrorMessage(q.error)}</Notice>}
      {q.isLoading && <Skeleton className="h-32 w-full" />}
      {q.data && q.data.artigos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum artigo com esse filtro.</p>}
      {q.data && q.data.artigos.length > 0 && (
        <ul className="divide-y">
          {q.data.artigos.map((a) => (
            <li key={a.article_id} className="py-2">
              <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(open === a.article_id ? null : a.article_id)} aria-expanded={open === a.article_id}>
                <span className="min-w-0 flex-1 break-words text-sm font-medium">{a.title || a.keyword || 'Sem título'}</span>
                <span className="flex flex-wrap items-center gap-2"><Chip>{a.status_rotulo}</Chip><Chip tone={STATE_TONE[a.estado]}>{STATE_LABEL[a.estado]}</Chip>{a.nota !== null && <Chip tone="info">Nota {a.nota}</Chip>}{(a.image_state === 'repetida' || a.image_state === 'ausente') && <Chip tone="bad">Imagem {a.image_state}</Chip>}</span>
              </button>
              {open === a.article_id && <DetailPanel projectId={projectId} articleId={a.article_id} />}
            </li>
          ))}
        </ul>
      )}
      {q.data && <div className="flex items-center justify-between text-sm"><span>{nf(q.data.total)} artigo(s). Página {page} de {pages}.</span>
        <span className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</Button></span></div>}
    </div>
  );
}

function DetailPanel({ projectId, articleId }: { projectId: string; articleId: string }) {
  const q = useQuery<Detalhe>({ queryKey: ['curadoria', 'detalhe', projectId, articleId], queryFn: () => curadoria.detalhe(projectId, articleId), retry: false, refetchOnWindowFocus: false });
  if (q.isLoading) return <Skeleton className="mt-2 h-24 w-full" />;
  if (q.isError) return <Notice kind="error">{curadoriaErrorMessage(q.error)}</Notice>;
  const d = q.data!;
  const r = d.relatorio;
  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">{d.gravado ? `Curadoria gravada em ${d.curated_at ? new Date(d.curated_at).toLocaleString('pt-BR') : '—'}` : 'Ainda não há curadoria gravada: este relatório foi calculado agora, sem salvar.'}{d.estado_atual === 'desatualizada' ? ' O artigo mudou depois: rode a curadoria de novo.' : ''}</p>
      {r.bloqueios.length > 0 && <Notice kind="error">{r.bloqueios.join(' ')}</Notice>}
      {r.faltando.length > 0 && <Notice kind="warn">Falta corrigir: {r.faltando.join(' ')}</Notice>}
      <ul className="space-y-2">
        {r.itens.map((i) => (
          <li key={i.modulo} className="rounded border p-2">
            <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{ITEM_LABEL[i.modulo] || i.modulo}</strong><Chip tone={ITEM_TONE[i.estado]}>{ITEM_TEXT[i.estado]}</Chip></div>
            <p className="mt-1 break-words text-sm">{i.motivo_em_portugues}</p>
            <p className="text-xs text-muted-foreground">Fonte: {i.fonte}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImagesPanel({ projectId }: { projectId: string }) {
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: ['curadoria', 'imagens', projectId, offset], queryFn: () => curadoria.imagens(projectId, offset, 50), retry: false, refetchOnWindowFocus: false });
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <Notice kind="error">{curadoriaErrorMessage(q.error)}</Notice>;
  const d = q.data!;
  const labels: Record<string, string> = { generating: 'Em criação', draft: 'Na fila', ready: 'Finalizado', published: 'Publicado', error: 'Com erro' };
  return (
    <div className="space-y-3">
      <div className={SECTION}>
        <h2 className="text-lg font-semibold">Diagnóstico das imagens</h2>
        <p className="text-sm">{nf(d.total_artigos)} artigo(s) usam apenas <strong>{nf(d.imagens_distintas)}</strong> imagem(ns) diferente(s); {nf(d.artigos_sem_imagem)} não têm imagem. {nf(d.grupos_repetidos)} imagem(ns) aparecem em mais de um artigo.</p>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 pr-3">Etapa</th><th className="pr-3">Artigos</th><th className="pr-3">Imagens diferentes</th><th className="pr-3">Em imagem repetida</th><th>Sem imagem</th></tr></thead>
          <tbody>{Object.entries(d.por_status).map(([s, v]) => <tr key={s} className="border-t"><td className="py-1 pr-3">{labels[s] || s}</td><td className="pr-3">{nf(v.artigos)}</td><td className="pr-3">{nf(v.imagens_distintas)}</td><td className="pr-3">{nf(v.em_imagem_repetida)}</td><td>{nf(v.sem_imagem)}</td></tr>)}</tbody></table></div>
        <p className="text-xs text-muted-foreground">{d.regra} {d.normalizacao}</p>
      </div>
      <div className={SECTION}>
        <h3 className="font-semibold">Imagens mais repetidas</h3>
        {d.mais_repetidas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma imagem repetida.</p> : (
          <ul className="space-y-1">{d.mais_repetidas.map((g) => <li key={g.chave} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="min-w-0 break-all text-xs text-muted-foreground">{g.exemplo_url}</span><span className="flex gap-2"><Chip tone="bad">{nf(g.usos)} artigos</Chip>{g.usada_em_publicado && <Chip tone="warn">já em artigo publicado</Chip>}</span></li>)}</ul>
        )}
      </div>
      <div className={SECTION}>
        <h3 className="font-semibold">Artigos que precisam de imagem nova ({nf(d.precisam_imagem_nova.total)})</h3>
        <p className="text-xs text-muted-foreground">Ordem de prioridade: Em criação, depois Na fila, depois Finalizado.</p>
        {d.precisam_imagem_nova.artigos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum artigo precisa de imagem nova.</p> : (
          <ol className="divide-y">{d.precisam_imagem_nova.artigos.map((a) => <li key={a.article_id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm"><span className="min-w-0 flex-1 break-words">{a.prioridade}. {a.title || a.keyword || 'Sem título'}</span><span className="flex gap-2"><Chip>{a.status_rotulo}</Chip><Chip tone="bad">{a.motivo === 'ausente' ? 'Sem imagem' : `Repetida em ${a.usos}`}</Chip></span></li>)}</ol>
        )}
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Anteriores</Button><Button variant="outline" size="sm" disabled={offset + 50 >= d.precisam_imagem_nova.total} onClick={() => setOffset(offset + 50)}>Próximos</Button></div>
      </div>
    </div>
  );
}

function PromptsPanel({ projectId }: { projectId: string }) {
  const q = useQuery({ queryKey: ['curadoria', 'prompts', projectId], queryFn: () => curadoria.promptsAbertos(projectId), retry: false, refetchOnWindowFocus: false });
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <Notice kind="error">{curadoriaErrorMessage(q.error)}</Notice>;
  const d = q.data!;
  if (d.sem_dados) return <div className={SECTION}><h2 className="text-lg font-semibold">Prompts abertos sem conteúdo</h2><p className="text-sm">Sem dados: {d.motivo}</p></div>;
  return (
    <div className={SECTION}>
      <h2 className="text-lg font-semibold">Prompts abertos sem conteúdo</h2>
      <div className="flex flex-wrap gap-2"><Chip tone="bad">Sem artigo: {nf(d.resumo.sem_artigo)}</Chip><Chip tone="warn">Só em produção: {nf(d.resumo.so_em_producao)}</Chip><Chip tone="ok">Cobertos por artigo publicado: {nf(d.resumo.coberto)}</Chip><Chip>{nf(d.total_prompts)} pergunta(s) ativa(s)</Chip></div>
      <p className="text-xs text-muted-foreground">{d.regra}</p>
      {d.prompts.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma pergunta em aberto.</p> : (
        <ul className="divide-y">{d.prompts.map((p) => (
          <li key={p.id} className="py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 flex-1 break-words font-medium">{p.query}</span><Chip tone={p.estado === 'sem_artigo' ? 'bad' : 'warn'}>{p.estado === 'sem_artigo' ? 'Sem artigo' : 'Só em produção'}</Chip></div>
            <p className="text-xs text-muted-foreground">{[p.topic, p.conjunto].filter(Boolean).join(' · ') || 'Sem tema'}</p>
            {p.cobertos_por.length > 0 && <p className="text-xs">Casa com: {p.cobertos_por.map((c) => `${c.title} (${c.palavras_casadas.join(', ')})`).join('; ')}</p>}
          </li>))}</ul>
      )}
    </div>
  );
}

export type { ArtStatus };
