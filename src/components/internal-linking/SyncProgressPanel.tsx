import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SyncLogEntry {
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  articleTitle?: string;
}

export interface SyncProgress {
  phase: 'idle' | 'fetching' | 'analyzing' | 'indexing' | 'complete' | 'error';
  total: number;
  fetched: number;
  analyzed: number;
  indexed: number;
  skipped: number;
  errors: number;
  currentArticle?: string;
  logs: SyncLogEntry[];
}

interface SyncProgressPanelProps {
  progress: SyncProgress;
  onStartSync: (fullSync: boolean) => void;
  isSyncing: boolean;
}

export function SyncProgressPanel({
  progress,
  onStartSync,
  isSyncing,
}: SyncProgressPanelProps) {
  const getPhaseLabel = (phase: SyncProgress['phase']) => {
    switch (phase) {
      case 'idle': return 'Aguardando';
      case 'fetching': return 'Buscando artigos...';
      case 'analyzing': return 'Analisando com IA...';
      case 'indexing': return 'Indexando...';
      case 'complete': return 'Concluído';
      case 'error': return 'Erro';
      default: return 'Desconhecido';
    }
  };

  const getProgressPercent = () => {
    if (progress.total === 0) return 0;
    const completed = progress.analyzed + progress.skipped;
    return Math.round((completed / progress.total) * 100);
  };

  const getLogIcon = (type: SyncLogEntry['type']) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-3 h-3 text-green-500" />;
      case 'error': return <XCircle className="w-3 h-3 text-destructive" />;
      case 'warning': return <AlertCircle className="w-3 h-3 text-yellow-500" />;
      default: return <FileText className="w-3 h-3 text-blue-500" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <RefreshCw className={cn("w-5 h-5", isSyncing && "animate-spin")} />
              Sincronização
            </CardTitle>
            <CardDescription>
              Sincronize artigos do WordPress para indexação e análise por IA
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStartSync(false)}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onStartSync(true)}
              disabled={isSyncing}
              title="Força reanálise de todos os artigos mesmo se já indexados"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reindexar Tudo
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        {isSyncing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{getPhaseLabel(progress.phase)}</span>
              <span className="font-medium">{getProgressPercent()}%</span>
            </div>
            <Progress value={getProgressPercent()} className="h-2" />
            {progress.currentArticle && (
              <p className="text-xs text-muted-foreground truncate">
                Processando: {progress.currentArticle}
              </p>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-center">
            <p className="text-2xl font-bold text-blue-600">{progress.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-center">
            <p className="text-2xl font-bold text-purple-600">{progress.fetched}</p>
            <p className="text-xs text-muted-foreground">Buscados</p>
          </div>
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-center">
            <p className="text-2xl font-bold text-green-600">{progress.analyzed}</p>
            <p className="text-xs text-muted-foreground">Analisados</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-center">
            <p className="text-2xl font-bold text-amber-600">{progress.skipped}</p>
            <p className="text-xs text-muted-foreground">Ignorados</p>
          </div>
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-center">
            <p className="text-2xl font-bold text-red-600">{progress.errors}</p>
            <p className="text-xs text-muted-foreground">Erros</p>
          </div>
        </div>

        {/* Logs */}
        {progress.logs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Log de Atividades</p>
              <Badge variant="outline" className="text-xs">
                {progress.logs.length} eventos
              </Badge>
            </div>
            <ScrollArea className="h-40 border rounded-lg">
              <div className="p-2 space-y-1">
                {progress.logs.slice().reverse().map((log, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-start gap-2 text-xs p-1.5 rounded",
                      log.type === 'error' && "bg-red-50 dark:bg-red-900/10",
                      log.type === 'warning' && "bg-amber-50 dark:bg-amber-900/10",
                      log.type === 'success' && "bg-green-50 dark:bg-green-900/10"
                    )}
                  >
                    {getLogIcon(log.type)}
                    <span className="text-muted-foreground flex-shrink-0">
                      {log.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="flex-1 truncate">{log.message}</span>
                    {log.articleTitle && (
                      <Badge variant="outline" className="text-[10px] px-1">
                        {log.articleTitle.slice(0, 20)}...
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
