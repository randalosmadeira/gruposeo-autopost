import { cn } from '@/lib/utils';
import {
  FileText,
  Globe,
  Link2,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'accent' | 'success' | 'info';
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  className,
}: StatCardProps) {
  const variants = {
    default: {
      bg: 'bg-card',
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
    },
    primary: {
      bg: 'bg-gradient-primary',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
    },
    accent: {
      bg: 'bg-gradient-accent',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
    },
    success: {
      bg: 'bg-gradient-success',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
    },
    info: {
      bg: 'bg-gradient-info',
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
    },
  };

  const style = variants[variant];
  const isGradient = variant !== 'default';

  return (
    <div
      className={cn(
        'relative p-6 rounded-2xl overflow-hidden transition-all duration-300',
        'hover:shadow-card-hover hover:-translate-y-1',
        style.bg,
        isGradient ? 'text-white' : 'shadow-card',
        className
      )}
    >
      {/* Background decoration for gradient cards */}
      {isGradient && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      )}

      <div className="relative flex items-start justify-between">
        <div className="space-y-3">
          <p className={cn(
            'text-sm font-medium uppercase tracking-wide',
            isGradient ? 'text-white/80' : 'text-muted-foreground'
          )}>
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">{value}</span>
            {trend && (
              <span className={cn(
                'flex items-center text-sm font-medium',
                isGradient
                  ? 'text-white/90'
                  : trend.isPositive
                    ? 'text-success'
                    : 'text-destructive'
              )}>
                {trend.isPositive ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : (
                  <ArrowDownRight className="w-4 h-4" />
                )}
                {trend.value}%
              </span>
            )}
          </div>
          {subtitle && (
            <p className={cn(
              'text-sm',
              isGradient ? 'text-white/70' : 'text-muted-foreground'
            )}>
              {subtitle}
            </p>
          )}
        </div>

        <div className={cn(
          'flex items-center justify-center w-12 h-12 rounded-xl',
          style.iconBg
        )}>
          <Icon className={cn('w-6 h-6', style.iconColor)} />
        </div>
      </div>
    </div>
  );
}

export function StatsGrid() {
  const stats = [
    {
      title: 'Total de Artigos',
      value: 127,
      subtitle: 'Gerados este mês',
      icon: FileText,
      trend: { value: 12, isPositive: true },
      variant: 'primary' as const,
    },
    {
      title: 'Publicados',
      value: 89,
      subtitle: 'No WordPress',
      icon: Globe,
      trend: { value: 8, isPositive: true },
      variant: 'success' as const,
    },
    {
      title: 'Links Internos',
      value: 342,
      subtitle: 'Conexões criadas',
      icon: Link2,
      trend: { value: 23, isPositive: true },
      variant: 'info' as const,
    },
    {
      title: 'Taxa de Sucesso',
      value: '98%',
      subtitle: 'Artigos sem erros',
      icon: TrendingUp,
      trend: { value: 2, isPositive: true },
      variant: 'accent' as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat) => (
        <StatCard key={stat.title} {...stat} />
      ))}
    </div>
  );
}