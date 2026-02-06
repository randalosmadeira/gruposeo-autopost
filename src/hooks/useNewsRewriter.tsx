import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RewriteRequest {
  sourceUrl: string;
  sourceContent: string;
  sourceName: string;
  analysisAngle: string;
  keyword?: string;
  language?: string;
  projectId?: string;
}

export interface RewriteResult {
  id: string;
  title: string;
  slug: string;
  word_count: number;
  featured_image_url: string | null;
  originality_score: number;
  added_value: string;
  credits: string;
}

export function useNewsRewriter() {
  const [isRewriting, setIsRewriting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const { toast } = useToast();

  const rewriteNews = async (request: RewriteRequest): Promise<RewriteResult | null> => {
    setIsRewriting(true);
    setProgress('Preparando repostagem...');

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
          body: JSON.stringify(request),
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
      
      toast({
        title: 'Repostagem concluída!',
        description: `Artigo "${data.article.title}" criado com ${data.article.originality_score}% de originalidade`,
      });

      return data.article as RewriteResult;
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
  };
}
