import { useMemo, useState } from 'react';
import { CheckCircle2, Globe2, Images, KeyRound, Loader2, Newspaper, ShieldCheck } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOpenAIByok, useOrganizationConsole } from '@/hooks/useOrganizationConsole';
import { toast } from 'sonner';

function Meter({ label, used, limit, icon: Icon }: { label: string; used: number; limit: number | null; icon: typeof Globe2 }) {
  const percentage = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return <div className="space-y-2 rounded-xl border border-[#263541] bg-[#0D1117]/45 p-4">
    <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Icon className="h-4 w-4 text-[#00F0FF]" />{label}</span><span className="text-xs font-bold text-slate-400">{used} / {limit ?? 'Ilimitado'}</span></div>
    <Progress value={limit ? percentage : 100} className="h-2" />
  </div>;
}

export function SubscriptionOverviewCard() {
  const { data, isLoading, error } = useOrganizationConsole();
  const { setKey, deleteKey } = useOpenAIByok();
  const [secret, setSecret] = useState('');
  const subscription = data?.membership.organization_subscriptions?.[0];
  const plan = subscription?.commercial_plans;
  const organization = data?.membership.organizations;
  const canManageByok = plan?.byok_allowed && ['owner', 'admin'].includes(data?.membership.role || '');
  const expires = useMemo(() => subscription?.current_period_end ? new Intl.DateTimeFormat('pt-BR').format(new Date(subscription.current_period_end)) : null, [subscription?.current_period_end]);

  if (isLoading) return <div className="rounded-xl border border-[#263541] p-6 text-sm text-slate-400" role="status"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando assinatura...</div>;
  if (error || !data || !plan || !organization) return <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-300">Não foi possível carregar a assinatura.</div>;

  const saveKey = async () => {
    if (secret.trim().length < 20) return toast.error('Informe uma chave OpenAI válida.');
    try { await setKey.mutateAsync({ organizationId: organization.id, secret: secret.trim() }); setSecret(''); toast.success('Chave protegida no Vault. Nenhum teste pago foi executado.'); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Não foi possível proteger a chave.'); }
  };

  return <section className="space-y-5 rounded-2xl border border-[#263541] bg-[#161B22]/70 p-5 sm:p-6" aria-labelledby="subscription-title">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#D4FF00]">Minha assinatura</p><h2 id="subscription-title" className="mt-1 text-xl font-black text-white">{plan.name}</h2><p className="mt-1 text-sm text-slate-400">{organization.name} · {subscription.status === 'active' ? 'Ativa' : subscription.status}{expires ? ` · ciclo até ${expires}` : ''}</p></div>
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/8 px-3 py-1.5 text-xs font-bold text-emerald-300"><CheckCircle2 className="h-4 w-4" />Conta operacional</span>
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      <Meter label="Projetos WordPress" used={data.usage.projects} limit={plan.project_limit} icon={Globe2} />
      <Meter label="Artigos no mês" used={data.usage.articles} limit={plan.article_limit_monthly} icon={Newspaper} />
      <Meter label="Imagens homologadas" used={data.usage.brand_assets} limit={plan.brand_asset_limit} icon={Images} />
    </div>
    <div className="rounded-xl border border-[#263541] bg-[#0D1117]/45 p-4">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-[#D4FF00]" /><div><h3 className="text-sm font-bold text-white">OpenAI BYOK</h3><p className="mt-1 text-xs leading-5 text-slate-400">A chave é enviada ao backend e armazenada exclusivamente no Vault. O navegador não recebe o segredo de volta.</p></div></div>
      {plan.byok_allowed ? <div className="mt-4">
        {data.byok && data.byok.status !== 'revoked' ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#00F0FF]/15 bg-[#00F0FF]/5 p-3"><span className="text-sm text-slate-300"><KeyRound className="mr-2 inline h-4 w-4 text-[#00F0FF]" />Chave terminada em {data.byok.secret_last_four} · {data.byok.status}</span>{canManageByok ? <Button variant="outline" size="sm" disabled={deleteKey.isPending} onClick={() => deleteKey.mutateAsync(organization.id).then(() => toast.success('Chave revogada.')).catch(() => toast.error('Falha ao revogar a chave.'))}>Revogar</Button> : null}</div>
        : canManageByok ? <div className="flex flex-col gap-2 sm:flex-row"><Input type="password" autoComplete="off" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Cole sua chave OpenAI" aria-label="Chave OpenAI própria" /><Button onClick={saveKey} disabled={setKey.isPending}>{setKey.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}Proteger no Vault</Button></div> : null}
      </div> : <p className="mt-4 text-xs text-slate-500">Disponível no plano BYOK, com limite de 650 artigos por ciclo.</p>}
    </div>
  </section>;
}
