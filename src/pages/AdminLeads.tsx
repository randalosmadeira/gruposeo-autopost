import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LeadError, leadErrorMessage, leadRelease, leadsList, leadUpdate, type LeadRow, type LeadStatus } from '@/lib/lead-api';

const STATUS_LABEL: Record<LeadStatus, string> = { new: 'Novo', contacted: 'Contatado', signed_up: 'Já se cadastrou', discarded: 'Descartado' };
const FILTERS: Array<{ value: LeadStatus | ''; label: string }> = [{ value: '', label: 'Todos' }, { value: 'new', label: 'Novos' }, { value: 'contacted', label: 'Contatados' }, { value: 'signed_up', label: 'Cadastrados' }, { value: 'discarded', label: 'Descartados' }];
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const PLAN_LABEL: Record<string, string> = { trial: 'Espaço de teste', commercial: 'Comercial', byok: 'Chave própria (BYOK)' };
const RELEASE_PLANS = ['commercial', 'byok'];
const wa = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;

/** Caixa de entrada dos leads vindos do atalho do site (só a gestão da plataforma). */
export default function AdminLeads() {
  const [filter, setFilter] = useState<LeadStatus | ''>('');
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [counts, setCounts] = useState<Record<LeadStatus, number> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setNotice('');
    try {
      const r = await leadsList({ status: filter, limit: 100 });
      setLeads(r.leads);
      setCounts(r.counts);
      setNotes(Object.fromEntries(r.leads.map((l) => [l.id, l.notes || ''])));
    } catch (e) {
      setNotice(leadErrorMessage(e));
    } finally {
      setLoaded(true);
    }
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  async function change(lead: LeadRow, patch: { status?: LeadStatus; notes?: string | null }) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      await leadUpdate({ id: lead.id, ...patch });
      await load();
    } catch (e) {
      setNotice(e instanceof LeadError ? leadErrorMessage(e) : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function release(lead: LeadRow) {
    if (busy || !lead.space) return;
    setBusy(true);
    setNotice('');
    try {
      await leadRelease({ organization_id: lead.space.organization_id, plan: plan[lead.id] || RELEASE_PLANS[0] });
      setConfirming(null);
      await load();
    } catch (e) {
      setNotice(leadErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Leads do site</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pessoas que deixaram o contato pelo atalho do site e seguiram para o cadastro. Os dados foram dados com consentimento: use só para falar sobre o Zica.ai e apague quando pedirem.</p>
      </header>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por situação">
        {FILTERS.map((f) => (
          <Button key={f.value || 'all'} size="sm" variant={filter === f.value ? 'default' : 'outline'} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}{counts ? ` (${f.value ? counts[f.value] : Object.values(counts).reduce((a, b) => a + b, 0)})` : ''}
          </Button>
        ))}
      </div>

      {notice && <p role="alert" className="rounded border border-destructive/40 p-3 text-sm text-destructive">{notice}</p>}
      {!loaded && <p className="text-sm text-muted-foreground" aria-busy="true">Carregando…</p>}
      {loaded && !notice && !leads.length && <p className="rounded border p-4 text-sm text-muted-foreground">Nenhum lead {filter ? 'nesta situação' : 'por enquanto'}.</p>}

      <ul className="space-y-3">
        {leads.map((l) => (
          <li key={l.id} className="space-y-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{l.name}</p>
                <p className="text-xs text-muted-foreground">{when(l.created_at)}{l.segment ? ` · ${l.segment}` : ''}{typeof l.source?.utm_source === 'string' ? ` · origem: ${l.source.utm_source}` : ''}</p>
              </div>
              <span className="rounded bg-muted px-2 py-0.5 text-xs">{STATUS_LABEL[l.status]}</span>
            </div>
            <p className="text-sm">
              {l.phone && <a className="mr-3 underline" href={wa(l.phone)} target="_blank" rel="noopener noreferrer">WhatsApp {l.phone}</a>}
              {l.email && <span className="mr-3 break-all">{l.email}</span>}
              {l.site_url && <span className="break-all text-muted-foreground">{l.site_url}</span>}
            </p>
            {l.message && <p className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-sm">{l.message}</p>}
            {l.space ? (
              <div className="space-y-2 rounded border p-2 text-sm" data-testid={`space-${l.id}`}>
                <p>Espaço: <strong>{PLAN_LABEL[l.space.plan_id] || l.space.plan_id}</strong> ({l.space.status === 'trialing' ? 'em teste' : l.space.status === 'active' ? 'ativo' : l.space.status})</p>
                {l.space.plan_id === 'trial' && (confirming === l.id ? (
                  <div className="space-y-2" role="group" aria-label="Confirmar liberação">
                    <p className="text-muted-foreground">Liberar dá a esta pessoa acesso à IA paga da plataforma, dentro do plano escolhido. Confirma?</p>
                    <label htmlFor={`p-${l.id}`} className="text-xs text-muted-foreground">Plano</label>
                    <select id={`p-${l.id}`} className="w-full rounded border bg-background p-2" value={plan[l.id] || RELEASE_PLANS[0]} onChange={(e) => setPlan((p) => ({ ...p, [l.id]: e.target.value }))}>
                      {RELEASE_PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={busy} onClick={() => release(l)}>Confirmar liberação</Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(l.id)}>Liberar espaço</Button>)}
              </div>
            ) : l.status === 'signed_up' ? <p className="text-xs text-muted-foreground">Cadastrou-se, mas ainda sem espaço de teste (pode ter chegado ao limite diário).</p> : null}
            <div className="space-y-2">
              <label htmlFor={`n-${l.id}`} className="text-xs text-muted-foreground">Anotações (só a equipe vê)</label>
              <textarea id={`n-${l.id}`} className="min-h-16 w-full rounded border bg-background p-2 text-sm" maxLength={1000} value={notes[l.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [l.id]: e.target.value }))} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => change(l, { notes: notes[l.id] ?? '' })}>Salvar anotação</Button>
                {l.status !== 'contacted' && l.status !== 'signed_up' && <Button size="sm" disabled={busy} onClick={() => change(l, { status: 'contacted' })}>Marcar como contatado</Button>}
                {l.status !== 'discarded' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => change(l, { status: 'discarded' })}>Descartar</Button>}
                {l.status === 'discarded' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => change(l, { status: 'new' })}>Reabrir</Button>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
