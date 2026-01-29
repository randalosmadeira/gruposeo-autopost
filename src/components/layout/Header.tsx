import { Bell, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';

export function Header() {
  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="flex items-center justify-between h-full px-6">
        {/* Search */}
        <div className="flex items-center gap-4 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar artigos, projetos..."
              className="pl-10 bg-muted/50 border-0 focus-visible:ring-1"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* New Article Button */}
          <Button asChild size="sm" className="bg-gradient-accent hover:opacity-90 shadow-glow-accent/30">
            <Link to="/articles/new">
              <Plus className="w-4 h-4 mr-1" />
              Novo Artigo
            </Link>
          </Button>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 pl-3 pr-1 py-1 rounded-full bg-muted/50 hover:bg-muted transition-colors">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium leading-none">Rândalos</p>
                  <p className="text-xs text-muted-foreground">Admin</p>
                </div>
                <Avatar className="w-8 h-8 border-2 border-primary/20">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs font-bold">
                    RD
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">Rândalos Dias Madeira</p>
                  <p className="text-xs text-muted-foreground">gestor@gruposeomkt.com.br</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <span>Meu Perfil</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <span>Configurações</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <span>Sair</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}