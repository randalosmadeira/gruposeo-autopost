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
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface RecreateArticleButtonProps {
  articleId: string;
  keyword: string;
  onRecreateComplete: (newContent: string, newTitle: string, newExcerpt: string) => void;
  hasError?: boolean;
  isEmpty?: boolean;
}

export function RecreateArticleButton({ 
  articleId, 
  keyword, 
  onRecreateComplete,
  hasError = false,
  isEmpty = false,
}: RecreateArticleButtonProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecreating, setIsRecreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const shouldShowButton = hasError || isEmpty;

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

      setProgress(10);
      setStatusMessage('Conectando com IA...');

      // Make direct fetch to handle SSE stream
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-article`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
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

      setProgress(95);
      setStatusMessage('Finalizando...');

      if (fullContent.length > 100) {
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

        // Call the callback to update UI
        onRecreateComplete(fullContent, extractedTitle, excerpt);

        toast({
          title: 'Artigo recriado com sucesso!',
          description: `${wordCount} palavras geradas e salvas.`,
        });
      } else {
        throw new Error('Conteúdo gerado muito curto');
      }
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
            <Sparkles className="w-4 h-4" />
            Recriar com IA
          </>
        )}
      </Button>

      {/* Progress indicator when recreating */}
      {isRecreating && progress > 0 && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border rounded-lg shadow-lg p-4 w-80">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="font-medium text-sm">Recriando artigo</span>
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
              Recriar Artigo Completo?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
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
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRecreate}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Confirmar e Recriar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
