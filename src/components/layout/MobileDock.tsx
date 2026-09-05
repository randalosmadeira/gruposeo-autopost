import { NavLink } from 'react-router-dom';
import { CalendarDays, FileText, Globe2, Home, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { to: '/dashboard', label: 'Painel', icon: Home, end: true },
  { to: '/articles', label: 'Conteúdo', icon: FileText },
  { to: '/calendar', label: 'Calendário', icon: CalendarDays, primary: true },
  { to: '/integrations', label: 'Blogs', icon: Globe2 },
  { to: '/account', label: 'Conta', icon: UserRound },
];

export function MobileDock() {
  return (
    <nav className="neural-mobile-dock fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 items-end rounded-2xl border border-[#30363D]/90 bg-[#0D1117]/92 px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_18px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl md:hidden">
      {items.map(({ to, label, icon: Icon, primary, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'relative flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[9px] font-semibold tracking-tight text-slate-500 transition-all',
              isActive && !primary && 'text-[#00F0FF]',
              primary && '-mt-7 text-[#0D1117]',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-xl border border-transparent transition-all',
                  isActive && !primary && 'border-[#00F0FF]/25 bg-[#00F0FF]/8 shadow-[0_0_20px_rgba(0,240,255,.12)]',
                  primary && 'h-12 w-12 border-[#D4FF00]/70 bg-[#D4FF00] shadow-[0_0_28px_rgba(212,255,0,.32)]',
                )}
              >
                <Icon className={cn('h-4 w-4', primary && 'h-5 w-5')} />
              </span>
              <span className={cn('truncate', primary && 'mt-0.5 text-[#D4FF00]')}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
