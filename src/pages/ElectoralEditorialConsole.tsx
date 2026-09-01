import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle, Bot, CheckCircle2, ExternalLink, FileEdit, FilePlus2, Globe2,
  History, Loader2, RefreshCw, Search, Send, ShieldCheck, Sparkles, WandSparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const PRESET = 'madeira-1470-sp-2026';

type ElectoralArticle = {
  id: string;
  title: string | null;
  keyword: string;
  status: string;
  project_id: string | null;
  published_at: string | null;
  published_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  word_count: number | null;
  seo_score: number | null;
  config: any;
};

type ReviewResult = {
  score?: number;
  ready_for_human_review?: boolean;
  summary?: string;
  factual_risks?: string[];
  missing_sources?: string[];
  compliance_risks?: string[];
  technical_errors?: string[];
  structure_issues?: string[];
  recommended_corrections?: string[];
};

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  generating: 'Em produção',
  ready: 'Pronto',
  published: 'Publicado',
  error: 'Erro',
  scheduled: 'Agendado',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function complianceReady(article: ElectoralArticle) {
  return article.config?.complianceSnapshot?.canPublish === true;
}

export default function ElectoralEditorialConsole() {
  const { user } = useAuth();
  const { projects } = useProjects();
  const { toast } = useToast();
  const navigate = useNavigate();
  const db = supabase as any;

  const [articles, setArticles] = useState<ElectoralArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [projectId, setProjectId] = useState('all');
  const [review, setReview] = useState<{ article: ElectoralArticle; analysis: ReviewResult } | null>(null);

  const [manualTitle, setManualTitle] = useState('');
  const [manualKeyword, setManualKeyword] = useState('');
  const [manualProjectId, setManualProjectId] = useState('');
  const [creatingManual, setCreatingManual] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      let query = db
        .from('articles')
        .select('id,title,keyword,status,project_id,published_at,published_url,error_message,created_at,updated_at,word_count,seo_score,config')
        .contains('config', { electoral: true })
        .order('updated_at', { ascending: false })
        .limit(250);

      if (status !== 'all') query = query.eq('status', status);
      if (projectId !== 'all') query = query.eq('project_id', projectId);
      if (search.trim()) {
        const term = search.trim().replace(/[,%()]/g, ' ');
        query = query.or(`title.ilike.%${term}%,keyword.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setArticles((data || []) as ElectoralArticle[]);
    } catch (error) {
      toast({ title: 'Falha ao carregar histórico eleitoral', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, projectId, search, status, toast, user]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: articles.length };
    for (const article of articles) result[article.status] = (result[article.status] || 0) + 1;
    return result;
  }, [articles]);

  const projectName = useCallback((id: string | null) => {
    if (!id) return 'Sem destino';
    return projects.find((project) => project.id === id)?.name || 'Projeto não localizado';
  }, [projects]);

  const refresh = async () => {
    setRefreshing(true);
    await load(true);
  };

  const createManualDraft = async () => {
    if (!user) return;
    const title = manualTitle.trim();
    const keyword = manualKeyword.trim() || title;
    if (title.length < 5) {
      toast({ title: 'Informe um título para o rascunho manual.', variant: 'destructive' });
      return;
    }
    setCreatingManual(true);
    try {
      const initialContent = `<article data-electoral-draft="true" data-manual-draft="true"><p><strong>RASCUNHO ELEITORAL MANUAL — REVISÃO HUMANA OBRIGATÓRIA</strong></p><h1>${title.replace(/[<>&]/g, '')}</h1><p>[VERIFICAR] Desenvolva o conteúdo factual e inclua as fontes primárias antes da publicação.</p></article>`;
      const { data, error } = await db.from('articles').insert({
        user_id: user.id,
        project_id: manualProjectId || null,
        keyword,
        title,
        content: initialContent,
        type: 'blog',
        status: 'draft',
        word_count: 13,
        config: {
          electoral: true,
          campaignPresetId: PRESET,
          manualDraft: true,
          complianceSnapshot: { canPublish: false, blockers: ['Revisão de compliance pendente'] },
          createdFrom: 'electoral-editorial-console',
        },
      }).select('id').single();
      if (error) throw error;
      setManualTitle('');
      setManualKeyword('');
      toast({ title: 'Rascunho eleitoral manual criado.' });
      navigate(`/articles/${data.id}/edit`);
    } catch (error) {
      toast({ title: 'Falha ao criar rascunho', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setCreatingManual(false);
    }
  };

  const runAi = async (article: ElectoralArticle, action: 'reanalyze' | 'correct') => {
    setBusy(`${action}:${article.id}`);
    try {
      const { data, error } = await supabase.functions.invoke('electoral-editorial-action', {
        body: { articleId: article.id, action },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'A ação de IA não foi concluída.');
      if (action === 'reanalyze') {
        setReview({ article, analysis: data.analysis || {} });
        toast({ title: 'Reanálise editorial concluída', description: `Score: ${data.analysis?.score ?? '—'}/100. Nenhuma publicação foi realizada.` });
      } else {
        toast({ title: 'Correção editorial concluída', description: 'O conteúdo voltou para revisão humana e não foi republicado automaticamente.' });
      }
      await load(true);
    } catch (error) {
      toast({ title: action === 'reanalyze' ? 'Falha na reanálise' : 'Falha na correção', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const publish = async (article: ElectoralArticle) => {
    if (!article.project_id) {
      toast({ title: 'Defina um projeto WordPress de destino antes de publicar.', variant: 'destructive' });
      return;
    }
    if (!complianceReady(article)) {
      toast({ title: 'Publicação bloqueada pelo compliance', description: 'Abra o módulo eleitoral, revise os gates e gere/salve um snapshot liberado antes da publicação.', variant: 'destructive' });
      return;
    }
    setBusy(`publish:${article.id}`);
    try {
      const { data, error } = await supabase.functions.invoke('publish-to-wordpress', {
        body: { articleId: article.id, projectId: article.project_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: article.status === 'published' ? 'Republicação solicitada' : 'Publicação concluída', description: 'O histórico será atualizado com a URL retornada pelo WordPress.' });
      await load(true);
    } catch (error) {
      toast({ title: 'Falha na publicação', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black"><History className="h-6 w-6" /> Central Editorial Eleitoral</h1>
          <p className="mt-1 text-sm text-muted-foreground">Histórico, produção, revisão humana, auditoria por IA, correção e publicação das peças eleitorais em uma única tela.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link to="/electoral-campaign"><Sparkles className="mr-2 h-4 w-4" /> Produzir com IA</Link></Button>
          <Button asChild variant="outline"><Link to="/electoral-campaign/portal-network"><Globe2 className="mr-2 h-4 w-4" /> Rede Eleitoral</Link></Button>
          <Button asChild><Link to="/wordpress-plugin#electoral-plugin">Plugin Eleitoral</Link></Button>
        </div>
      </div>

      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex gap-3 p-4 text-sm"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Ações de IA deste painel são editoriais:</strong> analisam factualidade, fontes, estrutura, compliance e erros técnicos. Não recomendam voto, não criam perfil de eleitor e não fazem personalização persuasiva por localização. Toda correção exige revisão humana antes de publicação.</div></CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {['all', 'draft', 'ready', 'published', 'error', 'generating'].map((key) => (
          <Card key={key} className={status === key ? 'border-primary' : ''} onClick={() => setStatus(key)}>
            <CardContent className="cursor-pointer p-4"><div className="text-2xl font-black">{counts[key] || 0}</div><div className="text-xs text-muted-foreground">{key === 'all' ? 'Total exibido' : statusLabels[key] || key}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FilePlus2 className="h-5 w-5" /> Produção manual</CardTitle><CardDescription>Cria uma peça eleitoral vazia e abre o editor manual. O rascunho nasce bloqueado para publicação até passar pelos gates de compliance.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div><Label>Título *</Label><Input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Título da peça" /></div>
          <div><Label>Pauta/palavra-chave</Label><Input value={manualKeyword} onChange={(e) => setManualKeyword(e.target.value)} placeholder="Pauta factual" /></div>
          <div><Label>Projeto WordPress</Label><Select value={manualProjectId} onValueChange={setManualProjectId}><SelectTrigger><SelectValue placeholder="Definir depois" /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-end"><Button className="w-full" onClick={() => void createManualDraft()} disabled={creatingManual}>{creatingManual ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileEdit className="mr-2 h-4 w-4" />} Criar e editar</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico e fila operacional</CardTitle><CardDescription>Data, título, destino, URL publicada, status, erros e ações do ciclo editorial.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px_auto]">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar título ou pauta" /></div>
            <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{Object.entries(statusLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
            <Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os destinos</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select>
            <Button variant="outline" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Atualizar</Button>
          </div>

          {loading ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin" /></div> : articles.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhuma peça eleitoral encontrada com os filtros atuais. As próximas produções aparecerão aqui automaticamente.</div>
          ) : (
            <div className="space-y-3">
              {articles.map((article) => {
                const latestReview = article.config?.electoralEditorialReview as ReviewResult | undefined;
                const isBusy = Boolean(busy?.endsWith(article.id));
                return (
                  <div key={article.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="truncate text-sm">{article.title || article.keyword}</strong>
                          <Badge variant={article.status === 'published' ? 'default' : article.status === 'error' ? 'destructive' : 'outline'}>{statusLabels[article.status] || article.status}</Badge>
                          <Badge variant={complianceReady(article) ? 'default' : 'outline'}>{complianceReady(article) ? 'Compliance liberado' : 'Compliance pendente'}</Badge>
                          {latestReview?.score != null && <Badge variant="secondary">IA {latestReview.score}/100</Badge>}
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                          <div><strong>Criação:</strong> {formatDate(article.created_at)}</div>
                          <div><strong>Atualização:</strong> {formatDate(article.updated_at)}</div>
                          <div><strong>Publicação:</strong> {formatDate(article.published_at)}</div>
                          <div><strong>Destino:</strong> {projectName(article.project_id)}</div>
                        </div>
                        <div className="mt-2 text-xs"><strong>Pauta:</strong> {article.keyword || '—'} · <strong>Palavras:</strong> {article.word_count ?? 0}</div>
                        {article.published_url && <a className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary underline" href={article.published_url} target="_blank" rel="noreferrer">{article.published_url}<ExternalLink className="h-3 w-3 shrink-0" /></a>}
                        {article.error_message && <div className="mt-2 flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /> {article.error_message}</div>}
                      </div>
                      <div className="flex flex-wrap gap-2 xl:max-w-[510px] xl:justify-end">
                        <Button size="sm" variant="outline" asChild><Link to={`/articles/${article.id}`}>Visualizar</Link></Button>
                        <Button size="sm" variant="outline" onClick={() => navigate(`/articles/${article.id}/edit`)}><FileEdit className="mr-1 h-4 w-4" /> Editar manual</Button>
                        <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void runAi(article, 'reanalyze')}><Bot className="mr-1 h-4 w-4" /> Reanalisar IA</Button>
                        <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void runAi(article, 'correct')}><WandSparkles className="mr-1 h-4 w-4" /> Corrigir IA</Button>
                        <Button size="sm" disabled={isBusy || !article.project_id || !complianceReady(article)} onClick={() => void publish(article)}><Send className="mr-1 h-4 w-4" /> {article.status === 'published' ? 'Republicar' : 'Publicar'}</Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {review && (
        <Card className="border-primary/30">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5" /> Última reanálise — {review.article.title || review.article.keyword}</CardTitle><CardDescription>A IA não publicou nem alterou o conteúdo durante esta ação.</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2"><Badge>{review.analysis.score ?? '—'}/100</Badge><Badge variant="outline">{review.analysis.ready_for_human_review ? 'Pronto para revisão humana' : 'Correções recomendadas'}</Badge></div>
            {review.analysis.summary && <p>{review.analysis.summary}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ['Riscos factuais', review.analysis.factual_risks],
                ['Fontes ausentes', review.analysis.missing_sources],
                ['Compliance', review.analysis.compliance_risks],
                ['Erros técnicos', review.analysis.technical_errors],
                ['Estrutura', review.analysis.structure_issues],
                ['Correções recomendadas', review.analysis.recommended_corrections],
              ].map(([label, values]) => <div key={String(label)} className="rounded-md border p-3"><strong>{String(label)}</strong>{Array.isArray(values) && values.length ? values.map((value) => <div key={value} className="mt-1 text-xs text-muted-foreground">• {value}</div>) : <div className="mt-1 text-xs text-muted-foreground">Nenhum apontamento.</div>}</div>)}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
