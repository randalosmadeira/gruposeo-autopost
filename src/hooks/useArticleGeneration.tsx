import { useState, useCallback } from 'react';
import { useToast } from './use-toast';
import { supabase } from '@/integrations/supabase/client';
import { createErrorToastContent } from '@/components/ui/error-toast';
import { removeCodeBlockMarkers, improveContentStructure } from '@/lib/sanitize';

const GENERATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-article`;

interface ArticleConfig {
  keyword: string;
  title?: string;
  secondaryKeywords: string;
  wordCount: 'short' | 'medium' | 'long' | 'very-long';
  tone: string;
  pointOfView: string;
  language: string;
  type: 'blog' | 'sales' | 'review' | 'comparison';
  // Advanced SEO fields
  contentType?: 'how-to' | 'listicle' | 'pillar' | 'comparative' | 'review' | 'opinion' | 'news';
  segment?: 'legal' | 'health' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'education' | 'general';
  goal?: 'inform' | 'convert' | 'educate' | 'engage';
  intentType?: 'informational' | 'navigational' | 'transactional' | 'commercial';
  // Company data
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  // Sales-specific
  targetAudience?: string;
  painPoints?: string;
  differentials?: string;
  ctaObjective?: string;
  additionalInfo?: string;
  // Content elements
  includeFaq: boolean;
  faqCount: number;
  includeTable: boolean;
  includeList: boolean;
  includeConclusion: boolean;
  includeMetaDescription?: boolean;
  // SEO options
  seoOptimization: boolean;
  humanizeContent?: boolean;
  realtimeData?: boolean;
  customInstructions?: string;
  // Internal links
  internalLinks?: Array<{ anchor: string; url: string }>;
  sourcesContext?: string;
  // ZicaJuris project config
  projectConfig?: {
    nicho?: string;
    compliance_rules?: string;
    empresa_nome?: string;
    empresa_telefone?: string;
    empresa_endereco?: string;
    empresa_whatsapp?: string;
  };
}

export type { ArticleConfig };

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
      // Get the user's session token with auto-refresh
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      // If session exists but might be expired, try to refresh it
      if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.warn('Token refresh failed:', refreshError);
        } else if (refreshData.session) {
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

      const response = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ config }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido', request_id: undefined }));
        const requestId = errorData.request_id;
        
        if (response.status === 429) {
          toast(createErrorToastContent(
            'Limite excedido',
            'Muitas requisições. Aguarde alguns segundos e tente novamente.',
            requestId
          ));
        } else if (response.status === 402) {
          toast(createErrorToastContent(
            'Créditos insuficientes',
            'Adicione créditos à sua conta para continuar gerando artigos.',
            requestId
          ));
        } else if (response.status === 401) {
          toast(createErrorToastContent(
            'Sessão expirada',
            'Por favor, faça login novamente.',
            requestId
          ));
        } else {
          toast(createErrorToastContent(
            'Erro na geração',
            errorData.error || 'Falha ao gerar artigo',
            requestId
          ));
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

      // Clean up the content - remove code block markers and improve structure
      fullContent = removeCodeBlockMarkers(fullContent);
      fullContent = improveContentStructure(fullContent);

      setContent(fullContent);
      setProgress(100);
      setIsGenerating(false);
      
      toast({
        title: 'Artigo gerado!',
        description: 'O conteúdo foi gerado com sucesso.',
      });

      return fullContent;
    } catch (error) {
      console.error('Generation error:', error);
      toast(createErrorToastContent(
        'Erro na geração',
        error instanceof Error ? error.message : 'Erro desconhecido'
      ));
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
