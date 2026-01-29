import { Link } from 'react-router-dom';
import { PenTool, Zap, BarChart3, Settings, ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickActionProps {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  variant: 'primary' | 'accent' | 'premium' | 'default';
}

function QuickAction({ title, description, icon: Icon, href, variant }: QuickActionProps) {
  const variants = {
    primary: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20',
    accent: 'bg-accent/10 text-accent border-accent/20 hover:bg-accent/20',
    premium: 'bg-premium/10 text-premium border-premium/20 hover:bg-premium/20',
    default: 'bg-muted text-foreground border-border hover:bg-muted/80',
  };

  const iconBg = {
    primary: 'bg-primary text-primary-foreground',
    accent: 'bg-accent text-accent-foreground',
    premium: 'bg-premium text-premium-foreground',
    default: 'bg-muted-foreground text-background',
  };

  return (
    <Link
      to={href}
      className={cn(
        'group flex items-center gap-4 p-4 rounded-xl border transition-all duration-200',
        variants[variant]
      )}
    >
      <div className={cn(
        'flex items-center justify-center w-10 h-10 rounded-lg transition-transform group-hover:scale-110',
        iconBg[variant]
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground truncate">{description}</p>
      </div>
      <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
    </Link>
  );
}

export function QuickActions() {
  const actions: QuickActionProps[] = [
    {
      title: 'Novo Artigo',
      description: 'Criar conteúdo com IA',
      icon: PenTool,
      href: '/articles/new',
      variant: 'primary',
    },
    {
      title: 'Geração em Massa',
      description: 'Múltiplos artigos de uma vez',
      icon: Zap,
      href: '/articles/bulk',
      variant: 'accent',
    },
    {
      title: 'Topical Map',
      description: 'Planejar estrutura de conteúdo',
      icon: BarChart3,
      href: '/topical-maps',
      variant: 'premium',
    },
    {
      title: 'Configurações',
      description: 'APIs e integrações',
      icon: Settings,
      href: '/settings',
      variant: 'default',
    },
  ];

  return (
    <div className="bg-card rounded-2xl p-6 shadow-card">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-accent" />
        <h3 className="font-semibold text-lg">Ações Rápidas</h3>
      </div>
      <div className="space-y-3">
        {actions.map((action) => (
          <QuickAction key={action.href} {...action} />
        ))}
      </div>
    </div>
  );
}