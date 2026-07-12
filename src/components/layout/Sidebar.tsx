import { useState, memo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { PrefetchLink } from '@/components/PrefetchLink';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  Crown,
  Newspaper,
  GraduationCap,
  History,
  User,
  Plug,
  Target,
  Zap,
  FileEdit,
  Layers,
  Calendar,
  Activity,
  ChevronDown,
  FileText,
  MessageSquare,
  
  Vote,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import logoSeo from '@/assets/logo-grupo-seo.png';

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  badge?: string;
  badgeVariant?: 'default' | 'accent' | 'premium' | 'orange';
  iconColor?: string;
  subItems?: NavItem[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Início',
    items: [
      { label: 'Painel', icon: LayoutDashboard, href: '/' },
      { label: 'Calendário', icon: Calendar, href: '/calendar', badge: 'Novo', badgeVariant: 'orange', iconColor: '#10B981' },
      { label: 'Academia', icon: GraduationCap, href: '/academia' },
      { label: 'Chat IA', icon: MessageSquare, href: '/ai-chat', badge: 'Novo', badgeVariant: 'orange', iconColor: '#8B5CF6' },
    ],
  },
  {
    title: 'Geradores',
    items: [
      { 
        label: 'Artigos IA', 
        icon: Zap, 
        href: '/articles/bulk',
        iconColor: '#4169E1',
        subItems: [
          { 
            label: 'Artigo', 
            icon: FileText, 
            href: '/articles/types',
            iconColor: '#4169E1',
          },
          { 
            label: 'Landing Page', 
            icon: Target, 
            href: '/landing-page/new', 
            iconColor: '#FF6B2B',
          },
          { 
            label: 'Repostagem', 
            icon: FileEdit, 
            href: '/news-rewriter',
            iconColor: '#10B981',
          },
          { 
            label: 'Eleitoral', 
            icon: Vote, 
            href: '/electoral-campaign',
            badge: 'Novo',
            badgeVariant: 'orange' as const,
            iconColor: '#DC2626',
          },
          { 
            label: 'Em Massa', 
            icon: Layers, 
            href: '/bulk-generator',
            badge: 'Pro',
            badgeVariant: 'premium',
            iconColor: '#8B5CF6',
          },
        ],
      },
    ],
  },
  {
    title: 'Automação',
    items: [
      { label: 'Autoridade', icon: Crown, href: '/authority-planner' },
      { label: 'Agentes', icon: Newspaper, href: '/news-agents' },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { label: 'Projetos', icon: FolderKanban, href: '/projects' },
      { label: 'Histórico', icon: History, href: '/articles' },
      { label: 'Linkagem', icon: Target, href: '/internal-linking', badge: 'IA', badgeVariant: 'accent', iconColor: '#F97316' },
      { label: 'Monitor WP', icon: Activity, href: '/wordpress-monitor', iconColor: '#10B981' },
      { label: 'Filas', icon: Layers, href: '/queue-monitor', badge: 'Novo', badgeVariant: 'orange', iconColor: '#8B5CF6' },
      { label: 'Plugin WP', icon: Plug, href: '/wordpress-plugin' },
    ],
  },
];

const bottomNavItems: NavItem[] = [
  { label: 'Configurações', icon: Settings, href: '/settings' },
  { label: 'Perfil', icon: User, href: '/settings' },
];

