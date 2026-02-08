import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';
import type { Json } from '@/integrations/supabase/types';

interface OutlineSectionData {
  id: string;
  title: string;
  level: string;
}

interface AutoSaveConfig {
  keyword: string;
  title: string;
  aiModel: string;
  size: string;
  tone: string;
  pointOfView: string;
  language: string;
  projectId?: string;
}

interface UseArticleAutoSaveOptions {
  debounceMs?: number;
}

export function useArticleAutoSave(options: UseArticleAutoSaveOptions = {}) {
  const { debounceMs = 2000 } = options;
  const [articleId, setArticleId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const { toast } = useToast();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create or update article draft
  const saveOutline = useCallback(async (
    outline: OutlineSectionData[],
    config: AutoSaveConfig
  ): Promise<string | null> => {
    try {
      setIsSaving(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.warn('No authenticated user for auto-save');
        return null;
      }

      // Convert to JSON-compatible format
      const configJson: Json = {
        outline: outline.map(s => ({ id: s.id, title: s.title, level: s.level })),
        aiModel: config.aiModel,
        size: config.size,
        tone: config.tone,
        pointOfView: config.pointOfView,
        language: config.language,
      };

      if (articleId) {
        // Update existing draft
        const { error } = await supabase
          .from('articles')
          .update({
            keyword: config.keyword,
            title: config.title || null,
            config: configJson,
            project_id: config.projectId || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', articleId);

        if (error) throw error;
        setLastSaved(new Date());
        return articleId;
      } else {
        // Create new draft
        const { data, error } = await supabase
          .from('articles')
          .insert({
            keyword: config.keyword,
            title: config.title || null,
            config: configJson,
            project_id: config.projectId || null,
            status: 'draft' as const,
            user_id: session.user.id,
          })
          .select('id')
          .single();

        if (error) throw error;
        setArticleId(data.id);
        setLastSaved(new Date());
        return data.id;
      }
    } catch (error) {
      console.error('Auto-save error:', error);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [articleId]);

  // Debounced save function
  const debouncedSave = useCallback((
    outline: OutlineSectionData[],
    config: AutoSaveConfig
  ) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveOutline(outline, config);
    }, debounceMs);
  }, [saveOutline, debounceMs]);

  // Update article with generated content
  const saveGeneratedArticle = useCallback(async (
    content: string,
    title: string,
    featuredImageUrl?: string | null
  ): Promise<boolean> => {
    if (!articleId) return false;

    try {
      setIsSaving(true);
      const wordCount = content.split(/\s+/).filter(Boolean).length;

      // Generate meta-description automatically using AI
      let generatedExcerpt: string | null = null;
      try {
        const { data, error } = await supabase.functions.invoke('regenerate-content', {
          body: {
            type: 'excerpt',
            keyword: title,
            currentTitle: title,
            language: 'pt-BR',
          },
        });
        
        if (!error && data?.result) {
          generatedExcerpt = data.result;
        }
      } catch (excerptError) {
        console.warn('Meta-description generation failed:', excerptError);
        // Continue without excerpt - it's optional
      }

      const updateData: {
        content: string;
        title: string;
        word_count: number;
        status: 'ready';
        updated_at: string;
        featured_image_url?: string | null;
        excerpt?: string | null;
      } = {
        content,
        title,
        word_count: wordCount,
        status: 'ready' as const,
        updated_at: new Date().toISOString(),
      };

      // Include featured image if provided
      if (featuredImageUrl !== undefined) {
        updateData.featured_image_url = featuredImageUrl;
      }

      // Include auto-generated excerpt
      if (generatedExcerpt) {
        updateData.excerpt = generatedExcerpt;
      }

      const { error } = await supabase
        .from('articles')
        .update(updateData)
        .eq('id', articleId);

      if (error) throw error;
      setLastSaved(new Date());
      
      toast({
        title: 'Artigo salvo!',
        description: generatedExcerpt 
          ? 'Artigo e meta-descrição gerados automaticamente.' 
          : 'Seu artigo foi salvo automaticamente.',
      });
      
      return true;
    } catch (error) {
      console.error('Save article error:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o artigo.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [articleId, toast]);

  // Update article status to generating
  const setGeneratingStatus = useCallback(async (): Promise<boolean> => {
    if (!articleId) return false;

    try {
      const { error } = await supabase
        .from('articles')
        .update({ status: 'generating', updated_at: new Date().toISOString() })
        .eq('id', articleId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Set generating status error:', error);
      return false;
    }
  }, [articleId]);

  // Load existing draft
  const loadDraft = useCallback(async (draftId: string) => {
    try {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', draftId)
        .single();

      if (error) throw error;
      setArticleId(draftId);
      return data;
    } catch (error) {
      console.error('Load draft error:', error);
      return null;
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    articleId,
    isSaving,
    lastSaved,
    saveOutline,
    debouncedSave,
    saveGeneratedArticle,
    setGeneratingStatus,
    loadDraft,
    setArticleId,
  };
}
