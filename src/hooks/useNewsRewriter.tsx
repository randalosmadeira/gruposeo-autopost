import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RewriteRequest {
  sourceUrl: string;
  sourceContent: string;
  sourceName: string;
  analysisAngle: string;
  keyword?: string;
  niche?: string;
  articleLength?: 'short' | 'medium' | 'long';
  language?: string;
  projectId?: string;
  internalLinks?: Array<{ anchor: string; url: string }>;
}

export interface ComplianceCheck {
  originalityScore: number;
  citationCompliance: boolean;
  seoOptimized: boolean;
  readabilityScore: number;
}

export interface RewriteResult {
  id: string;
  title: string;
  slug: string;
  word_count: number;
  featured_image_url: string | null;
  originality_score: number;
  quality_score: number;
  readability_score: number;
  seo_optimized: boolean;
  reading_time: string;
  credits: string;
  niche: string;
  tags: string[];
  keywords: string[];
}

export function useNewsRewriter() {
  const [isRewriting, setIsRewriting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RewriteResult | null>(null);
  const [lastCompliance, setLastCompliance] = useState<ComplianceCheck | null>(null);
  const { toast } = useToast();

  const rewriteNews = async (request: RewriteRequest): Promise<RewriteResult | null> => {
    setIsRewriting(true);
    setProgress('Preparando repostagem...');
    setLastResult(null);
    setLastCompliance(null);

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: 'Erro de autenticação',
          description: 'Faça login para continuar',
          variant: 'destructive',
        });
        return null;
      }

      setProgress('Analisando conteúdo original...');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rewrite-news`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            ...request,
            niche: request.niche || 'geral',
            articleLength: request.articleLength || 'medium',
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 429) {
          toast({
            title: 'Limite de requisições',
            description: 'Aguarde alguns minutos e tente novamente',
            variant: 'destructive',
          });
          return null;
        }
        
        if (response.status === 402) {
          toast({
            title: 'Créditos insuficientes',
            description: 'Adicione créditos para continuar gerando conteúdo',
            variant: 'destructive',
          });
          return null;
        }

        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      setProgress('Gerando artigo com IA...');
      const data = await response.json();

      if (!data.success || !data.article) {
        throw new Error('Resposta inválida do servidor');
      }

      setProgress('Artigo criado com sucesso!');
      
      const result = data.article as RewriteResult;
      const compliance = data.compliance as ComplianceCheck;
      
      setLastResult(result);
      setLastCompliance(compliance);
      
      toast({
        title: 'Repostagem concluída!',
        description: `Artigo "${result.title}" criado com ${result.originality_score}% de originalidade e score de qualidade ${result.quality_score}`,
      });

      return result;
    } catch (error) {
      console.error('Rewrite error:', error);
      toast({
        title: 'Erro na repostagem',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsRewriting(false);
      setProgress(null);
    }
  };

  return {
    rewriteNews,
    isRewriting,
    progress,
    lastResult,
    lastCompliance,
  };
}
