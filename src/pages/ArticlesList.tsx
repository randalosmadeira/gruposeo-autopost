import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Folder,
  ImageIcon,
  Inbox,
  Link as LinkIcon,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
import { BulkPublishModal } from '@/components/articles/BulkPublishModal';
import { EmotionalTriggerBadge } from '@/components/shared/EmotionalTriggerBadge';
import { supabase } from '@/integrations/supabase/client';
import { articleHasContent, useArticlesList } from '@/hooks/useArticlesList';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const RDM_PROJECT_ID = 'fab1032d-56a4-4e59-b3d4-4a68d3d4bf0a';
const IMAGE_CONCURRENCY = 4;
const SEO_BATCH_SIZE = 2;
const SEO_CONCURRENCY = 2;

type StatusCfg = { label: string; icon: React.ReactNode; classes: string };
const statusConfig: Record<string, StatusCfg> = {
  draft: { label: 'Na Fila', icon: <Inbox className="w-3 h-3" />, classes: 'bg-muted text-muted-foreground border-muted' },
  generating: { label: 'Em criação', icon: <Loader2 className="w-3 h-3 animate-spin" />, classes: 'bg-warning/20 text-warning-foreground border-warning/30' },
  ready: { label: 'Finalizado', icon: <FileCheck className="w-3 h-3" />, classes: 'bg-primary/10 text-primary border-primary/20' },
  published: { label: 'Publicado', icon: <CheckCircle2 className="w-3 h-3" />, classes: 'bg-success/10 text-success border-success/20' },
  error: { label: 'Erro', icon: <AlertCircle className="w-3 h-3" />, classes: 'bg-destructive/10 text-destructive border-destructive/20' },
  scheduled: { label: 'Agendado', icon: <Clock className="w-3 h-3" />, classes: 'bg-accent/50 text-accent-foreground border-accent' },
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

export default function ArticlesList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { projects } = useProjects();
  const {
    articles,
    total,
    totalPages,
    isLoading,
    filters,
    statusCounts,
    updateFilter,
    refreshArticles,
    deleteArticle,
  } = useArticlesList();

  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  const [bulkAnalysisProgress, setBulkAnalysisProgress] = useState(0);
  const [isBulkGeneratingImages, setIsBulkGeneratingImages] = useState(false);
  const [bulkImageProgress, setBulkImageProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => updateFilter('search', searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput, updateFilter]);

  useEffect(() => {
    updateFilter('dateFilter', dateFilter || undefined);
  }, [dateFilter, updateFilter]);

  useEffect(() => {
    setSelectedArticles(new Set());
  }, [filters.page, filters.status, filters.projectId, filters.search, filters.dateFilter]);

  const statusTabs = useMemo(() => [
    { value: 'all', label: 'Todos', count: statusCounts.all },
    { value: 'published', label: 'Publicado', count: statusCounts.published },
    { value: 'scheduled', label: 'Agendado', count: statusCounts.scheduled },
    { value: 'ready', label: 'Finalizado', count: statusCounts.ready },
    { value: 'generating', label: 'Em criação', count: statusCounts.generating },
    { value: 'draft', label: 'Na Fila', count: statusCounts.draft },
    { value: 'error', label: 'Erro', count: statusCounts.error },
  ], [statusCounts]);

  const getProjectName = useCallback((projectId: string | null) => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId)?.name || null;
  }, [projects]);

  const toggleSelect = (id: string) => setSelectedArticles((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (articles.length > 0 && selectedArticles.size === articles.length) setSelectedArticles(new Set());
    else setSelectedArticles(new Set(articles.map((a) => a.id)));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await refreshArticles(); } finally { setIsRefreshing(false); }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedArticles);
    if (!ids.length) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('articles').delete().in('id', ids);
      if (error) throw error;
      toast({ title: 'Exclusão concluída', description: `${ids.length} artigo(s) removido(s).` });
      setSelectedArticles(new Set());
      setShowDeleteDialog(false);
      await refreshArticles();
    } catch (error) {
      toast({ title: 'Erro na exclusão em massa', description: error instanceof Error ? error.message : 'Falha inesperada.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkSEOAnalysis = async () => {
    const ids = Array.from(selectedArticles);
    if (!ids.length || isBulkAnalyzing) return;
    setIsBulkAnalyzing(true);
    setBulkAnalysisProgress(0);
    let processed = 0;
    let optimized = 0;
    let failed = 0;
    let scoreTotal = 0;

    toast({ title: `SEO/GEO: processando ${ids.length} artigo(s)`, description: 'Conteúdo e estrutura serão otimizados sem disparar imagem ou republicação.' });
    try {
      const batches = chunk(ids, SEO_BATCH_SIZE);
      await runPool(batches, SEO_CONCURRENCY, async (batch) => {
        try {
          const { data, error } = await supabase.functions.invoke('analyze-seo-advanced', { body: { article_ids: batch, mode: 'optimize' } });
          if (error) throw error;
          for (const result of data?.results || []) {
            if (result.error) failed += 1;
            else {
              optimized += result.optimized ? 1 : 0;
              scoreTotal += Number(result.score || 0);
            }
          }
          const missing = batch.length - Number(data?.results?.length || 0);
          if (missing > 0) failed += missing;
        } catch {
          failed += batch.length;
        } finally {
          processed += batch.length;
          setBulkAnalysisProgress(Math.min(processed, ids.length));
        }
      });
      const avg = optimized ? Math.round(scoreTotal / optimized) : 0;
      toast({ title: 'SEO/GEO concluído', description: `${optimized} otimizado(s), ${failed} falha(s), score médio ${avg}/100.` });
      await refreshArticles();
    } finally {
      setIsBulkAnalyzing(false);
      setBulkAnalysisProgress(0);
    }
  };

  const handleBulkImageGeneration = async () => {
    const ids = Array.from(selectedArticles);
    if (!ids.length || isBulkGeneratingImages) return;
    setIsBulkGeneratingImages(true);
    setBulkImageProgress(0);
    let processed = 0;
    let success = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const { data: rows, error } = await supabase
        .from('articles')
        .select('id,title,keyword,excerpt,content,featured_image_url,project_id')
        .in('id', ids);
      if (error) throw error;

      await runPool(rows || [], IMAGE_CONCURRENCY, async (article) => {
        try {
          if (article.featured_image_url) {
            skipped += 1;
            return;
          }
          if (!article.title) throw new Error('article_title_missing');
          const { data, error: fnError } = await supabase.functions.invoke('generate-image', {
            body: {
              title: article.title,
              keywords: article.keyword || '',
              context: article.excerpt || '',
              content: article.content || '',
              articleId: article.id,
              projectId: article.project_id,
              moduleKey: 'article',
              aspectRatio: '16:9',
              quality: 'high',
              allowAiGeneration: true,
            },
          });
          if (fnError || !data?.success || !data?.image) throw fnError || new Error(data?.error || 'image_failed');
          success += 1;
        } catch {
          failed += 1;
        } finally {
          processed += 1;
          setBulkImageProgress(processed);
        }
      });

      const notReturned = ids.length - Number(rows?.length || 0);
      failed += Math.max(0, notReturned);
      toast({
        title: 'Imagens processadas',
        description: `${success} criada(s)/selecionada(s), ${skipped} já existente(s), ${failed} falha(s).${ids.some((id) => rows?.find((r) => r.id === id)?.project_id === RDM_PROJECT_ID) ? ' O pool oficial é priorizado e a IA é usada apenas quando não houver imagem autorizada disponível.' : ''}`,
        variant: failed ? 'destructive' : 'default',
      });
      await refreshArticles();
    } catch (error) {
      toast({ title: 'Erro na geração em massa', description: error instanceof Error ? error.message : 'Falha inesperada.', variant: 'destructive' });
    } finally {
      setIsBulkGeneratingImages(false);
      setBulkImageProgress(0);
    }
  };

  const handleCopyLink = async (articleId: string) => {
    const article = articles.find((a) => a.id === articleId);
    if (!article?.published_url) return;
    await navigator.clipboard.writeText(article.published_url);
    toast({ title: 'Link copiado' });
  };

  if (isLoading && !articles.length) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-card">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Artigos</h1>
            <Badge variant="secondary" className="bg-primary/10 text-primary">Total: {statusCounts.all}</Badge>
          </div>
          <Button asChild><Link to="/articles/new"><Plus className="mr-2 h-4 w-4" />Gerar Onda</Link></Button>
        </div>
      </header>

      <section className="space-y-4 border-b bg-card px-6 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Pesquisar artigos..." className="pl-10" />
          </div>
          <Select value={filters.projectId} onValueChange={(v) => updateFilter('projectId', v)}>
            <SelectTrigger className="w-full lg:w-56"><Folder className="mr-2 h-4 w-4 text-amber-500" /><SelectValue placeholder="Todos os projetos" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos os projetos</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="relative w-full lg:w-48">
            <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            {dateFilter && <button type="button" aria-label="Limpar data" onClick={() => setDateFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-4 w-4" /></button>}
          </div>
          <Select value={`${filters.sortBy}-${filters.sortOrder}`} onValueChange={(v) => { const [sortBy, sortOrder] = v.split('-') as ['created_at' | 'scheduled_at', 'asc' | 'desc']; updateFilter('sortBy', sortBy); updateFilter('sortOrder', sortOrder); }}>
            <SelectTrigger className="w-full lg:w-52"><ArrowUpDown className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at-desc"><ArrowDown className="mr-2 inline h-4 w-4" />Mais recentes</SelectItem>
              <SelectItem value="created_at-asc"><ArrowUp className="mr-2 inline h-4 w-4" />Mais antigos</SelectItem>
              <SelectItem value="scheduled_at-desc"><Clock className="mr-2 inline h-4 w-4" />Agendados próximos</SelectItem>
              <SelectItem value="scheduled_at-asc"><Clock className="mr-2 inline h-4 w-4" />Agendados distantes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!selectedArticles.size} onClick={() => setShowPublishModal(true)}><Upload className="mr-2 h-4 w-4" />Publicar em massa</Button>
          <Button size="sm" variant="outline" disabled={!selectedArticles.size || isBulkAnalyzing} onClick={handleBulkSEOAnalysis}>
            {isBulkAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {isBulkAnalyzing ? `Otimizando... (${bulkAnalysisProgress}/${selectedArticles.size})` : `Análise SEO IA (${selectedArticles.size})`}
          </Button>
          <Button size="sm" variant="outline" disabled={!selectedArticles.size || isBulkGeneratingImages} onClick={handleBulkImageGeneration}>
            {isBulkGeneratingImages ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
            {isBulkGeneratingImages ? `Processando... (${bulkImageProgress}/${selectedArticles.size})` : `Gerar Imagens (${selectedArticles.size})`}
          </Button>
          <Button size="sm" variant="destructive" disabled={!selectedArticles.size || isDeleting} onClick={() => setShowDeleteDialog(true)}><Trash2 className="mr-2 h-4 w-4" />Excluir selecionados ({selectedArticles.size})</Button>
        </div>
      </section>

      <nav className="overflow-x-auto border-b bg-card px-6 py-3">
        <div className="flex items-center gap-2">
          {statusTabs.map((tab) => <button key={tab.value} onClick={() => updateFilter('status', tab.value)} className={cn('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors', filters.status === tab.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
            {tab.label}{tab.count > 0 && <span className="ml-2 rounded bg-muted/60 px-1.5 py-0.5 text-xs">{tab.count}</span>}
          </button>)}
          <button type="button" aria-label="Atualizar artigos" onClick={handleRefresh} disabled={isRefreshing} className="ml-2 rounded-lg p-2 hover:bg-muted disabled:opacity-50"><RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} /></button>
        </div>
      </nav>

      <main className="p-6">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {!articles.length && !isLoading ? (
            <div className="p-16 text-center"><FileText className="mx-auto mb-4 h-16 w-16 text-muted-foreground/40" /><h3 className="text-lg font-medium">Nenhum resultado encontrado</h3></div>
          ) : (
            <Table>
              <TableHeader><TableRow className="bg-muted/50">
                <TableHead className="w-12"><Checkbox checked={articles.length > 0 && selectedArticles.size === articles.length} onCheckedChange={toggleSelectAll} /></TableHead>
                <TableHead>Imagem</TableHead><TableHead>Título</TableHead><TableHead>Projeto Final</TableHead><TableHead>Status</TableHead><TableHead>Data/Hora</TableHead><TableHead className="w-16">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>{articles.map((article) => {
                const status = statusConfig[article.status] || statusConfig.draft;
                return <TableRow key={article.id} className={selectedArticles.has(article.id) ? 'bg-primary/5' : ''}>
                  <TableCell><Checkbox checked={selectedArticles.has(article.id)} onCheckedChange={() => toggleSelect(article.id)} /></TableCell>
                  <TableCell><div className="h-14 w-20 overflow-hidden rounded-lg bg-muted">{article.featured_image_url ? <img src={article.featured_image_url} alt={article.title || article.keyword || 'Imagem do artigo'} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>}</div></TableCell>
                  <TableCell><div className="max-w-lg space-y-1"><button type="button" onClick={() => navigate(`/articles/${article.id}`)} className="line-clamp-1 text-left text-sm font-medium hover:text-primary">{article.title || article.keyword}</button>{article.excerpt && <p className="line-clamp-2 text-xs text-muted-foreground">{article.excerpt}</p>}{article.emotional_trigger && <EmotionalTriggerBadge trigger={article.emotional_trigger} confidence={article.emotional_confidence} compact />}</div></TableCell>
                  <TableCell>{article.project_id ? <div className="flex items-center gap-2"><Folder className="h-4 w-4 text-amber-500" /><span className="max-w-36 truncate text-sm">{getProjectName(article.project_id) || 'Projeto'}</span></div> : <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell><Badge variant="outline" className={cn('gap-1.5', status.classes)}>{status.icon}{status.label}</Badge></TableCell>
                  <TableCell><div className="text-sm"><div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{format(new Date(article.created_at), 'dd/MM/yyyy', { locale: ptBR })}</div><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{format(new Date(article.created_at), 'HH:mm', { locale: ptBR })}</div></div></TableCell>
                  <TableCell><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="rounded p-1.5 hover:bg-muted"><MoreVertical className="h-4 w-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`/articles/${article.id}`)}><Eye className="mr-2 h-4 w-4" />Ver artigo</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate(`/articles/${article.id}/edit`)}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                    {article.published_url && <><DropdownMenuItem onClick={() => handleCopyLink(article.id)}><LinkIcon className="mr-2 h-4 w-4" />Copiar link</DropdownMenuItem><DropdownMenuItem asChild><a href={article.published_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Ver publicado</a></DropdownMenuItem></>}
                    <DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => deleteArticle.mutate(article.id)}><Trash2 className="mr-2 h-4 w-4" />Apagar</DropdownMenuItem>
                  </DropdownMenuContent></DropdownMenu></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          )}

          <div className="flex flex-col items-center justify-between gap-4 border-t bg-muted/30 px-6 py-4 sm:flex-row">
            <span className="text-sm text-muted-foreground">{selectedArticles.size} de {total} selecionado(s)</span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Página {filters.page} de {totalPages}</span>
              <Select value={String(filters.perPage)} onValueChange={(v) => updateFilter('perPage', Number(v))}><SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger><SelectContent>{[10, 20, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select>
              <div className="flex gap-1"><button type="button" onClick={() => updateFilter('page', Math.max(1, filters.page - 1))} disabled={filters.page <= 1} className="rounded p-1.5 hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => updateFilter('page', Math.min(totalPages, filters.page + 1))} disabled={filters.page >= totalPages} className="rounded p-1.5 hover:bg-muted disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div>
            </div>
          </div>
        </div>
      </main>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar exclusão em massa</AlertDialogTitle><AlertDialogDescription>Excluir {selectedArticles.size} artigo(s)? Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground">{isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {showPublishModal && <BulkPublishModal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        selectedArticles={Array.from(selectedArticles).map((id) => {
          const article = articles.find((a) => a.id === id);
          return { id, title: article?.title || '', project_id: article?.project_id || '', hasContent: article ? articleHasContent(article) : false, word_count: article?.word_count ?? 0 };
        })}
        projects={projects}
        onPublishComplete={async (result) => {
          setShowPublishModal(false);
          setSelectedArticles(new Set());
          toast({ title: 'Publicação concluída', description: `${result.success} sucesso(s), ${result.failed} falha(s).` });
          await refreshArticles();
        }}
      />}
    </div>
  );
}
