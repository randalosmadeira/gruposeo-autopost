import { Bell, Search, Plus, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

export function Header() {
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const initials = displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="flex items-center justify-between h-full px-6">
        <div className="flex items-center gap-4 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar artigos, projetos..." className="pl-10 bg-muted/50 border-0 focus-visible:ring-1" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild size="sm" className="bg-gradient-accent hover:opacity-90 shadow-glow-accent/30">
            <Link to="/articles/new"><Plus className="w-4 h-4 mr-1" />Novo Artigo</Link>
          </Button>
          <Button variant="ghost" size="icon"><Bell className="w-5 h-5 text-muted-foreground" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 pl-3 pr-1 py-1 rounded-full bg-muted/50 hover:bg-muted transition-colors">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium leading-none">{displayName.split(' ')[0]}</p>
                  <p className="text-xs text-muted-foreground">Admin</p>
                </div>
                <Avatar className="w-8 h-8 border-2 border-primary/20">
                  <AvatarImage src={profile?.avatar_url || ''} />
                  <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/settings">Configurações</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => signOut()}><LogOut className="w-4 h-4 mr-2" />Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
