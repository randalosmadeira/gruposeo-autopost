import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AnalyzedKeyword } from '@/lib/keyword-analyzer';

export interface GenerationJob {
  id: string;
  keyword: AnalyzedKeyword;
  status: 'pending' | 'generating' | 'completed' | 'error';
  articleId?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface BulkGenerationState {
  jobs: GenerationJob[];
  isRunning: boolean;
  currentIndex: number;
  completedCount: number;
  errorCount: number;
}

export function useBulkGeneration() {
  const { toast } = useToast();
  const [state, setState] = useState<BulkGenerationState>({
    jobs: [],
    isRunning: false,
    currentIndex: 0,
    completedCount: 0,
    errorCount: 0
  });

  const initializeJobs = useCallback((keywords: AnalyzedKeyword[]) => {
    const jobs: GenerationJob[] = keywords.map((kw, index) => ({
      id: `job-${index}-${Date.now()}`,
      keyword: kw,
      status: 'pending'
    }));

    setState({
      jobs,
      isRunning: false,
      currentIndex: 0,
      completedCount: 0,
      errorCount: 0
    });

    return jobs;
  }, []);

  const generateArticle = async (job: GenerationJob, projectId?: string): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Não autenticado');
    }

    const config = {
      keyword: job.keyword.keyword,
      type: job.keyword.tipoConteudo === 'landing_page' ? 'sales' : 'blog',
      language: 'pt-BR',
      tone: 'professional',
      wordCount: job.keyword.comprimentoSugerido,
      pointOfView: 'third_person',
      generateImage: true,
      projectId
    };

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-article`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(config),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit - aguarde alguns minutos');
      }
      if (response.status === 402) {
        throw new Error('Créditos insuficientes');
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Erro ${response.status}`);
    }

    const data = await response.json();
    return data.article?.id || null;
  };

  const startGeneration = useCallback(async (projectId?: string, delayMs = 3000) => {
    setState(prev => ({ ...prev, isRunning: true }));

    const pendingJobs = state.jobs.filter(j => j.status === 'pending');
    
    for (let i = 0; i < pendingJobs.length; i++) {
      const job = pendingJobs[i];
      
      // Update job status to generating
      setState(prev => ({
        ...prev,
        currentIndex: i,
        jobs: prev.jobs.map(j => 
          j.id === job.id ? { ...j, status: 'generating', startedAt: new Date() } : j
        )
      }));

      try {
        const articleId = await generateArticle(job, projectId);
        
        setState(prev => ({
          ...prev,
          completedCount: prev.completedCount + 1,
          jobs: prev.jobs.map(j => 
            j.id === job.id 
              ? { ...j, status: 'completed', articleId: articleId || undefined, completedAt: new Date() } 
              : j
          )
        }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        
        setState(prev => ({
          ...prev,
          errorCount: prev.errorCount + 1,
          jobs: prev.jobs.map(j => 
            j.id === job.id 
              ? { ...j, status: 'error', error: errorMessage, completedAt: new Date() } 
              : j
          )
        }));

        // Stop on critical errors
        if (errorMessage.includes('Créditos') || errorMessage.includes('Rate limit')) {
          toast({
            title: 'Geração pausada',
            description: errorMessage,
            variant: 'destructive'
          });
          break;
        }
      }

      // Delay between generations to avoid rate limiting
      if (i < pendingJobs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    setState(prev => ({ ...prev, isRunning: false }));
    
    toast({
      title: 'Geração em massa concluída',
      description: `${state.completedCount} artigos gerados, ${state.errorCount} erros`
    });
  }, [state.jobs, toast]);

  const stopGeneration = useCallback(() => {
    setState(prev => ({ ...prev, isRunning: false }));
  }, []);

  const resetJobs = useCallback(() => {
    setState({
      jobs: [],
      isRunning: false,
      currentIndex: 0,
      completedCount: 0,
      errorCount: 0
    });
  }, []);

  return {
    ...state,
    initializeJobs,
    startGeneration,
    stopGeneration,
    resetJobs
  };
}
