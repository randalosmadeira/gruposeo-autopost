import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { Sparkles, Loader2, AlertTriangle, Newspaper } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ArticleConfig {
  type?: string;
  source_url?: string;
  source_name?: string;
  niche?: string;
  article_length?: string;
  analysis_angle?: string;
}

interface RecreateArticleButtonProps {
  articleId: string;
  keyword: string;
  onRecreateComplete: (newContent: string, newTitle: string, newExcerpt: string) => void;
  hasError?: boolean;
  isEmpty?: boolean;
  articleConfig?: ArticleConfig;
}

export function RecreateArticleButton({ 
  articleId, 
  keyword, 
  onRecreateComplete,
  hasError = false,
  isEmpty = false,
  articleConfig,
}: RecreateArticleButtonProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecreating, setIsRecreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const shouldShowButton = hasError || isEmpty;
  
  // Determine if this is a news rewrite article
  const isRewriteArticle = articleConfig?.type === 'rewrite';
  const sourceUrl = articleConfig?.source_url;
  const sourceName = articleConfig?.source_name;

  const recreateAsNewsRewrite = async (accessToken: string) => {
    setProgress(10);
    setStatusMessage('Re-analisando URL da fonte...');

    // Step 1: Re-analyze the source URL
    const analyzeResponse = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-url-content`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          url: sourceUrl,
        }),
      }
    );

    if (!analyzeResponse.ok) {
      throw new Error('Falha ao re-analisar URL da fonte');
    }

    const analyzeData = await analyzeResponse.json();
    const analysis = analyzeData.analysis;

    if (!analysis?.content) {
      throw new Error('Não foi possível extrair conteúdo da URL');
    }

    setProgress(30);
    setStatusMessage('Gerando repostagem com IA Redator...');

    // Get best niche and angle from analysis
    const bestNiche = analysis.suggestedNiches?.[0]?.id || articleConfig?.niche || 'geral';
    const bestAngle = analysis.suggestedAngles?.[0]?.label || articleConfig?.analysis_angle || 'Impacto no Brasil';

    // Step 2: Call rewrite-news with the fresh content
    const rewriteResponse = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rewrite-news`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          sourceUrl: sourceUrl,
          sourceContent: analysis.content,
          sourceName: analysis.source || sourceName || 'Fonte Externa',
          analysisAngle: bestAngle,
          keyword: analysis.originalKeyword || keyword,
          niche: bestNiche,
          articleLength: articleConfig?.article_length || 'medium',
          language: 'pt-BR',
        }),
      }
    );

    if (!rewriteResponse.ok) {
      const errorData = await rewriteResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Erro na repostagem');
    }

    setProgress(90);
    setStatusMessage('Finalizando...');

    const rewriteData = await rewriteResponse.json();
    
    if (!rewriteData.success || !rewriteData.article) {
      throw new Error('Resposta inválida do servidor');
    }

    // Fetch the newly created article content
    const { data: newArticle, error: fetchError } = await supabase
      .from('articles')
      .select('content, title, excerpt, word_count')
      .eq('id', rewriteData.article.id)
      .single();

    if (fetchError || !newArticle) {
      throw new Error('Erro ao buscar artigo recriado');
    }

    // Update the original article with the new content
    const { error: updateError } = await supabase
      .from('articles')
      .update({
        content: newArticle.content,
        title: newArticle.title,
        excerpt: newArticle.excerpt,
        word_count: newArticle.word_count,
        status: 'ready',
        error_message: null,
      })
      .eq('id', articleId);

    if (updateError) {
      console.error('Update error:', updateError);
    }

    // Delete the duplicate article created by rewrite-news
    await supabase
      .from('articles')
      .delete()
      .eq('id', rewriteData.article.id);

    setProgress(100);
    setStatusMessage('Concluído!');

    return {
      content: newArticle.content || '',
      title: newArticle.title || keyword,
      excerpt: newArticle.excerpt || '',
      wordCount: newArticle.word_count || 0,
    };
  };

  const recreateAsStandardArticle = async (accessToken: string) => {
    setProgress(10);
    setStatusMessage('Conectando com IA...');

    // Make direct fetch to handle SSE stream
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-article`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          config: {
            keyword,
            wordCount: 'medium',
            tone: 'profissional',
            pointOfView: 'voce',
            language: 'pt-BR',
            type: 'blog',
            includeFaq: true,
            faqCount: 5,
            includeTable: true,
            includeList: true,
            includeConclusion: true,
            includeMetaDescription: true,
            seoOptimization: true,
            humanizeContent: true,
            contentType: 'how-to',
            segment: 'general',
            goal: 'inform',
            intentType: 'informational',
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Erro na geração');
    }

    setProgress(20);
    setStatusMessage('Gerando conteúdo...');

    // Read the SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Não foi possível ler a resposta');
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let chunksReceived = 0;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') continue;
            
            const parsed = JSON.parse(jsonStr);
            const content = parsed?.choices?.[0]?.delta?.content;
            
            if (content) {
              fullContent += content;
              chunksReceived++;
              
              // Update progress based on content length
              const estimatedProgress = Math.min(20 + (chunksReceived * 2), 90);
              setProgress(estimatedProgress);
              
              // Update status message
              if (chunksReceived % 10 === 0) {
                const wordCount = fullContent.split(/\s+/).length;
                setStatusMessage(`Gerando... ${wordCount} palavras`);
              }
            }
          } catch {
            // Ignore parsing errors for incomplete chunks
          }
        }
      }
    }

    if (fullContent.length < 100) {
      throw new Error('Conteúdo gerado muito curto');
    }

    setProgress(95);
    setStatusMessage('Finalizando...');

    // Extract title from content (first H1)
    const titleMatch = fullContent.match(/<h1[^>]*>([^<]+)<\/h1>/i) || 
                       fullContent.match(/^#\s+(.+)$/m);
    const extractedTitle = titleMatch ? titleMatch[1].trim() : keyword;
    
    // Extract meta description if present
    const metaMatch = fullContent.match(/<!--\s*META_DESCRIPTION:\s*([^-]+)-->/i);
    let excerpt = '';
    if (metaMatch) {
      excerpt = metaMatch[1].trim();
      // Remove meta comment from content
      fullContent = fullContent.replace(/<!--\s*META_DESCRIPTION:[^>]+-->/gi, '').trim();
    } else {
      // Generate excerpt from content
      const textContent = fullContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      excerpt = textContent.substring(0, 155) + '...';
    }
    
    // Remove TITLE_SEO comment
    fullContent = fullContent.replace(/<!--\s*TITLE_SEO:[^>]+-->/gi, '').trim();

    // Calculate word count
    const wordCount = fullContent.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

    // Update the article in database
    const { error: updateError } = await supabase
      .from('articles')
      .update({
        content: fullContent,
        title: extractedTitle,
        excerpt: excerpt,
        word_count: wordCount,
        status: 'ready',
        error_message: null,
      })
      .eq('id', articleId);

    if (updateError) {
      console.error('Update error:', updateError);
    }

    setProgress(100);
    setStatusMessage('Concluído!');

    return {
      content: fullContent,
      title: extractedTitle,
      excerpt: excerpt,
      wordCount,
    };
  };

  const handleRecreate = async () => {
    setIsRecreating(true);
    setIsDialogOpen(false);
    setProgress(5);
    setStatusMessage('Iniciando geração...');

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Usuário não autenticado');
      }

      let result;
      
      // Use different recreation logic based on article type
      if (isRewriteArticle && sourceUrl) {
        result = await recreateAsNewsRewrite(session.access_token);
      } else {
        result = await recreateAsStandardArticle(session.access_token);
      }

      // Call the callback to update UI
      onRecreateComplete(result.content, result.title, result.excerpt);

      toast({
        title: 'Artigo recriado com sucesso!',
        description: `${result.wordCount} palavras geradas e salvas.`,
      });
    } catch (error) {
      console.error('Recreate error:', error);
      toast({
        title: 'Erro ao recriar',
        description: error instanceof Error ? error.message : 'Não foi possível recriar o artigo.',
        variant: 'destructive',
      });
    } finally {
      setIsRecreating(false);
      setProgress(0);
      setStatusMessage('');
    }
  };

  if (!shouldShowButton && !isRecreating) {
    return null;
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setIsDialogOpen(true)}
        disabled={isRecreating}
        className="gap-2"
      >
        {isRecreating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="hidden sm:inline">{statusMessage || 'Recriando...'}</span>
            <span className="sm:hidden">Recriando...</span>
          </>
        ) : (
          <>
            {isRewriteArticle ? (
              <Newspaper className="w-4 h-4" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isRewriteArticle ? 'Recriar Repostagem' : 'Recriar com IA'}
          </>
        )}
      </Button>

      {/* Progress indicator when recreating */}
      {isRecreating && progress > 0 && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border rounded-lg shadow-lg p-4 w-80">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="font-medium text-sm">
              {isRewriteArticle ? 'Recriando repostagem' : 'Recriando artigo'}
            </span>
          </div>
          <Progress value={progress} className="h-2 mb-2" />
          <p className="text-xs text-muted-foreground">{statusMessage}</p>
        </div>
      )}

      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {isRewriteArticle ? 'Recriar Repostagem Jornalística?' : 'Recriar Artigo Completo?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {isRewriteArticle ? (
                  <>
                    <p>
                      Esta ação irá <strong>buscar novamente a URL da fonte</strong> e gerar uma nova 
                      repostagem usando a persona de <strong>IA Redator Jornalístico</strong>.
                    </p>
                    <p className="text-muted-foreground text-sm">
                      URL da fonte: <strong>{sourceUrl}</strong>
                    </p>
                    <p className="text-amber-600 font-medium">
                      ⚠️ O conteúdo atual será substituído.
                    </p>
                    <p>
                      O sistema irá:
                    </p>
                    <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                      <li>Re-analisar a URL da fonte original</li>
                      <li>Auto-selecionar melhor nicho e ângulo de análise</li>
                      <li>Gerar conteúdo 100% original (≥95% originalidade)</li>
                      <li>Usar prompt personalizado de notícias</li>
                      <li>Manter compliance Lei 9.610/98</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p>
                      Esta ação irá <strong>substituir todo o conteúdo atual</strong> por um novo artigo 
                      gerado pela IA baseado na palavra-chave: <strong>"{keyword}"</strong>
                    </p>
                    <p className="text-amber-600 font-medium">
                      ⚠️ O conteúdo atual será perdido permanentemente.
                    </p>
                    <p>
                      A IA irá gerar:
                    </p>
                    <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                      <li>Novo título otimizado para SEO</li>
                      <li>Conteúdo completo com estrutura H2/H3/H4</li>
                      <li>Meta-descrição</li>
                      <li>Seguindo todas as diretrizes dos prompts configurados</li>
                    </ul>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRecreate}
            >
              {isRewriteArticle ? (
                <Newspaper className="w-4 h-4 mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Confirmar e Recriar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
