import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AnalyzedKeyword } from '@/lib/keyword-analyzer';
import { BulkGenerationConfig } from '@/types/bulk-generation';

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
  imageUrl?: string;
  retryCount?: number;
}

export interface BulkGenerationState {
  jobs: GenerationJob[];
  isRunning: boolean;
  currentIndex: number;
  completedCount: number;
  errorCount: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

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

// Generate image with retry logic
async function generateImageWithRetry(
  title: string,
  keyword: string,
  segment: string,
  accessToken: string,
  maxRetries = 3
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            title,
            keywords: keyword,
            segment: segment || 'general',
            style: 'photorealistic',
            aspectRatio: '16:9',
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.image) {
          return data.image;
        }
      }
      
      // If rate limited, wait longer before retry
      if (response.status === 429) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        continue;
      }
      
      // For other errors, try again with shorter wait
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Image generation attempt ${attempt} failed:`, error);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  return null;
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

  // Use ref to store jobs to avoid stale closure issues
  const jobsRef = useRef<GenerationJob[]>([]);

  const initializeJobs = useCallback((keywords: AnalyzedKeyword[]) => {
    const jobs: GenerationJob[] = keywords.map((kw, index) => ({
      id: `job-${index}-${Date.now()}`,
      keyword: kw,
      status: 'pending',
      progress: 0,
    }));

    jobsRef.current = jobs;
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
    onProgress: (content: string, progress: number, step: string) => void,
    retryAttempt = 0
  ): Promise<{ content: string; articleId: string | null; imageUrl: string | null }> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Não autenticado');
    }

    onProgress('', 0, 'Iniciando geração...');

    // Fetch internal links if project is connected and internal linking is enabled
    let internalLinks: Array<{ anchor: string; url: string }> = [];
    
    if (projectId && bulkConfig?.internalLinking) {
      try {
        onProgress('', 2, 'Buscando links internos...');
        
        const linkResponse = await supabase.functions.invoke('analyze-wp-articles', {
          body: {
            action: 'get_link_suggestions',
            project_id: projectId,
            keyword: job.keyword.keyword,
            max_links: 10,
          },
        });

        if (linkResponse.data?.success && linkResponse.data?.suggestions) {
          internalLinks = linkResponse.data.suggestions.map((s: any) => ({
            anchor: s.anchor_text,
            url: s.url,
          }));
          console.log(`Found ${internalLinks.length} internal links for ${job.keyword.keyword}`);
        }
      } catch (linkError) {
        console.warn('Failed to fetch internal links:', linkError);
        // Continue without internal links
      }
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
      // Advanced SEO fields for new prompt system
      segment: bulkConfig?.segment || 'general',
      contentType: bulkConfig?.contentType || 'how-to',
      goal: bulkConfig?.goal || 'inform',
      intentType: bulkConfig?.intentType || 'informational',
      // Geographic and audience
      geographicReach: bulkConfig?.geographicReach || '',
      audienceType: bulkConfig?.audienceType || '',
      // Content structure - always generate complete content
      includeFaq: bulkConfig?.faq ?? true,
      faqCount: bulkConfig?.faqCount || 5,
      includeTable: bulkConfig?.tables ?? true,
      includeList: bulkConfig?.lists ?? true,
      includeConclusion: bulkConfig?.conclusion ?? true,
      includeMetaDescription: bulkConfig?.metaDescription ?? true,
      // SEO & Advanced - always optimize
      seoOptimization: bulkConfig?.seoOptimization ?? true,
      humanizeContent: bulkConfig?.humanizeContent ?? true,
      realtimeData: bulkConfig?.realtimeData ?? false,
      // AI Auto Optimization - analyzes all keywords and improves content automatically
      // Always enforces: TITLE ≤60 chars, META_DESCRIPTION ≤160 chars
      aiAutoOptimization: bulkConfig?.aiAutoOptimization ?? true,
      // Company data - cite strategically in all content
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
      // Internal links (automatically fetched)
      internalLinks: internalLinks.length > 0 ? internalLinks : undefined,
    };

    // Try to generate article with retries
    let content = '';
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          onProgress('', 0, `Tentativa ${attempt + 1}/${MAX_RETRIES + 1}...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-article`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ config }),
            signal: abortControllerRef.current?.signal,
          }
        );

        if (!response.ok) {
          if (response.status === 429) {
            lastError = new Error('Rate limit - aguarde alguns minutos');
            if (attempt < MAX_RETRIES) continue;
            throw lastError;
          }
          if (response.status === 402) {
            throw new Error('Créditos insuficientes');
          }
          const errorData = await response.json().catch(() => ({}));
          lastError = new Error(errorData.error || `Erro ${response.status}`);
          if (attempt < MAX_RETRIES) continue;
          throw lastError;
        }

        if (!response.body) {
          lastError = new Error('Stream não disponível');
          if (attempt < MAX_RETRIES) continue;
          throw lastError;
        }

        const reader = response.body.getReader();
        content = await parseSSEStream(reader, (streamContent, progress) => {
          onProgress(streamContent, progress * 0.85, // Reserve 15% for image generation
            progress < 30 ? 'Pesquisando...' : 
            progress < 60 ? 'Escrevendo conteúdo...' : 
            progress < 90 ? 'Finalizando artigo...' : 'Artigo concluído!'
          );
        });

        // Content generated successfully
        if (content && content.length > 500) {
          break;
        } else {
          lastError = new Error('Conteúdo gerado muito curto');
          if (attempt < MAX_RETRIES) continue;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Erro desconhecido');
        if (error instanceof Error && error.name === 'AbortError') throw error;
        if (attempt >= MAX_RETRIES) throw lastError;
      }
    }

    if (!content || content.length < 500) {
      throw lastError || new Error('Falha ao gerar conteúdo após múltiplas tentativas');
    }

    // Generate image with retry logic (always generate images)
    onProgress(content, 88, 'Gerando imagem...');
    let imageUrl: string | null = null;
    
    // Always try to generate image
    const titleMatch = content.match(/^#\s*(.+)$/m) || content.match(/TITLE_SEO:\s*(.+?)-->/);
    const extractedTitle = titleMatch?.[1]?.trim() || job.keyword.keyword;
    
    imageUrl = await generateImageWithRetry(
      extractedTitle,
      job.keyword.keyword,
      bulkConfig?.segment || 'general',
      session.access_token,
      MAX_RETRIES
    );

    onProgress(content, 95, imageUrl ? 'Imagem gerada!' : 'Continuando sem imagem...');

    // Return content and image - article is now created/updated by the caller
    onProgress(content, 100, 'Concluído!');

    return { content, articleId: job.articleId || null, imageUrl };
  };

  const startGeneration = useCallback(async (
    projectId?: string, 
    bulkConfig?: BulkGenerationConfig,
    delayMs = 5000 // Increased delay to avoid rate limits
  ) => {
    setState(prev => ({ ...prev, isRunning: true }));

    // Use ref to get fresh jobs list (avoids stale closure)
    const pendingJobs = jobsRef.current.filter(j => j.status === 'pending');
    let completedCount = 0;
    let errorCount = 0;
    
    // Initialize abort controller for this generation session
    abortControllerRef.current = new AbortController();

    // Get session first
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      toast({
        title: 'Erro de autenticação',
        description: 'Faça login novamente',
        variant: 'destructive'
      });
      setState(prev => ({ ...prev, isRunning: false }));
      return;
    }

    // STEP 1: Create all articles in database as 'draft' (queue)
    // This makes them visible in the articles list immediately
    const articleIdMap = new Map<string, string>(); // job.id -> article.id
    
    for (const job of pendingJobs) {
      try {
        const { data: article, error } = await supabase
          .from('articles')
          .insert({
            user_id: session.user.id,
            keyword: job.keyword.keyword,
            title: `${job.keyword.keyword}: Guia Completo ${new Date().getFullYear()}`,
            status: 'draft', // Start as draft (Na Fila)
            type: job.keyword.tipoConteudo === 'landing_page' ? 'sales' : 'blog',
            project_id: projectId && projectId !== 'none' ? projectId : null,
            config: { bulkGenerated: true, ...bulkConfig },
          })
          .select('id')
          .single();

        if (!error && article) {
          articleIdMap.set(job.id, article.id);
          // Update job with article ID
          const updatedJob = { ...job, articleId: article.id };
          jobsRef.current = jobsRef.current.map(j => j.id === job.id ? updatedJob : j);
        }
      } catch (e) {
        console.error('Failed to create article placeholder:', e);
      }
    }
    
    // STEP 2: Process each job sequentially
    for (let i = 0; i < pendingJobs.length; i++) {
      const job = pendingJobs[i];
      const articleId = articleIdMap.get(job.id);
      
      // Check if generation was stopped
      if (abortControllerRef.current?.signal.aborted) {
        break;
      }
      
      // Update article status to 'generating' in database
      if (articleId) {
        await supabase
          .from('articles')
          .update({ status: 'generating' })
          .eq('id', articleId);
      }
      
      // Update job status to generating
      const updatedJobGenerating = { 
        ...job, 
        status: 'generating' as const, 
        startedAt: new Date(), 
        progress: 0, 
        currentStep: 'Iniciando...',
        retryCount: 0,
        articleId,
      };
      jobsRef.current = jobsRef.current.map(j => j.id === job.id ? updatedJobGenerating : j);
      setState(prev => ({
        ...prev,
        currentIndex: i,
        jobs: prev.jobs.map(j => 
          j.id === job.id ? updatedJobGenerating : j
        )
      }));

      try {
        const { content, articleId: generatedArticleId, imageUrl } = await generateArticleWithStreaming(
          { ...job, articleId },
          projectId && projectId !== 'none' ? projectId : undefined,
          bulkConfig,
          (streamContent, progress, step) => {
            // Update job progress in real-time
            setState(prev => ({
              ...prev,
              jobs: prev.jobs.map(j => 
                j.id === job.id 
                  ? { 
                      ...j, 
                      progress, 
                      content: streamContent,
                      currentStep: step
                    } 
                  : j
              )
            }));
          }
        );
        
        // Update article in database with content and set to 'ready'
        const finalArticleId = articleId || generatedArticleId;
        if (finalArticleId) {
          const titleMatch = content.match(/^#\s*(.+)$/m) || content.match(/TITLE_SEO:\s*(.+?)-->/);
          const extractedTitle = titleMatch?.[1]?.trim().slice(0, 60) || job.keyword.keyword;
          const wordCount = content.split(/\s+/).filter(Boolean).length;
          
          await supabase
            .from('articles')
            .update({ 
              status: 'ready',
              content,
              title: extractedTitle,
              word_count: wordCount,
              featured_image_url: imageUrl,
            })
            .eq('id', finalArticleId);
        }
        
        completedCount++;
        const completedJob = { 
          ...job, 
          status: 'completed' as const, 
          articleId: finalArticleId || undefined, 
          completedAt: new Date(),
          progress: 100,
          currentStep: imageUrl ? 'Completo com imagem!' : 'Completo!',
          content,
          imageUrl: imageUrl || undefined,
        };
        jobsRef.current = jobsRef.current.map(j => j.id === job.id ? completedJob : j);
        setState(prev => ({
          ...prev,
          completedCount,
          jobs: prev.jobs.map(j => j.id === job.id ? completedJob : j)
        }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        
        // Check if it was an abort
        if (error instanceof Error && error.name === 'AbortError') {
          // Reset article to draft
          if (articleId) {
            await supabase
              .from('articles')
              .update({ status: 'draft' })
              .eq('id', articleId);
          }
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
        
        // Update article status to 'error' in database
        if (articleId) {
          await supabase
            .from('articles')
            .update({ 
              status: 'error',
              error_message: errorMessage,
            })
            .eq('id', articleId);
        }
        
        errorCount++;
        const errorJob = { 
          ...job, 
          status: 'error' as const, 
          error: errorMessage, 
          completedAt: new Date(), 
          progress: 0,
          articleId,
        };
        jobsRef.current = jobsRef.current.map(j => j.id === job.id ? errorJob : j);
        setState(prev => ({
          ...prev,
          errorCount,
          jobs: prev.jobs.map(j => j.id === job.id ? errorJob : j)
        }));

        // Only stop on critical errors (credits, not rate limit - we already retry internally)
        if (errorMessage.includes('Créditos')) {
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
        setState(prev => ({
          ...prev,
          jobs: prev.jobs.map(j => 
            j.id === pendingJobs[i + 1]?.id 
              ? { ...j, currentStep: `Aguardando ${Math.ceil(delayMs / 1000)}s...` } 
              : j
          )
        }));
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    setState(prev => ({ ...prev, isRunning: false }));
    abortControllerRef.current = null;
    
    const imageCount = jobsRef.current.filter(j => j.imageUrl).length;
    toast({
      title: 'Geração em massa concluída',
      description: `${completedCount} artigos gerados (${imageCount} com imagem), ${errorCount} erros`
    });
  }, [toast]);

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
