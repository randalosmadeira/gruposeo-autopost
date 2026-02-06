import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

interface WordPressPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  slug: string;
  status: string;
  link: string;
  date: string;
  categories: number[];
  tags: number[];
  featured_media: number;
}

interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  parent: number;
  count: number;
}

interface WordPressTag {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
}

interface WordPressMedia {
  id: number;
  title: { rendered: string };
  source_url: string;
  media_type: string;
  mime_type: string;
}

interface WordPressUser {
  id: number;
  name: string;
  slug: string;
  avatar_urls: Record<string, string>;
}

interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function callWordPressAPI<T>(
  action: string,
  params: Record<string, unknown>
): Promise<APIResponse<T>> {
  const { data, error } = await supabase.functions.invoke<APIResponse<T>>(
    'wordpress-api',
    {
      body: { action, ...params },
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (error) {
    return { success: false, error: error.message };
  }

  return data || { success: false, error: 'No response from API' };
}

export function useWordPressAPI(projectId: string | null) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // === POSTS ===
  const getPosts = useCallback(async (page = 1, perPage = 10) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      return await callWordPressAPI<WordPressPost[]>('get-posts', {
        projectId,
        page,
        perPage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const getPost = useCallback(async (postId: number) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      return await callWordPressAPI<WordPressPost>('get-post', {
        projectId,
        postId,
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const createPost = useCallback(async (postData: {
    title: string;
    content: string;
    excerpt?: string;
    slug?: string;
    status?: 'draft' | 'publish' | 'pending' | 'private';
    categories?: number[];
    tags?: number[];
    featuredMedia?: number;
  }) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      const result = await callWordPressAPI<WordPressPost>('create-post', {
        projectId,
        ...postData,
      });

      if (result.success) {
        toast({
          title: 'Post criado!',
          description: `"${postData.title}" foi criado no WordPress.`,
        });
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  const updatePost = useCallback(async (postId: number, postData: {
    title?: string;
    content?: string;
    excerpt?: string;
    slug?: string;
    status?: 'draft' | 'publish' | 'pending' | 'private';
    categories?: number[];
    tags?: number[];
    featuredMedia?: number;
  }) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      const result = await callWordPressAPI<WordPressPost>('update-post', {
        projectId,
        postId,
        ...postData,
      });

      if (result.success) {
        toast({
          title: 'Post atualizado!',
          description: 'O post foi atualizado com sucesso.',
        });
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  const deletePost = useCallback(async (postId: number, force = false) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      const result = await callWordPressAPI<{ deleted: boolean }>('delete-post', {
        projectId,
        postId,
        force,
      });

      if (result.success) {
        toast({
          title: 'Post removido!',
          description: force ? 'O post foi permanentemente removido.' : 'O post foi movido para a lixeira.',
        });
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  // === CATEGORIES ===
  const getCategories = useCallback(async (perPage = 100) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      return await callWordPressAPI<WordPressCategory[]>('get-categories', {
        projectId,
        perPage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const createCategory = useCallback(async (categoryData: {
    name: string;
    slug?: string;
    description?: string;
    parent?: number;
  }) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      const result = await callWordPressAPI<WordPressCategory>('create-category', {
        projectId,
        ...categoryData,
      });

      if (result.success) {
        toast({
          title: 'Categoria criada!',
          description: `"${categoryData.name}" foi criada.`,
        });
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  // === TAGS ===
  const getTags = useCallback(async (perPage = 100) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      return await callWordPressAPI<WordPressTag[]>('get-tags', {
        projectId,
        perPage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const createTag = useCallback(async (tagData: {
    name: string;
    slug?: string;
    description?: string;
  }) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      const result = await callWordPressAPI<WordPressTag>('create-tag', {
        projectId,
        ...tagData,
      });

      if (result.success) {
        toast({
          title: 'Tag criada!',
          description: `"${tagData.name}" foi criada.`,
        });
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  // === MEDIA ===
  const getMedia = useCallback(async (perPage = 20) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      return await callWordPressAPI<WordPressMedia[]>('get-media', {
        projectId,
        perPage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const uploadMedia = useCallback(async (mediaData: {
    imageData: string; // base64
    filename?: string;
    mimeType?: string;
  }) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      const result = await callWordPressAPI<WordPressMedia>('upload-media', {
        projectId,
        ...mediaData,
      });

      if (result.success) {
        toast({
          title: 'Mídia enviada!',
          description: 'O arquivo foi enviado para o WordPress.',
        });
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  // === USERS ===
  const getUsers = useCallback(async (perPage = 100) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      return await callWordPressAPI<WordPressUser[]>('get-users', {
        projectId,
        perPage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const getCurrentUser = useCallback(async () => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      return await callWordPressAPI<WordPressUser>('get-current-user', {
        projectId,
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // === HEALTH CHECK ===
  const checkHealth = useCallback(async (): Promise<{
    success: boolean;
    status: 'healthy' | 'degraded' | 'offline';
    message: string;
    details?: {
      restApi: boolean;
      authentication: boolean;
      categories: boolean;
      responseTime: number;
    };
  }> => {
    if (!projectId) {
      return { 
        success: false, 
        status: 'offline', 
        message: 'ID do projeto não fornecido' 
      };
    }

    const startTime = Date.now();
    const details = {
      restApi: false,
      authentication: false,
      categories: false,
      responseTime: 0,
    };

    try {
      // Test 1: Check if REST API is accessible (get categories)
      const categoriesResult = await callWordPressAPI<unknown[]>('get-categories', {
        projectId,
        perPage: 1,
      });

      details.responseTime = Date.now() - startTime;

      if (!categoriesResult.success) {
        const errorMsg = categoriesResult.error || '';
        
        // Check for critical PHP error
        if (errorMsg.includes('<p>') || errorMsg.includes('erro crítico') || errorMsg.includes('critical')) {
          return {
            success: false,
            status: 'offline',
            message: 'Site WordPress com erro crítico (HTTP 500). Desative plugins conflitantes ou reinstale o plugin ContentFactory RDM v2.2.1+.',
            details,
          };
        }

        // Check for authentication error
        if (errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('autenticação')) {
          details.restApi = true;
          return {
            success: false,
            status: 'degraded',
            message: 'Falha na autenticação. Verifique usuário e senha do aplicativo WordPress.',
            details,
          };
        }

        // Check for connection error
        if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('conexão') || errorMsg.includes('timeout')) {
          return {
            success: false,
            status: 'offline',
            message: 'Não foi possível conectar ao site WordPress. Verifique se a URL está correta e o site está online.',
            details,
          };
        }

        return {
          success: false,
          status: 'degraded',
          message: errorMsg || 'Erro desconhecido ao verificar o WordPress',
          details,
        };
      }

      // All checks passed
      details.restApi = true;
      details.authentication = true;
      details.categories = true;

      // Determine health status based on response time
      const status = details.responseTime > 5000 ? 'degraded' : 'healthy';
      const message = status === 'healthy' 
        ? 'WordPress conectado e funcionando corretamente'
        : `WordPress conectado, mas com resposta lenta (${(details.responseTime / 1000).toFixed(1)}s)`;

      return {
        success: true,
        status,
        message,
        details,
      };
    } catch (error) {
      details.responseTime = Date.now() - startTime;
      return {
        success: false,
        status: 'offline',
        message: error instanceof Error ? error.message : 'Erro ao verificar saúde do WordPress',
        details,
      };
    }
  }, [projectId]);

  // === SEO ===
  const updateYoastMeta = useCallback(async (postId: number, seoData: {
    seoTitle?: string;
    seoDescription?: string;
    focusKeyword?: string;
  }) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      const result = await callWordPressAPI<WordPressPost>('update-yoast-meta', {
        projectId,
        postId,
        ...seoData,
      });

      if (result.success) {
        toast({
          title: 'SEO atualizado!',
          description: 'Metadados Yoast atualizados.',
        });
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  const updateRankMathMeta = useCallback(async (postId: number, seoData: {
    seoTitle?: string;
    seoDescription?: string;
    focusKeyword?: string;
  }) => {
    if (!projectId) return { success: false, error: 'Project ID required' };
    setIsLoading(true);
    try {
      const result = await callWordPressAPI<WordPressPost>('update-rankmath-meta', {
        projectId,
        postId,
        ...seoData,
      });

      if (result.success) {
        toast({
          title: 'SEO atualizado!',
          description: 'Metadados Rank Math atualizados.',
        });
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  return {
    isLoading,
    // Posts
    getPosts,
    getPost,
    createPost,
    updatePost,
    deletePost,
    // Categories
    getCategories,
    createCategory,
    // Tags
    getTags,
    createTag,
    // Media
    getMedia,
    uploadMedia,
    // Users
    getUsers,
    getCurrentUser,
    // SEO
    updateYoastMeta,
    updateRankMathMeta,
    // Health
    checkHealth,
  };
}
