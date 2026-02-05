import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  History, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';

interface GenerationLog {
  id: string;
  generation_type: string;
  status: string;
  current_step: string | null;
  total_steps: number | null;
  completed_steps: number | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  metadata: {
    centralTheme?: string;
    satelliteCount?: number;
    projectId?: string;
  } | null;
}

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-100', label: 'Pendente' },
  running: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-100', label: 'Em execução' },
  completed: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-100', label: 'Concluído' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100', label: 'Erro' },
};

export function GenerationHistory() {
  const [logs, setLogs] = useState<GenerationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('generation_logs')
        .select('*')
        .eq('generation_type', 'authority_plan')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setLogs((data as unknown as GenerationLog[]) || []);
    } catch (err) {
      console.error('Error fetching generation logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="w-5 h-5" />
            Histórico de Gerações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma geração registrada ainda. Crie seu primeiro plano de autoridade!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="w-5 h-5" />
          Histórico de Gerações ({logs.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-3">
            {logs.map((log) => {
              const status = statusConfig[log.status as keyof typeof statusConfig] || statusConfig.pending;
              const StatusIcon = status.icon;
              const isExpanded = expandedId === log.id;
              const metadata = log.metadata;

              return (
                <Collapsible
                  key={log.id}
                  open={isExpanded}
                  onOpenChange={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  <div className="border rounded-lg p-3 hover:bg-accent/50 transition-colors">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full p-0 h-auto hover:bg-transparent">
                        <div className="flex items-start gap-3 w-full text-left">
                          <div className={`p-2 rounded-full ${status.bg}`}>
                            <StatusIcon className={`w-4 h-4 ${status.color} ${log.status === 'running' ? 'animate-spin' : ''}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-sm truncate">
                                {metadata?.centralTheme || 'Plano de Autoridade'}
                              </h4>
                              <Badge variant="outline" className="text-xs">
                                {metadata?.satelliteCount || 0} satélites
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>{format(new Date(log.started_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                              <span>•</span>
                              <Badge variant="secondary" className={`text-xs ${status.color}`}>
                                {status.label}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {log.completed_steps !== null && log.total_steps !== null && (
                              <span className="text-xs text-muted-foreground">
                                {log.completed_steps}/{log.total_steps}
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </Button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="mt-3 pt-3 border-t space-y-2">
                        {log.current_step && (
                          <div className="flex items-center gap-2 text-sm">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Última etapa:</span>
                            <span>{log.current_step}</span>
                          </div>
                        )}
                        {log.error_message && (
                          <div className="p-2 rounded bg-destructive/10 text-destructive text-sm">
                            <strong>Erro:</strong> {log.error_message}
                          </div>
                        )}
                        {log.completed_at && (
                          <div className="text-xs text-muted-foreground">
                            Concluído em: {format(new Date(log.completed_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
