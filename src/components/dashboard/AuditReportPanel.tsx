import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Shield,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
  Wrench,
  Globe,
  FileCode,
  Gauge,
  FileText,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface AuditIssue {
  id: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  category: string;
  title: string;
  description: string;
  impact: string;
  fix_instruction: string;
  auto_fixed: boolean;
}

interface AuditData {
  score: number;
  issues: AuditIssue[];
  issues_found: number;
  issues_fixed: number;
  categories: Record<string, { score: number; issues: number; fixed: number }>;
}

const priorityConfig = {
  P0: { label: 'Crítico', color: 'text-red-600 bg-red-100 border-red-200', icon: AlertCircle, dot: 'bg-red-500' },
  P1: { label: 'Alto', color: 'text-orange-600 bg-orange-100 border-orange-200', icon: AlertTriangle, dot: 'bg-orange-500' },
  P2: { label: 'Médio', color: 'text-amber-600 bg-amber-100 border-amber-200', icon: Info, dot: 'bg-amber-500' },
  P3: { label: 'Baixo', color: 'text-blue-600 bg-blue-100 border-blue-200', icon: Info, dot: 'bg-blue-500' },
};

const categoryConfig: Record<string, { label: string; icon: React.ElementType }> = {
  indexing: { label: 'Indexação', icon: Globe },
  schema: { label: 'Schema', icon: FileCode },
  performance: { label: 'Performance', icon: Gauge },
  content: { label: 'Conteúdo', icon: FileText },
  geo: { label: 'GEO / IA', icon: Eye },
};

function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function getScoreLabel(score: number) {
  if (score >= 80) return 'Bom';
  if (score >= 60) return 'Regular';
  return 'Crítico';
}

function getProgressColor(score: number) {
  if (score >= 80) return '[&>div]:bg-green-500';
  if (score >= 60) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-red-500';
}

export function AuditReportPanel() {
  const { user } = useAuth();
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);

  const { data: latestAudit, isLoading } = useQuery({
    queryKey: ['audit-report', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('seo_agent_runs')
        .select('id, started_at, completed_at, summary, details, status')
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .limit(5);
      if (error) throw error;

      // Find the latest run with audit data
      for (const run of (data || [])) {
        const details = run.details as any;
        if (details?.audit?.score !== undefined) {
          return { run, audit: details.audit as AuditData };
        }
      }
      return null;
    },
    enabled: !!user?.id,
    refetchInterval: 60000,
  });

  const audit = latestAudit?.audit;
  const run = latestAudit?.run;

  const issuesByPriority = useMemo(() => {
    if (!audit?.issues) return {};
    return audit.issues.reduce((acc, issue) => {
      if (!acc[issue.priority]) acc[issue.priority] = [];
      acc[issue.priority].push(issue);
      return acc;
    }, {} as Record<string, AuditIssue[]>);
  }, [audit]);

  if (isLoading) {
    return (
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Relatório de Auditoria SEO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-20 bg-muted rounded-lg" />
            <div className="h-12 bg-muted rounded-lg" />
            <div className="h-12 bg-muted rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!audit) {
    return (
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Relatório de Auditoria SEO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Shield className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma auditoria disponível.</p>
            <p className="text-xs mt-1">Execute o Agente SEO para gerar o relatório.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Relatório de Auditoria SEO
          </CardTitle>
          {run && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(run.started_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Score Overview */}
        <div className="flex items-center gap-6 p-4 bg-muted/30 rounded-xl">
          <div className="text-center">
            <p className={cn('text-4xl font-bold', getScoreColor(audit.score))}>{audit.score}</p>
            <p className="text-xs text-muted-foreground mt-1">Score Geral</p>
            <Badge variant="outline" className={cn('mt-1 text-xs', getScoreColor(audit.score))}>
              {getScoreLabel(audit.score)}
            </Badge>
          </div>
          <div className="flex-1 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Problemas encontrados</span>
              <span className="font-semibold text-foreground">{audit.issues_found}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Corrigidos automaticamente</span>
              <span className="font-semibold text-green-600">{audit.issues_fixed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pendentes</span>
              <span className="font-semibold text-amber-600">{audit.issues_found - audit.issues_fixed}</span>
            </div>
          </div>
        </div>

        {/* Category Scores */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(audit.categories || {}).map(([key, cat]) => {
            const cfg = categoryConfig[key] || { label: key, icon: Info };
            const Icon = cfg.icon;
            return (
              <div key={key} className="p-3 rounded-lg bg-muted/30 text-center space-y-1.5">
                <Icon className={cn('w-4 h-4 mx-auto', getScoreColor(cat.score))} />
                <p className={cn('text-xl font-bold', getScoreColor(cat.score))}>{Math.max(0, cat.score)}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{cfg.label}</p>
                {cat.issues > 0 && (
                  <div className="flex items-center justify-center gap-1">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {cat.issues} issue{cat.issues > 1 ? 's' : ''}
                    </Badge>
                    {cat.fixed > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600 border-green-200">
                        {cat.fixed} fix
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Issues by Priority */}
        {audit.issues.length > 0 && (
          <ScrollArea className="max-h-[350px]">
            <div className="space-y-2">
              {(['P0', 'P1', 'P2', 'P3'] as const).map(priority => {
                const priorityIssues = issuesByPriority[priority];
                if (!priorityIssues || priorityIssues.length === 0) return null;
                const cfg = priorityConfig[priority];

                return (
                  <div key={priority} className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <div className={cn('w-2 h-2 rounded-full', cfg.dot)} />
                      {cfg.label} ({priorityIssues.length})
                    </div>
                    {priorityIssues.map(issue => {
                      const PIcon = cfg.icon;
                      const isExpanded = expandedIssue === issue.id;
                      return (
                        <Collapsible key={issue.id} open={isExpanded} onOpenChange={() => setExpandedIssue(isExpanded ? null : issue.id)}>
                          <CollapsibleTrigger asChild>
                            <button className={cn(
                              'w-full flex items-center gap-3 p-3 rounded-lg border text-left text-sm transition-colors hover:bg-muted/50',
                              issue.auto_fixed ? 'border-green-200 bg-green-50/50' : 'border-border'
                            )}>
                              <PIcon className={cn('w-4 h-4 flex-shrink-0', cfg.color.split(' ')[0])} />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-foreground">{issue.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{issue.id} • {categoryConfig[issue.category]?.label || issue.category}</p>
                              </div>
                              {issue.auto_fixed && (
                                <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 flex-shrink-0">
                                  <Wrench className="w-3 h-3 mr-1" /> Corrigido
                                </Badge>
                              )}
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="ml-7 mt-1 p-3 bg-muted/30 rounded-lg text-sm space-y-2 border-l-2 border-muted">
                              <div>
                                <p className="font-medium text-xs text-muted-foreground uppercase">Descrição</p>
                                <p className="text-foreground">{issue.description}</p>
                              </div>
                              <div>
                                <p className="font-medium text-xs text-muted-foreground uppercase">Impacto</p>
                                <p className="text-foreground">{issue.impact}</p>
                              </div>
                              <div>
                                <p className="font-medium text-xs text-muted-foreground uppercase">Como corrigir</p>
                                <p className="text-foreground">{issue.fix_instruction}</p>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {audit.issues.length === 0 && (
          <div className="text-center py-4">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum problema detectado. Site em ótima saúde!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
