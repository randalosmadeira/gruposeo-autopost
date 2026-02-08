import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Newspaper, 
  Plus, 
  RefreshCw, 
  Settings2,
  Activity,
  Play,
  Pause,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useNewsAgents, NewsAgent } from '@/hooks/useNewsAgents';
import { AgentConfigPanel } from '@/components/news-agents/AgentConfigPanel';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function NewsAgents() {
  const navigate = useNavigate();
  const { 
    agents, 
    isLoading, 
    activeAgentsCount, 
    totalArticles,
    toggleAgent,
    deleteAgent 
  } = useNewsAgents();
  
  
  const [selectedAgent, setSelectedAgent] = useState<NewsAgent | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<string | null>(null);

  const maxAgents = 3;
  const maxNewsPerDay = 10;
  const newsToday = 0; // TODO: Calculate from actual data

  const handleDeleteConfirm = () => {
    if (agentToDelete) {
      deleteAgent.mutate(agentToDelete);
      setAgentToDelete(null);
      setDeleteDialogOpen(false);
      if (selectedAgent?.id === agentToDelete) {
        setSelectedAgent(null);
      }
    }
  };

  return (
    <div className="flex h-full bg-muted/30">
      {/* Main Content */}
      <div className={cn(
        "flex-1 p-4 md:p-5 space-y-4 overflow-auto transition-all",
        selectedAgent && "lg:pr-80"
      )}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-primary/10 rounded-lg shrink-0">
              <Newspaper className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-foreground truncate">Agente de Notícias</h1>
              <p className="text-xs text-muted-foreground truncate">
                Monitoramento e publicação automática
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-border">
            <CardContent className="p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Agentes
              </p>
              <p className="text-xl font-bold mt-0.5">
                {agents?.length || 0} / {maxAgents}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Notícias Hoje
              </p>
              <p className="text-xl font-bold mt-0.5">
                {newsToday} / {maxNewsPerDay}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Artigos (30 dias)
              </p>
              <p className="text-xl font-bold mt-0.5">
                {totalArticles} / ∞
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Activity className="w-4 h-4 text-accent" />
                <span className="text-accent font-semibold text-sm">Disponível</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agents List or Empty State */}
        {isLoading ? (
          <Card className="border-dashed border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
              <p className="mt-3 text-sm text-muted-foreground">Carregando agentes...</p>
            </CardContent>
          </Card>
        ) : !agents || agents.length === 0 ? (
          <Card className="border-dashed border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="p-3 bg-muted rounded-full">
                <Newspaper className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="mt-3 text-base font-semibold">Nenhum agente configurado</h3>
              <p className="mt-1 text-sm text-muted-foreground text-center max-w-xs">
                Crie seu primeiro agente para monitorar tópicos e publicar automaticamente.
              </p>
              <Button 
                className="mt-4 gap-2" 
                size="sm"
                onClick={() => navigate('/news-agents/new')}
                disabled={agents && agents.length >= maxAgents}
              >
                <Plus className="w-4 h-4" />
                Criar Novo Agente
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-semibold">Seus Agentes</h2>
              <Button 
                size="sm" 
                className="gap-1.5 h-8"
                onClick={() => navigate('/news-agents/new')}
                disabled={agents.length >= maxAgents}
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Agente
              </Button>
            </div>
            
            <div className="grid gap-3">
              {agents.map((agent) => (
                <Card 
                  key={agent.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md border-border",
                    selectedAgent?.id === agent.id && "ring-2 ring-primary"
                  )}
                  onClick={() => setSelectedAgent(agent)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn(
                          "p-1.5 rounded-lg shrink-0",
                          agent.is_active ? "bg-primary/10" : "bg-muted"
                        )}>
                          <Newspaper className={cn(
                            "w-4 h-4",
                            agent.is_active ? "text-primary" : "text-muted-foreground"
                          )} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                            <Badge variant={agent.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                              {agent.is_active ? "Ativo" : "Pausado"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {agent.topics.length} tópicos • {agent.articles_generated} artigos
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        {agent.last_run_at && (
                          <span className="text-[10px] text-muted-foreground hidden md:inline">
                            {format(new Date(agent.last_run_at), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAgent.mutate({ id: agent.id, is_active: !agent.is_active });
                          }}
                        >
                          {agent.is_active ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              className="text-destructive text-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAgentToDelete(agent.id);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Config Panel */}
      {selectedAgent && (
        <AgentConfigPanel 
          agent={selectedAgent} 
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O agente será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
