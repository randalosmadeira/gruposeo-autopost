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
    <div className="flex h-full">
      {/* Main Content */}
      <div className={cn(
        "flex-1 p-6 space-y-6 overflow-auto transition-all",
        selectedAgent && "pr-80"
      )}>
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Newspaper className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Agente de notícias</h1>
              <p className="text-sm text-muted-foreground">
                Agentes de monitoramento e publicação automática de notícias
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Settings2 className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <RefreshCw className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Agentes
              </p>
              <p className="text-2xl font-bold mt-1">
                {agents?.length || 0} / {maxAgents}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Notícias Hoje
              </p>
              <p className="text-2xl font-bold mt-1">
                {newsToday} / {maxNewsPerDay}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Artigos (30 dias)
              </p>
              <p className="text-2xl font-bold mt-1">
                {totalArticles} / ∞
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Activity className="w-4 h-4 text-green-500" />
                <span className="text-green-500 font-semibold">Disponível</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agents List or Empty State */}
        {isLoading ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin" />
              <p className="mt-4 text-muted-foreground">Carregando agentes...</p>
            </CardContent>
          </Card>
        ) : !agents || agents.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-muted rounded-full">
                <Newspaper className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Nenhum agente configurado</h3>
              <p className="mt-1 text-muted-foreground text-center max-w-sm">
                Crie seu primeiro agente de notícias para monitorar tópicos e publicar automaticamente.
              </p>
              <Button 
                className="mt-6 gap-2" 
                onClick={() => navigate('/news-agents/new')}
                disabled={agents && agents.length >= maxAgents}
              >
                <Plus className="w-4 h-4" />
                Criar Novo Agente
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Seus Agentes</h2>
              <Button 
                size="sm" 
                className="gap-2"
                onClick={() => navigate('/news-agents/new')}
                disabled={agents.length >= maxAgents}
              >
                <Plus className="w-4 h-4" />
                Novo Agente
              </Button>
            </div>
            
            <div className="grid gap-4">
              {agents.map((agent) => (
                <Card 
                  key={agent.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    selectedAgent?.id === agent.id && "ring-2 ring-primary"
                  )}
                  onClick={() => setSelectedAgent(agent)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          agent.is_active ? "bg-primary/10" : "bg-muted"
                        )}>
                          <Newspaper className={cn(
                            "w-5 h-5",
                            agent.is_active ? "text-primary" : "text-muted-foreground"
                          )} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{agent.name}</h3>
                            <Badge variant={agent.is_active ? "default" : "secondary"}>
                              {agent.is_active ? "Ativo" : "Pausado"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {agent.topics.length} tópicos • {agent.articles_generated} artigos gerados
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {agent.last_run_at && (
                          <span className="text-xs text-muted-foreground">
                            Última execução: {format(new Date(agent.last_run_at), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAgent.mutate({ id: agent.id, is_active: !agent.is_active });
                          }}
                        >
                          {agent.is_active ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAgentToDelete(agent.id);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
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
