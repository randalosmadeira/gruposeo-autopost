import { AlertTriangle, Building2, Globe2, Loader2, Newspaper, Radio } from 'lucide-react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useManagedOrganizations } from '@/hooks/useOrganizationConsole';

export default function AdminOrganizations() {
  const { isAdmin } = useAdminAccess();
  const { data, isLoading, error } = useManagedOrganizations(isAdmin);
  if (isLoading) return <div className="p-8 text-sm text-slate-400" role="status"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando organizações...</div>;
  if (error) return <div className="p-8 text-sm text-red-300">Falha ao carregar o Painel Gestor.</div>;
  const rows = data?.organizations || [];
  return <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
    <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#D4FF00]">Painel Gestor</p><h1 className="mt-1 text-2xl font-black text-white">Contratantes e consumo</h1><p className="mt-1 text-sm text-slate-400">Visão administrativa multi-tenant do Zica.IA Posts.</p></div>
    <div className="overflow-hidden rounded-2xl border border-[#263541] bg-[#161B22]/70">
      <div className="hidden grid-cols-[2fr_1fr_repeat(3,minmax(110px,0.7fr))] gap-4 border-b border-[#263541] px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 md:grid"><span>Organização</span><span>Plano</span><span>Projetos</span><span>Artigos</span><span>Fila</span></div>
      {rows.map((row) => { const subscription=row.organization_subscriptions?.[0]; const plan=subscription?.commercial_plans; return <article key={row.id} className="grid gap-3 border-b border-[#263541]/70 px-5 py-4 last:border-0 md:grid-cols-[2fr_1fr_repeat(3,minmax(110px,0.7fr))] md:items-center md:gap-4">
        <div><p className="flex items-center gap-2 font-bold text-white"><Building2 className="h-4 w-4 text-[#00F0FF]" />{row.name}</p><p className="mt-1 text-xs text-slate-500">{row.slug} · {row.status}</p></div>
        <div className="text-sm text-slate-300">{plan?.name || subscription?.plan_id || 'Sem plano'}</div>
        <div className="text-sm text-slate-300"><Globe2 className="mr-1.5 inline h-4 w-4" />{row.projects_used} / {plan?.project_limit ?? '∞'}</div>
        <div className="text-sm text-slate-300"><Newspaper className="mr-1.5 inline h-4 w-4" />{row.articles_used} / {plan?.article_limit_monthly ?? '∞'}</div>
        <div className={row.active_jobs ? 'text-sm text-amber-300' : 'text-sm text-emerald-300'}>{row.active_jobs ? <AlertTriangle className="mr-1.5 inline h-4 w-4" /> : <Radio className="mr-1.5 inline h-4 w-4" />}{row.active_jobs}</div>
      </article>; })}
      {!rows.length ? <p className="p-8 text-center text-sm text-slate-500">Nenhuma organização cadastrada.</p> : null}
    </div>
  </div>;
}
