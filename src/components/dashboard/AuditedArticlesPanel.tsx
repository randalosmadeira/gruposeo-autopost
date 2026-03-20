import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  CheckCircle2, XCircle, AlertTriangle, ExternalLink,
  Search, FileCheck, Link2, ArrowRight, Shield,
  ChevronDown, ChevronUp, Loader2, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditIssue {
  type: 'meta' | 'link' | 'broken' | 'redirect' | 'schema' | 'content' | 'indexing';
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  title: string;
  description: string;
  fix_suggestion?: string;
  auto_fixable: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
}

interface AuditedArticle {
  id: string;
  wp_post_id?: number;
  title: string;
  url: string;
  seo_score: number;
  issues: AuditIssue[];
  status: 'healthy' | 'needs_review' | 'critical';
}

interface AuditedArticlesPanelProps {
  auditDetails: any;
  projectId?: string;
}

function extractAuditedArticles(details: any): AuditedArticle[] {
  if (!details) return [];
  const articlesMap = new Map<string, AuditedArticle>();

  // Extract from meta audit fixes
  const metaFixes = details.meta_audit?.fixes_applied || [];
  for (const fix of metaFixes) {
    const match = typeof fix === 'string' ? fix.match(/post (\d+)|"([^"]+)"/) : null;
    const id = match?.[1] || `meta-${metaFixes.indexOf(fix)}`;
    if (!articlesMap.has(id)) {
      articlesMap.set(id, {
        id, wp_post_id: match?.[1] ? parseInt(match[1]) : undefined,
        title: typeof fix === 'string' ? fix.replace(/^✅\s*/, '').slice(0, 80) : 'Artigo',
        url: '', seo_score: 0, issues: [], status: 'needs_review',
      });
    }
    articlesMap.get(id)!.issues.push({
      type: 'meta', severity: 'P2', title: 'Meta description corrigida',
      description: typeof fix === 'string' ? fix : 'Meta atualizada via IA',
      auto_fixable: true, status: 'applied',
    });
  }

  // Extract from broken links
  const brokenUrls = details.broken_links?.broken_urls || [];
  for (const broken of brokenUrls) {
    const sourceUrl = broken.source_url || broken.broken_url || '';
    const id = `broken-${sourceUrl}`;
    if (!articlesMap.has(id)) {
      articlesMap.set(id, {
        id, title: sourceUrl.split('/').pop() || 'Página com link quebrado',
        url: sourceUrl, seo_score: 0, issues: [], status: 'critical',
      });
    }
    articlesMap.get(id)!.issues.push({
      type: 'broken', severity: 'P0',
      title: `Link quebrado (${broken.status || 404})`,
      description: `URL: ${broken.broken_url}`,
      fix_suggestion: 'Criar redirect 301 automático para artigo similar',
      auto_fixable: true, status: 'pending',
    });
  }

  // Extract from broken links fix (already fixed)
  const fixedDetails = details.broken_links_fix?.details || [];
  for (const d of fixedDetails) {
    const id = `fixed-${fixedDetails.indexOf(d)}`;
    articlesMap.set(id, {
      id, title: typeof d === 'string' ? d.slice(0, 80) : 'Redirect criado',
      url: '', seo_score: 0, issues: [{
        type: 'redirect', severity: 'P1', title: 'Redirect 301 criado',
        description: typeof d === 'string' ? d : 'Redirecionamento aplicado',
        auto_fixable: true, status: 'applied',
      }], status: 'healthy',
    });
  }

  // Extract from internal links suggestions
  const linkDetails = details.internal_links?.applied_details || [];
  for (const link of linkDetails) {
    const id = `link-${linkDetails.indexOf(link)}`;
    articlesMap.set(id, {
      id, title: typeof link === 'string' ? link.replace(/^🔗\s*/, '').slice(0, 80) : 'Link interno',
      url: '', seo_score: 0, issues: [{
        type: 'link', severity: 'P2', title: 'Link interno aplicado',
        description: typeof link === 'string' ? link : 'Linkagem interna sugerida',
        auto_fixable: true, status: 'applied',
      }], status: 'healthy',
    });
  }

  // Extract orphan pages
  const orphanCount = details.internal_links?.orphans || 0;
  if (orphanCount > 0) {
    articlesMap.set('orphans-summary', {
      id: 'orphans-summary', title: `${orphanCount} artigos órfãos detectados`,
      url: '', seo_score: 30, issues: [{
        type: 'link', severity: 'P1', title: `${orphanCount} páginas sem links internos`,
        description: 'Estas páginas não recebem nenhum link de outros artigos do site.',
        fix_suggestion: 'Gerar sugestões de linkagem interna via IA para conectar esses artigos',
        auto_fixable: true, status: 'pending',
      }], status: 'critical',
    });
  }

  // Extract from bulk meta fix
  const bulkMetaDetails = details.bulk_meta_fix?.details || [];
  for (const d of bulkMetaDetails) {
    const id = `bulk-${bulkMetaDetails.indexOf(d)}`;
    articlesMap.set(id, {
      id, title: typeof d === 'string' ? d.slice(0, 80) : 'Meta otimizada',
      url: '', seo_score: 0, issues: [{
        type: 'meta', severity: 'P2', title: 'Título/Meta otimizado via IA',
        description: typeof d === 'string' ? d : 'Otimização aplicada',
        auto_fixable: true, status: 'applied',
      }], status: 'healthy',
    });
  }

  // Extract audit issues
  const auditIssues = details.audit?.issues || [];
  for (const issue of auditIssues) {
    const id = `issue-${auditIssues.indexOf(issue)}`;
    const existing = articlesMap.get(id);
    if (!existing) {
      articlesMap.set(id, {
        id, title: issue.title || 'Problema detectado',
        url: '', seo_score: 0,
        issues: [{
          type: issue.category || 'content',
          severity: issue.priority || 'P2',
          title: issue.title,
          description: issue.description || '',
          fix_suggestion: issue.fix_instruction,
          auto_fixable: !!issue.auto_fixed,
          status: issue.auto_fixed ? 'applied' : 'pending',
        }],
        status: issue.auto_fixed ? 'healthy' : 'needs_review',
      });
    }
  }

  // Extract VPS audit items
  const vpsAudit = details.vps_server_audit;
  if (vpsAudit?.details?.length > 0) {
    for (const check of vpsAudit.details) {
      const id = `vps-${vpsAudit.details.indexOf(check)}`;
      const isOk = typeof check === 'string' && (check.includes('✅') || check.includes('OK'));
      articlesMap.set(id, {
        id, title: typeof check === 'string' ? check.replace(/^[✅❌⚠️🔴]\s*/, '').slice(0, 80) : 'VPS Check',
        url: '', seo_score: isOk ? 100 : 40,
        issues: [{
          type: 'indexing', severity: isOk ? 'P3' : 'P1',
          title: typeof check === 'string' ? check.slice(0, 60) : 'Verificação VPS',
          description: typeof check === 'string' ? check : '',
          auto_fixable: false, status: isOk ? 'applied' : 'pending',
        }],
        status: isOk ? 'healthy' : 'needs_review',
      });
    }
  }

  return Array.from(articlesMap.values());
}

