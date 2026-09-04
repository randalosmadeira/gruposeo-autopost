import { Building2, Code2, ExternalLink, Mail } from 'lucide-react';
import { PRODUCT_IDENTITY } from '@/lib/productIdentity';
import { cn } from '@/lib/utils';

type InstitutionalInfoProps = {
  variant?: 'login' | 'settings';
};

const items = [
  {
    title: 'Site institucional',
    icon: Building2,
    ...PRODUCT_IDENTITY.institutionalSite,
  },
  {
    title: 'E-mail',
    icon: Mail,
    ...PRODUCT_IDENTITY.contactEmail,
  },
  {
    title: 'Desenvolvedores',
    icon: Code2,
    ...PRODUCT_IDENTITY.developers,
  },
];

export function InstitutionalInfo({ variant = 'settings' }: InstitutionalInfoProps) {
  const isLogin = variant === 'login';

  return (
    <section
      aria-labelledby={`institutional-info-${variant}`}
      className={cn(
        'rounded-lg border',
        isLogin
          ? 'mt-5 border-[#25333e] bg-[#0b141d]/65 p-4'
          : 'bg-card p-6 text-card-foreground shadow-sm',
      )}
    >
      <h2
        id={`institutional-info-${variant}`}
        className={cn(
          'font-semibold',
          isLogin ? 'text-xs uppercase tracking-[.12em] text-slate-300' : 'text-lg text-foreground',
        )}
      >
        Informações institucionais
      </h2>
      <div className={cn('grid gap-3', isLogin ? 'mt-3' : 'mt-5 sm:grid-cols-3')}>
        {items.map(({ title, label, href, icon: Icon }) => (
          <a
            key={href}
            href={href}
            target={href.startsWith('mailto:') ? undefined : '_blank'}
            rel={href.startsWith('mailto:') ? undefined : 'noreferrer'}
            className={cn(
              'group flex min-w-0 items-start gap-3 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              isLogin
                ? 'border-[#25333e] bg-[#071018]/70 p-3 hover:border-[#00F0FF]/60'
                : 'border-border bg-muted/30 p-4 hover:border-primary/50 hover:bg-muted/50',
            )}
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', isLogin ? 'text-[#00F0FF]' : 'text-primary')} />
            <span className="min-w-0">
              <span className={cn('block text-xs font-semibold', isLogin ? 'text-slate-400' : 'text-muted-foreground')}>{title}</span>
              <span className={cn('mt-1 flex items-center gap-1 break-all text-xs font-medium', isLogin ? 'text-slate-200' : 'text-foreground')}>
                {label}
                {!href.startsWith('mailto:') && <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
