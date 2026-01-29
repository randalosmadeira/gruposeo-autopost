import { cn } from '@/lib/utils';
import { FileText, Globe, FolderKanban, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  variant?: 'default' | 'primary' | 'accent' | 'success' | 'info';
}

export function StatCard({ title, value, subtitle, icon: Icon, variant = 'default' }: StatCardProps) {
  const variants = {
    default: { bg: 'bg-card', iconBg: 'bg-muted', iconColor: 'text-muted-foreground' },
    primary: { bg: 'bg-gradient-primary', iconBg: 'bg-white/20', iconColor: 'text-white' },
    accent: { bg: 'bg-gradient-accent', iconBg: 'bg-white/20', iconColor: 'text-white' },
    success: { bg: 'bg-gradient-success', iconBg: 'bg-white/20', iconColor: 'text-white' },
    info: { bg: 'bg-gradient-info', iconBg: 'bg-white/20', iconColor: 'text-white' },
  };
  const style = variants[variant];
  const isGradient = variant !== 'default';

  return (
    <div className={cn('relative p-6 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1', style.bg, isGradient ? 'text-white' : 'shadow-card')}>
      {isGradient && <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />}
      <div className="relative flex items-start justify-between">
        <div className="space-y-3">
          <p className={cn('text-sm font-medium uppercase tracking-wide', isGradient ? 'text-white/80' : 'text-muted-foreground')}>{title}</p>
          <span className="text-3xl font-bold tracking-tight">{value}</span>
          {subtitle && <p className={cn('text-sm', isGradient ? 'text-white/70' : 'text-muted-foreground')}>{subtitle}</p>}
        </div>
        <div className={cn('flex items-center justify-center w-12 h-12 rounded-xl', style.iconBg)}>
          <Icon className={cn('w-6 h-6', style.iconColor)} />
        </div>
      </div>
    </div>
  );
}

interface StatsGridProps {
  stats: { total: number; published: number; ready: number; draft: number };
  projectCount: number;
}

export function StatsGrid({ stats, projectCount }: StatsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard title="Total de Artigos" value={stats.total} subtitle="Todos os artigos" icon={FileText} variant="primary" />
      <StatCard title="Publicados" value={stats.published} subtitle="No WordPress" icon={Globe} variant="success" />
      <StatCard title="Prontos" value={stats.ready} subtitle="Aguardando publicação" icon={TrendingUp} variant="info" />
      <StatCard title="Projetos" value={projectCount} subtitle="Sites conectados" icon={FolderKanban} variant="accent" />
    </div>
  );
}
