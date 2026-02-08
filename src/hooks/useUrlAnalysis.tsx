import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface UrlAnalysisResult {
  title: string;
  originalTitle: string;
  preservedTitle: string;
  content: string;
  source: string;
  suggestedNiche: string;
  suggestedAngle: string;
  originalKeyword: string;
  suggestedKeyword: string;
  secondaryKeywords: string[];
  summary: string;
  mainTopics: string[];
  targetAudience: string;
  publishingStrategy: string;
  seoPreservation: {
    titleMatchPercent: number;
    keywordMatchPercent: number;
    indexTerms: string[];
  };
}

interface UseUrlAnalysisOptions {
  projectNiche?: string;
  projectName?: string;
}

export function useUrlAnalysis(options: UseUrlAnalysisOptions = {}) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<UrlAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const analyzeUrl = useCallback(async (url: string): Promise<UrlAnalysisResult | null> => {
    if (!url.trim()) {
      toast({
        title: 'URL inválida',
        description: 'Por favor, insira uma URL válida',
        variant: 'destructive',
      });
      return null;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      toast({
        title: 'URL inválida',
        description: 'O formato da URL não é válido',
        variant: 'destructive',
      });
      return null;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Não autenticado');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-url-content`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            url,
            projectNiche: options.projectNiche,
            projectName: options.projectName,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success || !data.analysis) {
        throw new Error('Resposta inválida do servidor');
      }

      setAnalysisResult(data.analysis);
      
      toast({
        title: 'URL analisada! ✨',
        description: 'Sugestões de conteúdo e ângulo geradas com IA',
      });

      return data.analysis;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao analisar URL';
      setError(message);
      toast({
        title: 'Erro na análise',
        description: message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [options.projectNiche, options.projectName, toast]);

  const clearAnalysis = useCallback(() => {
    setAnalysisResult(null);
    setError(null);
  }, []);

  return {
    analyzeUrl,
    isAnalyzing,
    analysisResult,
    error,
    clearAnalysis,
  };
}
