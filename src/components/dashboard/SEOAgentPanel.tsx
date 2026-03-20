import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bot, Play, CheckCircle2, AlertCircle, Loader2, Link2,
  Search, FileCheck, Clock, TrendingUp, Globe, Shield,
  AlertTriangle, ArrowRight, Trash2, ExternalLink, BarChart3,
  MapPin, Zap, RefreshCw, Wrench, ClipboardList,
} from 'lucide-react';
import { AuditedArticlesPanel } from './AuditedArticlesPanel';
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
  details: any;
}

export function SEOAgentPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const { data: runs, isLoading } = useQuery({
    queryKey: ['seo-agent-runs', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('seo_agent_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as AgentRun[];
    },
    enabled: !!user?.id,
    refetchInterval: isRunning ? 5000 : 30000,
  });

  // Real-time subscription for live updates
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('seo-agent-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'seo_agent_runs',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['seo-agent-runs'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

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

  const lastRun = runs?.[0];
  const completedRuns = runs?.filter(r => r.status === 'completed') || [];
  const totalFixed = completedRuns.reduce((sum, r) => sum + (r.meta_issues_fixed || 0), 0);
  const totalLinks = completedRuns.reduce((sum, r) => sum + (r.links_applied || 0), 0);
  const totalIndexed = completedRuns.reduce((sum, r) => sum + (r.indexing_submitted || 0), 0);
  const totalRedirects = completedRuns.reduce((sum, r) => {
    const d = r.details as any;
    return sum + (d?.autonomous_fix?.redirects_created || 0) + (d?.broken_links_fix?.redirects_created || 0);
  }, 0);
  const totalBrokenFixed = completedRuns.reduce((sum, r) => {
    const d = r.details as any;
    return sum + (d?.broken_links_fix?.fixed || 0);
  }, 0);
  const totalBulkMeta = completedRuns.reduce((sum, r) => {
    const d = r.details as any;
    return sum + (d?.bulk_meta_fix?.fixed || 0);
  }, 0);

  // Extract audit data from latest completed run
  const latestAudit = useMemo(() => {
    const completed = completedRuns[0];
    if (!completed?.details) return null;
    const d = completed.details as any;
    return {
      score: d?.audit?.score || 0,
      categories: d?.audit?.categories || {},
      issues: d?.audit?.issues || [],
      issuesFixed: d?.audit?.issues_fixed || 0,
      autonomousFix: d?.autonomous_fix || {},
      aiDiscovery: d?.ai_discovery || {},
      indexing: d?.indexing || {},
      metaAudit: d?.meta_audit || {},
      internalLinks: d?.internal_links || {},
      brokenLinksFix: d?.broken_links_fix || {},
      bulkMetaFix: d?.bulk_meta_fix || {},
      brokenLinks: d?.broken_links || {},
      sitemapOpt: d?.sitemap_optimization || {},
    };
  }, [completedRuns]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'running': return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-destructive" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const priorityColor = (priority: string) => {
    switch (priority) {
      case 'P0': return 'bg-destructive text-destructive-foreground';
      case 'P1': return 'bg-orange-500 text-white';
      case 'P2': return 'bg-yellow-500 text-white';
      case 'P3': return 'bg-blue-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-destructive';
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          Agente SEO Autônomo
          <Badge variant="secondary" className="text-xs">v3.6.0</Badge>
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
           <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview" className="text-xs">Resumo</TabsTrigger>
            <TabsTrigger value="articles" className="text-xs">
              <ClipboardList className="w-3 h-3 mr-1" />
              Artigos
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-xs">Auditoria</TabsTrigger>
            <TabsTrigger value="fixes" className="text-xs">Correções</TabsTrigger>
            <TabsTrigger value="actions" className="text-xs">Ações</TabsTrigger>
            <TabsTrigger value="history" className="text-xs">Histórico</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { icon: FileCheck, value: totalFixed, label: 'Metas Fix', color: 'text-green-500' },
                { icon: Link2, value: totalLinks, label: 'Links Aplicados', color: 'text-blue-500' },
                { icon: Search, value: totalIndexed, label: 'URLs Indexadas', color: 'text-amber-500' },
                { icon: ArrowRight, value: totalRedirects, label: 'Redirects 301', color: 'text-purple-500' },
              ].map((stat, i) => (
                <div key={i} className="p-2.5 bg-muted/50 rounded-lg text-center">
                  <stat.icon className={cn("w-4 h-4 mx-auto mb-1", stat.color)} />
                  <p className="text-xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: AlertTriangle, value: totalBrokenFixed, label: '404s Corrigidos', color: 'text-red-500' },
                { icon: Zap, value: totalBulkMeta, label: 'Títulos/Metas IA', color: 'text-cyan-500' },
                { icon: TrendingUp, value: latestAudit?.score || 0, label: 'SEO Score', color: scoreColor(latestAudit?.score || 0) },
              ].map((stat, i) => (
                <div key={i} className="p-2.5 bg-muted/50 rounded-lg text-center">
                  <stat.icon className={cn("w-4 h-4 mx-auto mb-1", stat.color)} />
                  <p className="text-xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            {lastRun && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 p-2 rounded-lg">
                <Clock className="w-4 h-4" />
                <span>
                  Última: {formatDistanceToNow(new Date(lastRun.started_at), { addSuffix: true, locale: ptBR })}
                </span>
                {statusIcon(lastRun.status)}
                {lastRun.status === 'error' && (
                  <span className="text-destructive text-xs truncate">{lastRun.error_message}</span>
                )}
              </div>
            )}

            {/* Quick summary of latest run */}
            {latestAudit && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Categorias da Auditoria</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {Object.entries(latestAudit.categories).map(([key, cat]: [string, any]) => (
                    <div key={key} className="text-center p-2 bg-muted/30 rounded">
                      <p className={cn("text-sm font-bold", scoreColor(cat.score))}>{cat.score}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{key}</p>
                      {cat.fixed > 0 && (
                        <Badge variant="outline" className="text-[9px] mt-0.5">
                          {cat.fixed} fix
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* AUDIT TAB */}
          <TabsContent value="audit" className="space-y-3 mt-3">
            {latestAudit && latestAudit.issues.length > 0 ? (
              <ScrollArea className="max-h-[350px]">
                <div className="space-y-2">
                  {latestAudit.issues.map((issue: any, i: number) => (
                    <div key={i} className={cn(
                      "p-3 rounded-lg border transition-colors",
                      issue.auto_fixed ? "bg-green-500/5 border-green-500/20" : "bg-muted/30 border-border"
                    )}>
                      <div className="flex items-start gap-2">
                        <Badge className={cn("text-[10px] shrink-0 mt-0.5", priorityColor(issue.priority))}>
                          {issue.priority}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-foreground">{issue.title}</p>
                            {issue.auto_fixed && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{issue.description}</p>
                          {!issue.auto_fixed && issue.fix_instruction && (
                            <p className="text-xs text-primary/80 mt-1 italic">
                              💡 {issue.fix_instruction}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[9px] shrink-0 capitalize">
                          {issue.category}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhum dado de auditoria. Execute o agente para diagnosticar.</p>
              </div>
            )}
          </TabsContent>

          {/* FIXES TAB - New v3.6.0 */}
          <TabsContent value="fixes" className="space-y-3 mt-3">
            {latestAudit ? (
              <ScrollArea className="max-h-[350px]">
                <div className="space-y-3">
                  {/* Broken Links Fixed */}
                  {latestAudit.brokenLinks?.broken_found > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-destructive" /> Links Quebrados (404)
                      </p>
                      <div className="flex items-center gap-2 p-2 bg-destructive/5 rounded-lg">
                        <span className="text-lg font-bold text-destructive">{latestAudit.brokenLinks.broken_found}</span>
                        <span className="text-xs text-muted-foreground">detectados</span>
                        {latestAudit.brokenLinksFix?.fixed > 0 && (
                          <>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="text-lg font-bold text-green-500">{latestAudit.brokenLinksFix.fixed}</span>
                            <span className="text-xs text-green-600">corrigidos com 301</span>
                          </>
                        )}
                      </div>
                      {latestAudit.brokenLinksFix?.details?.map((d: string, i: number) => (
                        <p key={i} className="text-xs text-foreground bg-green-500/5 p-1.5 rounded">{d}</p>
                      ))}
                      {latestAudit.brokenLinks?.broken_urls?.slice(0, 5).map((b: any, i: number) => (
                        <p key={`b-${i}`} className="text-xs text-muted-foreground truncate">
                          🔴 {b.broken_url} ({b.status})
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Redirect Chains */}
                  {latestAudit.brokenLinks?.redirects_found > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" /> Redirect Chains Simplificadas
                      </p>
                      <p className="text-xs text-foreground bg-amber-500/5 p-1.5 rounded">
                        ⚠ {latestAudit.brokenLinks.redirects_found} cadeias de redirecionamento detectadas
                      </p>
                    </div>
                  )}

                  {/* Bulk Meta Fix */}
                  {latestAudit.bulkMetaFix?.fixed > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <FileCheck className="w-3 h-3" /> Títulos & Metas Otimizados via IA
                      </p>
                      <div className="flex items-center gap-2 p-2 bg-cyan-500/5 rounded-lg">
                        <span className="text-lg font-bold text-cyan-500">{latestAudit.bulkMetaFix.fixed}</span>
                        <span className="text-xs text-muted-foreground">títulos/metas corrigidos automaticamente</span>
                      </div>
                      {latestAudit.bulkMetaFix?.details?.map((d: string, i: number) => (
                        <p key={i} className="text-xs text-foreground bg-cyan-500/5 p-1.5 rounded">{d}</p>
                      ))}
                    </div>
                  )}

                  {/* Sitemap Optimization */}
                  {latestAudit.sitemapOpt?.details?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Otimização de Sitemap
                      </p>
                      {latestAudit.sitemapOpt.details.map((d: string, i: number) => (
                        <p key={i} className="text-xs text-foreground bg-muted/50 p-1.5 rounded">🗺 {d}</p>
                      ))}
                    </div>
                  )}

                  {/* No fixes */}
                  {!latestAudit.brokenLinks?.broken_found &&
                   !latestAudit.bulkMetaFix?.fixed &&
                   !latestAudit.sitemapOpt?.details?.length && (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      <Shield className="w-6 h-6 mx-auto mb-2 opacity-50" />
                      Execute o agente para detectar e corrigir problemas.
                    </div>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Execute o agente para ver correções automáticas.</p>
              </div>
            )}
          </TabsContent>

          {/* ACTIONS TAB */}
          <TabsContent value="actions" className="space-y-3 mt-3">
            {latestAudit ? (
              <ScrollArea className="max-h-[350px]">
                <div className="space-y-3">
                  {/* Meta audit */}
                  {latestAudit.metaAudit?.fixes_applied?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <FileCheck className="w-3 h-3" /> Metas Corrigidos
                      </p>
                      {latestAudit.metaAudit.fixes_applied.map((fix: string, i: number) => (
                        <p key={i} className="text-xs text-foreground bg-green-500/5 p-1.5 rounded">✅ {fix}</p>
                      ))}
                    </div>
                  )}

                  {/* Internal links */}
                  {latestAudit.internalLinks?.applied_details?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Link2 className="w-3 h-3" /> Links Internos Aplicados
                      </p>
                      {latestAudit.internalLinks.applied_details.slice(0, 10).map((detail: string, i: number) => (
                        <p key={i} className="text-xs text-foreground bg-blue-500/5 p-1.5 rounded">🔗 {detail}</p>
                      ))}
                      {latestAudit.internalLinks.orphans > 0 && (
                        <p className="text-xs text-amber-600">
                          ⚠ {latestAudit.internalLinks.orphans} artigos órfãos restantes
                        </p>
                      )}
                    </div>
                  )}

                  {/* Autonomous fixes */}
                  {latestAudit.autonomousFix?.details?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Correções Autônomas
                      </p>
                      {latestAudit.autonomousFix.details.map((d: string, i: number) => (
                        <p key={i} className="text-xs text-foreground bg-purple-500/5 p-1.5 rounded">⚡ {d}</p>
                      ))}
                    </div>
                  )}

                  {/* AI Discovery */}
                  {latestAudit.aiDiscovery?.actions?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Globe className="w-3 h-3" /> AI Discovery
                      </p>
                      {latestAudit.aiDiscovery.actions.map((a: string, i: number) => (
                        <p key={i} className="text-xs text-foreground bg-muted/50 p-1.5 rounded">🌐 {a}</p>
                      ))}
                    </div>
                  )}

                  {/* Indexing */}
                  {latestAudit.indexing?.details?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Search className="w-3 h-3" /> Indexação
                      </p>
                      {latestAudit.indexing.details.map((d: string, i: number) => (
                        <p key={i} className="text-xs text-foreground bg-amber-500/5 p-1.5 rounded">📡 {d}</p>
                      ))}
                    </div>
                  )}

                  {/* No actions */}
                  {!latestAudit.metaAudit?.fixes_applied?.length &&
                   !latestAudit.internalLinks?.applied_details?.length &&
                   !latestAudit.autonomousFix?.details?.length && (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      <RefreshCw className="w-6 h-6 mx-auto mb-2 opacity-50" />
                      Nenhuma ação executada na última run.
                    </div>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Execute o agente para ver ações reais.</p>
              </div>
            )}
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history" className="space-y-2 mt-3">
            {runs && runs.length > 0 ? (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-1.5">
                  {runs.slice(0, 15).map(run => (
                    <div key={run.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors text-sm">
                      {statusIcon(run.status)}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-foreground text-xs">
                          {run.summary || (run.status === 'running' ? 'Executando...' : run.error_message || 'Sem dados')}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(run.started_at), "dd/MM HH:mm", { locale: ptBR })}
                          {run.run_type === 'manual' && ' • Manual'}
                        </p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {(run.meta_issues_fixed || 0) > 0 && (
                          <Badge variant="outline" className="text-[9px]">{run.meta_issues_fixed} fix</Badge>
                        )}
                        {(run.links_applied || 0) > 0 && (
                          <Badge variant="outline" className="text-[9px]">{run.links_applied} links</Badge>
                        )}
                        {(run.indexing_submitted || 0) > 0 && (
                          <Badge variant="outline" className="text-[9px]">{run.indexing_submitted} idx</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-sm">
                <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma execução ainda.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
