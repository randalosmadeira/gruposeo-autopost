import { useState, useCallback } from 'react';
import { useToast } from './use-toast';
import { supabase } from '@/integrations/supabase/client';

const GENERATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-article`;

interface ArticleConfig {
  keyword: string;
  secondaryKeywords: string;
  wordCount: 'short' | 'medium' | 'long' | 'very-long';
  tone: string;
  pointOfView: string;
  language: string;
  type: 'blog' | 'sales';
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  targetAudience?: string;
  painPoints?: string;
  differentials?: string;
  ctaObjective?: string;
  includeFaq: boolean;
  faqCount: number;
  includeTable: boolean;
  includeList: boolean;
  includeConclusion: boolean;
  seoOptimization: boolean;
  customInstructions?: string;
}

export function useArticleGeneration() {
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const generateArticle = useCallback(async (config: ArticleConfig) => {
    setIsGenerating(true);
    setContent('');
    setProgress(0);

    try {
      // Get the user's session token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        toast({
          title: 'Sessão expirada',
          description: 'Por favor, faça login novamente.',
          variant: 'destructive',
        });
        setIsGenerating(false);
        return null;
      }

      const response = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ config }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        
        if (response.status === 429) {
          toast({
            title: 'Limite excedido',
            description: 'Muitas requisições. Aguarde alguns segundos e tente novamente.',
            variant: 'destructive',
          });
        } else if (response.status === 402) {
          toast({
            title: 'Créditos insuficientes',
            description: 'Adicione créditos à sua conta para continuar gerando artigos.',
            variant: 'destructive',
          });
        } else if (response.status === 401) {
          toast({
            title: 'Sessão expirada',
            description: 'Por favor, faça login novamente.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Erro na geração',
            description: errorData.error || 'Falha ao gerar artigo',
            variant: 'destructive',
          });
        }
        setIsGenerating(false);
        return null;
      }

      if (!response.body) {
        throw new Error('Stream não disponível');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let fullContent = '';
      let streamDone = false;

      // Estimate progress based on word count target
      const wordTargets = {
        short: 800,
        medium: 1500,
        long: 2500,
        'very-long': 4000,
      };
      const targetWords = wordTargets[config.wordCount];

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const deltaContent = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (deltaContent) {
              fullContent += deltaContent;
              setContent(fullContent);
              
              // Update progress based on word count
              const currentWords = fullContent.split(/\s+/).length;
              const newProgress = Math.min((currentWords / targetWords) * 100, 95);
              setProgress(newProgress);
            }
          } catch {
            // Incomplete JSON, put back and wait for more data
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const deltaContent = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (deltaContent) {
              fullContent += deltaContent;
              setContent(fullContent);
            }
          } catch { /* ignore partial leftovers */ }
        }
      }

      setProgress(100);
      setIsGenerating(false);
      
      toast({
        title: 'Artigo gerado!',
        description: 'O conteúdo foi gerado com sucesso.',
      });

      return fullContent;
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: 'Erro na geração',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
      setIsGenerating(false);
      return null;
    }
  }, [toast]);

  const resetGeneration = useCallback(() => {
    setContent('');
    setProgress(0);
    setIsGenerating(false);
  }, []);

  return {
    content,
    isGenerating,
    progress,
    generateArticle,
    resetGeneration,
  };
}
