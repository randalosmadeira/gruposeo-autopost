import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  PenTool,
  Link2,
  Sparkles,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Zap,
  BarChart3,
  Crown,
  Newspaper,
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
  { label: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { label: 'Novo Artigo', icon: PenTool, href: '/articles/new', badge: 'IA', badgeVariant: 'accent' },
  { label: 'Artigos', icon: FileText, href: '/articles' },
  { label: 'Plano Autoridade', icon: Crown, href: '/authority-planner', badge: 'Novo', badgeVariant: 'premium' },
  { label: 'Agente Notícias', icon: Newspaper, href: '/news-agents', badge: 'IA', badgeVariant: 'accent' },
  { label: 'Geração em Massa', icon: Zap, href: '/articles/bulk', badge: 'Beta', badgeVariant: 'premium' },
  { label: 'Projetos', icon: FolderKanban, href: '/projects' },
  { label: 'Links Internos', icon: Link2, href: '/internal-links' },
  { label: 'Topical Maps', icon: BarChart3, href: '/topical-maps' },
];

const bottomNavItems: NavItem[] = [
  { label: 'Configurações', icon: Settings, href: '/settings' },
  { label: 'Ajuda', icon: HelpCircle, href: '/help' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
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
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
          'hover:bg-sidebar-accent group relative',
          active && 'bg-sidebar-accent text-sidebar-primary',
          !active && 'text-sidebar-foreground/70 hover:text-sidebar-foreground'
        )}
      >
        <Icon className={cn(
          'w-5 h-5 flex-shrink-0 transition-colors',
          active && 'text-sidebar-primary'
        )} />
        {!collapsed && (
          <>
            <span className="text-sm font-medium truncate">{item.label}</span>
            {item.badge && (
              <span className={cn(
                'ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full uppercase',
                item.badgeVariant === 'accent' && 'bg-accent text-accent-foreground',
                item.badgeVariant === 'premium' && 'bg-premium text-premium-foreground',
                !item.badgeVariant && 'bg-sidebar-accent text-sidebar-foreground'
              )}>
                {item.badge}
              </span>
            )}
          </>
        )}
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-sidebar-primary rounded-r-full" />
        )}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            {linkContent}
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {item.label}
            {item.badge && (
              <span className={cn(
                'px-1.5 py-0.5 text-[10px] font-bold rounded-full uppercase',
                item.badgeVariant === 'accent' && 'bg-accent text-accent-foreground',
                item.badgeVariant === 'premium' && 'bg-premium text-premium-foreground',
                !item.badgeVariant && 'bg-muted text-muted-foreground'
              )}>
                {item.badge}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  return (
    <aside className={cn(
      'h-screen flex flex-col bg-gradient-sidebar border-r border-sidebar-border',
      'transition-all duration-300 ease-in-out',
      collapsed ? 'w-[72px]' : 'w-64'
    )}>
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-3 px-4 h-16 border-b border-sidebar-border',
        collapsed && 'justify-center px-2'
      )}>
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-primary shadow-glow-primary">
          <Sparkles className="w-5 h-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-lg font-bold text-sidebar-foreground tracking-tight">
              ContentFactory
            </span>
            <span className="text-[10px] font-medium text-sidebar-foreground/50 uppercase tracking-wider">
              RDM Internal
            </span>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {mainNavItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
        {bottomNavItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {/* Collapse Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sidebar-foreground/50 hover:text-sidebar-foreground',
            'hover:bg-sidebar-accent transition-colors',
            collapsed && 'justify-center'
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Recolher</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}