import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Link2,
  Search,
  FileCheck,
  Clock,
  TrendingUp,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AgentRun {
  id: string;
  project_id: string;
  run_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  meta_issues_found: number;
  meta_issues_fixed: number;
  links_suggested: number;
  links_applied: number;
  indexing_submitted: number;
  sitemap_updated: boolean;
  summary: string | null;
  error_message: string | null;
}

export function SEOAgentPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);

  const { data: runs, isLoading } = useQuery({
    queryKey: ['seo-agent-runs', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('seo_agent_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as AgentRun[];
    },
    enabled: !!user?.id,
    refetchInterval: isRunning ? 5000 : 30000,
  });

  const runAgent = useMutation({
    mutationFn: async () => {
      setIsRunning(true);
      const { data, error } = await supabase.functions.invoke('seo-agent', {
        body: { user_id: user?.id, run_type: 'manual' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setIsRunning(false);
      queryClient.invalidateQueries({ queryKey: ['seo-agent-runs'] });
      toast({
        title: '🤖 Agente SEO Executado',
        description: `${data.runs} projeto(s) auditado(s) com sucesso.`,
      });
    },
    onError: (error) => {
      setIsRunning(false);
      toast({
        title: 'Erro no Agente SEO',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Stats
  const lastRun = runs?.[0];
  const completedRuns = runs?.filter(r => r.status === 'completed') || [];
  const totalFixed = completedRuns.reduce((sum, r) => sum + (r.meta_issues_fixed || 0), 0);
  const totalLinks = completedRuns.reduce((sum, r) => sum + (r.links_suggested || 0), 0);
  const totalIndexed = completedRuns.reduce((sum, r) => sum + (r.indexing_submitted || 0), 0);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'running': return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-destructive" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          Agente SEO Autônomo
          <Badge variant="secondary" className="text-xs">
            A cada 6h
          </Badge>
        </CardTitle>
        <Button
          size="sm"
          onClick={() => runAgent.mutate()}
          disabled={runAgent.isPending || isRunning}
          className="bg-gradient-accent hover:opacity-90"
        >
          {runAgent.isPending || isRunning ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Executar Agora
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <FileCheck className="w-5 h-5 text-green-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{totalFixed}</p>
            <p className="text-xs text-muted-foreground">Metas Corrigidos</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <Link2 className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{totalLinks}</p>
            <p className="text-xs text-muted-foreground">Links Sugeridos</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <Search className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{totalIndexed}</p>
            <p className="text-xs text-muted-foreground">URLs Indexadas</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <TrendingUp className="w-5 h-5 text-purple-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{completedRuns.length}</p>
            <p className="text-xs text-muted-foreground">Execuções</p>
          </div>
        </div>

        {/* Last run info */}
        {lastRun && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 p-2 rounded-lg">
            <Clock className="w-4 h-4" />
            <span>
              Última execução: {formatDistanceToNow(new Date(lastRun.started_at), { addSuffix: true, locale: ptBR })}
            </span>
            {statusIcon(lastRun.status)}
          </div>
        )}

        {/* Recent Runs */}
        {runs && runs.length > 0 && (
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-2">
              {runs.slice(0, 8).map(run => (
                <div key={run.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors text-sm">
                  {statusIcon(run.status)}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-foreground">
                      {run.summary || (run.status === 'running' ? 'Executando...' : run.error_message || 'Sem dados')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(run.started_at), "dd/MM HH:mm", { locale: ptBR })}
                      {run.run_type === 'manual' && ' • Manual'}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {run.meta_issues_fixed > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {run.meta_issues_fixed} fix
                      </Badge>
                    )}
                    {run.links_suggested > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {run.links_suggested} links
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && (!runs || runs.length === 0) && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Nenhuma execução ainda. Clique em "Executar Agora" ou aguarde o cron automático.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
