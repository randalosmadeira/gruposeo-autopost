import { memo } from 'react';
import { useLocation } from 'react-router-dom';
import { PrefetchLink } from '@/components/PrefetchLink';
import { cn } from '@/lib/utils';
import { Activity, Calendar, Cpu, FileCode2, FileText, Globe2, LayoutDashboard, ListChecks, UserRound } from 'lucide-react';
import { ZicaLogo } from '@/components/brand/ZicaLogo';
import { useAdminAccess } from '@/hooks/useAdminAccess';

interface NavItem { label: string; icon: React.ElementType; href: string; }

const clientItems: NavItem[] = [
  { label: 'Visão Geral', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Conteúdo & Notícias', icon: FileText, href: '/articles' },
  { label: 'Calendário Editorial', icon: Calendar, href: '/calendar' },
  { label: 'Meus Blogs', icon: Globe2, href: '/integrations' },
  { label: 'Minha Conta', icon: UserRound, href: '/account' },
];

const adminItems: NavItem[] = [
  { label: 'Motor de IA & Chaves', icon: Cpu, href: '/admin/ai-engine' },
  { label: 'Engenharia de Prompts', icon: FileCode2, href: '/admin/prompts' },
  { label: 'Filas & Operações', icon: ListChecks, href: '/admin/queues' },
];

export const Sidebar = memo(function Sidebar() {
  const location = useLocation();
  const { isAdmin } = useAdminAccess();
  const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(`${href}/`);
  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <PrefetchLink key={item.href} to={item.href} prefetchOnHover className={cn('group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition', active ? 'border-[#00F0FF]/25 bg-[#00F0FF]/[.045] text-white shadow-[inset_3px_0_0_#D4FF00]' : 'border-transparent text-slate-400 hover:border-[#263541] hover:bg-white/[.025] hover:text-white')}>
        <Icon className={cn('h-[18px] w-[18px] shrink-0 transition', active && 'text-[#00F0FF]')} />
        <span className="hidden min-w-0 flex-1 truncate text-xs font-semibold lg:block">{item.label}</span>
      </PrefetchLink>
    );
  };

  return (
    <aside className="zica-sidebar-wide flex h-screen w-[78px] flex-col border-r border-[#263541] lg:w-[244px]">
      <div className="zica-sidebar-logo-band flex h-[82px] shrink-0 items-center border-b border-[#263541] px-4 lg:px-5">
        <div className="hidden lg:block"><ZicaLogo showSubtitle /></div><div className="mx-auto lg:hidden"><ZicaLogo compact /></div>
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2.5 py-4 lg:px-3.5" aria-label="Navegação principal">
        <p className="mb-2 hidden px-2 text-[9px] font-black uppercase tracking-[.18em] text-slate-600 lg:block">Painel</p>
        <div className="space-y-1">{clientItems.map(renderItem)}</div>
        {isAdmin ? <div className="mt-5 border-t border-[#1f2d38] pt-4"><p className="mb-2 hidden px-2 text-[9px] font-black uppercase tracking-[.18em] text-slate-600 lg:block">Administração</p><div className="space-y-1">{adminItems.map(renderItem)}</div></div> : null}
      </nav>
      <div className="border-t border-[#263541] p-2.5 lg:p-3.5"><div className="zica-sidebar-status hidden rounded-xl border border-[#263541] p-3 lg:block"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-[#D4FF00]"><Activity className="h-4 w-4" /> Núcleo conectado</div><p className="mt-2 text-[10px] leading-4 text-slate-500">Sincronização automática ativa</p></div></div>
    </aside>
  );
});