const severityColor: Record<string, string> = {
  P0: 'bg-destructive text-destructive-foreground',
  P1: 'bg-orange-500 text-white',
  P2: 'bg-yellow-500 text-white',
  P3: 'bg-blue-500 text-white',
};

const statusConfig = {
  healthy: { label: 'OK', color: 'text-green-500', icon: CheckCircle2 },
  needs_review: { label: 'Revisar', color: 'text-yellow-500', icon: AlertTriangle },
  critical: { label: 'Crítico', color: 'text-destructive', icon: XCircle },
};

const typeIcons: Record<string, typeof FileCheck> = {
  meta: FileCheck, link: Link2, broken: AlertTriangle,
  redirect: ArrowRight, schema: Shield, content: Search, indexing: ExternalLink,
};

export function AuditedArticlesPanel({ auditDetails, projectId }: AuditedArticlesPanelProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'applied' | 'healthy' | 'critical'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Record<number, 'approved' | 'rejected'>>>({});

  const articles = useMemo(() => extractAuditedArticles(auditDetails), [auditDetails]);

  const filtered = useMemo(() => {
    let result = articles;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => a.title.toLowerCase().includes(q) || a.url.toLowerCase().includes(q));
    }
    if (filterStatus === 'pending') {
      result = result.filter(a => a.issues.some(i => i.status === 'pending'));
    } else if (filterStatus === 'applied') {
      result = result.filter(a => a.issues.every(i => i.status === 'applied'));
    } else if (filterStatus === 'healthy') {
      result = result.filter(a => a.status === 'healthy');
    } else if (filterStatus === 'critical') {
      result = result.filter(a => a.status === 'critical' || a.status === 'needs_review');
    }
    return result;
  }, [articles, search, filterStatus]);

  const stats = useMemo(() => ({
    total: articles.length,
    healthy: articles.filter(a => a.status === 'healthy').length,
    pending: articles.filter(a => a.issues.some(i => i.status === 'pending')).length,
    critical: articles.filter(a => a.status === 'critical').length,
  }), [articles]);

  const handleDecision = (articleId: string, issueIdx: number, decision: 'approved' | 'rejected') => {
    setDecisions(prev => ({
      ...prev,
      [articleId]: { ...prev[articleId], [issueIdx]: decision },
    }));
  };

  const handleApplyApproved = async (articleId: string) => {
    const articleDecisions = decisions[articleId];
    if (!articleDecisions) return;

    const approved = Object.entries(articleDecisions)
      .filter(([, d]) => d === 'approved')
      .map(([idx]) => parseInt(idx));

    if (approved.length === 0) {
      toast({ title: 'Nenhuma sugestão aprovada', description: 'Aprove ao menos uma sugestão para aplicar.', variant: 'destructive' });
      return;
    }

    setApplyingId(articleId);
    try {
      const article = articles.find(a => a.id === articleId);
      if (!article) throw new Error('Artigo não encontrado');

      // Call seo-agent with specific fixes to apply
      const { error } = await supabase.functions.invoke('seo-agent', {
        body: {
          action: 'apply_approved_fixes',
          project_id: projectId,
          article_id: articleId,
          wp_post_id: article.wp_post_id,
          approved_fixes: approved.map(idx => ({
            index: idx,
            issue: article.issues[idx],
          })),
        },
      });

      if (error) throw error;

      toast({ title: '✅ Correções aplicadas', description: `${approved.length} correção(ões) aplicada(s) com sucesso.` });
      // Mark as applied locally
      setDecisions(prev => {
        const updated = { ...prev };
        delete updated[articleId];
        return updated;
      });
    } catch (err: any) {
      toast({ title: 'Erro ao aplicar', description: err.message, variant: 'destructive' });
    } finally {
      setApplyingId(null);
    }
  };

  const handleApproveAll = (articleId: string, issueCount: number) => {
    const all: Record<number, 'approved'> = {};
    for (let i = 0; i < issueCount; i++) all[i] = 'approved';
    setDecisions(prev => ({ ...prev, [articleId]: all }));
  };

  const handleRejectAll = (articleId: string, issueCount: number) => {
    const all: Record<number, 'rejected'> = {};
    for (let i = 0; i < issueCount; i++) all[i] = 'rejected';
    setDecisions(prev => ({ ...prev, [articleId]: all }));
  };

  if (articles.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">Nenhum artigo auditado ainda</p>
        <p className="text-xs mt-1">Execute o Agente SEO para auditar seus artigos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground', filter: 'all' as const },
          { label: 'Saudáveis', value: stats.healthy, color: 'text-green-500', filter: 'healthy' as const },
          { label: 'Pendentes', value: stats.pending, color: 'text-yellow-500', filter: 'pending' as const },
          { label: 'Críticos', value: stats.critical, color: 'text-destructive', filter: 'critical' as const },
        ].map(s => (
          <button
            key={s.filter}
            onClick={() => setFilterStatus(s.filter)}
            className={cn(
              'p-2 rounded-lg text-center transition-colors border',
              filterStatus === s.filter ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/40 hover:bg-muted/60'
            )}
          >
            <p className={cn('text-lg font-bold', s.color)}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar artigo auditado..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-9 text-sm"
        />
      </div>

      {/* Articles list */}
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-2">
          {filtered.map(article => {
            const StatusIcon = statusConfig[article.status].icon;
            const isExpanded = expandedId === article.id;
            const articleDecs = decisions[article.id] || {};
            const pendingIssues = article.issues.filter(i => i.status === 'pending');
            const appliedIssues = article.issues.filter(i => i.status === 'applied');

            return (
              <div key={article.id} className={cn(
                'rounded-lg border transition-all',
                article.status === 'critical' ? 'border-destructive/30 bg-destructive/5' :
                article.status === 'needs_review' ? 'border-yellow-500/30 bg-yellow-500/5' :
                'border-border bg-card'
              )}>
                {/* Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : article.id)}
                  className="w-full flex items-center gap-2 p-3 text-left"
                >
                  <StatusIcon className={cn('w-4 h-4 shrink-0', statusConfig[article.status].color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{article.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[9px]">
                        {article.issues.length} item(ns)
                      </Badge>
                      {appliedIssues.length > 0 && (
                        <span className="text-[10px] text-green-600">✅ {appliedIssues.length} aplicado(s)</span>
                      )}
                      {pendingIssues.length > 0 && (
                        <span className="text-[10px] text-yellow-600">⏳ {pendingIssues.length} pendente(s)</span>
                      )}
                    </div>
                  </div>
                  {article.url && (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-muted-foreground hover:text-primary"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {/* Expanded issues */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border/50 pt-2">
                    {/* Bulk actions for pending issues */}
                    {pendingIssues.length > 1 && (
                      <div className="flex items-center gap-2 mb-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
                          onClick={() => handleApproveAll(article.id, article.issues.length)}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Aprovar Tudo
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-destructive border-red-200 hover:bg-red-50"
                          onClick={() => handleRejectAll(article.id, article.issues.length)}
                        >
                          <XCircle className="w-3 h-3 mr-1" /> Rejeitar Tudo
                        </Button>
                      </div>
                    )}

                    {article.issues.map((issue, idx) => {
                      const IssueIcon = typeIcons[issue.type] || FileCheck;
                      const decision = articleDecs[idx];

                      return (
                        <div key={idx} className={cn(
                          'p-2.5 rounded-lg border text-sm',
                          issue.status === 'applied' ? 'bg-green-500/5 border-green-500/20' :
                          decision === 'approved' ? 'bg-green-500/10 border-green-500/30' :
                          decision === 'rejected' ? 'bg-destructive/5 border-destructive/20 opacity-60' :
                          'bg-muted/30 border-border'
                        )}>
                          <div className="flex items-start gap-2">
                            <IssueIcon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge className={cn('text-[9px]', severityColor[issue.severity])}>{issue.severity}</Badge>
                                <span className="text-xs font-medium text-foreground">{issue.title}</span>
                                {issue.status === 'applied' && (
                                  <Badge variant="outline" className="text-[9px] text-green-600 border-green-300">Aplicado</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{issue.description}</p>
                              {issue.fix_suggestion && issue.status !== 'applied' && (
                                <p className="text-xs text-primary/80 mt-1 italic">💡 {issue.fix_suggestion}</p>
                              )}
                            </div>

                            {/* Approval buttons for pending issues */}
                            {issue.status === 'pending' && (
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => handleDecision(article.id, idx, 'approved')}
                                  className={cn(
                                    'p-1 rounded transition-colors',
                                    decision === 'approved' ? 'bg-green-500 text-white' : 'hover:bg-green-100 text-green-600'
                                  )}
                                  title="Aprovar correção"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDecision(article.id, idx, 'rejected')}
                                  className={cn(
                                    'p-1 rounded transition-colors',
                                    decision === 'rejected' ? 'bg-destructive text-white' : 'hover:bg-red-100 text-destructive'
                                  )}
                                  title="Rejeitar correção"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Apply button */}
                    {pendingIssues.length > 0 && Object.keys(articleDecs).length > 0 && (
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs bg-gradient-accent"
                        onClick={() => handleApplyApproved(article.id)}
                        disabled={applyingId === article.id}
                      >
                        {applyingId === article.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                        )}
                        Aplicar Correções Aprovadas
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {filtered.length === 0 && articles.length > 0 && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          <Eye className="w-6 h-6 mx-auto mb-2 opacity-50" />
          Nenhum artigo encontrado com esse filtro.
        </div>
      )}
    </div>
  );
}
