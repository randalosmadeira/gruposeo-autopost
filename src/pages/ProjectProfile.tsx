import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileField } from '@/components/profile/ProfileField';
import { AnalysisStep, ModulesStep, PathStep, VersionsPanel } from '@/components/profile/ProfileExtras';
import { ProfileChat } from '@/components/profile/ProfileChat';
import { callProfile, clearDraft, loadDraft, ProfileError, profileErrorMessage, saveDraft, type ProfilePayload } from '@/lib/profile-api';
import {
  COUNCIL, PROFILE_FIELDS_V2, PROFILE_STEPS, fieldsOfStep, isPrivateStore, isVisible, type FieldValue, type StepId,
} from '../../supabase/functions/_shared/profile-registry';
import {
  applyPatch, buildPatch, effectiveChanges, emptyStores, overallCompleteness, readValues, stepCompleteness, type Stores,
} from '../../supabase/functions/_shared/profile-model';

type Draft = Record<string, FieldValue | null>;
type Notice = { kind: 'ok' | 'error' | 'info'; text: string } | null;

const ROLE_LABEL: Record<string, string> = { owner: 'dono', admin: 'administrador', editor: 'editor', viewer: 'visualizador', campaign_manager: 'gestor de campanha' };

export default function ProjectProfile() {
  const { id = '' } = useParams();
  const cache = useQueryClient();
  const key = useMemo(() => ['project-profile', id], [id]);
  const query = useQuery<ProfilePayload>({ queryKey: key, queryFn: () => callProfile('profile_load', { projectId: id }), enabled: !!id, refetchOnWindowFocus: false, retry: false });
  const payload = query.data;

  const [step, setStep] = useState<StepId>('conversa');
  const [draft, setDraft] = useState<Draft>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const hydrated = useRef<string>('');

  // estado atual do servidor, no formato do modelo compartilhado
  const stores: Stores = useMemo(() => payload
    ? { strategy: payload.strategy.data, sections: payload.extended.sections, finance: payload.private?.finance ?? {}, goals: payload.private?.goals ?? {} }
    : emptyStores(), [payload]);
  const canPrivate = !!payload?.can_private;
  const built = useMemo(() => buildPatch(draft, canPrivate, stores), [draft, canPrivate, stores]);
  const changedKeys = useMemo(() => effectiveChanges(stores, built.patch), [stores, built]);
  const values = useMemo(() => readValues(applyPatch(stores, built.patch), canPrivate), [stores, built, canPrivate]);
  const serverValues = useMemo(() => readValues(stores, canPrivate), [stores, canPrivate]);
  const errorKeys = Object.keys(built.errors);
  const hasUnsaved = changedKeys.length > 0 || errorKeys.length > 0;
  const errors = { ...serverErrors, ...built.errors };
  const canWrite = !!payload?.can_write;

  // rascunho local: restaura ao abrir o projeto e guarda a cada mudança
  useEffect(() => {
    if (!payload || hydrated.current === id) return;
    hydrated.current = id;
    const stored = loadDraft(id);
    if (!stored) return;
    setDraft(stored.values);
    const same = stored.base.extended === payload.extended.version && stored.base.strategy === payload.strategy.version;
    setNotice({ kind: 'info', text: same ? 'Recuperei o que você digitou e ainda não salvou neste navegador. Revise e salve.' : 'Recuperei um rascunho seu, mas o perfil foi alterado em outra tela depois dele. Confira com cuidado antes de salvar.' });
  }, [payload, id]);
  useEffect(() => {
    if (!payload || hydrated.current !== id) return;
    saveDraft(id, draft, { strategy: payload.strategy.version, extended: payload.extended.version, private: payload.private?.version ?? 0 });
  }, [draft, payload, id]);
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsaved]);

  const setField = useCallback((k: string, v: FieldValue | null) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setServerErrors((s) => { if (!(k in s)) return s; const { [k]: _gone, ...rest } = s; return rest; });
    setNotice(null);
  }, []);

  const expected = () => ({ strategy: payload!.strategy.version, extended: payload!.extended.version, private: payload!.private?.version ?? 0 });

  async function run(action: () => Promise<ProfilePayload>, ok: string, afterOk?: () => void) {
    setBusy(true);
    setNotice(null);
    try {
      const next = await action();
      cache.setQueryData(key, next);
      afterOk?.();
      setNotice({ kind: 'ok', text: ok });
      void cache.invalidateQueries({ queryKey: ['projects'] });
    } catch (e) {
      if (e instanceof ProfileError && e.fields && Object.keys(e.fields).length) setServerErrors(e.fields);
      setNotice({ kind: 'error', text: profileErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(
    () => callProfile('profile_save', { projectId: id, changes: draft, expected: expected() }),
    'Perfil salvo. Uma nova versão ficou guardada.',
    () => { setDraft({}); setServerErrors({}); clearDraft(id); },
  );
  const discard = () => { setDraft({}); setServerErrors({}); clearDraft(id); setNotice({ kind: 'info', text: 'Alterações não salvas descartadas.' }); };
  const importLegacy = () => {
    if (!payload) return;
    const next: Draft = {};
    for (const [k, v] of Object.entries(payload.legacy_strategy)) if (v && !payload.strategy.data[k] && !(k in draft)) next[k] = v;
    const n = Object.keys(next).length;
    setDraft((d) => ({ ...d, ...next }));
    setNotice({ kind: 'info', text: n ? `${n} campo(s) vazio(s) preenchido(s) com dados já cadastrados neste projeto. Confira e salve: ainda são informações declaradas, não verificadas.` : 'Não há dados antigos para importar: os campos já estão preenchidos ou o projeto não tem cadastro anterior.' });
  };

  if (!id) return <p role="alert" className="p-6">Projeto não informado.</p>;
  if (query.isLoading) return <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-7" aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  if (query.isError || !payload) {
    const code = query.error instanceof ProfileError ? query.error.code : '';
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-6">
        <p role="alert">{code === 'project_not_found' ? 'Projeto não encontrado.' : code === 'organization_membership_required' ? 'Você não faz parte da organização deste projeto.' : 'Não foi possível carregar o perfil. Atualize a página.'}</p>
        <div className="flex gap-2"><Button variant="outline" onClick={() => query.refetch()}>Tentar de novo</Button><Button variant="outline" asChild><a href="/projects">Voltar aos projetos</a></Button><Button variant="outline" asChild><a href="/auth">Entrar no painel</a></Button></div>
      </div>
    );
  }

  const display = (k: string): FieldValue | undefined => (k in draft ? (draft[k] ?? undefined) : values[k]);
  const stepInfo = PROFILE_STEPS.find((s) => s.id === step)!;
  const idx = PROFILE_STEPS.findIndex((s) => s.id === step);
  const visible = fieldsOfStep(step).filter((f) => isVisible(f, values));
  const groups: Array<{ name: string; fields: typeof visible }> = [];
  for (const f of visible) {
    const name = f.group || '';
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.fields.push(f); else groups.push({ name, fields: [f] });
  }
  const seg = typeof values.seg === 'string' ? values.seg : '';
  const total = overallCompleteness(values, canPrivate);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-7">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-primary">Perfil do projeto · versão em teste</p>
        <h1 className="text-3xl font-bold">{payload.project.name}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Seu papel: {ROLE_LABEL[payload.role] || payload.role}</span>
          <span>Versão do perfil: {payload.extended.version || 'ainda não salvo'}</span>
          <span className="flex items-center gap-2"><span className="h-2 w-32 overflow-hidden rounded bg-muted" role="img" aria-label={`Perfil ${total}% preenchido`}><span className="block h-full bg-primary" style={{ width: `${total}%` }} /></span>{total}% preenchido</span>
          <a className="underline" href={`/business-profile?project=${id}`}>Abrir a tela antiga</a>
        </div>
        {!canWrite && <p role="note" className="rounded border p-3 text-sm">Você pode ver este perfil, mas seu papel não permite editar.</p>}
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Etapas do perfil" className="min-w-0 md:sticky md:top-4 md:self-start">
          <ol className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible">
            {PROFILE_STEPS.map((s, i) => {
              const pct = stepCompleteness(s.id, values, canPrivate);
              return (
                <li key={s.id} className="shrink-0">
                  <button type="button" aria-current={s.id === step ? 'step' : undefined} onClick={() => setStep(s.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${s.id === step ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-accent'}`}>
                    <span>{i + 1}. {s.name}</span>
                    {pct !== null && <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="min-w-0 space-y-5">
          <section aria-labelledby="step-title" className="space-y-4 rounded-lg border p-4 md:p-5">
            <div>
              <h2 id="step-title" className="text-2xl font-semibold">{idx + 1}. {stepInfo.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{stepInfo.intro}</p>
            </div>

            {step === 'conversa' && <ProfileChat projectId={id} payload={payload} hasUnsaved={hasUnsaved} onProfileUpdated={(next) => { cache.setQueryData(key, next); setDraft({}); setServerErrors({}); clearDraft(id); }} />}

            {step === 'negocio' && canWrite && (
              <Button variant="outline" size="sm" disabled={busy} onClick={importLegacy}>Importar dados já cadastrados neste projeto</Button>
            )}

            {step === 'modulos' ? (
              <ModulesStep payload={payload} busy={busy} onDecide={(code, enabled, reason) => run(() => callProfile('modules_set', { projectId: id, moduleCode: code, enabled, reason }), `Decisão do módulo registrada: ${enabled ? 'ligado' : 'desligado'}.`)} />
            ) : step === 'analise' ? (
              <AnalysisStep projectId={id} hasUnsaved={hasUnsaved} />
            ) : step === 'caminho' ? (
              <>
                <PathStep values={values} />
                <div className="grid gap-4 md:grid-cols-2">
                  {visible.map((f) => <ProfileField key={f.key} field={f} value={display(f.key)} error={errors[f.key]} disabled={!canWrite || busy} onChange={(v) => setField(f.key, v)} />)}
                </div>
              </>
            ) : (
              groups.map((g, gi) => {
                const locked = !canPrivate && g.fields.some((f) => isPrivateStore(f.store));
                return (
                  <fieldset key={`${g.name}-${gi}`} className="space-y-3">
                    {g.name && <legend className="mb-1 border-t pt-3 text-sm font-semibold">{g.name}</legend>}
                    {locked ? (
                      <p role="note" className="rounded border border-dashed p-3 text-sm text-muted-foreground">Estes números ficam só com dono e administrador da organização.</p>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2">
                        {g.fields.map((f) => (
                          <div key={f.key} className="contents">
                            <ProfileField field={f} value={display(f.key)} error={errors[f.key]} disabled={!canWrite || busy} fromSystem={serverValues[f.key] !== undefined && !(f.key in draft)} onChange={(v) => setField(f.key, v)} />
                            {f.key === 'seg' && seg && (
                              <div role="note" className="rounded border bg-muted/40 p-3 text-sm md:col-span-2">
                                {COUNCIL[seg]
                                  ? <><strong>Conselho identificado: {COUNCIL[seg][0]}.</strong> {COUNCIL[seg][1]} Entra como camada de revisão depois do perfil, só neste projeto.</>
                                  : <><strong>Sem conselho de classe.</strong> Para este segmento valem o Código de Defesa do Consumidor e a LGPD. Se houver regra do setor, informe em "Restrições setoriais".</>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </fieldset>
                );
              })
            )}
          </section>

          <div className="sticky bottom-0 z-10 -mx-1 space-y-2">
          <div role={notice?.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={notice ? `rounded border bg-background p-3 text-sm ${notice.kind === 'error' ? 'border-destructive text-destructive' : notice.kind === 'ok' ? 'border-emerald-500/50' : 'border-primary/40'}` : 'sr-only'}>
            {notice?.text}
            {notice?.kind === 'error' && query.isFetched && <Button className="ml-3" size="sm" variant="outline" onClick={() => query.refetch()}>Recarregar do servidor</Button>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 backdrop-blur">
            <div className="flex gap-2">
              <Button variant="outline" disabled={idx === 0} onClick={() => setStep(PROFILE_STEPS[idx - 1].id)}>Anterior</Button>
              <Button variant="outline" disabled={idx === PROFILE_STEPS.length - 1} onClick={() => setStep(PROFILE_STEPS[idx + 1].id)}>Próxima etapa</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {hasUnsaved ? `${changedKeys.length || errorKeys.length} alteração(ões) não salva(s)` : 'Tudo salvo'}
              </span>
              {hasUnsaved && <Button variant="ghost" size="sm" disabled={busy} onClick={discard}>Descartar</Button>}
              <Button disabled={busy || !canWrite || !changedKeys.length || errorKeys.length > 0} onClick={save}>{busy ? 'Salvando…' : 'Salvar perfil'}</Button>
            </div>
          </div>

          </div>

          <section aria-labelledby="versions-title" className="space-y-2 rounded-lg border p-4">
            <h2 id="versions-title" className="text-lg font-semibold">Versões guardadas</h2>
            {hasUnsaved && <p className="text-xs text-muted-foreground">Salve ou descarte as alterações antes de restaurar uma versão.</p>}
            <VersionsPanel payload={payload} busy={busy || hasUnsaved} onRestore={(v) => run(() => callProfile('profile_restore', { projectId: id, version: v, expected: expected() }), `Versão ${v} restaurada como uma nova versão.`)} />
          </section>
        </main>
      </div>
    </div>
  );
}

export const PROFILE_FIELD_COUNT = PROFILE_FIELDS_V2.length;
