import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface ArticleListFilters {
  status: string;
  projectId: string;
  search: string;
  page: number;
  perPage: number;
  sortBy: 'created_at' | 'scheduled_at';
  sortOrder: 'asc' | 'desc';
  dateFilter?: string; // YYYY-MM-DD
}

const defaultFilters: ArticleListFilters = {
  status: 'all',
  projectId: 'all',
  search: '',
  page: 1,
  perPage: 50,
  sortBy: 'created_at',
  sortOrder: 'desc',
};

// Lightweight article type for list view (no content)
export interface ArticleListItem {
  id: string;
  keyword: string;
  title: string | null;
  status: string;
  type: string;
  slug: string | null;
  excerpt: string | null;
  featured_image_url: string | null;
  seo_score: number | null;
  word_count: number | null;
  project_id: string | null;
  published_at: string | null;
  published_url: string | null;
  scheduled_at: string | null;
  secondary_keywords: string[] | null;
  config: any;
  error_message: string | null;
  emotional_trigger: string | null;
  emotional_confidence: number | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}

interface StatusCounts {
  all: number;
  published: number;
  scheduled: number;
  ready: number;
  generating: number;
  draft: number;
  error: number;
}

const selectFields = `
  id, keyword, title, status, type, slug, excerpt,
  featured_image_url, seo_score, word_count, project_id,
  published_at, published_url, scheduled_at, secondary_keywords,
  config, error_message, emotional_trigger, emotional_confidence,
  created_at, updated_at, user_id
`;

// Helper: article has content if word_count > 0 (content col not fetched in list for performance)
export function articleHasContent(article: { word_count: number | null; status: string }): boolean {
  return (article.word_count ?? 0) > 0 && article.status !== 'draft' || 
         (article.word_count ?? 0) > 100;
}

export function useArticlesList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ArticleListFilters>(defaultFilters);

  // Fetch status counts using separate lightweight count queries
  const { data: statusCounts } = useQuery({
    queryKey: ['articles-counts', user?.id, filters.projectId, filters.search, filters.dateFilter],
    queryFn: async (): Promise<StatusCounts> => {
      if (!user) return { all: 0, published: 0, scheduled: 0, ready: 0, generating: 0, draft: 0, error: 0 };

      const buildBaseQuery = () => {
        let q = supabase.from('articles').select('id', { count: 'exact', head: true });
        if (filters.projectId !== 'all') q = q.eq('project_id', filters.projectId);
        if (filters.search) q = q.or(`title.ilike.%${filters.search}%,keyword.ilike.%${filters.search}%`);
        if (filters.dateFilter) {
          q = q.gte('created_at', `${filters.dateFilter}T00:00:00`).lte('created_at', `${filters.dateFilter}T23:59:59`);
        }
        return q;
      };

      const [allRes, pubRes, readyRes, genRes, draftRes, errRes] = await Promise.all([
        buildBaseQuery(),
        buildBaseQuery().eq('status', 'published'),
        buildBaseQuery().eq('status', 'ready'),
        buildBaseQuery().eq('status', 'generating'),
        buildBaseQuery().eq('status', 'draft'),
        buildBaseQuery().eq('status', 'error'),
      ]);

      return {
        all: allRes.count ?? 0,
        published: pubRes.count ?? 0,
        scheduled: 0, // Will be computed from ready articles with scheduled_at
        ready: readyRes.count ?? 0,
        generating: genRes.count ?? 0,
        draft: draftRes.count ?? 0,
        error: errRes.count ?? 0,
      };
    },
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Fetch paginated articles
  const { data: articlesData, isLoading, error } = useQuery({
    queryKey: ['articles-list', user?.id, filters],
    queryFn: async () => {
      if (!user) return { articles: [] as ArticleListItem[], total: 0 };

      const { page, perPage, status, projectId, search, sortBy, sortOrder, dateFilter } = filters;
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;

      let query = supabase
        .from('articles')
        .select(selectFields, { count: 'exact' })
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range(from, to);

      // Status filter
      if (status !== 'all') {
        if (status === 'scheduled') {
          query = query.eq('status', 'ready').not('scheduled_at', 'is', null);
        } else if (status === 'ready') {
          query = query.eq('status', 'ready');
          // We'll filter scheduled out client-side for simplicity
        } else {
          query = query.eq('status', status as any);
        }
      }

      if (projectId !== 'all') {
        query = query.eq('project_id', projectId);
      }

      if (search) {
        query = query.or(`title.ilike.%${search}%,keyword.ilike.%${search}%`);
      }

      if (dateFilter) {
        const start = `${dateFilter}T00:00:00`;
        const end = `${dateFilter}T23:59:59`;
        query = query.gte('created_at', start).lte('created_at', end);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('[useArticlesList] Query error:', error);
        throw error;
      }

      let articles = (data || []) as ArticleListItem[];

      // Client-side filter for 'ready' (exclude scheduled) and 'scheduled' (only future scheduled)
      if (status === 'ready') {
        articles = articles.filter(a => !a.scheduled_at || new Date(a.scheduled_at) <= new Date());
      } else if (status === 'scheduled') {
        articles = articles.filter(a => a.scheduled_at && new Date(a.scheduled_at) > new Date());
      }

      console.log(`[useArticlesList] Loaded ${articles.length} articles (page ${page}, total: ${count})`);

      return { articles, total: count || 0 };
    },
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const updateFilter = useCallback((key: keyof ArticleListFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      // Reset page when filters change (except page itself)
      ...(key !== 'page' ? { page: 1 } : {}),
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  const refreshArticles = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['articles-list'] });
    await queryClient.invalidateQueries({ queryKey: ['articles-counts'] });
  }, [queryClient]);

  // Delete mutation
  const deleteArticle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('articles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      refreshArticles();
      toast({ title: 'Artigo excluído', description: 'O artigo foi removido.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir artigo', description: error.message, variant: 'destructive' });
    },
  });

  return {
    articles: articlesData?.articles ?? [],
    total: articlesData?.total ?? 0,
    totalPages: Math.ceil((articlesData?.total ?? 0) / filters.perPage) || 1,
    isLoading,
    error,
    filters,
    statusCounts: statusCounts ?? { all: 0, published: 0, scheduled: 0, ready: 0, generating: 0, draft: 0, error: 0 },
    updateFilter,
    resetFilters,
    refreshArticles,
    deleteArticle,
  };
}
