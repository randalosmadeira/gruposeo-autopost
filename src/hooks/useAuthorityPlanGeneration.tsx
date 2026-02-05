import { useState, useCallback, useRef } from 'react';
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

interface ProgressStep {
  step: string;
  current: number;
  total: number;
  percentage: number;
}

interface ArticlePlan {
  title: string;
  keyword: string;
  outline: string[];
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
  const [progress, setProgress] = useState<ProgressStep | null>(null);
  const [pillarPlan, setPillarPlan] = useState<ArticlePlan | null>(null);
  const [satellitePlans, setSatellitePlans] = useState<ArticlePlan[]>([]);
  const [generatedArticles, setGeneratedArticles] = useState<{
    pillar: GeneratedArticle | null;
    satellites: GeneratedArticle[];
  }>({ pillar: null, satellites: [] });
  const [generatedPlan, setGeneratedPlan] = useState<AuthorityPlanResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  const generatePlan = useCallback(async (data: AuthorityPlanData): Promise<AuthorityPlanResult | null> => {
    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado para gerar um plano.',
        variant: 'destructive',
      });
      return null;
    }

    // Reset state
    setIsGenerating(true);
    setProgress(null);
    setPillarPlan(null);
    setSatellitePlans([]);
    setGeneratedArticles({ pillar: null, satellites: [] });
    setGeneratedPlan(null);
    setLogs([]);

    abortControllerRef.current = new AbortController();

    try {
      addLog('Iniciando geração do plano de autoridade...');
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-authority-plan-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            ...data,
            userId: user.id,
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.slice(7);
            continue;
          }
          
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Handle different event types based on data structure
              if (data.step !== undefined && data.percentage !== undefined) {
                // Progress event
                setProgress(data);
                addLog(data.step);
              } else if (data.title && data.outline && !data.id) {
                // Pillar plan or satellite plans
                if (Array.isArray(data)) {
                  setSatellitePlans(data);
                  addLog(`${data.length} artigos satélites planejados`);
                } else {
                  setPillarPlan(data);
                  addLog(`Pilar planejado: ${data.title}`);
                }
              } else if (data.satellites && Array.isArray(data.satellites)) {
                // Satellite plans array
                setSatellitePlans(data.satellites || data);
                addLog(`${(data.satellites || data).length} artigos satélites planejados`);
              } else if (data.id && data.title && data.index === undefined) {
                // Pillar created
                setGeneratedArticles(prev => ({ ...prev, pillar: data }));
                addLog(`✅ Pilar criado: ${data.title}`);
              } else if (data.index !== undefined && data.id) {
                // Satellite created
                setGeneratedArticles(prev => ({
                  ...prev,
                  satellites: [...prev.satellites, data],
                }));
                addLog(`✅ Satélite ${data.index} criado: ${data.title}`);
              } else if (data.success !== undefined) {
                // Complete event
                if (data.success) {
                  setGeneratedPlan(data);
                  addLog(`🎉 Plano completo! ${data.totalArticles} artigos gerados.`);
                  toast({
                    title: 'Plano de Autoridade Criado! 🎉',
                    description: `Gerados ${data.totalArticles} artigos: 1 pilar + ${data.satellites?.length || 0} satélites`,
                  });
                }
              } else if (data.message) {
                // Error event
                throw new Error(data.message);
              }
            } catch (e) {
              if (e instanceof SyntaxError) {
                // Incomplete JSON, will be completed in next chunk
              } else {
                throw e;
              }
            }
          }
        }
      }

      return generatedPlan;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        addLog('Geração cancelada pelo usuário');
        return null;
      }

      console.error('Authority plan generation error:', error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      
      addLog(`❌ Erro: ${message}`);
      
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
      abortControllerRef.current = null;
    }
  }, [user, toast, addLog, generatedPlan]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
  }, []);

  const reset = useCallback(() => {
    setIsGenerating(false);
    setProgress(null);
    setPillarPlan(null);
    setSatellitePlans([]);
    setGeneratedArticles({ pillar: null, satellites: [] });
    setGeneratedPlan(null);
    setLogs([]);
  }, []);

  return {
    generatePlan,
    cancel,
    reset,
    isGenerating,
    progress,
    pillarPlan,
    satellitePlans,
    generatedArticles,
    generatedPlan,
    logs,
  };
}
