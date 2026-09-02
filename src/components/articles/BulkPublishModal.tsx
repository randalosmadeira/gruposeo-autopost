import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AlertCircle, Check, CheckCircle2, Globe, Loader2, RefreshCw, Search, Tag, Upload, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

type Step = 'destination' | 'categories' | 'publishing';
type HealthState = 'idle' | 'checking' | 'online' | 'offline';
type PublishState = 'waiting' | 'publishing' | 'success' | 'error';

type Project = {
  id: string;
  name: string;
  domain: string;
  wordpress_url?: string | null;
};

type Category = {
  id: number;
  name: string;
  slug?: string;
  count?: number;
};

type SiteHealth = {
  status: HealthState;
  message: string;
  latency?: number;
};

type SiteCategories = {
  loading: boolean;
  items: Category[];
  error?: string;
};

type PublicationRow = {
  key: string;
  articleId: string;
  articleTitle: string;
  projectId: string;
  projectName: string;
  status: PublishState;
  error?: string;
  url?: string;
};

interface BulkPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedArticles: Array<{ id: string; title: string | null; project_id: string | null; hasContent?: boolean; word_count?: number }>;
  projects: Project[];
  onPublishComplete: (result: { success: number; failed: number }) => void;
}

async function extractInvokeError(error: unknown, data: any, fallback: string) {
  const fromData = String(data?.error || data?.message || '').trim();
  if (fromData) return fromData;
  const candidate = error as { message?: string; context?: Response } | null;
  const response = candidate?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      const message = String(payload?.error || payload?.message || payload?.hint || '').trim();
      if (message) return message;
    } catch {
      try {
        const text = await response.clone().text();
        if (text && !text.trim().startsWith('<')) return text.slice(0, 400);
      } catch {
        // Ignore body parsing failures and use the SDK message below.
      }
    }
  }
  const sdkMessage = String(candidate?.message || '').trim();
  if (sdkMessage && sdkMessage !== 'Edge Function returned a non-2xx status code') return sdkMessage;
  return fallback;
}

