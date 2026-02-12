import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

import { useToast } from '@/hooks/use-toast';
import type { SyncProgress, SyncLogEntry } from '@/components/internal-linking/SyncProgressPanel';

export interface IndexedArticle {
  id: string;
  wp_post_id: number;
  wp_post_url: string;
  wp_post_title: string;
  primary_keyword: string | null;
  secondary_keywords: string[];
  topic_cluster: string | null;
  linkability_score: number;
  semantic_summary: string | null;
}

export interface LinkSuggestion {
  article_id: string | null;
  url: string;
  anchor_text: string;
  relevance_score: number;
  position: 'introduction' | 'body' | 'conclusion';
  reason?: string;
  is_rule?: boolean;
}

export interface TopicCluster {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  article_count: number;
  cluster_strength: number;
  primary_keywords: string[];
}

export interface KeywordRule {
  id: string;
  keyword: string;
  match_type: 'exact' | 'partial' | 'regex';
  target_url: string;
  target_title: string | null;
  max_links_per_article: number;
  is_active: boolean;
  times_applied: number;
}

const initialSyncProgress: SyncProgress = {
  phase: 'idle',
  total: 0,
  fetched: 0,
  analyzed: 0,
  analyzedWithAI: 0,
  analyzedBasic: 0,
  indexed: 0,
  skipped: 0,
  errors: 0,
  logs: [],
  aiStatus: 'ok',
};

export interface SyncState {
  pluginNotFound: boolean;
  usedFallback: boolean;
  fallbackReason?: string;
}

