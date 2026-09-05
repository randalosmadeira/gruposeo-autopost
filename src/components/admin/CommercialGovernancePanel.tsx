import { type ReactNode, useState } from 'react';
import { BadgeDollarSign, CalendarClock, Loader2, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  BillingCycle,
  CommercialPlanSummary,
  ManagedOrganization,
  OrganizationOperatingPolicy,
  OrganizationRole,
  OveragePolicy,
  useBusinessConfig,
  useCommercialPolicyMutations,
} from '@/hooks/useOrganizationConsole';
import { toast } from 'sonner';

const billingLabels: Record<BillingCycle, string> = { monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' };
const overageLabels: Record<OveragePolicy, string> = { block: 'Bloquear ao atingir o limite', per_article: 'Cobrar por artigo excedente', package: 'Consumir pacote adicional' };
const roleLabels: Record<OrganizationRole, string> = { owner: 'Proprietário', admin: 'Administrador', editor: 'Editor', campaign_manager: 'Gestor eleitoral', viewer: 'Visualizador' };
const allRoles = Object.keys(roleLabels) as OrganizationRole[];
const moneyToCents = (value: string) => value.trim() === '' ? null : Math.round(Number(value.replace(',', '.')) * 100);
const centsToMoney = (value: number | null) => value === null ? '' : (value / 100).toFixed(2).replace('.', ',');
const localDateTime = (iso: string) => {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="space-y-1.5 text-xs font-bold text-slate-400">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-[#263541] bg-[#0D1117] px-3 text-sm text-slate-100 outline-none focus:border-[#00F0FF]">{children}</select></label>;
}

function PlanTermsEditor({ plan }: { plan: CommercialPlanSummary }) {
  const { updatePlan } = useCommercialPolicyMutations();
  const [price, setPrice] = useState(() => centsToMoney(plan.price_cents));
  const [cycle, setCycle] = useState<BillingCycle>(plan.billing_cycle);
  const [overage, setOverage] = useState<OveragePolicy>(plan.overage_policy);
  const [unitPrice, setUnitPrice] = useState(() => centsToMoney(plan.overage_unit_cents));
  const [grace, setGrace] = useState(String(plan.overage_grace_articles));
  const save = async () => {
    const priceCents = moneyToCents(price);
    const overageCents = moneyToCents(unitPrice);
    if ((priceCents !== null && (!Number.isFinite(priceCents) || priceCents < 0)) || (overage !== 'block' && (overageCents === null || overageCents < 0))) return toast.error('Confira os valores monetários do plano.');
    try {
      await updatePlan.mutateAsync({ plan_id: plan.id, price_cents: priceCents, currency: 'BRL', billing_cycle: cycle, overage_policy: overage, overage_unit_cents: overageCents, overage_grace_articles: Number(grace) });
      toast.success(`Condições do plano ${plan.name} atualizadas.`);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Falha ao atualizar o plano.'); }
  };
  return <article className="space-y-4 rounded-xl border border-[#263541] bg-[#0D1117]/45 p-4">
    <div><h3 className="font-black text-white">{plan.name}</h3><p className="mt-1 text-xs text-slate-500">{plan.project_limit ?? '∞'} projetos, {plan.article_limit_monthly ?? '∞'} artigos/mês</p></div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="space-y-1.5 text-xs font-bold text-slate-400">Preço do ciclo, R$<Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" placeholder="Definir" /></label>
      <SelectField label="Ciclo de cobrança" value={cycle} onChange={(value) => setCycle(value as BillingCycle)}>{Object.entries(billingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      <SelectField label="Política de excedente" value={overage} onChange={(value) => setOverage(value as OveragePolicy)}>{Object.entries(overageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      {overage !== 'block' ? <label className="space-y-1.5 text-xs font-bold text-slate-400">Valor por excedente, R$<Input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} inputMode="decimal" /></label> : <label className="space-y-1.5 text-xs font-bold text-slate-400">Franquia de excedente<Input type="number" min={0} max={10000} value={grace} onChange={(event) => setGrace(event.target.value)} disabled /></label>}
    </div>
    {overage !== 'block' ? <label className="block max-w-xs space-y-1.5 text-xs font-bold text-slate-400">Artigos de tolerância/pacote<Input type="number" min={0} max={10000} value={grace} onChange={(event) => setGrace(event.target.value)} /></label> : null}
    <Button size="sm" onClick={save} disabled={updatePlan.isPending}><Save className="mr-2 h-4 w-4" />Salvar condições do plano</Button>
  </article>;
}

function OrganizationPolicyForm({ organization, policy, subscription, plans, onSaved }: {
  organization: ManagedOrganization;
  policy: OrganizationOperatingPolicy;
  subscription: { plan_id: string; status: string; current_period_start: string; current_period_end: string };
  plans: CommercialPlanSummary[];
  onSaved: () => void;
}) {
  const { updateOrganization } = useCommercialPolicyMutations();
  const [planId, setPlanId] = useState(subscription.plan_id);
  const [status, setStatus] = useState(subscription.status);
  const [periodStart, setPeriodStart] = useState(() => localDateTime(subscription.current_period_start));
  const [periodEnd, setPeriodEnd] = useState(() => localDateTime(subscription.current_period_end));
  const [price, setPrice] = useState(() => centsToMoney(policy.price_cents));
  const [cycle, setCycle] = useState<BillingCycle>(policy.billing_cycle);
  const [projectLimit, setProjectLimit] = useState(policy.project_limit_override?.toString() || '');
  const [articleLimit, setArticleLimit] = useState(policy.article_limit_monthly_override?.toString() || '');
  const [overage, setOverage] = useState<OveragePolicy>(policy.overage_policy);
  const [overagePrice, setOveragePrice] = useState(() => centsToMoney(policy.overage_unit_cents));
  const [grace, setGrace] = useState(String(policy.overage_grace_articles));
  const [approvalRequired, setApprovalRequired] = useState(policy.publication_approval_required);
  const [automated, setAutomated] = useState(policy.allow_automated_publish);
  const [publisherRoles, setPublisherRoles] = useState<OrganizationRole[]>(policy.publisher_roles);
  const [approverRoles, setApproverRoles] = useState<OrganizationRole[]>(policy.approver_roles);
  const toggleRole = (role: OrganizationRole, target: 'publisher' | 'approver') => {
    if (target === 'publisher') setPublisherRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]);
    else setApproverRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]);
  };
  const save = async () => {
    if (!publisherRoles.length || !approverRoles.length || approverRoles.some((role) => !publisherRoles.includes(role))) return toast.error('Todo aprovador também precisa estar autorizado a publicar.');
    try {
      await updateOrganization.mutateAsync({
        organization_id: organization.id, plan_id: planId, subscription_status: status,
        current_period_start: new Date(periodStart).toISOString(), current_period_end: new Date(periodEnd).toISOString(),
        price_cents: moneyToCents(price), currency: 'BRL', billing_cycle: cycle,
        project_limit_override: projectLimit || null, article_limit_monthly_override: articleLimit || null,
        overage_policy: overage, overage_unit_cents: moneyToCents(overagePrice), overage_grace_articles: Number(grace),
        publication_approval_required: approvalRequired, publisher_roles: publisherRoles, approver_roles: approverRoles,
        allow_automated_publish: automated,
      });
      toast.success('Política do contratante atualizada e versionada.'); onSaved();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Falha ao salvar a política.'); }
  };
  return <div className="max-h-[72vh] space-y-6 overflow-y-auto pr-2">
    <section className="grid gap-3 md:grid-cols-2">
      <SelectField label="Plano contratado" value={planId} onChange={setPlanId}>{plans.filter((plan) => plan.active !== false).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</SelectField>
      <SelectField label="Situação da assinatura" value={status} onChange={setStatus}>{['trialing','active','past_due','suspended','cancelled'].map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
      <label className="space-y-1.5 text-xs font-bold text-slate-400">Início do ciclo<Input type="datetime-local" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
      <label className="space-y-1.5 text-xs font-bold text-slate-400">Fim do ciclo<Input type="datetime-local" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
      <label className="space-y-1.5 text-xs font-bold text-slate-400">Preço negociado, R$<Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" placeholder="Usar preço do plano" /></label>
      <SelectField label="Ciclo de cobrança" value={cycle} onChange={(value) => setCycle(value as BillingCycle)}>{Object.entries(billingLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      <label className="space-y-1.5 text-xs font-bold text-slate-400">Limite de projetos<Input type="number" min={1} value={projectLimit} onChange={(event) => setProjectLimit(event.target.value)} placeholder="Usar plano" /></label>
      <label className="space-y-1.5 text-xs font-bold text-slate-400">Limite mensal de artigos<Input type="number" min={1} value={articleLimit} onChange={(event) => setArticleLimit(event.target.value)} placeholder="Usar plano" /></label>
      <SelectField label="Excedentes" value={overage} onChange={(value) => setOverage(value as OveragePolicy)}>{Object.entries(overageLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      <label className="space-y-1.5 text-xs font-bold text-slate-400">Valor unitário excedente, R$<Input value={overagePrice} onChange={(event) => setOveragePrice(event.target.value)} inputMode="decimal" disabled={overage === 'block'} /></label>
      <label className="space-y-1.5 text-xs font-bold text-slate-400">Tolerância/pacote de artigos<Input type="number" min={0} max={10000} value={grace} onChange={(event) => setGrace(event.target.value)} disabled={overage === 'block'} /></label>
    </section>
    <section className="space-y-4 rounded-xl border border-[#263541] bg-[#0D1117]/55 p-4">
      <div><h3 className="flex items-center gap-2 font-black text-white"><ShieldCheck className="h-4 w-4 text-[#D4FF00]" />Governança de publicação</h3><p className="mt-1 text-xs text-slate-400">A regra é aplicada no backend antes de qualquer envio ao WordPress.</p></div>
      <div className="flex items-center justify-between gap-4"><span className="text-sm text-slate-200">Exigir papel aprovador para publicar</span><Switch checked={approvalRequired} onCheckedChange={setApprovalRequired} /></div>
      <div className="flex items-center justify-between gap-4"><span className="text-sm text-slate-200">Permitir publicação automática por filas e agentes</span><Switch checked={automated} onCheckedChange={setAutomated} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Podem publicar</p>{allRoles.map((role) => <label key={role} className="flex items-center gap-2 py-1.5 text-sm text-slate-300"><Checkbox checked={publisherRoles.includes(role)} onCheckedChange={() => toggleRole(role,'publisher')} />{roleLabels[role]}</label>)}</div>
        <div><p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Podem aprovar</p>{allRoles.map((role) => <label key={role} className="flex items-center gap-2 py-1.5 text-sm text-slate-300"><Checkbox checked={approverRoles.includes(role)} onCheckedChange={() => toggleRole(role,'approver')} />{roleLabels[role]}</label>)}</div>
      </div>
    </section>
    <Button onClick={save} disabled={updateOrganization.isPending}>{updateOrganization.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar e versionar política</Button>
  </div>;
}

export function OrganizationPolicyDialog({ organization, open, onOpenChange }: { organization: ManagedOrganization | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading, error, refetch } = useBusinessConfig(open ? organization?.id || null : null);
  const rawSubscription = data?.organization.organization_subscriptions;
  const subscription = Array.isArray(rawSubscription) ? rawSubscription[0] : rawSubscription as { plan_id: string; status: string; current_period_start: string; current_period_end: string } | undefined;
  const rawPolicy = data?.organization.organization_operating_policies;
  const policy = Array.isArray(rawPolicy) ? rawPolicy[0] : rawPolicy;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-4xl border-[#263541] bg-[#161B22] text-white"><DialogHeader><DialogTitle>Condições de {organization?.name}</DialogTitle><DialogDescription>Plano, cobrança, excedentes e autorização de publicação. Toda alteração mantém histórico.</DialogDescription></DialogHeader>
    {isLoading ? <div className="p-8 text-center text-sm text-slate-400"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando política...</div> : null}
    {error ? <p className="p-6 text-sm text-red-300">Não foi possível carregar a política.</p> : null}
    {organization && subscription && policy && data ? <OrganizationPolicyForm key={`${organization.id}-${policy.version}`} organization={organization} subscription={subscription} policy={policy} plans={data.plans} onSaved={() => void refetch()} /> : null}
  </DialogContent></Dialog>;
}

export function CommercialGovernancePanel({ plans }: { plans: CommercialPlanSummary[] }) {
  return <section className="space-y-4 rounded-2xl border border-[#263541] bg-[#161B22]/70 p-5">
    <div><p className="flex items-center gap-2 text-sm font-black text-white"><BadgeDollarSign className="h-5 w-5 text-[#00F0FF]" />Tabela comercial</p><p className="mt-1 text-xs text-slate-400"><CalendarClock className="mr-1 inline h-3.5 w-3.5" />Preços não são presumidos. O Gestor define os valores e cada mudança fica versionada.</p></div>
    <div className="grid gap-4">{plans.map((plan) => <PlanTermsEditor key={plan.id} plan={plan} />)}</div>
  </section>;
}
