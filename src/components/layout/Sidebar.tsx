import { memo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PrefetchLink } from '@/components/PrefetchLink';
import { cn } from '@/lib/utils';
import { Activity, Calendar, ChevronDown, Crown, FileEdit, FileText, FolderKanban, GraduationCap, History, Layers, LayoutDashboard, MessageSquare, Newspaper, Plug, Settings, Target, User, Vote, Zap } from 'lucide-react';
import { ZicaLogo } from '@/components/brand/ZicaLogo';

interface NavItem { label: string; icon: React.ElementType; href: string; badge?: string; subItems?: NavItem[]; }
interface NavGroup { title: string; items: NavItem[]; }
const navGroups: NavGroup[] = [
  { title: 'Cérebro', items: [{ label: 'Visão Geral', icon: LayoutDashboard, href: '/' }, { label: 'Cérebro de Tráfego', icon: Activity, href: '/' }, { label: 'Calendário de Ondas', icon: Calendar, href: '/calendar', badge: 'Novo' }, { label: 'Academia', icon: GraduationCap, href: '/academia' }, { label: 'Chat IA', icon: MessageSquare, href: '/ai-chat', badge: 'IA' }] },
  { title: 'Geração', items: [{ label: 'Ondas de Conteúdo', icon: Zap, href: '/articles/bulk', subItems: [{ label: 'Artigo', icon: FileText, href: '/articles/types' }, { label: 'Landing Page', icon: Target, href: '/landing-page/new' }, { label: 'Repostagem', icon: FileEdit, href: '/news-rewriter' }, { label: 'Eleitoral', icon: Vote, href: '/electoral-campaign', badge: 'Novo' }, { label: 'Em Massa', icon: Layers, href: '/bulk-generator', badge: 'Pro' }] }] },
  { title: 'Automação 24/7', items: [{ label: 'Autoridade', icon: Crown, href: '/authority-planner' }, { label: 'Agentes Autônomos', icon: Newspaper, href: '/news-agents' }] },
  { title: 'Ecossistema', items: [{ label: 'Projetos', icon: FolderKanban, href: '/projects' }, { label: 'Histórico', icon: History, href: '/articles' }, { label: 'Linkagem IA', icon: Target, href: '/internal-linking', badge: 'IA' }, { label: 'Monitor WordPress', icon: Activity, href: '/wordpress-monitor' }, { label: 'Filas', icon: Layers, href: '/queue-monitor' }, { label: 'Plugin WordPress', icon: Plug, href: '/wordpress-plugin' }] },
];
const bottomItems: NavItem[] = [{ label: 'Configurações', icon: Settings, href: '/settings' }, { label: 'Perfil', icon: User, href: '/settings' }];

export const Sidebar = memo(function Sidebar() {
  const location = useLocation();
  const [expanded, setExpanded] = useState<string | null>('Ondas de Conteúdo');
  const isActive = (href: string) => href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);
  const renderItem = (item: NavItem, child = false): React.ReactNode => {
    const Icon = item.icon;
    const childActive = item.subItems?.some((sub) => isActive(sub.href));
    const active = isActive(item.href) || !!childActive;
    const hasChildren = !!item.subItems?.length;
    const open = expanded === item.label;
    if (hasChildren) return <div key={item.label} className="space-y-1"><button type="button" onClick={() => setExpanded(open ? null : item.label)} className={cn('group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition', active ? 'border border-[#D4FF00]/25 bg-[#D4FF00]/[.055] text-[#D4FF00]' : 'border border-transparent text-slate-400 hover:bg-white/[.035] hover:text-white')}><Icon className="h-[18px] w-[18px] shrink-0" /><span className="hidden min-w-0 flex-1 truncate text-xs font-semibold lg:block">{item.label}</span><ChevronDown className={cn('hidden h-3.5 w-3.5 transition lg:block', open && 'rotate-180')} /></button><div className={cn('hidden overflow-hidden pl-4 lg:block', !open && 'max-h-0', open && 'max-h-96')}><div className="space-y-1 border-l border-[#263541] pl-2">{item.subItems?.map((sub) => renderItem(sub, true))}</div></div></div>;
    return <PrefetchLink key={`${item.href}-${item.label}`} to={item.href} prefetchOnHover className={cn('group relative flex items-center gap-3 rounded-xl border px-3 transition', child ? 'py-2' : 'py-2.5', active ? 'border-[#00F0FF]/25 bg-[#00F0FF]/[.045] text-white shadow-[inset_3px_0_0_#D4FF00]' : 'border-transparent text-slate-400 hover:border-[#263541] hover:bg-white/[.025] hover:text-white')}><Icon className={cn('shrink-0 transition', child ? 'h-4 w-4' : 'h-[18px] w-[18px]', active && 'text-[#00F0FF]')} /><span className={cn('hidden min-w-0 flex-1 truncate font-semibold lg:block', child ? 'text-[11px]' : 'text-xs')}>{item.label}</span>{item.badge && <span className="hidden rounded-full border border-[#D4FF00]/25 bg-[#D4FF00]/[.06] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#D4FF00] lg:inline">{item.badge}</span>}</PrefetchLink>;
  };
  return <aside className="zica-sidebar-wide flex h-screen w-[78px] flex-col border-r border-[#263541] lg:w-[244px]"><div className="zica-sidebar-logo-band flex h-[82px] shrink-0 items-center border-b border-[#263541] px-4 lg:px-5"><div className="hidden lg:block"><ZicaLogo showSubtitle /></div><div className="mx-auto lg:hidden"><ZicaLogo compact /></div></div><nav className="scrollbar-thin flex-1 overflow-y-auto px-2.5 py-4 lg:px-3.5">{navGroups.map((group, idx) => <div key={group.title} className={cn(idx > 0 && 'mt-5 border-t border-[#1f2d38] pt-4')}><p className="mb-2 hidden px-2 text-[9px] font-black uppercase tracking-[.18em] text-slate-600 lg:block">{group.title}</p><div className="space-y-1">{group.items.map((item) => renderItem(item))}</div></div>)}</nav><div className="border-t border-[#263541] p-2.5 lg:p-3.5"><div className="zica-sidebar-status mb-3 hidden rounded-2xl border border-[#263541] p-3 lg:block"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-[#D4FF00]"><Activity className="h-4 w-4" /> Cérebro online</div><p className="mt-2 text-[10px] leading-4 text-slate-500">Todos os sistemas operacionais</p><div className="mt-3 h-1 overflow-hidden rounded-full bg-[#1c2a34]"><div className="h-full w-full bg-[#D4FF00] shadow-[0_0_10px_#D4FF00]" /></div></div><div className="space-y-1">{bottomItems.map((item) => renderItem(item))}</div></div></aside>;
});
