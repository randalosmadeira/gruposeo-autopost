import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AnalyzedKeyword } from '@/lib/keyword-analyzer';
import { BulkGenerationConfig } from '@/components/bulk-generator';

export interface GenerationJob {
  id: string;
  keyword: AnalyzedKeyword;
  status: 'pending' | 'generating' | 'completed' | 'error';
  articleId?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
  currentStep?: string;
  content?: string;
}

export interface BulkGenerationState {
  jobs: GenerationJob[];
  isRunning: boolean;
  currentIndex: number;
  completedCount: number;
  errorCount: number;
}

// Parse SSE stream and accumulate content
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onProgress: (content: string, progress: number) => void
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let estimatedWords = 0;
  const targetWords = 2000; // Average target for long content

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') {
        onProgress(fullContent, 100);
        return fullContent;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const deltaContent = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (deltaContent) {
          fullContent += deltaContent;
          estimatedWords = fullContent.split(/\s+/).length;
          const progress = Math.min((estimatedWords / targetWords) * 100, 95);
          onProgress(fullContent, progress);
        }
      } catch {
        // Incomplete JSON, continue
      }
    }
  }

  // Final flush
  if (buffer.trim()) {
    for (let raw of buffer.split('\n')) {
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
        }
      } catch { /* ignore */ }
    }
  }

  return fullContent;
}

export function useBulkGeneration() {
  const { toast } = useToast();
  const abortControllerRef = useRef<AbortController | null>(null);
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
      status: 'pending',
      progress: 0,
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

  const generateArticleWithStreaming = async (
    job: GenerationJob, 
    projectId: string | undefined,
    bulkConfig: BulkGenerationConfig | undefined,
    onProgress: (content: string, progress: number) => void
  ): Promise<{ content: string; articleId: string | null }> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Não autenticado');
    }

    // Build config from bulk settings + keyword analysis
    const config = {
      keyword: job.keyword.keyword,
      type: job.keyword.tipoConteudo === 'landing_page' ? 'sales' : 'blog',
      language: bulkConfig?.language || 'pt-BR',
      tone: bulkConfig?.tone || 'profissional',
      wordCount: bulkConfig?.contentLength || job.keyword.comprimentoSugerido || 'long',
      pointOfView: bulkConfig?.pointOfView || 'terceira-singular',
      secondaryKeywords: '',
      // Content structure
      includeFaq: bulkConfig?.faq ?? true,
      faqCount: bulkConfig?.faqCount || 5,
      includeTable: bulkConfig?.tables ?? false,
      includeList: bulkConfig?.lists ?? true,
      includeConclusion: bulkConfig?.conclusion ?? true,
      includeMetaDescription: bulkConfig?.metaDescription ?? true,
      // SEO & Advanced
      seoOptimization: bulkConfig?.seoOptimization ?? true,
      humanizeContent: bulkConfig?.humanizeContent ?? false,
      realtimeData: bulkConfig?.realtimeData ?? false,
      // Company data
      companyName: bulkConfig?.companyName || '',
      companyPhone: bulkConfig?.companyPhone || '',
      companyAddress: bulkConfig?.companyAddress || '',
      // Target audience
      targetAudience: bulkConfig?.targetAudience || '',
      painPoints: bulkConfig?.painPoints || '',
      ctaObjective: bulkConfig?.ctaObjective || '',
      additionalInfo: bulkConfig?.additionalInfo || '',
      // AI Model
      aiModel: bulkConfig?.aiModel || 'standard',
    };

    abortControllerRef.current = new AbortController();

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-article`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ config }),
        signal: abortControllerRef.current.signal,
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

    if (!response.body) {
      throw new Error('Stream não disponível');
    }

    const reader = response.body.getReader();
    const content = await parseSSEStream(reader, onProgress);

    // Save article to database
    let articleId: string | null = null;
    if (content) {
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      const titleMatch = content.match(/^#\s*(.+)$/m);
      const title = titleMatch?.[1] || job.keyword.keyword;

      const { data: article, error } = await supabase
        .from('articles')
        .insert({
          keyword: job.keyword.keyword,
          title,
          content,
          word_count: wordCount,
          status: 'ready' as const,
          user_id: session.user.id,
          project_id: projectId || null,
          type: job.keyword.tipoConteudo === 'landing_page' ? 'sales' : 'blog',
        })
        .select('id')
        .single();

      if (!error && article) {
        articleId = article.id;
      }
    }

    return { content, articleId };
  };

  const startGeneration = useCallback(async (
    projectId?: string, 
    bulkConfig?: BulkGenerationConfig,
    delayMs = 3000
  ) => {
    setState(prev => ({ ...prev, isRunning: true }));

    const pendingJobs = state.jobs.filter(j => j.status === 'pending');
    let completedCount = state.completedCount;
    let errorCount = state.errorCount;
    
    for (let i = 0; i < pendingJobs.length; i++) {
      const job = pendingJobs[i];
      
      // Check if generation was stopped
      if (!abortControllerRef.current || abortControllerRef.current.signal.aborted) {
        // Reset abort controller for next run
        abortControllerRef.current = null;
        break;
      }
      
      // Update job status to generating
      setState(prev => ({
        ...prev,
        currentIndex: i,
        jobs: prev.jobs.map(j => 
          j.id === job.id 
            ? { ...j, status: 'generating', startedAt: new Date(), progress: 0, currentStep: 'Iniciando...' } 
            : j
        )
      }));

      try {
        const { content, articleId } = await generateArticleWithStreaming(
          job,
          projectId && projectId !== 'none' ? projectId : undefined,
          bulkConfig,
          (streamContent, progress) => {
            // Update job progress in real-time
            setState(prev => ({
              ...prev,
              jobs: prev.jobs.map(j => 
                j.id === job.id 
                  ? { 
                      ...j, 
                      progress, 
                      content: streamContent,
                      currentStep: progress < 30 ? 'Pesquisando...' : 
                                   progress < 60 ? 'Escrevendo...' : 
                                   progress < 90 ? 'Finalizando...' : 'Concluído!'
                    } 
                  : j
              )
            }));
          }
        );
        
        completedCount++;
        setState(prev => ({
          ...prev,
          completedCount,
          jobs: prev.jobs.map(j => 
            j.id === job.id 
              ? { 
                  ...j, 
                  status: 'completed', 
                  articleId: articleId || undefined, 
                  completedAt: new Date(),
                  progress: 100,
                  currentStep: 'Salvo!',
                  content,
                } 
              : j
          )
        }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        
        // Check if it was an abort
        if (error instanceof Error && error.name === 'AbortError') {
          setState(prev => ({
            ...prev,
            jobs: prev.jobs.map(j => 
              j.id === job.id 
                ? { ...j, status: 'pending', progress: 0, currentStep: 'Cancelado' } 
                : j
            )
          }));
          break;
        }
        
        errorCount++;
        setState(prev => ({
          ...prev,
          errorCount,
          jobs: prev.jobs.map(j => 
            j.id === job.id 
              ? { ...j, status: 'error', error: errorMessage, completedAt: new Date(), progress: 0 } 
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
    abortControllerRef.current = null;
    
    toast({
      title: 'Geração em massa concluída',
      description: `${completedCount} artigos gerados, ${errorCount} erros`
    });
  }, [state.jobs, state.completedCount, state.errorCount, toast]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState(prev => ({ ...prev, isRunning: false }));
  }, []);

  const resetJobs = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
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
