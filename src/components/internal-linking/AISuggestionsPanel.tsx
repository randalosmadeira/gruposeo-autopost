import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  Link2,
  Target,
  Zap,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  Bot,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface LinkSuggestionRow {
  id: string;
  anchor_text: string;
  anchor_context: string | null;
  target_url: string;
  relevance_score: number | null;
  status: string | null;
  position_suggestion: string | null;
  source_wp_post_id: number | null;
  target_wp_post_id: number | null;
  created_at: string;
  source_article: { wp_post_title: string } | null;
  target_article: { wp_post_title: string } | null;
}

interface AISuggestionsPanelProps {
  projectId: string;
}

export function AISuggestionsPanel({ projectId }: AISuggestionsPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<LinkSuggestionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [approvalProgress, setApprovalProgress] = useState({ current: 0, total: 0, phase: '' });

  const fetchSuggestions = useCallback(async () => {
    if (!projectId || !user) return;
    setIsLoading(true);
    try {
      let query = supabase
        .from('internal_link_suggestions')
        .select(`
          id, anchor_text, anchor_context, target_url, relevance_score,
          status, position_suggestion, source_wp_post_id, target_wp_post_id, created_at,
          source_article:source_article_id(wp_post_title),
          target_article:target_article_id(wp_post_title)
        `)
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .order('relevance_score', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;

      setSuggestions((data as any) || []);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, user, statusFilter]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  // Realtime subscription
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`suggestions-${projectId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'internal_link_suggestions',
        filter: `project_id=eq.${projectId}`,
      }, () => fetchSuggestions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, fetchSuggestions]);

  const toggleSelectAll = () => {
    if (selectedIds.size === suggestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suggestions.map(s => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkApprove = async () => {
    setShowApproveDialog(false);
    if (selectedIds.size === 0) return;

    setIsApproving(true);
    const ids = Array.from(selectedIds);
    setApprovalProgress({ current: 0, total: ids.length, phase: 'Aprovando sugestões...' });

    try {
      // Update status to approved
      const { error: updateError } = await supabase
        .from('internal_link_suggestions')
        .update({ status: 'approved', applied_at: new Date().toISOString() })
        .in('id', ids);

      if (updateError) throw updateError;

      setApprovalProgress({ current: ids.length / 2, total: ids.length, phase: 'Enviando para fila de processamento...' });

      // Trigger the autonomous application via edge function
      const { error: invokeError } = await supabase.functions.invoke('analyze-wp-articles', {
        body: {
          action: 'apply_approved_links',
          project_id: projectId,
          suggestion_ids: ids,
        },
      });

      if (invokeError) {
        console.warn('Queue trigger warning:', invokeError);
      }

      setApprovalProgress({ current: ids.length, total: ids.length, phase: 'Concluído!' });

      toast({
        title: `✅ ${ids.length} sugestões aprovadas`,
        description: 'Os links serão inseridos automaticamente nos artigos. Acompanhe no Monitor de Fila.',
      });

      setSelectedIds(new Set());
      await fetchSuggestions();
    } catch (error: any) {
      console.error('Error approving suggestions:', error);
      toast({
        title: 'Erro ao aprovar',
        description: error.message || 'Falha ao aprovar sugestões',
        variant: 'destructive',
      });
    } finally {
      setIsApproving(false);
      setApprovalProgress({ current: 0, total: 0, phase: '' });
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    setIsRejecting(true);
    try {
      const { error } = await supabase
        .from('internal_link_suggestions')
        .update({ status: 'rejected', rejected_reason: 'Rejeitado em massa pelo usuário' })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast({ title: `${selectedIds.size} sugestões rejeitadas` });
      setSelectedIds(new Set());
      await fetchSuggestions();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsRejecting(false);
    }
  };

  const handleGenerateSuggestions = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-wp-articles', {
        body: {
          action: 'generate_backlink_suggestions',
          project_id: projectId,
        },
      });

      if (error) throw error;

      toast({
        title: 'Sugestões geradas pela IA',
        description: `${data?.suggestions_created || 0} novas sugestões de links internos criadas.`,
      });

      await fetchSuggestions();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const pendingCount = suggestions.filter(s => s.status === 'pending').length;
  const approvedCount = suggestions.filter(s => s.status === 'approved' || s.status === 'applied').length;

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'pending': return <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pendente</Badge>;
      case 'approved': return <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Aprovado</Badge>;
      case 'applied': return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Aplicado</Badge>;
      case 'rejected': return <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Rejeitado</Badge>;
      default: return <Badge variant="outline">{status || '—'}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              Sugestões de Links da IA
            </CardTitle>
            <CardDescription>
              Sugestões autônomas de linkagem interna geradas pela IA. Sua aprovação é a chave para a automação em massa.
            </CardDescription>
          </div>
          <Button
            onClick={handleGenerateSuggestions}
            disabled={isGenerating}
            className="gap-2"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isGenerating ? 'Gerando...' : 'Gerar Sugestões IA'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary Bar */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold">{suggestions.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">{approvedCount}</p>
              <p className="text-xs text-muted-foreground">Aprovadas</p>
            </div>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-amber-100/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <Zap className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {pendingCount} sugestões aguardando sua aprovação
              </span>
            </div>
          )}
        </div>

        {/* Approval Progress */}
        {isApproving && approvalProgress.total > 0 && (
          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                {approvalProgress.phase}
              </span>
            </div>
            <Progress value={(approvalProgress.current / approvalProgress.total) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {approvalProgress.current} de {approvalProgress.total} processadas
            </p>
          </div>
        )}

        {/* Filter & Bulk Actions */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filtrar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="approved">Aprovados</SelectItem>
                <SelectItem value="applied">Aplicados</SelectItem>
                <SelectItem value="rejected">Rejeitados</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={fetchSuggestions}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline">{selectedIds.size} selecionadas</Badge>
              <Button
                size="sm"
                onClick={() => setShowApproveDialog(true)}
                disabled={isApproving}
                className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4" />
                Aprovar Selecionados
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkReject}
                disabled={isRejecting}
                className="gap-1 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
              >
                <XCircle className="w-4 h-4" />
                Rejeitar
              </Button>
            </div>
          )}
        </div>

        {/* Suggestions Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bot className="w-14 h-14 mx-auto mb-4 opacity-40" />
            <p className="font-medium">Nenhuma sugestão encontrada</p>
            <p className="text-sm mt-1">Clique em "Gerar Sugestões IA" para que a inteligência artificial analise seus artigos e crie sugestões de links internos.</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={selectedIds.size === suggestions.length && suggestions.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Artigo Origem</TableHead>
                  <TableHead>Âncora</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead className="text-center">Relevância</TableHead>
                  <TableHead className="text-center">Posição</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map(suggestion => (
                  <TableRow key={suggestion.id} className={cn(
                    selectedIds.has(suggestion.id) && "bg-primary/5"
                  )}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(suggestion.id)}
                        onCheckedChange={() => toggleSelect(suggestion.id)}
                      />
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {(suggestion.source_article as any)?.wp_post_title || `Post #${suggestion.source_wp_post_id || '—'}`}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{suggestion.anchor_text}</code>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm truncate">
                          {(suggestion.target_article as any)?.wp_post_title || suggestion.target_url}
                        </span>
                        <a href={suggestion.target_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn("font-semibold text-sm", getScoreColor(suggestion.relevance_score))}>
                        {suggestion.relevance_score || 0}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs capitalize">
                        {suggestion.position_suggestion || 'corpo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(suggestion.status)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        {/* Approval Confirmation Dialog */}
        <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-600" />
                Aprovar {selectedIds.size} sugestões de links?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  Ao aprovar, o sistema autônomo iniciará imediatamente a inserção dos links nos artigos do WordPress.
                </p>
                <div className="p-3 rounded-lg bg-muted/50 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>As sugestões serão adicionadas à fila de processamento</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-primary shrink-0" />
                    <span>A IA conectará ao WordPress e editará cada artigo automaticamente</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Você poderá acompanhar o progresso no Monitor de Fila</span>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkApprove}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <Zap className="w-4 h-4" />
                Aprovar e Automatizar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
