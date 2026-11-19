import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useProjects } from '@/hooks/useProjects';
import { callProfile, profileErrorMessage, ProfileError, type ProfilePayload } from '@/lib/profile-api';
import { cleanSiteInput, clearDiscovery, discoverErrorMessage, loadDiscovery, runDiscovery, saveDiscovery, type Discovery, type Progress } from '@/lib/discover-api';
import { DiscoverRunning, DiscoverStart } from '@/components/discover/DiscoverFlow';
import { DiscoverReview, type Selection } from '@/components/discover/DiscoverReview';
import { showValue } from '@/lib/discover-format';
import { ProfileChat } from '@/components/profile/ProfileChat';
import { FIELD_BY_KEY, type FieldValue } from '../../supabase/functions/_shared/profile-registry';
import { readValues, validateValue } from '../../supabase/functions/_shared/profile-model';

type Phase = 'start' | 'running' | 'review';
const IDLE: Progress = { phase: 'mapa', done: 0, total: 1, message: 'Começando…', pagesRead: 0, sitemapUrls: 0 };
const autoName = (host: string) => { const l = host.replace(/^www\./, '').split('.')[0] || host; return l.charAt(0).toUpperCase() + l.slice(1); };
const emptyOrUnknown = (v: FieldValue | undefined) => v === undefined || v === null || v === '' || v === 'unknown' || (Array.isArray(v) && !v.length);
const sameText = (a: FieldValue | null | undefined, b: FieldValue | null | undefined) => showValue(a).trim().toLowerCase() === showValue(b).trim().toLowerCase();
const clip = (v: FieldValue | null | undefined, n = 170) => { const t = showValue(v).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/**
 * Descoberta do negócio: o cliente cola o endereço do site e a Zica lê tudo, monta o perfil e entrega para confirmar e refinar.
 * Substitui o formulário de 8 a 11 etapas como PRIMEIRO contato (o formulário continua disponível para edição fina).
 */
export default function DiscoverBusiness() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const { projects, isLoading: loadingProjects } = useProjects();
  const projectId = params.get('project') || '';
  const project = useMemo(() => projects?.find((p) => p.id === projectId) || null, [projects, projectId]);

  const [phase, setPhase] = useState<Phase>('start');
  const [progress, setProgress] = useState<Progress>(IDLE);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [error, setError] = useState('');
  const [runningHost, setRunningHost] = useState('');
  const [selection, setSelection] = useState<Selection>({ accepted: {}, edits: {} });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string; details?: string[] } | null>(null);
  const savedRef = useRef<HTMLDivElement | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [seed, setSeed] = useState<{ text: string; n: number }>({ text: '', n: 0 });
  const abort = useRef<AbortController | null>(null);
  const started = useRef('');
  const chatRef = useRef<HTMLDivElement | null>(null);

  const profileKey = useMemo(() => ['project-profile', projectId], [projectId]);
  const profile = useQuery<ProfilePayload>({ queryKey: profileKey, queryFn: () => callProfile('profile_load', { projectId }), enabled: !!projectId, refetchOnWindowFocus: false, retry: false });
  const payload = profile.data;
  const canWrite = !!payload?.can_write;
  const current = useMemo(() => payload ? readValues({ strategy: payload.strategy.data, sections: payload.extended.sections, finance: {}, goals: {} }, false) : {}, [payload]);

  const start = useCallback(async (id: string, site: string | undefined, host: string) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setError(''); setNotice(null); setSaved(null); setRunningHost(host); setProgress(IDLE); setPhase('running');
    try {
      const d = await runDiscovery(id, site, setProgress, ctl.signal);
      if (ctl.signal.aborted) return;
      saveDiscovery(id, d);
      setDiscovery(d);
      setPhase('review');
    } catch (e) {
      if (ctl.signal.aborted || (e instanceof Error && e.message === 'cancelled')) { setPhase(discovery ? 'review' : 'start'); return; }
      setError(discoverErrorMessage(e));
      setPhase(discovery ? 'review' : 'start');
    }
  }, [discovery]);

  // projeto na URL: mostra a última descoberta guardada; com ?auto=1 e sem descoberta, já começa a ler o site
  useEffect(() => {
    if (!projectId || !project || started.current === projectId) return;
    started.current = projectId;
    const stored = loadDiscovery(projectId);
    if (stored) { setDiscovery(stored); setPhase('review'); return; }
    if (project.domain && params.get('auto') === '1') void start(projectId, undefined, project.domain);
  }, [projectId, project, params, start]);
  useEffect(() => () => abort.current?.abort(), []);

  // seleção inicial: o que é certo ou provável e cabe sem apagar nada vem marcado; palpites e trocas ficam para o cliente decidir
  useEffect(() => {
    if (!discovery || !payload) return;
    const accepted: Record<string, boolean> = {};
    for (const i of discovery.inferences) accepted[i.key] = (i.confidence === 'alta' || i.confidence === 'media') && emptyOrUnknown(current[i.key]);
    setSelection({ accepted, edits: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discovery?.generatedAt, !!payload]);

  async function onStartNew(host: string) {
    if (!user) return;
    setError('');
    try {
      const { data, error: e } = await supabase.from('projects').insert({ name: autoName(host), domain: host, user_id: user.id } as never).select('id').single();
      if (e || !data) throw e || new Error('create_failed');
      const id = (data as { id: string }).id;
      void cache.invalidateQueries({ queryKey: ['projects'] });
      started.current = id;
      setDiscovery(null);
      setParams({ project: id }, { replace: true });
      await start(id, host, host);
    } catch {
      setError('Não foi possível criar o projeto agora. Confira o limite do seu plano ou tente de novo.');
    }
  }
  function onPick(id: string) {
    const p = projects?.find((x) => x.id === id);
    if (!p?.domain) return;
    started.current = id;
    clearDiscovery(id);
    setDiscovery(null);
    setParams({ project: id }, { replace: true });
    void start(id, undefined, p.domain);
  }
  function reanalyze() {
    if (!project?.domain) return;
    void start(projectId, undefined, project.domain);
  }
  function askZica(text?: string) {
    setChatOpen(true);
    if (text) setSeed((s) => ({ text, n: s.n + 1 }));
    window.setTimeout(() => chatRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 60);
  }

  const chosen = useMemo(() => (discovery?.inferences || []).filter((i) => selection.accepted[i.key]).map((i) => ({ key: i.key, value: (i.key in selection.edits ? selection.edits[i.key] : i.value) as FieldValue | null })), [discovery, selection]);
  const invalid = chosen.filter((c) => { const def = FIELD_BY_KEY[c.key]; return !def || !validateValue(def, c.value).ok; }).map((c) => c.key);
  const recommended = () => { if (!discovery) return; const accepted: Record<string, boolean> = {}; for (const i of discovery.inferences) accepted[i.key] = (i.confidence !== 'baixa') && emptyOrUnknown(current[i.key]); setSelection((s) => ({ ...s, accepted })); };
  // item que TROCA um texto que o perfil já tem (campo preenchido e diferente do que foi achado)
  const replaces = (key: string, value: FieldValue | null | undefined) => !emptyOrUnknown(current[key]) && !sameText(current[key], value);
  const replacing = chosen.filter((c) => replaces(c.key, c.value));
  // "Marcar todos" nunca troca texto que o cliente já escreveu e ignora as sugestões de baixa confiança (palpites): marca só o que está certo ou provável e preenche vazio ou já confere
  const all = () => { if (!discovery) return; const accepted: Record<string, boolean> = {}; for (const i of discovery.inferences) accepted[i.key] = i.confidence !== 'baixa' && !replaces(i.key, i.key in selection.edits ? selection.edits[i.key] : i.value); setSelection((s) => ({ ...s, accepted })); };
  const unmarkReplacing = () => { setSelection((s) => ({ ...s, accepted: { ...s.accepted, ...Object.fromEntries(replacing.map((c) => [c.key, false])) } })); setConfirming(false); };
  // qualquer mudança na seleção cancela uma confirmação em aberto (o que seria confirmado deixou de ser o que está marcado)
  useEffect(() => { setConfirming(false); }, [selection]);

  async function apply(confirmedReplace = false) {
    if (saving) return;
    if (!payload) { setNotice({ kind: 'error', text: 'O perfil do projeto ainda não carregou. Atualize a página e tente de novo.' }); return; }
    if (!chosen.length) { setNotice({ kind: 'error', text: 'Marque ao menos um item para salvar no perfil.' }); return; }
    if (invalid.length) { setNotice({ kind: 'error', text: 'Há itens com valor inválido. Use "Editar" para corrigir ou desmarque-os.' }); return; }
    if (replacing.length && !confirmedReplace) { setNotice(null); setConfirming(true); return; }
    setSaving(true); setNotice({ kind: 'ok', text: `Salvando ${chosen.length} item(ns) no perfil…` });
    const changes: Record<string, FieldValue | null> = {};
    for (const c of chosen) changes[c.key] = c.value;
    try {
      const next = await callProfile<ProfilePayload>('profile_save', { projectId, changes, expected: { strategy: payload.strategy.version, extended: payload.extended.version, private: payload.private?.version ?? 0 } });
      cache.setQueryData(profileKey, next);
      setSaved(next.extended.version || next.strategy.version);
      const text = `${chosen.length} item(ns) salvo(s) no perfil. Uma nova versão ficou guardada.`;
      setNotice({ kind: 'ok', text });
      toast({ title: 'Perfil salvo', description: text });
      window.setTimeout(() => savedRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }), 80);
      const name = chosen.find((c) => c.key === 'businessName');
      if (name && typeof name.value === 'string' && project && project.name === autoName(project.domain || '') && name.value.trim()) {
        await supabase.from('projects').update({ name: name.value.trim().slice(0, 120) } as never).eq('id', projectId);
      }
      void cache.invalidateQueries({ queryKey: ['projects'] });
    } catch (e) {
      if (e instanceof ProfileError && e.code === 'profile_changed_reload') await profile.refetch();
      const details = e instanceof ProfileError ? Object.entries(e.fields).map(([k, why]) => `${FIELD_BY_KEY[k]?.label || k}: ${why}`) : [];
      const text = profileErrorMessage(e);
      setNotice({ kind: 'error', text, details });
      toast({ title: 'Não consegui salvar no perfil', description: text, variant: 'destructive' });
    } finally { setSaving(false); }
  }

  const shell = 'mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8';
  if (loadingProjects && !projects) return <div className={shell} aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="mt-4 h-64 w-full" /></div>;

  if (phase === 'running') return <div className={shell}><DiscoverRunning host={runningHost} progress={progress} onCancel={() => abort.current?.abort()} /></div>;

  if (phase === 'start' || !discovery) {
    return (
      <div className={`${shell} pb-32 md:pb-8`}>
        <DiscoverStart busy={false} error={error} projects={(projects || []).map((p) => ({ id: p.id, name: p.name, domain: p.domain }))} initial={project?.domain || ''} onStart={(h) => (project?.domain && cleanSiteInput(project.domain) === h ? start(projectId, undefined, h) : onStartNew(h))} onPickProject={onPick} />
      </div>
    );
  }

  const ok = discovery.siteState === 'ok';
  const accepted = chosen.length;
  return (
    <div className={`${shell} space-y-4 pb-48 md:pb-28`}>
      {error && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {profile.isError && <p role="alert" className="rounded border border-amber-500/50 bg-amber-500/10 p-3 text-sm">Não consegui carregar o perfil deste projeto, então não dá para salvar agora. <Button size="sm" variant="outline" className="ml-2" onClick={() => profile.refetch()}>Tentar de novo</Button></p>}
      {payload && !canWrite && <p role="note" className="rounded border p-3 text-sm">Você pode ver o resultado, mas seu papel não permite salvar no perfil.</p>}

      <DiscoverReview discovery={discovery} current={current} selection={selection} onSelection={setSelection} canWrite={canWrite} busy={saving} onReanalyze={reanalyze} onAskZica={askZica} />

      {saved !== null && (
        <section ref={savedRef as never} className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-4 sm:p-5" role="status">
          <p className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden />Perfil montado e salvo (versão {saved})</p>
          <p className="mt-1 text-sm">O perfil já alimenta os módulos. O próximo passo é refinar: peça sugestões à Zica ou abra o perfil completo para ajustar cada detalhe.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => askZica()}><MessageCircle className="mr-1.5 h-4 w-4" aria-hidden />Refinar com a Zica</Button>
            <Button asChild variant="outline"><Link to={`/projects/${projectId}/perfil`}>Abrir o perfil completo</Link></Button>
            <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>Ir para o painel</Button>
          </div>
        </section>
      )}

      <div ref={chatRef} id="discover-chat">
        {payload ? (
          <details className="group rounded-xl border bg-card/40" open={chatOpen} onToggle={(e) => setChatOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5">
              <span><span className="block text-lg font-semibold">Refinar conversando com a Zica</span><span className="block text-sm text-muted-foreground">{ok ? 'Peça sugestões de concorrentes, regiões, perguntas dos clientes e conceito da marca.' : 'Conte o que o negócio faz e para quem; a Zica monta o conceito com você.'}</span></span>
              <span className="shrink-0 rounded-full border px-3 py-1 text-xs group-open:hidden">Abrir</span>
            </summary>
            <div className="border-t p-3 sm:p-4">
              <ProfileChat projectId={projectId} payload={payload} hasUnsaved={false} suggestions={discovery.followUps} seed={seed}
                onProfileUpdated={(next) => cache.setQueryData(profileKey, next)} />
            </div>
          </details>
        ) : null}
      </div>

      {confirming && replacing.length > 0 && (
        <section role="alertdialog" aria-labelledby="replace-title" className="rounded-xl border-2 border-amber-500/70 bg-amber-500/10 p-4 sm:p-5">
          <h2 id="replace-title" className="text-lg font-semibold">Isto vai substituir {replacing.length} texto(s) que você já tem no perfil</h2>
          <p className="mt-1 text-sm">Confira o antes e o depois. Uma versão anterior fica guardada, mas só confirme se o texto novo realmente é melhor.</p>
          <ul className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {replacing.map((c) => (
              <li key={c.key} className="rounded-lg border bg-background/60 p-3 text-sm">
                <p className="font-semibold">{FIELD_BY_KEY[c.key]?.label || c.key}</p>
                <p className="mt-1 break-words"><span className="text-muted-foreground">Hoje: </span>{clip(current[c.key])}</p>
                <p className="mt-1 break-words"><span className="text-amber-300">Vai virar: </span>{clip(c.value)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Voltar e revisar</Button>
            <Button type="button" variant="outline" onClick={unmarkReplacing}>Desmarcar os que substituem</Button>
            <Button type="button" variant="destructive" disabled={saving} onClick={() => { setConfirming(false); void apply(true); }}>Sim, substituir {replacing.length} texto(s) e salvar</Button>
          </div>
        </section>
      )}

      {canWrite && ok && (
        <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 md:bottom-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
            <div className="min-w-0 flex-1 text-sm">
              {saved !== null ? (
                <p role="status" className="font-medium text-emerald-400">Perfil salvo (versão {saved}). {notice?.kind === 'ok' ? notice.text : ''}</p>
              ) : (
                <>
                  <p><strong className="tabular-nums">{accepted}</strong> de {discovery.inferences.length} marcado(s) para o perfil</p>
                  {!accepted && !notice && <p className="text-xs text-muted-foreground">Marque ao menos um item para salvar.</p>}
                  {replacing.length > 0 && !confirming && <p role="note" className="text-xs text-amber-300">{replacing.length} item(ns) vão <strong>substituir texto que você já tem</strong>. Vou pedir confirmação antes de salvar.</p>}
                  {invalid.length > 0 && <p role="alert" className="text-xs text-red-400">Há itens com valor inválido: use Editar para corrigir ou desmarque-os.</p>}
                  {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`text-xs ${notice.kind === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{notice.text}</p>}
                  {notice?.details?.map((d) => <p key={d} role="alert" className="text-xs text-red-400">{d}</p>)}
                </>
              )}
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {saved !== null ? (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => askZica()}>Refinar com a Zica</Button>
                  <Button asChild size="sm"><Link to={`/projects/${projectId}/perfil`}>Abrir o perfil</Link></Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="ghost" size="sm" className="px-2" onClick={recommended}>Recomendados</Button>
                  <Button type="button" variant="ghost" size="sm" className="hidden px-2 sm:inline-flex" onClick={all} title="Marca só o que está certo ou provável e preenche campo vazio ou já confere. Ignora os palpites (baixa confiança) e nunca troca um texto que você já escreveu.">Marcar todos (sem substituir)</Button>
                  <Button type="button" className="flex-1 sm:flex-none" aria-busy={saving} disabled={saving} onClick={() => apply()}>{saving ? 'Salvando…' : `Confirmar ${accepted ? `${accepted} ` : ''}no perfil${replacing.length ? ` (${replacing.length} substituem)` : ''}`}</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{notice?.text}</p>
    </div>
  );
}
