import { useState, useCallback } from 'react';
import { useToast } from './use-toast';
import { supabase } from '@/integrations/supabase/client';
import { createErrorToastContent } from '@/components/ui/error-toast';

const GENERATE_IMAGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`;

interface ImageRequest {
  title: string;
  keywords?: string;
  context?: string;
  segment?: 'legal' | 'health' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'education' | 'general';
  style?: 'photorealistic' | 'illustration' | 'abstract';
  aspectRatio?: '16:9' | '1:1' | '4:3';
  quality?: 'standard' | 'high';
  // Optional provider/model override
  provider?: 'openai' | 'gemini' | 'auto';
  model?: string;
}

interface GeneratedImage {
  image: string;
  alt: string;
  title: string;
  prompt: string;
  model: string;
}

interface GeneratedImagesResult {
  images: GeneratedImage[];
  featuredImage: GeneratedImage | null;
}

export function useImageGeneration() {
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const { toast } = useToast();

  // Generate a single image
  const generateSingleImage = useCallback(async (
    request: ImageRequest, 
    accessToken: string,
    imageIndex?: number
  ): Promise<GeneratedImage | null> => {
    try {
      // Modify title for additional images to get variety
      const modifiedRequest = imageIndex && imageIndex > 0 
        ? {
            ...request,
            title: `${request.title} - perspectiva ${imageIndex + 1}`,
            context: `${request.context || ''} Gere uma imagem diferente da anterior, com novo ângulo ou composição.`.trim(),
          }
        : request;

      const response = await fetch(GENERATE_IMAGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(modifiedRequest),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        console.error(`Image ${(imageIndex || 0) + 1} generation error:`, errorData);
        return null;
      }

      const data = await response.json();
      
      if (!data.success || !data.image) {
        return null;
      }

      return {
        image: data.image,
        alt: data.alt,
        title: data.title,
        prompt: data.prompt,
        model: data.model,
      };
    } catch (error) {
      console.error(`Image ${(imageIndex || 0) + 1} generation error:`, error);
      return null;
    }
  }, []);

  // Generate single image (backward compatible)
  const generateImage = useCallback(async (request: ImageRequest): Promise<GeneratedImage | null> => {
    setIsGenerating(true);
    setGeneratedImage(null);
    setProgress({ current: 0, total: 1 });

    try {
      // Get session
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        if (refreshData.session) {
          session = refreshData.session;
        }
      }
      
      if (sessionError || !session?.access_token) {
        toast({
          title: 'Sessão expirada',
          description: 'Por favor, faça login novamente.',
          variant: 'destructive',
        });
        setIsGenerating(false);
        return null;
      }

      const result = await generateSingleImage(request, session.access_token);
      
      if (!result) {
        toast({
          title: 'Erro na geração',
          description: 'Falha ao gerar imagem',
          variant: 'destructive',
        });
        setIsGenerating(false);
        return null;
      }

      setGeneratedImage(result);
      setProgress({ current: 1, total: 1 });
      setIsGenerating(false);
      
      toast({
        title: 'Imagem gerada!',
        description: 'A imagem foi criada com sucesso.',
      });

      return result;
    } catch (error) {
      console.error('Image generation error:', error);
      toast(createErrorToastContent(
        'Erro na geração',
        error instanceof Error ? error.message : 'Erro desconhecido'
      ));
      setIsGenerating(false);
      return null;
    }
  }, [toast, generateSingleImage]);

  // Generate multiple images
  const generateMultipleImages = useCallback(async (
    request: ImageRequest,
    count: number = 1
  ): Promise<GeneratedImagesResult> => {
    setIsGenerating(true);
    setGeneratedImages([]);
    setGeneratedImage(null);
    setProgress({ current: 0, total: count });

    const results: GeneratedImage[] = [];

    try {
      // Get session
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        if (refreshData.session) {
          session = refreshData.session;
        }
      }
      
      if (sessionError || !session?.access_token) {
        toast({
          title: 'Sessão expirada',
          description: 'Por favor, faça login novamente.',
          variant: 'destructive',
        });
        setIsGenerating(false);
        return { images: [], featuredImage: null };
      }

      // Generate images sequentially to avoid rate limiting
      for (let i = 0; i < count; i++) {
        setProgress({ current: i, total: count });
        
        const result = await generateSingleImage(request, session.access_token, i);
        
        if (result) {
          results.push(result);
          setGeneratedImages([...results]);
          
          // Set first image as featured
          if (i === 0) {
            setGeneratedImage(result);
          }
        }

        // Small delay between requests to avoid rate limiting (except for last)
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setProgress({ current: count, total: count });
      setIsGenerating(false);

      if (results.length === 0) {
        toast({
          title: 'Erro na geração',
          description: 'Nenhuma imagem foi gerada. Tente novamente.',
          variant: 'destructive',
        });
        return { images: [], featuredImage: null };
      }

      toast({
        title: `${results.length} imagem(ns) gerada(s)!`,
        description: results.length < count 
          ? `${count - results.length} imagem(ns) falharam.`
          : 'Todas as imagens foram criadas com sucesso.',
      });

      return {
        images: results,
        featuredImage: results[0] || null,
      };
    } catch (error) {
      console.error('Multiple image generation error:', error);
      toast(createErrorToastContent(
        'Erro na geração',
        error instanceof Error ? error.message : 'Erro desconhecido'
      ));
      setIsGenerating(false);
      return { images: results, featuredImage: results[0] || null };
    }
  }, [toast, generateSingleImage]);

  const resetImage = useCallback(() => {
    setGeneratedImage(null);
    setGeneratedImages([]);
    setIsGenerating(false);
    setProgress({ current: 0, total: 0 });
  }, []);

  return {
    generatedImage,
    generatedImages,
    isGenerating,
    progress,
    generateImage,
    generateMultipleImages,
    resetImage,
  };
}
