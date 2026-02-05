import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  PenTool,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  Crown,
  Newspaper,
  GraduationCap,
  History,
  User,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  badge?: string;
  badgeVariant?: 'default' | 'accent' | 'premium';
}

const mainNavItems: NavItem[] = [
  { label: 'Academia', icon: GraduationCap, href: '/academia' },
  { label: 'Painel', icon: LayoutDashboard, href: '/' },
  { label: 'Geração em Massa', icon: Zap, href: '/articles/bulk' },
  { label: 'Autoridade', icon: Crown, href: '/authority-planner' },
  { label: 'Agente de notícias', icon: Newspaper, href: '/news-agents' },
  { label: 'Projetos', icon: FolderKanban, href: '/projects' },
  { label: 'Histórico', icon: History, href: '/articles' },
];

const bottomNavItems: NavItem[] = [
  { label: 'Configurações', icon: Settings, href: '/settings' },
  { label: 'Perfil', icon: User, href: '/settings' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(true);
  const location = useLocation();

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href);
    const Icon = item.icon;

    const linkContent = (
      <Link
        to={item.href}
        className={cn(
          'flex flex-col items-center gap-1 px-2 py-3 rounded-lg transition-all duration-200',
          'hover:bg-sidebar-accent group relative',
          active && 'bg-sidebar-accent text-sidebar-primary',
          !active && 'text-sidebar-foreground/70 hover:text-sidebar-foreground'
        )}
      >
        <Icon className={cn(
          'w-5 h-5 flex-shrink-0 transition-colors',
          active && 'text-sidebar-primary'
        )} />
        <span className={cn(
          'text-[10px] font-medium text-center leading-tight',
          collapsed && 'max-w-[60px] truncate'
        )}>
          {item.label}
        </span>
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-sidebar-primary rounded-r-full" />
        )}
      </Link>
    );

    return linkContent;
  };

  return (
    <aside className={cn(
      'h-screen flex flex-col bg-gradient-sidebar border-r border-sidebar-border',
      'transition-all duration-300 ease-in-out w-[72px]'
    )}>
      {/* Logo */}
      <div className="flex items-center justify-center px-2 h-16 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-primary shadow-glow-primary">
          <span className="text-lg font-bold text-primary-foreground">MA</span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {mainNavItems.map((item) => (
          <NavLink key={item.href + item.label} item={item} />
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-2 py-4 border-t border-sidebar-border space-y-1">
        {bottomNavItems.map((item) => (
          <NavLink key={item.href + item.label} item={item} />
        ))}
      </div>
    </aside>
  );
}
