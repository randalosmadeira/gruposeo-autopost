import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bot, ExternalLink, FileEdit, History, Loader2, Plug, RefreshCw, Send, Sparkles, WandSparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type LatestArticle = {
  id: string;
  title: string | null;
  keyword: string;
  status: string;
  project_id: string | null;
  published_url: string | null;
  config: any;
};

export function ElectoralOperationsDock() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const db = supabase as any;
  const [article, setArticle] = useState<LatestArticle | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const visible = location.pathname.startsWith('/electoral-campaign') && !location.pathname.includes('/editorial-console') && !location.pathname.includes('/history');

  const loadLatest = useCallback(async () => {
    if (!visible || !user) return;
    const { data } = await db
      .from('articles')
      .select('id,title,keyword,status,project_id,published_url,config')
      .contains('config', { electoral: true })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setArticle((data || null) as LatestArticle | null);
  }, [db, user, visible]);

  useEffect(() => { void loadLatest(); }, [loadLatest, location.pathname]);

  if (!visible) return null;

  const runAi = async (action: 'reanalyze' | 'correct') => {
    if (!article) return;
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke('electoral-editorial-action', { body: { articleId: article.id, action } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Ação não concluída');
      toast({
        title: action === 'reanalyze' ? 'Reanálise eleitoral concluída' : 'Correção eleitoral concluída',
        description: action === 'reanalyze' ? `Score editorial: ${data.analysis?.score ?? '—'}/100.` : 'O texto foi corrigido e permanece sujeito à revisão humana.',
      });
      await loadLatest();
      if (action === 'reanalyze') navigate('/electoral-campaign/editorial-console');
    } catch (error) {
      toast({ title: 'Falha na ação editorial', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const publish = async () => {
    if (!article?.project_id) return toast({ title: 'Projeto WordPress de destino não definido.', variant: 'destructive' });
    if (article.config?.complianceSnapshot?.canPublish !== true) return toast({ title: 'Publicação bloqueada: compliance pendente.', variant: 'destructive' });
    setBusy('publish');
    try {
      const { data, error } = await supabase.functions.invoke('publish-to-wordpress', { body: { articleId: article.id, projectId: article.project_id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: article.status === 'published' ? 'Republicação concluída' : 'Publicação concluída' });
      await loadLatest();
    } catch (error) {
      toast({ title: 'Falha na publicação', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const canPublish = Boolean(article?.project_id && article?.config?.complianceSnapshot?.canPublish === true);

  return (
    <div className="border-b border-[#263541] bg-[#0d151b]/95 px-4 py-2.5 backdrop-blur md:px-6">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Badge className="shrink-0 border-[#D4FF00]/30 bg-[#D4FF00]/10 text-[#D4FF00]">OPERAÇÃO ELEITORAL</Badge>
          <span className="truncate text-xs text-slate-400">{article ? `Última peça: ${article.title || article.keyword}` : 'Nenhuma peça eleitoral salva ainda.'}</span>
          {article && <Badge variant="outline" className="shrink-0 text-[10px]">{article.status}</Badge>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" asChild><Link to="/electoral-campaign"><Sparkles className="mr-1 h-3.5 w-3.5" /> Produzir</Link></Button>
          <Button size="sm" variant="outline" asChild><Link to="/electoral-campaign/editorial-console"><History className="mr-1 h-3.5 w-3.5" /> Histórico / Operações</Link></Button>
          <Button size="sm" variant="outline" asChild><Link to="/wordpress-plugin#electoral-plugin"><Plug className="mr-1 h-3.5 w-3.5" /> Plugin</Link></Button>
          {article && <>
            <Button size="sm" variant="outline" onClick={() => navigate(`/articles/${article.id}/edit`)}><FileEdit className="mr-1 h-3.5 w-3.5" /> Manual</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void runAi('reanalyze')}>{busy === 'reanalyze' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Bot className="mr-1 h-3.5 w-3.5" />} Reanalisar</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void runAi('correct')}>{busy === 'correct' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="mr-1 h-3.5 w-3.5" />} Corrigir</Button>
            <Button size="sm" disabled={!!busy || !canPublish} onClick={() => void publish()}>{busy === 'publish' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />} {article.status === 'published' ? 'Republicar' : 'Publicar'}</Button>
            {article.published_url && <Button size="sm" variant="ghost" asChild><a href={article.published_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>}
          </>}
          <Button size="sm" variant="ghost" onClick={() => void loadLatest()}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}