export function useInternalLinking(projectId: string | null) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [indexedArticles, setIndexedArticles] = useState<IndexedArticle[]>([]);
  const [topicClusters, setTopicClusters] = useState<TopicCluster[]>([]);
  const [keywordRules, setKeywordRules] = useState<KeywordRule[]>([]);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(initialSyncProgress);
  const [syncState, setSyncState] = useState<SyncState>({
    pluginNotFound: false,
    usedFallback: false,
  });

  const addLog = useCallback((type: SyncLogEntry['type'], message: string, articleTitle?: string) => {
    setSyncProgress(prev => ({
      ...prev,
      logs: [...prev.logs, { timestamp: new Date(), type, message, articleTitle }],
    }));
  }, []);

  // Fetch indexed articles for a project
  const fetchIndexedArticles = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('wordpress_article_index')
        .select('id, wp_post_id, wp_post_url, wp_post_title, primary_keyword, secondary_keywords, topic_cluster, linkability_score, semantic_summary')
        .eq('project_id', projectId)
        .eq('sync_status', 'synced')
        .order('linkability_score', { ascending: false });

      if (error) throw error;
      setIndexedArticles(data || []);
    } catch (error) {
      console.error('Error fetching indexed articles:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os artigos indexados.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  // Fetch topic clusters
  const fetchTopicClusters = useCallback(async () => {
    if (!projectId) return;

    try {
      const { data, error } = await supabase
        .from('topic_clusters')
        .select('id, name, slug, description, article_count, cluster_strength, primary_keywords')
        .eq('project_id', projectId)
        .order('cluster_strength', { ascending: false });

      if (error) throw error;
      setTopicClusters(data || []);
    } catch (error) {
      console.error('Error fetching topic clusters:', error);
    }
  }, [projectId]);

  // Fetch keyword rules
  const fetchKeywordRules = useCallback(async () => {
    if (!projectId) return;

    try {
      const { data, error } = await supabase
        .from('keyword_link_rules')
        .select('*')
        .eq('project_id', projectId)
        .order('priority', { ascending: false });

      if (error) throw error;
      
      // Cast match_type to the expected type
      const typedData = (data || []).map(rule => ({
        ...rule,
        match_type: rule.match_type as 'exact' | 'partial' | 'regex',
      }));
      setKeywordRules(typedData);
    } catch (error) {
      console.error('Error fetching keyword rules:', error);
    }
  }, [projectId]);

  // Get link suggestions for content
  const getLinkSuggestions = useCallback(async (
    keyword: string,
    content?: string,
    maxLinks: number = 10
  ): Promise<LinkSuggestion[]> => {
    if (!projectId) return [];

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Usuário não autenticado');
      }

      const response = await supabase.functions.invoke('analyze-wp-articles', {
        body: {
          action: 'get_link_suggestions',
          project_id: projectId,
          keyword,
          content,
          max_links: maxLinks,
        },
      });

      if (response.error) throw response.error;
      return response.data?.suggestions || [];
    } catch (error) {
      console.error('Error getting link suggestions:', error);
      return [];
    }
  }, [projectId]);

  // Trigger sync from WordPress
  const triggerSync = useCallback(async (fullSync: boolean = false, useFallback: boolean = false) => {
    if (!projectId) return;

    setIsSyncing(true);
    setSyncState(prev => ({ ...prev, pluginNotFound: false }));
    setSyncProgress({
      phase: 'fetching',
      total: 0,
      fetched: 0,
      analyzed: 0,
      indexed: 0,
      skipped: 0,
      errors: 0,
      logs: [],
    });
    
    try {
      // Get project details to find WordPress URL and credentials
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('wordpress_url, wordpress_username, wordpress_app_password')
        .eq('id', projectId)
        .single();

      if (projectError || !project?.wordpress_url) {
        throw new Error('Projeto WordPress não configurado');
      }

      addLog('info', `Iniciando sincronização ${fullSync ? 'completa' : 'incremental'}${useFallback ? ' (REST API)' : ''}...`);
      addLog('info', `Conectando a ${project.wordpress_url}...`);

      setSyncProgress(prev => ({ ...prev, phase: 'fetching' }));

      // Use raw fetch with SSE streaming to avoid timeout
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      
      if (!accessToken) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const syncResp = await fetch(`${supabaseUrl}/functions/v1/analyze-wp-articles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: 'sync',
          project_id: projectId,
          full_sync: fullSync,
          use_fallback: useFallback,
        }),
      });

      if (!syncResp.ok) {
        const errorText = await syncResp.text().catch(() => 'Erro desconhecido');
        let errorMsg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          errorMsg = parsed?.error || parsed?.message || errorText;
        } catch {}
        
        // Check for plugin not found
        try {
          const structuredError = JSON.parse(errorMsg);
          if (structuredError?.code === 'PLUGIN_NOT_FOUND') {
            setSyncState(prev => ({ ...prev, pluginNotFound: true }));
            throw new Error(structuredError.instructions || structuredError.message || 'Plugin não encontrado');
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes('Plugin')) throw e;
        }

        const isPluginNotFound = errorMsg.includes('rest_no_route') || errorMsg.includes('plugin ContentFactory não está instalado');
        if (isPluginNotFound) {
          setSyncState(prev => ({ ...prev, pluginNotFound: true }));
          throw new Error('Plugin não encontrado: O plugin ContentFactory não está instalado ou ativo.');
        }
        throw new Error(errorMsg);
      }

      // Parse SSE stream
      const reader = syncResp.body?.getReader();
      const decoder = new TextDecoder();
      let results = { synced: 0, analyzed: 0, errors: 0, skipped: 0, total: 0, analyzedWithAI: 0, analyzedBasic: 0 };
      let usedFallbackResult = false;
      let fallbackReasonResult: string | undefined;
      let aiStatus = 'ok';
      let syncError = '';
      let textBuffer = '';

      if (reader) {
        let done = false;
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            textBuffer += decoder.decode(value, { stream: true });
            const lines = textBuffer.split('\n');
            textBuffer = lines.pop() || '';
            
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const event = JSON.parse(line.slice(6));
                
                if (event.error) {
                  syncError = event.error;
                  continue;
                }
                
                if (event.phase === 'fetching') {
                  addLog('info', event.message || 'Buscando artigos...');
                } else if (event.phase === 'analyzing') {
                  setSyncProgress(prev => ({
                    ...prev,
                    phase: 'analyzing',
                    total: event.total || prev.total,
                    fetched: event.progress || prev.fetched,
                    analyzed: event.analyzed || prev.analyzed,
                    indexed: event.synced || prev.indexed,
                    skipped: event.skipped || prev.skipped,
                    errors: event.errors || prev.errors,
                  }));
                }
                
                if (event.done) {
                  results = event.results || results;
                  usedFallbackResult = event.usedFallback || false;
                  fallbackReasonResult = event.fallbackReason;
                  aiStatus = event.aiStatus || 'ok';
                }
              } catch {}
            }
          }
        }
      }

      if (syncError) {
        throw new Error(syncError);
      }

      const usedFallback = usedFallbackResult;
      const fallbackReason = fallbackReasonResult;
      
      // Update sync state
      setSyncState(prev => ({
        ...prev,
        usedFallback,
        fallbackReason,
        pluginNotFound: false,
      }));
      
      // Update progress with results
      setSyncProgress(prev => ({
        ...prev,
        phase: 'complete',
        total: results.total || results.synced + results.skipped,
        fetched: results.total || results.synced + results.skipped,
        analyzed: results.analyzed || 0,
        indexed: results.synced || 0,
        skipped: results.skipped || 0,
        errors: results.errors || 0,
      }));

      const fallbackInfo = usedFallback ? ' (via REST API)' : '';
      const aiInfo = results.analyzedWithAI > 0 && results.analyzedBasic > 0 
        ? ` (${results.analyzedWithAI} com IA, ${results.analyzedBasic} análise básica)`
        : results.analyzedBasic > 0 
          ? ' (análise básica)'
          : '';
      
      addLog('success', `Sincronização concluída${fallbackInfo}: ${results.synced} indexados${aiInfo}`);
      
      if (aiStatus === 'credits_exhausted') {
        addLog('warning', 'Créditos de IA esgotados - alguns artigos foram analisados com método básico');
      }

      // Refresh local data
      await fetchIndexedArticles();
      
      // Auto-generate clusters after successful sync if we have enough articles
      if (results.synced > 0) {
        addLog('info', 'Gerando clusters temáticos automaticamente...');
        try {
          const clusterResponse = await supabase.functions.invoke('analyze-wp-articles', {
            body: {
              action: 'generate_clusters',
              project_id: projectId,
            },
          });
          
          if (!clusterResponse.error && clusterResponse.data?.clusters?.length > 0) {
            addLog('success', `${clusterResponse.data.clusters.length} clusters temáticos gerados`);
          }
        } catch (clusterError) {
          console.error('Error auto-generating clusters:', clusterError);
          addLog('warning', 'Não foi possível gerar clusters automaticamente');
        }
      }
      
      await fetchTopicClusters();

      toast({
        title: 'Sincronização concluída!',
        description: `${results.synced} artigos sincronizados, ${results.analyzed} analisados.${fallbackInfo}`,
      });
    } catch (error) {
      console.error('Error triggering sync:', error);
      addLog('error', error instanceof Error ? error.message : 'Erro desconhecido');
      setSyncProgress(prev => ({ ...prev, phase: 'error' }));
      toast({
        title: 'Erro na sincronização',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [projectId, fetchIndexedArticles, fetchTopicClusters, toast, addLog]);

  // Generate topic clusters from indexed articles
  const generateClusters = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    try {
      const response = await supabase.functions.invoke('analyze-wp-articles', {
        body: {
          action: 'generate_clusters',
          project_id: projectId,
        },
      });

      if (response.error) throw response.error;

      toast({
        title: 'Clusters gerados',
        description: `${response.data?.clusters?.length || 0} clusters temáticos identificados.`,
      });

      await fetchTopicClusters();
    } catch (error) {
      console.error('Error generating clusters:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível gerar os clusters.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId, fetchTopicClusters, toast]);

  // Add keyword rule
  const addKeywordRule = useCallback(async (rule: Omit<KeywordRule, 'id' | 'times_applied'>) => {
    if (!projectId) return;

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) {
        throw new Error('Usuário não autenticado');
      }

      const { error } = await supabase
        .from('keyword_link_rules')
        .insert({
          user_id: session.session.user.id,
          project_id: projectId,
          ...rule,
        });

      if (error) throw error;

      toast({
        title: 'Regra criada',
        description: `Regra para "${rule.keyword}" adicionada com sucesso.`,
      });

      await fetchKeywordRules();
    } catch (error) {
      console.error('Error adding keyword rule:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar a regra.',
        variant: 'destructive',
      });
    }
  }, [projectId, fetchKeywordRules, toast]);

  // Delete keyword rule
  const deleteKeywordRule = useCallback(async (ruleId: string) => {
    try {
      const { error } = await supabase
        .from('keyword_link_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;

      toast({
        title: 'Regra removida',
        description: 'A regra de linkagem foi removida.',
      });

      await fetchKeywordRules();
    } catch (error) {
      console.error('Error deleting keyword rule:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível remover a regra.',
        variant: 'destructive',
      });
    }
  }, [fetchKeywordRules, toast]);

  // Toggle keyword rule active status
  const toggleKeywordRule = useCallback(async (ruleId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('keyword_link_rules')
        .update({ is_active: isActive })
        .eq('id', ruleId);

      if (error) throw error;
      await fetchKeywordRules();
    } catch (error) {
      console.error('Error toggling keyword rule:', error);
    }
  }, [fetchKeywordRules]);

  // Insert links into content
  const insertLinksIntoContent = useCallback((
    content: string,
    suggestions: LinkSuggestion[]
  ): string => {
    if (!suggestions.length) return content;

    let modifiedContent = content;
    const usedAnchors = new Set<string>();

    // Sort by relevance score
    const sortedSuggestions = [...suggestions].sort((a, b) => b.relevance_score - a.relevance_score);

    for (const suggestion of sortedSuggestions) {
      // Skip if we've already used this anchor
      if (usedAnchors.has(suggestion.anchor_text.toLowerCase())) continue;

      // Create regex to find the anchor text (not already linked)
      const anchorEscaped = suggestion.anchor_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(
        `(?<!<a[^>]*>)(?<!href=["'])\\b(${anchorEscaped})\\b(?![^<]*<\\/a>)`,
        'i'
      );

      const match = modifiedContent.match(regex);
      if (match) {
        const link = `<a href="${suggestion.url}" title="${suggestion.anchor_text}">${match[1]}</a>`;
        modifiedContent = modifiedContent.replace(regex, link);
        usedAnchors.add(suggestion.anchor_text.toLowerCase());
      }
    }

    return modifiedContent;
  }, []);

  // Sync ALL projects at once
  const syncAllProjects = useCallback(async () => {
    setIsSyncing(true);
    setSyncProgress({
      phase: 'fetching',
      total: 0,
      fetched: 0,
      analyzed: 0,
      indexed: 0,
      skipped: 0,
      errors: 0,
      logs: [],
    });

    try {
      addLog('info', 'Sincronizando TODOS os projetos...');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Sessão expirada');

      const resp = await fetch(`${supabaseUrl}/functions/v1/analyze-wp-articles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: 'sync_all_projects', project_id: projectId }),
      });

      if (!resp.ok) throw new Error(await resp.text());

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let totalSynced = 0;

      if (reader) {
        let done = false;
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            textBuffer += decoder.decode(value, { stream: true });
            const lines = textBuffer.split('\n');
            textBuffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const event = JSON.parse(line.slice(6));
                if (event.phase === 'project_start') {
                  addLog('info', `📁 Sincronizando: ${event.project_name}`);
                } else if (event.phase === 'fetched') {
                  addLog('info', `${event.project_name}: ${event.total} artigos encontrados`);
                } else if (event.phase === 'project_done') {
                  addLog('success', `✅ ${event.project_name}: ${event.synced} sincronizados, ${event.analyzed} analisados`);
                  totalSynced += event.synced || 0;
                } else if (event.phase === 'project_error') {
                  addLog('error', `❌ ${event.project_name}: ${event.error}`);
                }
                if (event.done) {
                  setSyncProgress(prev => ({ ...prev, phase: 'complete', indexed: totalSynced }));
                }
              } catch {}
            }
          }
        }
      }

      addLog('success', `Sincronização global concluída: ${totalSynced} artigos sincronizados`);
      await fetchIndexedArticles();
      await fetchTopicClusters();

      toast({ title: 'Sincronização global concluída!', description: `${totalSynced} artigos sincronizados em todos os projetos.` });
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : 'Erro desconhecido');
      setSyncProgress(prev => ({ ...prev, phase: 'error' }));
      toast({ title: 'Erro na sincronização', description: error instanceof Error ? error.message : 'Erro', variant: 'destructive' });
    } finally {
      setIsSyncing(false);
    }
  }, [projectId, fetchIndexedArticles, fetchTopicClusters, toast, addLog]);

  // Force validate ALL articles with SEO IA
  const forceValidateAll = useCallback(async () => {
    setIsSyncing(true);
    setSyncProgress({
      phase: 'fetching',
      total: 0,
      fetched: 0,
      analyzed: 0,
      indexed: 0,
      skipped: 0,
      errors: 0,
      logs: [],
    });

    try {
      addLog('info', '🔍 Forçando validação SEO IA em todos os artigos...');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Sessão expirada');

      const resp = await fetch(`${supabaseUrl}/functions/v1/analyze-wp-articles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: 'force_validate_all', project_id: projectId }),
      });

      if (!resp.ok) throw new Error(await resp.text());

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let finalResults = { validated: 0, fixed: 0, linksApplied: 0, errors: 0 };

      if (reader) {
        let done = false;
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            textBuffer += decoder.decode(value, { stream: true });
            const lines = textBuffer.split('\n');
            textBuffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const event = JSON.parse(line.slice(6));
                if (event.phase === 'starting') {
                  addLog('info', event.message);
                  setSyncProgress(prev => ({ ...prev, total: event.total, phase: 'analyzing' }));
                } else if (event.phase === 'validating') {
                  setSyncProgress(prev => ({
                    ...prev,
                    analyzed: event.validated || 0,
                    indexed: event.fixed || 0,
                    fetched: event.progress || 0,
                    total: event.total,
                    errors: event.errors || 0,
                  }));
                }
                if (event.done) {
                  finalResults = event.results || finalResults;
                  setSyncProgress(prev => ({ ...prev, phase: 'complete' }));
                }
              } catch {}
            }
          }
        }
      }

      addLog('success', `✅ Validação concluída: ${finalResults.validated} validados, ${finalResults.fixed} metas corrigidos, ${finalResults.linksApplied} links aplicados`);
      await fetchIndexedArticles();

      toast({
        title: 'Validação SEO IA concluída!',
        description: `${finalResults.validated} validados, ${finalResults.fixed} corrigidos, ${finalResults.linksApplied} links aplicados.`,
      });
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : 'Erro desconhecido');
      setSyncProgress(prev => ({ ...prev, phase: 'error' }));
      toast({ title: 'Erro na validação', description: error instanceof Error ? error.message : 'Erro', variant: 'destructive' });
    } finally {
      setIsSyncing(false);
    }
  }, [projectId, fetchIndexedArticles, toast, addLog]);

  return {
    // State
    isLoading,
    isSyncing,
    indexedArticles,
    topicClusters,
    keywordRules,
    syncProgress,
    syncState,
    
    // Actions
    fetchIndexedArticles,
    fetchTopicClusters,
    fetchKeywordRules,
    getLinkSuggestions,
    triggerSync,
    syncAllProjects,
    forceValidateAll,
    generateClusters,
    addKeywordRule,
    deleteKeywordRule,
    toggleKeywordRule,
    insertLinksIntoContent,
  };
}
