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

export function useImageGeneration() {
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const generateImage = useCallback(async (request: ImageRequest): Promise<GeneratedImage | null> => {
    setIsGenerating(true);
    setGeneratedImage(null);

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

      const response = await fetch(GENERATE_IMAGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        
        if (response.status === 429) {
          toast(createErrorToastContent(
            'Limite excedido',
            'Muitas requisições. Aguarde alguns segundos.',
            errorData.request_id
          ));
        } else if (response.status === 402) {
          toast(createErrorToastContent(
            'Créditos insuficientes',
            'Adicione créditos para gerar imagens.',
            errorData.request_id
          ));
        } else {
          toast(createErrorToastContent(
            'Erro na geração',
            errorData.error || 'Falha ao gerar imagem',
            errorData.request_id
          ));
        }
        setIsGenerating(false);
        return null;
      }

      const data = await response.json();
      
      if (!data.success || !data.image) {
        toast({
          title: 'Erro na geração',
          description: data.error || 'Nenhuma imagem foi gerada',
          variant: 'destructive',
        });
        setIsGenerating(false);
        return null;
      }

      const result: GeneratedImage = {
        image: data.image,
        alt: data.alt,
        title: data.title,
        prompt: data.prompt,
        model: data.model,
      };

      setGeneratedImage(result);
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
  }, [toast]);

  const resetImage = useCallback(() => {
    setGeneratedImage(null);
    setIsGenerating(false);
  }, []);

  return {
    generatedImage,
    isGenerating,
    generateImage,
    resetImage,
  };
}
