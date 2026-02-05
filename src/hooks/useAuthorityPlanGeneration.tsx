import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';
import { useAuth } from './useAuth';

interface AuthorityPlanData {
  centralTheme: string;
  satelliteCount: number;
  projectId: string;
  language: string;
  country: string;
  publicationMode: string;
}

interface GeneratedArticle {
  id: string;
  title: string;
  keyword: string;
  status: string;
  featured_image_url: string | null;
}

interface AuthorityPlanResult {
  success: boolean;
  pillar: GeneratedArticle;
  satellites: GeneratedArticle[];
  totalArticles: number;
  error?: string;
}

export function useAuthorityPlanGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [generatedPlan, setGeneratedPlan] = useState<AuthorityPlanResult | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const generatePlan = useCallback(async (data: AuthorityPlanData): Promise<AuthorityPlanResult | null> => {
    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado para gerar um plano.',
        variant: 'destructive',
      });
      return null;
    }

    setIsGenerating(true);
    setProgress('Iniciando geração do plano de autoridade...');
    setGeneratedPlan(null);

    try {
      setProgress('Pesquisando o tema e analisando a concorrência...');
      
      const { data: result, error } = await supabase.functions.invoke<AuthorityPlanResult>(
        'generate-authority-plan',
        {
          body: {
            ...data,
            userId: user.id,
          },
        }
      );

      if (error) {
        throw new Error(error.message || 'Erro ao gerar plano');
      }

      if (!result?.success) {
        throw new Error(result?.error || 'Falha na geração do plano');
      }

      setGeneratedPlan(result);
      setProgress('Plano gerado com sucesso!');

      toast({
        title: 'Plano de Autoridade Criado! 🎉',
        description: `Gerados ${result.totalArticles} artigos: 1 pilar + ${result.satellites.length} satélites`,
      });

      return result;
    } catch (error) {
      console.error('Authority plan generation error:', error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      
      setProgress('');
      
      // Handle specific errors
      if (message.includes('Rate limit')) {
        toast({
          title: 'Limite de requisições',
          description: 'Aguarde alguns minutos e tente novamente.',
          variant: 'destructive',
        });
      } else if (message.includes('Payment required')) {
        toast({
          title: 'Créditos insuficientes',
          description: 'Adicione créditos à sua conta para continuar.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Erro na geração',
          description: message,
          variant: 'destructive',
        });
      }
      
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [user, toast]);

  const reset = useCallback(() => {
    setIsGenerating(false);
    setProgress('');
    setGeneratedPlan(null);
  }, []);

  return {
    generatePlan,
    isGenerating,
    progress,
    generatedPlan,
    reset,
  };
}