export function BulkPublishModal({ isOpen, onClose, selectedArticles, projects, onPublishComplete }: BulkPublishModalProps) {
  const [step, setStep] = useState<Step>('destination');
  const [siteSearch, setSiteSearch] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [siteHealth, setSiteHealth] = useState<Record<string, SiteHealth>>({});
  const [siteCategories, setSiteCategories] = useState<Record<string, SiteCategories>>({});
  const [selectedCategories, setSelectedCategories] = useState<Record<string, number[]>>({});
  const [rows, setRows] = useState<PublicationRow[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [autoProjects, setAutoProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState('');

  const readyArticles = useMemo(() => selectedArticles.filter((article) => article.hasContent !== false), [selectedArticles]);
  const skippedArticles = useMemo(() => selectedArticles.filter((article) => article.hasContent === false), [selectedArticles]);
  const resolvedProjects = useMemo(() => {
    const merged = new Map<string, Project>();
    for (const project of projects) merged.set(project.id, project);
    for (const project of autoProjects) merged.set(project.id, { ...merged.get(project.id), ...project });
    return [...merged.values()];
  }, [projects, autoProjects]);
  const wordpressSites = useMemo(() => resolvedProjects.filter((project) => project.wordpress_url || project.domain), [resolvedProjects]);
  const filteredSites = useMemo(() => {
    const query = siteSearch.trim().toLowerCase();
    if (!query) return wordpressSites;
    return wordpressSites.filter((site) => `${site.name} ${site.domain} ${site.wordpress_url || ''}`.toLowerCase().includes(query));
  }, [wordpressSites, siteSearch]);
  const selectedSites = useMemo(() => wordpressSites.filter((site) => selectedProjectIds.includes(site.id)), [wordpressSites, selectedProjectIds]);
  const selectedHealth = selectedSites.map((site) => siteHealth[site.id]?.status || 'idle');
  const hasChecking = selectedHealth.includes('checking') || selectedHealth.includes('idle');
  const hasOffline = selectedHealth.includes('offline');
  const canContinueDestination = selectedSites.length > 0 && !hasChecking && !hasOffline && readyArticles.length > 0;
  const totalPublications = readyArticles.length * selectedSites.length;
  const successCount = rows.filter((row) => row.status === 'success').length;
  const failedCount = rows.filter((row) => row.status === 'error').length;

  useEffect(() => {
    if (!isOpen) return;
    setStep('destination');
    setSiteSearch('');
    setSelectedProjectIds([]);
    setSiteHealth({});
    setSiteCategories({});
    setSelectedCategories({});
    setRows([]);
    setIsPublishing(false);
    setProjectLoadError('');
  }, [isOpen, selectedArticles]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingProjects(true);
    setProjectLoadError('');
    void supabase
      .from('projects')
      .select('id,name,domain,wordpress_url')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setProjectLoadError('Não foi possível atualizar automaticamente a lista de projetos WordPress. Foi mantida a lista já carregada na tela.');
          return;
        }
        const normalized: Project[] = (data || []).map((item) => ({
          id: String(item.id),
          name: String(item.name || item.wordpress_url || item.domain || 'Projeto WordPress'),
          domain: String(item.domain || item.wordpress_url || ''),
          wordpress_url: item.wordpress_url ? String(item.wordpress_url) : null,
        }));
        setAutoProjects(normalized);
      })
      .catch(() => {
        if (!cancelled) setProjectLoadError('Não foi possível atualizar automaticamente a lista de projetos WordPress. Foi mantida a lista já carregada na tela.');
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  const checkSite = async (projectId: string) => {
    const startedAt = Date.now();
    setSiteHealth((current) => ({ ...current, [projectId]: { status: 'checking', message: 'Verificando conexão...' } }));
    try {
      const { data, error } = await supabase.functions.invoke('test-wordpress-connection', {
        body: { project_id: projectId },
      });
      const latency = Date.now() - startedAt;
      if (error || !data?.success || data?.canPublish === false) {
        const message = await extractInvokeError(error, data, 'O conector WordPress não respondeu corretamente.');
        setSiteHealth((current) => ({ ...current, [projectId]: { status: 'offline', message, latency } }));
        return false;
      }
      const label = data?.pluginVersion ? `Zica Posts ${data.pluginVersion}` : 'WordPress conectado';
      setSiteHealth((current) => ({ ...current, [projectId]: { status: 'online', message: label, latency } }));
      return true;
    } catch (error) {
      const latency = Date.now() - startedAt;
      setSiteHealth((current) => ({ ...current, [projectId]: { status: 'offline', message: error instanceof Error ? error.message : 'Falha de conexão', latency } }));
      return false;
    }
  };

  const loadCategories = async (projectId: string) => {
    setSiteCategories((current) => ({ ...current, [projectId]: { loading: true, items: current[projectId]?.items || [] } }));
    try {
      const { data, error } = await supabase.functions.invoke('wordpress-api', {
        body: { action: 'get-categories', projectId, perPage: 100 },
      });
      if (error || !data?.success) {
        const message = await extractInvokeError(error, data, 'Não foi possível carregar as categorias deste WordPress.');
        setSiteCategories((current) => ({ ...current, [projectId]: { loading: false, items: [], error: message } }));
        return;
      }
      const items = Array.isArray(data?.data) ? data.data : [];
      setSiteCategories((current) => ({ ...current, [projectId]: { loading: false, items } }));
    } catch (error) {
      setSiteCategories((current) => ({
        ...current,
        [projectId]: { loading: false, items: [], error: error instanceof Error ? error.message : 'Falha ao carregar categorias' },
      }));
    }
  };

  const toggleSite = async (projectId: string) => {
    if (selectedProjectIds.includes(projectId)) {
      setSelectedProjectIds((current) => current.filter((id) => id !== projectId));
      return;
    }
    setSelectedProjectIds((current) => [...current, projectId]);
    setSelectedCategories((current) => ({ ...current, [projectId]: current[projectId] || [] }));
    await Promise.all([checkSite(projectId), loadCategories(projectId)]);
  };

  const retrySite = async (projectId: string) => {
    await Promise.all([checkSite(projectId), loadCategories(projectId)]);
  };

  const toggleCategory = (projectId: string, categoryId: number) => {
    setSelectedCategories((current) => {
      const values = current[projectId] || [];
      return {
        ...current,
        [projectId]: values.includes(categoryId) ? values.filter((id) => id !== categoryId) : [...values, categoryId],
      };
    });
  };

  const publishOne = async (row: PublicationRow) => {
    setRows((current) => current.map((item) => item.key === row.key ? { ...item, status: 'publishing', error: undefined } : item));
    try {
      const { data, error } = await supabase.functions.invoke('publish-to-wordpress', {
        body: {
          articleId: row.articleId,
          projectId: row.projectId,
          publishStatus: 'publish',
          requireFeaturedImage: false,
          allowCrossProject: true,
          categories: selectedCategories[row.projectId] || [],
        },
      });
      if (error || !data?.success) {
        const message = await extractInvokeError(error, data, 'Falha ao publicar no WordPress.');
        setRows((current) => current.map((item) => item.key === row.key ? { ...item, status: 'error', error: message } : item));
        return false;
      }
      setRows((current) => current.map((item) => item.key === row.key ? { ...item, status: 'success', url: data.postUrl } : item));
      return true;
    } catch (error) {
      setRows((current) => current.map((item) => item.key === row.key ? { ...item, status: 'error', error: error instanceof Error ? error.message : 'Erro inesperado' } : item));
      return false;
    }
  };

  const startPublishing = async (retryOnly = false) => {
    if (!navigator.onLine) return;
    setStep('publishing');
    setIsPublishing(true);

    let publications = rows;
    if (!retryOnly || rows.length === 0) {
      publications = readyArticles.flatMap((article) => selectedSites.map((site) => ({
        key: `${article.id}:${site.id}`,
        articleId: article.id,
        articleTitle: article.title || 'Sem título',
        projectId: site.id,
        projectName: site.name,
        status: 'waiting' as PublishState,
      })));
      setRows(publications);
    } else {
      publications = rows.filter((row) => row.status === 'error');
      setRows((current) => current.map((row) => row.status === 'error' ? { ...row, status: 'waiting', error: undefined } : row));
    }

    let success = retryOnly ? rows.filter((row) => row.status === 'success').length : 0;
    let failed = 0;
    for (const publication of publications) {
      const ok = await publishOne(publication);
      if (ok) success += 1;
      else failed += 1;
    }
    setIsPublishing(false);
    const currentFailed = retryOnly ? rows.filter((row) => row.status !== 'success').length : failed;
    onPublishComplete({ success, failed: currentFailed });
  };

  const statusBadge = (health: SiteHealth | undefined) => {
    const status = health?.status || 'idle';
    if (status === 'checking' || status === 'idle') return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando</Badge>;
    if (status === 'online') return <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Online</Badge>;
    return <Badge className="gap-1 border-red-500/30 bg-red-500/10 text-red-400"><WifiOff className="h-3 w-3" /> Offline</Badge>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isPublishing && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden border-border bg-background p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary"><Upload className="h-5 w-5" /></div>
            <div className="flex-1">
              <DialogTitle>Publicar artigos em massa</DialogTitle>
              <DialogDescription>
                {readyArticles.length} artigo(s) pronto(s). Selecione um ou vários sites WordPress para publicar em paralelo lógico e com rastreio por destino.
              </DialogDescription>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 text-sm">
            {(['destination', 'categories', 'publishing'] as Step[]).map((item, index) => {
              const active = step === item;
              const passed = (step === 'categories' && index === 0) || (step === 'publishing' && index < 2);
              return <div key={item} className="flex items-center gap-2"><div className={cn('flex h-8 w-8 items-center justify-center rounded-full border font-semibold', active ? 'border-primary bg-primary text-primary-foreground' : passed ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>{passed ? <Check className="h-4 w-4" /> : index + 1}</div>{index < 2 && <div className="h-px w-10 bg-border" />}</div>;
            })}
          </div>
        </DialogHeader>

        <div className="max-h-[66vh] overflow-y-auto px-6 py-5">
          {skippedArticles.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-300">
              {skippedArticles.length} artigo(s) sem conteúdo foram retirados deste lote automaticamente.
            </div>
          )}

          {step === 'destination' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Sites WordPress</p>
                  <p className="text-sm text-muted-foreground">A lista é atualizada automaticamente ao abrir esta janela. Cada destino selecionado é validado individualmente.</p>
                </div>
                <Badge variant="outline">{selectedSites.length} selecionado(s)</Badge>
              </div>
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={siteSearch} onChange={(event) => setSiteSearch(event.target.value)} placeholder="Buscar site..." className="pl-9" /></div>
              {loadingProjects && <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Atualizando projetos WordPress...</div>}
              {projectLoadError && <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-300">{projectLoadError}</div>}
              {!loadingProjects && filteredSites.length === 0 && <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">Nenhum projeto WordPress configurado foi encontrado para esta conta.</div>}
              <div className="space-y-2">
                {filteredSites.map((site) => {
                  const checked = selectedProjectIds.includes(site.id);
                  const health = siteHealth[site.id];
                  return (
                    <div key={site.id} className={cn('rounded-xl border p-4 transition-colors', checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                      <div className="flex items-start gap-3">
                        <Checkbox checked={checked} onCheckedChange={() => void toggleSite(site.id)} className="mt-1" />
                        <button type="button" onClick={() => void toggleSite(site.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                          <Globe className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                          <span className="min-w-0"><span className="block font-semibold">{site.name}</span><span className="block truncate text-sm text-muted-foreground">{site.wordpress_url || site.domain}</span></span>
                        </button>
                        {checked && statusBadge(health)}
                      </div>
                      {checked && health && (
                        <div className={cn('mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs', health.status === 'offline' ? 'bg-red-500/10 text-red-300' : 'bg-muted/50 text-muted-foreground')}>
                          <span>{health.message}{typeof health.latency === 'number' ? ` · ${health.latency}ms` : ''}</span>
                          {health.status === 'offline' && <Button variant="ghost" size="sm" onClick={() => void retrySite(site.id)}><RefreshCw className="mr-1 h-3 w-3" /> Testar novamente</Button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {hasOffline && <div className="flex gap-2 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />Há destino selecionado sem conexão. Remova-o do lote ou corrija a conexão antes de continuar.</div>}
            </div>
          )}

          {step === 'categories' && (
            <div className="space-y-4">
              <div><p className="font-semibold">Categorias por destino</p><p className="text-sm text-muted-foreground">Os IDs de categoria variam entre WordPress. Por isso a seleção é feita separadamente para cada site.</p></div>
              {selectedSites.map((site) => {
                const state = siteCategories[site.id];
                const selected = selectedCategories[site.id] || [];
                return (
                  <div key={site.id} className="rounded-xl border border-border p-4">
                    <div className="mb-3 flex items-center justify-between gap-3"><div><p className="font-semibold">{site.name}</p><p className="text-xs text-muted-foreground">{site.wordpress_url || site.domain}</p></div>{statusBadge(siteHealth[site.id])}</div>
                    {state?.loading ? <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando categorias...</div> : state?.error ? <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-300">Categorias indisponíveis: {state.error}. A publicação ainda pode seguir sem categoria.</div> : state?.items?.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{state.items.map((category) => <label key={category.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/40"><Checkbox checked={selected.includes(category.id)} onCheckedChange={() => toggleCategory(site.id, category.id)} /><Tag className="h-3.5 w-3.5 text-primary" /><span className="truncate">{category.name}</span></label>)}</div> : <p className="py-3 text-sm text-muted-foreground">Nenhuma categoria encontrada. O artigo será publicado sem categoria adicional.</p>}
                  </div>
                );
              })}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"><strong>{totalPublications}</strong> publicação(ões) serão executadas, {readyArticles.length} artigo(s) × {selectedSites.length} site(s).</div>
            </div>
          )}

          {step === 'publishing' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between"><div><p className="font-semibold">Execução por destino</p><p className="text-sm text-muted-foreground">Cada publicação possui status próprio. Uma falha em um site não cancela os demais.</p></div><div className="flex gap-2"><Badge className="bg-emerald-500/10 text-emerald-400">{successCount} sucesso</Badge><Badge className="bg-red-500/10 text-red-400">{failedCount} falha</Badge></div></div>
              {rows.map((row) => <div key={row.key} className="rounded-xl border border-border p-3"><div className="flex items-start gap-3"><div className="mt-0.5">{row.status === 'publishing' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : row.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : row.status === 'error' ? <AlertCircle className="h-4 w-4 text-red-400" /> : <div className="h-4 w-4 rounded-full border border-border" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{row.articleTitle}</p><p className="text-xs text-muted-foreground">{row.projectName}</p>{row.error && <p className="mt-1 text-xs text-red-400">{row.error}</p>}{row.url && <a className="mt-1 block truncate text-xs text-primary hover:underline" href={row.url} target="_blank" rel="noreferrer">{row.url}</a>}</div></div></div>)}
              {!isPublishing && failedCount > 0 && <Button variant="outline" onClick={() => void startPublishing(true)}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente somente as falhas</Button>}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">{step === 'destination' ? `${readyArticles.length} artigo(s) · ${selectedSites.length} destino(s)` : step === 'categories' ? `${totalPublications} publicação(ões) no lote` : isPublishing ? 'Publicando...' : `${successCount} concluída(s), ${failedCount} falha(s)`}</div>
            <div className="flex gap-2">
              {step !== 'publishing' && <Button variant="outline" onClick={step === 'destination' ? onClose : () => setStep('destination')}>Cancelar</Button>}
              {step === 'destination' && <Button disabled={!canContinueDestination} onClick={() => setStep('categories')}><Upload className="mr-2 h-4 w-4" /> Continuar</Button>}
              {step === 'categories' && <Button disabled={totalPublications === 0} onClick={() => void startPublishing(false)}><Upload className="mr-2 h-4 w-4" /> Publicar em {selectedSites.length} site(s)</Button>}
              {step === 'publishing' && !isPublishing && <Button onClick={onClose}>Concluir</Button>}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
