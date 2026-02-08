import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

export function useInternalLinking(projectId: string | null) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [indexedArticles, setIndexedArticles] = useState<IndexedArticle[]>([]);
  const [topicClusters, setTopicClusters] = useState<TopicCluster[]>([]);
  const [keywordRules, setKeywordRules] = useState<KeywordRule[]>([]);

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
  const triggerSync = useCallback(async (fullSync: boolean = false) => {
    if (!projectId) return;

    setIsSyncing(true);
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

      toast({
        title: 'Sincronização iniciada',
        description: 'Buscando artigos do WordPress para indexação...',
      });

      // Step 1: Fetch articles from WordPress plugin API
      const isPluginAuth = project.wordpress_username === '__CFRDM_PLUGIN__';
      const baseUrl = project.wordpress_url.replace(/\/+$/, '');
      
      let articlesData: any[] = [];
      
      if (isPluginAuth) {
        // Use plugin API endpoint
        const articlesUrl = `${baseUrl}/wp-json/cfrdm/v1/articles-for-indexing?per_page=100`;
        const articlesResponse = await fetch(articlesUrl, {
          headers: {
            'X-CFRDM-API-Key': project.wordpress_app_password || '',
          },
        });

        if (!articlesResponse.ok) {
          throw new Error(`Erro ao buscar artigos: ${articlesResponse.status}`);
        }

        const articlesResult = await articlesResponse.json();
        
        if (!articlesResult.success || !articlesResult.articles) {
          throw new Error('Resposta inválida do plugin WordPress');
        }

        // Fetch content for each article
        const articleIds = articlesResult.articles.map((a: any) => a.wp_post_id);
        
        if (articleIds.length > 0) {
          // Use batch export endpoint
          const batchUrl = `${baseUrl}/wp-json/cfrdm/v1/export-articles-batch`;
          const batchResponse = await fetch(batchUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CFRDM-API-Key': project.wordpress_app_password || '',
            },
            body: JSON.stringify({ post_ids: articleIds }),
          });

          if (batchResponse.ok) {
            const batchResult = await batchResponse.json();
            articlesData = batchResult.articles || [];
          }
        }
      } else {
        // Use standard WordPress REST API
        const articlesUrl = `${baseUrl}/wp-json/wp/v2/posts?per_page=100&_fields=id,title,link,slug,categories,tags,content,modified_gmt,status,type`;
        const authHeader = 'Basic ' + btoa(`${project.wordpress_username}:${project.wordpress_app_password}`);
        
        const articlesResponse = await fetch(articlesUrl, {
          headers: {
            'Authorization': authHeader,
          },
        });

        if (!articlesResponse.ok) {
          throw new Error(`Erro ao buscar artigos: ${articlesResponse.status}`);
        }

        const wpArticles = await articlesResponse.json();
        
        // Transform to our format
        articlesData = wpArticles.map((post: any) => ({
          wp_post_id: post.id,
          wp_post_url: post.link,
          wp_post_slug: post.slug,
          wp_post_title: post.title?.rendered || '',
          wp_post_type: post.type || 'post',
          wp_post_status: post.status || 'publish',
          wp_categories: post.categories?.map((id: number) => `cat-${id}`) || [],
          wp_tags: post.tags?.map((id: number) => `tag-${id}`) || [],
          content: post.content?.rendered || '',
          word_count: (post.content?.rendered || '').split(/\s+/).length,
          last_wp_modified_at: post.modified_gmt,
        }));
      }

      if (articlesData.length === 0) {
        toast({
          title: 'Nenhum artigo encontrado',
          description: 'O site WordPress não possui artigos publicados.',
        });
        setIsSyncing(false);
        return;
      }

      toast({
        title: 'Artigos encontrados',
        description: `Analisando ${articlesData.length} artigos com IA...`,
      });

      // Step 2: Send to Edge Function for AI analysis
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Sessão expirada');
      }

      const syncResponse = await supabase.functions.invoke('analyze-wp-articles', {
        body: {
          action: 'sync',
          project_id: projectId,
          articles: articlesData,
          site_url: baseUrl,
        },
      });

      if (syncResponse.error) {
        throw syncResponse.error;
      }

      const results = syncResponse.data?.results || { synced: 0, analyzed: 0, errors: 0 };

      // Refresh local data
      await fetchIndexedArticles();
      await fetchTopicClusters();

      toast({
        title: 'Sincronização concluída!',
        description: `${results.synced} artigos sincronizados, ${results.analyzed} analisados com IA.`,
      });
    } catch (error) {
      console.error('Error triggering sync:', error);
      toast({
        title: 'Erro na sincronização',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [projectId, fetchIndexedArticles, fetchTopicClusters, toast]);

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

  return {
    // State
    isLoading,
    isSyncing,
    indexedArticles,
    topicClusters,
    keywordRules,
    
    // Actions
    fetchIndexedArticles,
    fetchTopicClusters,
    fetchKeywordRules,
    getLinkSuggestions,
    triggerSync,
    generateClusters,
    addKeywordRule,
    deleteKeywordRule,
    toggleKeywordRule,
    insertLinksIntoContent,
  };
}