export const Sidebar = memo(function Sidebar() {
  const [collapsed] = useState(true);
  const [expandedMenu, setExpandedMenu] = useState<string | null>('Artigos IA');
  const location = useLocation();

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  const isParentActive = (item: NavItem) => {
    if (item.subItems) {
      return item.subItems.some(sub => isActive(sub.href));
    }
    return isActive(item.href);
  };

  const badgeColors = {
    default: 'bg-muted text-muted-foreground',
    accent: 'bg-primary text-primary-foreground',
    premium: 'bg-amber-500 text-white',
    orange: 'bg-orange-500 text-white',
  };

  const NavLink = ({ item, isSubItem = false }: { item: NavItem; isSubItem?: boolean }) => {
    const active = isActive(item.href);
    const parentActive = isParentActive(item);
    const Icon = item.icon;
    const hasSubItems = item.subItems && item.subItems.length > 0;
    const isExpanded = expandedMenu === item.label;

    const handleClick = (e: React.MouseEvent) => {
      if (hasSubItems) {
        e.preventDefault();
        setExpandedMenu(isExpanded ? null : item.label);
      }
    };

    // Calculate dynamic height for smooth animation
    const subItemsHeight = item.subItems ? item.subItems.length * 52 + 8 : 0;

    if (hasSubItems) {
      return (
        <div className="relative">
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                onClick={handleClick}
                className={cn(
                  'w-full flex flex-col items-center gap-1 px-2 py-3 rounded-lg',
                  'transition-all duration-300 ease-out',
                  'hover:bg-sidebar-accent hover:scale-105 group relative',
                  parentActive && 'bg-sidebar-accent text-sidebar-primary',
                  !parentActive && 'text-sidebar-foreground/70 hover:text-sidebar-foreground'
                )}
              >
                <div className="relative">
                  <Icon 
                    className={cn(
                      'w-5 h-5 flex-shrink-0 transition-all duration-300',
                      parentActive && !item.iconColor && 'text-sidebar-primary'
                    )} 
                    style={item.iconColor ? { color: item.iconColor } : undefined}
                  />
                  <ChevronDown 
                    className={cn(
                      'absolute -bottom-1 -right-2 w-3 h-3 transition-transform duration-300 ease-out',
                      isExpanded && 'rotate-180'
                    )}
                  />
                </div>
                <span className={cn(
                  'text-[10px] font-medium text-center leading-tight transition-opacity duration-200',
                  collapsed && 'max-w-[60px] truncate'
                )}>
                  {item.label}
                </span>
                {parentActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-sidebar-primary rounded-r-full transition-all duration-300" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              <p>{item.label}</p>
              {item.subItems && (
                <p className="text-xs text-muted-foreground mt-1">
                  {item.subItems.map(s => s.label).join(', ')}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
          
          {/* Sub-items dropdown with smooth animation */}
          <div 
            className={cn(
              'overflow-hidden transition-all duration-300 ease-out'
            )}
            style={{
              maxHeight: isExpanded ? `${subItemsHeight}px` : '0px',
              opacity: isExpanded ? 1 : 0,
            }}
          >
            <div className="py-1 space-y-0.5">
              {item.subItems?.map((subItem, idx) => (
                <div
                  key={subItem.href + subItem.label}
                  className="animate-fade-in"
                  style={{
                    animationDelay: isExpanded ? `${idx * 50}ms` : '0ms',
                    animationFillMode: 'both',
                  }}
                >
                  <NavLink item={subItem} isSubItem />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const linkContent = (
      <PrefetchLink
        to={item.href}
        prefetchOnHover
        className={cn(
          'flex flex-col items-center gap-1 rounded-lg',
          'transition-all duration-300 ease-out',
          'hover:bg-sidebar-accent hover:scale-105 group relative',
          active && 'bg-sidebar-accent text-sidebar-primary',
          !active && 'text-sidebar-foreground/70 hover:text-sidebar-foreground',
          isSubItem ? 'px-1.5 py-2' : 'px-2 py-3'
        )}
      >
        <div className="relative">
          <Icon 
            className={cn(
              'flex-shrink-0 transition-all duration-300',
              isSubItem ? 'w-4 h-4' : 'w-5 h-5',
              active && !item.iconColor && 'text-sidebar-primary'
            )} 
            style={item.iconColor ? { color: item.iconColor } : undefined}
          />
          {item.badge && (
            <span className={cn(
              'absolute -top-1.5 -right-2.5 px-1 py-0.5 text-[8px] font-bold rounded-full leading-none',
              'animate-scale-in',
              badgeColors[item.badgeVariant || 'default']
            )}>
              {item.badge}
            </span>
          )}
        </div>
        <span className={cn(
          'font-medium text-center leading-tight transition-opacity duration-200',
          isSubItem ? 'text-[9px] max-w-[56px]' : 'text-[10px]',
          collapsed && 'max-w-[60px] truncate'
        )}>
          {item.label}
        </span>
        {active && !isSubItem && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-sidebar-primary rounded-r-full transition-all duration-300" />
        )}
      </PrefetchLink>
    );

    return (
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          {linkContent}
        </TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          <p>{item.label}</p>
          {item.badge && (
            <span className={cn(
              'inline-block ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded',
              badgeColors[item.badgeVariant || 'default']
            )}>
              {item.badge}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider>
      <aside className={cn(
        'h-screen flex flex-col bg-gradient-sidebar border-r border-sidebar-border',
        'transition-all duration-300 ease-in-out w-[72px]'
      )}>
        {/* Logo - GRUPO SEO MKT */}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center px-2 h-16 border-b border-sidebar-border cursor-pointer hover:bg-sidebar-accent/50 transition-colors duration-200">
              <img 
                src={logoSeo} 
                alt="GRUPO SEO MKT" 
                className="w-10 h-10 rounded-xl transition-transform duration-300 hover:scale-110"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            <p>ContentFactory</p>
            <p className="text-xs text-muted-foreground">by GRUPO SEO MKT</p>
          </TooltipContent>
        </Tooltip>

        {/* Main Navigation */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto scrollbar-thin">
          {navGroups.map((group, groupIdx) => (
            <div key={group.title} className={cn(groupIdx > 0 && 'mt-2 pt-2 border-t border-sidebar-border/50')}>
              {group.items.map((item) => (
                <NavLink key={item.href + item.label} item={item} />
              ))}
            </div>
          ))}
        </nav>

        {/* Bottom Navigation */}
        <div className="px-2 py-4 border-t border-sidebar-border space-y-1">
          {bottomNavItems.map((item) => (
            <NavLink key={item.href + item.label} item={item} />
          ))}
        </div>
      </aside>
    </TooltipProvider>
  );
});
