import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useProjects } from '@/hooks/useProjects';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ShieldCheck,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Bloco H (frontend half) — thin UI on top of `ai-geo-audit-proxy`, which is
// itself a thin authenticated proxy in front of the plugin's own
// `GET /ai-audit` (Bloco E's `run_audit()`). No scoring/checks logic lives
// here — this component only renders whatever the plugin already computed.

interface AuditCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  detail?: string | null;
}

interface AuditReport {
  score: number;
  checks: AuditCheck[];
  generated_at: string | null;
}

const CHECK_STATUS_CONFIG: Record<AuditCheck['status'], { icon: React.ElementType; className: string }> = {
  pass: { icon: CheckCircle2, className: 'text-green-500' },
  warn: { icon: AlertTriangle, className: 'text-amber-500' },
  fail: { icon: XCircle, className: 'text-destructive' },
  info: { icon: Info, className: 'text-muted-foreground' },
};

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-destructive';
}

function scoreBadgeClass(score: number) {
  if (score >= 80) return 'bg-green-500/10 text-green-600 border-green-500/20';
  if (score >= 50) return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
  return 'bg-destructive/10 text-destructive border-destructive/20';
}

export function AiGeoAuditPanel() {
  const { toast } = useToast();
  const { projects, isLoading: projectsLoading } = useProjects();
  const [projectId, setProjectId] = useState<string>('');
  const [report, setReport] = useState<AuditReport | null>(null);

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  const runAudit = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('Selecione um projeto para auditar.');
      const { data, error } = await supabase.functions.invoke('ai-geo-audit-proxy', {
        body: { projectId },
      });
      if (error || data?.success === false) {
        const message = String(data?.error || error?.message || 'Falha ao executar o Auditor GEO/AEO');
        throw new Error(message);
      }
      return data as AuditReport;
    },
    onSuccess: (data) => {
      setReport(data);
      toast({
        title: 'Auditor GEO/AEO concluído',
        description: `Score ${data.score}/100 — ${data.checks?.length || 0} verificações.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro no Auditor GEO/AEO',
        description: error instanceof Error ? error.message : 'Não foi possível concluir a auditoria.',
        variant: 'destructive',
      });
    },
  });

  const selectedProject = projects.find(p => p.id === projectId);

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3 gap-2 flex-wrap">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Auditor GEO/AEO
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={projectId} onValueChange={setProjectId} disabled={projectsLoading || runAudit.isPending}>
            <SelectTrigger className="w-[180px] h-9 bg-background text-sm">
              <SelectValue placeholder="Selecione o projeto" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(project => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => runAudit.mutate()}
            disabled={runAudit.isPending || !projectId}
            className="bg-gradient-accent hover:opacity-90"
          >
            {runAudit.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Rodar Auditor GEO/AEO
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!projects.length && !projectsLoading && (
          <p className="text-sm text-muted-foreground">Nenhum projeto encontrado. Crie um projeto para auditar.</p>
        )}

        {report ? (
          <>
            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-center shrink-0">
                <p className={cn('text-3xl font-bold', scoreColor(report.score))}>{report.score}</p>
                <p className="text-[10px] text-muted-foreground">/ 100</p>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <Badge variant="outline" className={cn('text-xs', scoreBadgeClass(report.score))}>
                  {selectedProject?.name || 'Projeto'}
                </Badge>
                {report.generated_at && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    Gerado {formatDistanceToNow(new Date(report.generated_at), { addSuffix: true, locale: ptBR })}
                  </p>
                )}
              </div>
            </div>

            <ScrollArea className="max-h-[320px]">
              <div className="space-y-2">
                {report.checks?.map((check) => {
                  const config = CHECK_STATUS_CONFIG[check.status] || CHECK_STATUS_CONFIG.info;
                  const Icon = config.icon;
                  return (
                    <div key={check.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                      <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', config.className)} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{check.label}</p>
                        {check.detail && (
                          <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Selecione um projeto e rode o Auditor para ver o relatório GEO/AEO.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AiGeoAuditPanel;
