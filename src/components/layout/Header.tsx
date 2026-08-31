import { memo } from 'react';
import { Bell, Search, Plus, LogOut, Activity, BrainCircuit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

export const Header = memo(function Header() {
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const initials = displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <header className="neural-topbar sticky top-0 z-40 h-16 shrink-0">
      <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-5 lg:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2 md:hidden">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#D4FF00]/35 bg-[#D4FF00]/8 shadow-[0_0_24px_rgba(212,255,0,.1)]">
            <BrainCircuit className="h-5 w-5 text-[#D4FF00]" />
          </span>
          <span className="text-sm font-black tracking-tight text-white">Zica<span className="text-[#D4FF00]">.</span><span className="text-[#00F0FF]">ai</span></span>
        </Link>

        <div className="hidden flex-1 items-center gap-4 sm:flex sm:max-w-lg">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input placeholder="Buscar ondas, ecossistemas e sinais..." className="h-10 border-[#30363D]/80 bg-[#0D1117]/65 pl-10 text-sm placeholder:text-slate-600 focus-visible:ring-[#D4FF00]/20" />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-1.5 rounded-full border border-[#00F0FF]/15 bg-[#00F0FF]/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.13em] text-[#00F0FF] lg:flex">
            <Activity className="h-3.5 w-3.5" /> Núcleo 24/7
          </div>
          <Button asChild size="sm" className="h-9 bg-[#D4FF00] px-3 font-black text-[#0D1117] shadow-[0_0_28px_rgba(212,255,0,.16)] hover:bg-[#e0ff45] sm:px-4">
            <Link to="/articles/new"><Plus className="mr-1 h-4 w-4" />Gerar Onda</Link>
          </Button>
          <Button variant="ghost" size="icon" className="hidden text-slate-500 hover:bg-[#00F0FF]/7 hover:text-[#00F0FF] sm:inline-flex">
            <Bell className="h-5 w-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 rounded-full border border-transparent py-1 pl-1 pr-1 transition hover:border-[#30363D] hover:bg-white/[.025] sm:pl-3">
                <div className="hidden text-right lg:block">
                  <p className="text-sm font-medium leading-none text-slate-200">{displayName.split(' ')[0]}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[.11em] text-slate-600">Operador</p>
                </div>
                <Avatar className="h-8 w-8 border border-[#D4FF00]/25 shadow-[0_0_18px_rgba(212,255,0,.08)]">
                  <AvatarImage src={profile?.avatar_url || ''} />
                  <AvatarFallback className="bg-[#D4FF00] text-xs font-black text-[#0D1117]">{initials}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 border-[#30363D] bg-[#161B22]/95 backdrop-blur-xl">
              <DropdownMenuLabel><p className="text-sm font-medium text-slate-100">{displayName}</p><p className="text-xs font-normal text-slate-500">{user?.email}</p></DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#30363D]" />
              <DropdownMenuItem asChild><Link to="/settings">Configurações</Link></DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#30363D]" />
              <DropdownMenuItem className="text-destructive" onClick={() => signOut()}><LogOut className="mr-2 h-4 w-4" />Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
});
